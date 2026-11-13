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
  | { kind: "live"; text: string; cohortName: string | null }
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
  const allSame = totals.length === PUBLIC_MODES.length && totals.every((t) => t.total === totals[0].total);
  const text = allSame
    ? formatNaira(totals[0].total)
    : totals.map((t) => `${formatNaira(t.total)} ${t.mode.toLowerCase()}`).join(" · ");

  return { kind: "live", text, cohortName };
}
