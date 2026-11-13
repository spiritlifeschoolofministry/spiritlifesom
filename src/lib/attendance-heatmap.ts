/**
 * Shapes attendance into a students × sessions grid for the heatmap on the
 * admin Attendance page. Uses the same rules as the page's statistics: only
 * sessions that count for attendance and have been held, per cohort.
 */
/** "none": a session of another cohort, not this student's class. */
export type HeatStatus = "present" | "late" | "absent" | "excused" | "unverified" | "none";

export interface HeatStudent { id: string; cohort_id: string; name: string }
export interface HeatSession { id: string; cohort_id: string; date: string }
export interface HeatAttendance { student_id: string; schedule_id: string | null; status: string | null; is_verified: boolean | null }

export interface HeatRow {
  id: string;
  name: string;
  /** Verified present or late, as a share of sessions held, 0–100. */
  pct: number;
  cells: HeatStatus[];
}

export interface Heatmap {
  sessions: HeatSession[];
  rows: HeatRow[];
}

export function shapeHeatmap(
  students: HeatStudent[],
  sessions: HeatSession[],
  attendance: HeatAttendance[],
  cohortId: string | null,
  maxSessions = 20,
): Heatmap {
  const cohortStudents = cohortId ? students.filter((s) => s.cohort_id === cohortId) : students;
  const cohortSessions = (cohortId ? sessions.filter((s) => s.cohort_id === cohortId) : sessions)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  // Newest on the right; with "all cohorts" each student only has cells for
  // their own cohort's sessions, so columns are the most recent dates overall.
  const shown = cohortSessions.slice(-maxSessions);

  const byKey = new Map<string, HeatAttendance>();
  for (const a of attendance) if (a.schedule_id) byKey.set(`${a.student_id}|${a.schedule_id}`, a);

  const rows = cohortStudents.map((student) => {
    const own = cohortSessions.filter((s) => s.cohort_id === student.cohort_id);
    let attended = 0;
    for (const s of own) {
      const a = byKey.get(`${student.id}|${s.id}`);
      const st = (a?.status ?? "").toUpperCase();
      if (a?.is_verified && (st === "PRESENT" || st === "LATE")) attended++;
    }
    const cells: HeatStatus[] = shown.map((s) => {
      if (s.cohort_id !== student.cohort_id) return "none";
      const a = byKey.get(`${student.id}|${s.id}`);
      if (!a) return "absent";
      const st = (a.status ?? "").toUpperCase();
      if (st === "EXCUSED") return "excused";
      if (st === "ABSENT") return "absent";
      if (!a.is_verified) return "unverified";
      return st === "LATE" ? "late" : "present";
    });
    return { id: student.id, name: student.name, pct: own.length ? Math.round((attended / own.length) * 100) : 0, cells };
  });

  // Lowest attendance first, so the students who need a call are on top. A
  // student with no class among the columns shown (e.g. a past cohort under
  // "all cohorts") has nothing to show and is left out.
  const visible = rows.filter((r) => r.cells.some((c) => c !== "none"));
  visible.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  return { sessions: shown, rows: visible };
}
