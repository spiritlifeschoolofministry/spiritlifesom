import { describe, it, expect } from "vitest";
import { effectiveExamStatus } from "@/lib/exam-utils";

const iso = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString();

describe("effectiveExamStatus", () => {
  it("keeps a published exam scheduled before its window opens", () => {
    expect(effectiveExamStatus({ status: "published", start_at: iso(30), end_at: iso(90) }))
      .toBe("published");
  });

  it("reads a published exam inside its window as live", () => {
    expect(effectiveExamStatus({ status: "published", start_at: iso(-10), end_at: iso(50) }))
      .toBe("in_progress");
  });

  it("reads a published exam past its window as ended", () => {
    expect(effectiveExamStatus({ status: "published", start_at: iso(-120), end_at: iso(-60) }))
      .toBe("ended");
  });

  // The bug this guards: exam-start stamps in_progress when the first student
  // opens the paper and nothing ever clears it, so a finished exam sat under
  // "Live" indefinitely.
  it("reads a stamped in_progress exam past its window as ended", () => {
    expect(effectiveExamStatus({ status: "in_progress", start_at: iso(-120), end_at: iso(-60) }))
      .toBe("ended");
  });

  it("leaves a stamped in_progress exam live while its window is open", () => {
    expect(effectiveExamStatus({ status: "in_progress", start_at: iso(-10), end_at: iso(50) }))
      .toBe("in_progress");
  });

  it("never overrides a stage an admin set by hand", () => {
    for (const status of ["draft", "ended", "closed", "archived"]) {
      expect(effectiveExamStatus({ status, start_at: iso(-10), end_at: iso(50) })).toBe(status);
    }
  });
});
