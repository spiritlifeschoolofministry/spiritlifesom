/**
 * What a student's attendance is, server-side.
 *
 * The canonical version is `src/lib/attendance.ts`, and its comment explains
 * why it exists: an attendance row only exists where a student checked in, so
 * counting rows scores everybody at nearly 100%. The denominator has to be the
 * classes the cohort actually held — schedule rows for that cohort, flagged
 * `counts_for_attendance`, on or before today.
 *
 * This is a second copy, which is a cost worth naming: an edge function cannot
 * import from `src/`. It is kept deliberately identical, and any change to one
 * belongs in both. A progress summary that quotes a different attendance figure
 * to the student's own attendance page is worse than one that omits it — the
 * student is told two numbers about themselves and has no way to tell which is
 * the real one.
 */

export interface AttendanceRow {
  status: string | null;
  schedule_id: string | null;
  is_verified: boolean | null;
}

export interface AttendanceTally {
  /** Counted sessions the cohort has held to date. */
  total: number;
  present: number;
  late: number;
  /** Derived: a counted session with no verified attendance. */
  absent: number;
  /** Present and late over total, or null when no counted session has been held. */
  rate: number | null;
}

export const tallyAttendance = (
  sessionIds: Set<string>,
  rows: AttendanceRow[],
): AttendanceTally => {
  // One mark per session, not per row: nothing in the database stops a student
  // having two rows against the same class, and counting both would put them
  // over 100%. Present beats Late where a session has both.
  const markBySession = new Map<string, "PRESENT" | "LATE">();
  for (const r of rows) {
    if (!r.is_verified || !r.schedule_id || !sessionIds.has(r.schedule_id)) continue;
    const status = (r.status || "").toUpperCase();
    if (status !== "PRESENT" && status !== "LATE") continue;
    if (status === "PRESENT" || !markBySession.has(r.schedule_id)) {
      markBySession.set(r.schedule_id, status);
    }
  }

  const marks = [...markBySession.values()];
  const present = marks.filter((m) => m === "PRESENT").length;
  const late = marks.filter((m) => m === "LATE").length;
  const total = sessionIds.size;
  return {
    total,
    present,
    late,
    absent: Math.max(0, total - present - late),
    rate: total > 0 ? Math.round(((present + late) / total) * 100) : null,
  };
};

/**
 * The bands the student's own attendance page already colours by: green at 75
 * and above, amber from 50, red below. Naming them here rather than inventing a
 * threshold means the summary's warning appears exactly when their attendance
 * page turns amber, and not on some standard only this feature knows about.
 */
export type Standing = "good" | "slipping" | "serious" | "unknown";

export const standingOf = (rate: number | null): Standing => {
  if (rate === null) return "unknown";
  if (rate >= 75) return "good";
  if (rate >= 50) return "slipping";
  return "serious";
};
