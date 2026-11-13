import { describe, expect, it } from "vitest";
import { formatMinutes, groupExamWindows, type WindowExam } from "@/lib/exam-windows";

const exam = (id: string, start: string, end: string, duration = 45, title = id): WindowExam => ({
  id, start_at: start, end_at: end, duration_minutes: duration, title, status: "published",
});

const oct1 = ["2026-10-01T08:30:00Z", "2026-10-01T13:00:00Z"] as const;
const sep5 = ["2026-09-05T09:00:00Z", "2026-09-05T12:00:00Z"] as const;
const nov20 = ["2026-11-20T09:00:00Z", "2026-11-20T12:00:00Z"] as const;

describe("groupExamWindows", () => {
  const exams = [
    exam("SLM 105 EXAM", ...oct1), exam("SLM 101 EXAM", ...oct1), exam("SLM 102 EXAM", ...oct1),
    exam("SLM 101 TEST", ...sep5, 25), exam("SLM 102 TEST", ...sep5, 25),
    exam("SLM 107 TEST", ...nov20, 25),
  ];

  it("puts papers sharing a window together, sorted by title", () => {
    const w = groupExamWindows(exams, {}, new Date("2026-10-01T10:50:00Z"));
    expect(w).toHaveLength(3);
    expect(w[0].exams.map((e) => e.id)).toEqual(["SLM 101 EXAM", "SLM 102 EXAM", "SLM 105 EXAM"]);
  });

  it("orders live first, then upcoming soonest, then past most recent", () => {
    const w = groupExamWindows(exams, {}, new Date("2026-10-01T10:50:00Z"));
    expect(w.map((x) => x.state)).toEqual(["live", "upcoming", "past"]);
  });

  it("counts done papers and compares time left with time needed", () => {
    const w = groupExamWindows(exams, { "SLM 105 EXAM": { status: "submitted" } }, new Date("2026-10-01T10:50:00Z"))[0];
    expect(w.done).toBe(1);
    expect(w.minutesLeft).toBe(130);
    expect(w.minutesNeeded).toBe(90);
  });

  it("treats a window as past once every paper is closed", () => {
    const closed = exams.map((e) => ({ ...e, status: "closed" }));
    const w = groupExamWindows(closed, {}, new Date("2026-10-01T10:50:00Z"));
    expect(w.find((x) => x.key.startsWith(oct1[0]))?.state).toBe("past");
  });
});

describe("formatMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatMinutes(130)).toBe("2 h 10 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});
