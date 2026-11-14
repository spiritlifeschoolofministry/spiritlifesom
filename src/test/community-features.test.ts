import { describe, expect, it } from "vitest";
import { ratingsComplete, responseRate, summariseFeedback } from "@/lib/course-feedback";
import { formatHours, serviceProgress, serviceTotals, validateServiceEntry } from "@/lib/service-log";
import { matchesFilter, questionStatus } from "@/lib/discussions";
import { servingLine, testimonyProblem, testimonyStatusLabel } from "@/lib/alumni";

// The push library imports the Supabase client; only its pure helpers are tested.
import { vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { pushStateHint, resolvePushState, urlBase64ToUint8Array, VAPID_PUBLIC_KEY } = await import("@/lib/push");

describe("course feedback", () => {
  const row = (overall: number, content = overall, teaching = overall, materials = overall) => ({
    rating_overall: overall,
    rating_content: content,
    rating_teaching: teaching,
    rating_materials: materials,
  });

  it("averages each question to one decimal place", () => {
    const summary = summariseFeedback([row(5, 4, 3, 2), row(4, 4, 4, 5), row(4, 5, 3, 3)]);
    expect(summary.count).toBe(3);
    expect(summary.averages).toEqual({
      rating_overall: 4.3,
      rating_content: 4.3,
      rating_teaching: 3.3,
      rating_materials: 3.3,
    });
  });

  it("counts how many gave each overall score", () => {
    expect(summariseFeedback([row(5), row(5), row(1), row(3)]).overallSpread).toEqual([1, 0, 1, 0, 2]);
  });

  it("has no average when nobody has answered", () => {
    const summary = summariseFeedback([]);
    expect(summary.count).toBe(0);
    expect(summary.averages.rating_overall).toBeNull();
  });

  it("states the response rate, and only a count for an empty cohort", () => {
    expect(responseRate(12, 40)).toBe("12 of 40 (30%)");
    expect(responseRate(3, 0)).toBe("3");
  });

  it("needs all four ratings before sending", () => {
    expect(ratingsComplete({ rating_overall: 5, rating_content: 4, rating_teaching: 4, rating_materials: null })).toBe(false);
    expect(ratingsComplete({ rating_overall: 5, rating_content: 4, rating_teaching: 4, rating_materials: 1 })).toBe(true);
  });
});

describe("service log", () => {
  it("adds hours by status, reading numeric strings from the database", () => {
    expect(
      serviceTotals([
        { hours: "2.5", status: "approved" },
        { hours: 3, status: "approved" },
        { hours: 1.5, status: "pending" },
        { hours: 4, status: "rejected" },
        { hours: "oops", status: "approved" },
      ]),
    ).toEqual({ approved: 5.5, pending: 1.5, rejected: 4 });
  });

  it("measures approved hours against the requirement, capped at 100", () => {
    expect(serviceProgress(10, 40)).toBe(25);
    expect(serviceProgress(55, 40)).toBe(100);
  });

  it("gives no percentage when the cohort has no requirement", () => {
    expect(serviceProgress(10, null)).toBeNull();
    expect(serviceProgress(10, 0)).toBeNull();
  });

  it("writes hours in words", () => {
    expect(formatHours(1)).toBe("1 hour");
    expect(formatHours("7.5")).toBe("7.5 hours");
  });

  it("refuses a future date, missing hours, too many hours and a thin description", () => {
    const good = { activityDate: "2026-11-10", hours: "2", description: "Led the youth outreach in Bodija." };
    const today = "2026-11-14";
    expect(validateServiceEntry(good, today)).toBeNull();
    expect(validateServiceEntry({ ...good, activityDate: "2026-11-15" }, today)).toMatch(/future/);
    expect(validateServiceEntry({ ...good, activityDate: "" }, today)).toMatch(/date/);
    expect(validateServiceEntry({ ...good, hours: "0" }, today)).toMatch(/hours/);
    expect(validateServiceEntry({ ...good, hours: "25" }, today)).toMatch(/24/);
    expect(validateServiceEntry({ ...good, description: "Prayed" }, today)).toMatch(/Describe/);
  });
});

describe("discussions", () => {
  const q = (over: Partial<Parameters<typeof questionStatus>[0]> = {}) => ({
    author_id: "me",
    is_resolved: false,
    answer_count: 0,
    has_staff_answer: false,
    ...over,
  });

  it("labels a question by how far it has got", () => {
    expect(questionStatus(q()).label).toBe("Waiting for an answer");
    expect(questionStatus(q({ answer_count: 2 })).label).toBe("Answered");
    expect(questionStatus(q({ answer_count: 2, has_staff_answer: true })).label).toBe("Staff answered");
    expect(questionStatus(q({ is_resolved: true })).label).toBe("Resolved");
  });

  it("filters the list", () => {
    expect(matchesFilter(q({ answer_count: 1 }), "unanswered", "me")).toBe(false);
    expect(matchesFilter(q(), "unanswered", "me")).toBe(true);
    expect(matchesFilter(q({ answer_count: 3 }), "needs-staff", "me")).toBe(true);
    expect(matchesFilter(q({ has_staff_answer: true }), "needs-staff", "me")).toBe(false);
    expect(matchesFilter(q({ is_resolved: true }), "open", "me")).toBe(false);
    expect(matchesFilter(q({ author_id: "someone" }), "mine", "me")).toBe(false);
    expect(matchesFilter(q({ is_resolved: true }), "all", "me")).toBe(true);
  });
});

describe("alumni", () => {
  it("builds the serving line from whichever parts exist", () => {
    expect(servingLine({ serving_as: "Youth pastor", serving_at: "Grace Chapel", location: "Ibadan" })).toBe(
      "Youth pastor at Grace Chapel · Ibadan",
    );
    expect(servingLine({ serving_as: null, serving_at: "Grace Chapel", location: " " })).toBe("Grace Chapel");
    expect(servingLine({})).toBe("");
  });

  it("asks for more than a few words in a testimony", () => {
    expect(testimonyProblem("Thank God")).toMatch(/more/);
    expect(testimonyProblem("God opened a door for me to plant a church this year.")).toBeNull();
    expect(testimonyProblem("x".repeat(3001))).toMatch(/3,000/);
  });

  it("names each status in plain words", () => {
    expect(testimonyStatusLabel("pending")).toBe("Waiting for approval");
    expect(testimonyStatusLabel("approved")).toBe("On the wall");
    expect(testimonyStatusLabel("hidden")).toBe("Not shown");
  });
});

describe("push notifications", () => {
  const env = (over: Partial<Parameters<typeof resolvePushState>[0]> = {}) => ({
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: "default" as NotificationPermission,
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
    standalone: false,
    subscribed: false,
    ...over,
  });

  it("decodes the VAPID key to the 65-byte point browsers expect", () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("is on only with a subscription and permission", () => {
    expect(resolvePushState(env())).toBe("off");
    expect(resolvePushState(env({ subscribed: true, permission: "granted" }))).toBe("on");
    expect(resolvePushState(env({ subscribed: true, permission: "default" }))).toBe("off");
  });

  it("reports a browser block", () => {
    expect(resolvePushState(env({ permission: "denied" }))).toBe("blocked");
    expect(pushStateHint("blocked")).toMatch(/site settings/);
  });

  it("tells iPhone Safari users to install first, and other browsers that it cannot work", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
    expect(resolvePushState(env({ hasPushManager: false, userAgent: iphone }))).toBe("needs-install");
    expect(resolvePushState(env({ hasPushManager: false, userAgent: iphone, standalone: true }))).toBe("unsupported");
    expect(resolvePushState(env({ hasPushManager: false }))).toBe("unsupported");
    expect(pushStateHint("needs-install")).toMatch(/Home Screen/);
    expect(pushStateHint("on")).toBeNull();
  });
});
