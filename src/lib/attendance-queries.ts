/**
 * The database reads behind the attendance figures. Kept apart from the maths in
 * attendance.ts so that stays a pure, testable function.
 */
import { supabase } from "@/integrations/supabase/client";
import { tallyAttendance, todayDateString, type AttendanceTally } from "@/lib/attendance";

/** The counted sessions a cohort has held on or before today. */
export const fetchCountedSessionIds = async (cohortId: string | null): Promise<Set<string>> => {
  if (!cohortId) return new Set();
  const { data } = await supabase
    .from("schedule")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("counts_for_attendance", true)
    .lte("date", todayDateString());
  return new Set((data || []).map((s) => s.id));
};

/** The whole read for one student: sessions, rows, tally. */
export const fetchStudentAttendance = async (
  studentId: string,
  cohortId: string | null
): Promise<AttendanceTally> => {
  const [sessionIds, { data: rows }] = await Promise.all([
    fetchCountedSessionIds(cohortId),
    supabase.from("attendance").select("status, schedule_id, is_verified").eq("student_id", studentId),
  ]);
  return tallyAttendance(sessionIds, rows || []);
};
