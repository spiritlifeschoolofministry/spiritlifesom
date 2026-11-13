import { describe, expect, it } from "vitest";
import { cohortFunnel } from "@/lib/cohort-funnel";

const s = (admission_status: string | null) => ({ admission_status });

describe("cohortFunnel", () => {
  it("counts the live portal's shape: 75 admitted + 27 graduates", () => {
    const students = [...Array(75)].map(() => s("ADMITTED")).concat([...Array(27)].map(() => s("Graduate")));
    expect(cohortFunnel(students)).toEqual([
      { key: "applied", label: "Applied", count: 102, conversion: null },
      { key: "admitted", label: "Admitted", count: 102, conversion: 100 },
      { key: "graduated", label: "Graduated", count: 27, conversion: 26 },
    ]);
  });

  it("normalises case and leaves pending and rejected out of admitted", () => {
    const f = cohortFunnel([s("Pending"), s("PENDING"), s("REJECTED"), s("admitted"), s("GRADUATE"), s(null)]);
    expect(f.map((x) => x.count)).toEqual([6, 2, 1]);
    expect(f[1].conversion).toBe(33);
    expect(f[2].conversion).toBe(50);
  });

  it("handles an empty cohort", () => {
    expect(cohortFunnel([]).map((x) => [x.count, x.conversion])).toEqual([[0, null], [0, 0], [0, 0]]);
  });
});
