import { describe, expect, it } from "vitest";
import { paperState } from "@/components/redesign/student-pages/exam-paper";

const exam = {
  start_at: "2026-10-01T08:30:00Z",
  end_at: "2026-10-01T13:00:00Z",
  status: "published",
  results_released: false,
  total_points: 90,
  passing_score: 50,
};
const at = (iso: string) => new Date(iso);

describe("paperState", () => {
  it("offers Start while open and not attempted", () => {
    const s = paperState(exam, undefined, at("2026-10-01T10:00:00Z"));
    expect(s.action).toBe("start");
    expect(s.pill.label).toBe("Open");
  });

  it("offers the lobby within the hour before opening, not earlier", () => {
    expect(paperState(exam, undefined, at("2026-10-01T07:45:00Z")).action).toBe("enter");
    expect(paperState(exam, undefined, at("2026-10-01T07:00:00Z")).action).toBeNull();
    expect(paperState(exam, undefined, at("2026-10-01T07:00:00Z")).pill.label).toBe("Upcoming");
  });

  it("offers Resume only for an attempt in progress while open", () => {
    const attempt = { status: "in_progress" };
    expect(paperState(exam, attempt, at("2026-10-01T10:00:00Z")).action).toBe("resume");
    expect(paperState(exam, attempt, at("2026-10-01T10:00:00Z")).pill.label).toBe("In progress");
    expect(paperState(exam, attempt, at("2026-10-01T14:00:00Z")).action).toBeNull();
  });

  it("calls a closed, unattempted paper missed", () => {
    const s = paperState(exam, undefined, at("2026-10-01T14:00:00Z"));
    expect(s.action).toBeNull();
    expect(s.pill).toEqual({ tone: "warning", label: "Missed" });
  });

  it("shows a submitted paper as submitted while open, awaiting results after", () => {
    const attempt = { status: "submitted" };
    expect(paperState(exam, attempt, at("2026-10-01T10:00:00Z")).pill.label).toBe("Submitted");
    expect(paperState(exam, attempt, at("2026-10-01T14:00:00Z")).pill.label).toBe("Awaiting results");
  });

  it("scores a released result against the attempt's own denominator", () => {
    const s = paperState(
      { ...exam, results_released: true },
      { status: "graded", score: 20, manual_score_override: 26, max_points: 30 },
      at("2026-10-02T10:00:00Z"),
    );
    expect(s.released).toBe(true);
    expect(s.pct).toBe(87);
    expect(s.pill).toEqual({ tone: "success", label: "87% · Passed" });
  });

  it("fails below the pass mark", () => {
    const s = paperState(
      { ...exam, results_released: true },
      { status: "graded", score: 30, max_points: 90 },
      at("2026-10-02T10:00:00Z"),
    );
    expect(s.pill).toEqual({ tone: "danger", label: "33% · Failed" });
  });
});
