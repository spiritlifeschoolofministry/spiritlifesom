/**
 * What the public home page says about fees.
 *
 * Two sources, in order:
 *  1. site_content home/fees_note, when an admin has written something there.
 *  2. The live price list from the public_fee_summary() database function
 *     (active cohort only, no student data).
 *
 * A fee structure applies to a learning mode when its learning_modes holds that
 * mode or "All" — the same literal rule as fee_structure_applies() in the
 * database, so the total shown is what a new student of that mode is billed.
 */

export interface PublicFeeRow {
  fee_name: string;
  amount: number;
  learning_modes: string[] | null;
  cohort_name: string | null;
}

export type PublicFeeSummary =
  | { kind: "note"; text: string }
  | {
      kind: "live";
      text: string;
      cohortName: string | null;
      /** What a new Online student is billed in total, or null when Online has no fees. */
      onlineTotal: number | null;
    }
  | { kind: "none" };

/** The modes an applicant can pick. Hybrid is assigned by admins, so it is not quoted. */
const PUBLIC_MODES = ["Physical", "Online"] as const;

const naira = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
export const formatNaira = (amount: number) => `₦${naira.format(amount)}`;

const applies = (modes: string[] | null, mode: string) =>
  !!modes && (modes.includes("All") || modes.includes(mode));

export function summarisePublicFees(
  rows: PublicFeeRow[] | null | undefined,
  note: string | null | undefined,
): PublicFeeSummary {
  const written = note?.trim();
  if (written) return { kind: "note", text: written };

  const list = rows ?? [];
  const totals = PUBLIC_MODES.map((mode) => ({
    mode,
    total: list
      .filter((r) => applies(r.learning_modes, mode))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0),
  })).filter((t) => t.total > 0);

  if (totals.length === 0) return { kind: "none" };

  const cohortName = list[0]?.cohort_name ?? null;
  // School policy: studying in person (Physical) is free. Physical-only rows
  // are course handouts, not school fees, so the public line never quotes a
  // price for Physical — it says it is free.
  const online = totals.find((t) => t.mode === "Online");
  const text = online
    ? `${formatNaira(online.total)} online · free for physical students`
    : "Free for physical students";

  return { kind: "live", text, cohortName, onlineTotal: online?.total ?? null };
}
