import { describe, expect, it } from "vitest";
import { withRejectionReason } from "@/lib/rejection-note";

describe("withRejectionReason", () => {
  it("keeps the student's note and adds the reason after it", () => {
    expect(withRejectionReason("Paid via GTBank", " Receipt unreadable ")).toBe("Paid via GTBank\n\nRejected: Receipt unreadable");
  });
  it("uses the reason alone when there is no note", () => {
    expect(withRejectionReason(null, "Wrong amount")).toBe("Rejected: Wrong amount");
    expect(withRejectionReason("   ", "Wrong amount")).toBe("Rejected: Wrong amount");
  });
});
