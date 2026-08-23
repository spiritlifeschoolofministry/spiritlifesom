/**
 * A student can be in more than one session over time — someone who did not
 * graduate is moved into the next cohort rather than made to register again.
 *
 * students.cohort_id only ever holds the session they are in now, so the pages
 * that read it show the current session and nothing else. The sessions before it
 * are the from_cohort_id values on student_cohort_moves, which is also where the
 * code they held at the time is kept.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PastSession {
  cohortId: string;
  cohortName: string;
  /** The code the student held while in that session, where it is known. */
  studentCode: string | null;
  /** When they left it. */
  leftAt: string;
}

export interface StudentHistory {
  /** Previous sessions, oldest first. Empty for a student who has never moved. */
  past: PastSession[];
  /** Codes the student has held before their current one, oldest first. */
  previousCodes: string[];
}

export const EMPTY_HISTORY: StudentHistory = { past: [], previousCodes: [] };

export const fetchStudentHistory = async (
  studentId: string | null | undefined,
  currentCode?: string | null
): Promise<StudentHistory> => {
  if (!studentId) return EMPTY_HISTORY;

  const { data } = await supabase
    .from("student_cohort_moves")
    .select("from_cohort_id, from_student_code, moved_at, from_cohort:cohorts!student_cohort_moves_from_cohort_id_fkey(name)")
    .eq("student_id", studentId)
    .order("moved_at", { ascending: true });

  const past: PastSession[] = [];
  for (const row of data || []) {
    if (!row.from_cohort_id) continue;
    // A student can pass through the same cohort twice; the session is listed
    // once, holding the last code they had in it.
    const existing = past.find((s) => s.cohortId === row.from_cohort_id);
    const entry = {
      cohortId: row.from_cohort_id,
      cohortName: (row.from_cohort as { name: string } | null)?.name || "Previous session",
      studentCode: row.from_student_code,
      leftAt: row.moved_at,
    };
    if (existing) Object.assign(existing, entry);
    else past.push(entry);
  }

  const previousCodes = (data || [])
    .map((r) => r.from_student_code)
    .filter((c): c is string => !!c && c !== currentCode)
    .filter((c, i, all) => all.indexOf(c) === i);

  return { past, previousCodes };
};
