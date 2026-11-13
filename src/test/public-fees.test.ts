import { describe, expect, it } from "vitest";
import { formatNaira, summarisePublicFees, type PublicFeeRow } from "@/lib/public-fees";

const row = (fee_name: string, amount: number, learning_modes: string[], cohort_name = "Cohort 2026"): PublicFeeRow => ({
  fee_name,
  amount,
  learning_modes,
  cohort_name,
});

describe("summarisePublicFees", () => {
  it("prefers the admin's note over live amounts", () => {
    const s = summarisePublicFees([row("Tuition", 50000, ["All"])], "  ₦50,000, payable in two instalments ");
    expect(s).toEqual({ kind: "note", text: "₦50,000, payable in two instalments" });
  });

  it("ignores a blank note and falls back to live amounts", () => {
    const s = summarisePublicFees([row("Tuition", 50000, ["All"])], "   ");
    expect(s).toEqual({ kind: "live", text: "₦50,000 online · free for physical students", cohortName: "Cohort 2026" });
  });

  it("quotes the Online total (counting 'All') and Physical as free", () => {
    const s = summarisePublicFees(
      [row("Tuition", 40000, ["All"]), row("Hall levy", 10000, ["Physical"]), row("Data support", 5000, ["Online"])],
      "",
    );
    expect(s).toEqual({ kind: "live", text: "₦45,000 online · free for physical students", cohortName: "Cohort 2026" });
  });

  it("does not quote Hybrid-only fees, since applicants cannot choose Hybrid", () => {
    const s = summarisePublicFees([row("Tuition", 40000, ["Physical", "Online"]), row("Hybrid kit", 7000, ["Hybrid"])], null);
    expect(s).toEqual({ kind: "live", text: "₦40,000 online · free for physical students", cohortName: "Cohort 2026" });
  });

  it("quotes Online and says Physical is free", () => {
    const s = summarisePublicFees([row("Tuition", 30000, ["Online"])], undefined);
    expect(s).toEqual({ kind: "live", text: "₦30,000 online · free for physical students", cohortName: "Cohort 2026" });
  });

  it("says free when only Physical handouts are listed", () => {
    const s = summarisePublicFees([row("Handout", 350, ["Physical"])], null);
    expect(s).toEqual({ kind: "live", text: "Free for physical students", cohortName: "Cohort 2026" });
  });

  it("returns none when there is nothing to show", () => {
    expect(summarisePublicFees([], "")).toEqual({ kind: "none" });
    expect(summarisePublicFees(null, null)).toEqual({ kind: "none" });
  });
});

describe("formatNaira", () => {
  it("groups thousands and drops kobo", () => {
    expect(formatNaira(1250000)).toBe("₦1,250,000");
    expect(formatNaira(15000.4)).toBe("₦15,000");
  });
});
