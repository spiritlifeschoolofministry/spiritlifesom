import { describe, it, expect } from "vitest";
import { splitFeesBySession } from "@/lib/fee-sessions";

const fee = (id: string, cohort_id: string | null) => ({ id, cohort_id });

describe("splitFeesBySession", () => {
  it("keeps the current cohort's fees as this session's", () => {
    const { current, past } = splitFeesBySession([fee("a", "c2"), fee("b", "c2")], "c2");
    expect(current.map((f) => f.id)).toEqual(["a", "b"]);
    expect(past).toEqual([]);
  });

  it("moves a left-behind session's fees out of the current total", () => {
    const { current, past } = splitFeesBySession([fee("old", "c1"), fee("new", "c2")], "c2");
    expect(current.map((f) => f.id)).toEqual(["new"]);
    expect(past.map((f) => f.id)).toEqual(["old"]);
  });

  it("leaves an unattributable fee with the current session", () => {
    const { current, past } = splitFeesBySession([fee("orphan", null)], "c2");
    expect(current.map((f) => f.id)).toEqual(["orphan"]);
    expect(past).toEqual([]);
  });

  it("treats every cohort-tagged fee as past for a student with no cohort", () => {
    const { current, past } = splitFeesBySession([fee("a", "c1"), fee("b", null)], null);
    expect(current.map((f) => f.id)).toEqual(["b"]);
    expect(past.map((f) => f.id)).toEqual(["a"]);
  });
});
