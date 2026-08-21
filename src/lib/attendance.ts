/**
 * One definition of what a student's attendance is.
 *
 * An attendance row only exists where a student checked in, so an absence is a
 * missing row. Counting the rows a student has therefore scores everyone at
 * ~100%. The denominator has to be the classes their cohort actually held:
 * schedule rows that belong to the cohort, are flagged counts_for_attendance,
 * and fall on or before today.
 *
 * This lived in four separate copies — the admin student profile, the analytics
 * page, the student dashboard and the transcript — and three of them had the
 * bug. Keep it here so the next screen cannot get it wrong. The maths is kept
 * free of any database call so it can be tested directly; the reads live in
 * attendance-queries.ts.
 */
export const todayDateString = () => new Date().toISOString().split("T")[0];

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

export const EMPTY_TALLY: AttendanceTally = { total: 0, present: 0, late: 0, absent: 0, rate: null };

/**
 * Tally verified attendance against the sessions that count. Rows for a session
 * outside the set — an uncounted calendar entry, another cohort's class, or a
 * row with no session at all — belong to no denominator, so they are ignored.
 */
export const tallyAttendance = (sessionIds: Set<string>, rows: AttendanceRow[]): AttendanceTally => {
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
