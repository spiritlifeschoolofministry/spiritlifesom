/**
 * Which session a fee belongs to.
 *
 * A fee row carries the cohort it was raised for, and that does not move when
 * the student does. A student who did not graduate and was moved into the next
 * cohort keeps their previous session's rows, so any screen that reads every
 * fee row a student has — the student fee page, the dashboard summary, the admin
 * profile — has to scope by session or last session's balance is reported as
 * this session's debt. That bug has now been fixed twice by hand; this is the
 * rule, in one place, so the next rollover does not need a third.
 *
 * A row with no cohort_id cannot be attributed to a session. Those stay with the
 * current one rather than vanishing, which is what the closed-session write-off
 * of 2026-08-23 deliberately left them doing.
 */

export interface SessionScopedFee {
  cohort_id: string | null;
}

export interface FeesBySession<T> {
  /** This session's fees: what the student is being billed now. */
  current: T[];
  /** Fees raised for a session the student has since left. */
  past: T[];
}

export const splitFeesBySession = <T extends SessionScopedFee>(
  fees: T[],
  currentCohortId: string | null | undefined
): FeesBySession<T> => ({
  current: fees.filter((f) => !f.cohort_id || f.cohort_id === currentCohortId),
  past: fees.filter((f) => !!f.cohort_id && f.cohort_id !== currentCohortId),
});
