import { describe, it, expect } from "vitest";
import { tallyAttendance } from "@/lib/attendance";

const row = (over: Partial<{ status: string | null; schedule_id: string | null; is_verified: boolean | null }> = {}) => ({
  status: "Present",
  schedule_id: "s1",
  is_verified: true,
  ...over,
});

describe("tallyAttendance", () => {
  it("counts the classes held, not the rows on file", () => {
    // The bug this replaces: one check-in against four classes read as 100%.
    const t = tallyAttendance(new Set(["s1", "s2", "s3", "s4"]), [row()]);
    expect(t.total).toBe(4);
    expect(t.present).toBe(1);
    expect(t.absent).toBe(3);
    expect(t.rate).toBe(25);
  });

  it("treats late as attended but still reports it separately", () => {
    const t = tallyAttendance(new Set(["s1", "s2"]), [
      row({ schedule_id: "s1" }),
      row({ schedule_id: "s2", status: "Late" }),
    ]);
    expect(t.rate).toBe(100);
    expect(t.late).toBe(1);
    expect(t.absent).toBe(0);
  });

  it("ignores rows that are not verified", () => {
    const t = tallyAttendance(new Set(["s1", "s2"]), [row({ is_verified: false })]);
    expect(t.present).toBe(0);
    expect(t.rate).toBe(0);
  });

  it("ignores rows for a session that does not count, and rows with no session", () => {
    const t = tallyAttendance(new Set(["s1"]), [
      row({ schedule_id: "graduation" }),
      row({ schedule_id: null }),
    ]);
    expect(t.present).toBe(0);
    expect(t.absent).toBe(1);
  });

  it("reads status case-insensitively", () => {
    const t = tallyAttendance(new Set(["s1", "s2"]), [
      row({ schedule_id: "s1", status: "present" }),
      row({ schedule_id: "s2", status: "LATE" }),
    ]);
    expect(t.rate).toBe(100);
  });

  it("has no rate at all when the cohort has held no counted class", () => {
    // 0% would accuse a student of missing classes that never happened.
    expect(tallyAttendance(new Set(), [row()]).rate).toBeNull();
  });

  it("never lets duplicate rows push a student past 100%", () => {
    // Nothing in the database stops two check-ins against one class.
    const t = tallyAttendance(new Set(["s1"]), [row(), row(), row()]);
    expect(t.present).toBe(1);
    expect(t.absent).toBe(0);
    expect(t.rate).toBe(100);
  });

  it("counts a session marked both late and present as present", () => {
    const t = tallyAttendance(new Set(["s1"]), [
      row({ status: "Late" }),
      row({ status: "Present" }),
    ]);
    expect(t.present).toBe(1);
    expect(t.late).toBe(0);
  });

  it("ignores a status that is neither present nor late", () => {
    const t = tallyAttendance(new Set(["s1"]), [row({ status: "Absent" })]);
    expect(t.present).toBe(0);
    expect(t.absent).toBe(1);
  });
});
