import { describe, expect, it } from "vitest";
import { shapeHeatmap } from "@/lib/attendance-heatmap";

const students = [
  { id: "a", cohort_id: "c1", name: "Ada" },
  { id: "b", cohort_id: "c1", name: "Bola" },
  { id: "x", cohort_id: "c2", name: "Xavier" },
];
const sessions = [
  { id: "s2", cohort_id: "c1", date: "2026-10-24" },
  { id: "s1", cohort_id: "c1", date: "2026-10-17" },
  { id: "t1", cohort_id: "c2", date: "2026-10-18" },
];
const attendance = [
  { student_id: "a", schedule_id: "s1", status: "Present", is_verified: true },
  { student_id: "a", schedule_id: "s2", status: "Late", is_verified: true },
  { student_id: "b", schedule_id: "s2", status: "Present", is_verified: false },
];

describe("shapeHeatmap", () => {
  it("orders sessions oldest to newest and students lowest attendance first", () => {
    const h = shapeHeatmap(students, sessions, attendance, "c1");
    expect(h.sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(h.rows.map((r) => [r.name, r.pct])).toEqual([["Bola", 0], ["Ada", 100]]);
  });

  it("marks absent, unverified, present and late", () => {
    const h = shapeHeatmap(students, sessions, attendance, "c1");
    expect(h.rows.find((r) => r.id === "b")?.cells).toEqual(["absent", "unverified"]);
    expect(h.rows.find((r) => r.id === "a")?.cells).toEqual(["present", "late"]);
  });

  it("with all cohorts, other cohorts' sessions are not counted against a student", () => {
    const h = shapeHeatmap(students, sessions, attendance, null);
    expect(h.sessions.map((s) => s.id)).toEqual(["s1", "t1", "s2"]);
    expect(h.rows.find((r) => r.id === "x")?.cells).toEqual(["none", "absent", "none"]);
  });

  it("leaves out students with no class among the columns shown", () => {
    const h = shapeHeatmap(students, sessions, attendance, null, 1);
    expect(h.sessions.map((s) => s.id)).toEqual(["s2"]);
    expect(h.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps only the most recent sessions", () => {
    expect(shapeHeatmap(students, sessions, attendance, "c1", 1).sessions.map((s) => s.id)).toEqual(["s2"]);
  });
});
