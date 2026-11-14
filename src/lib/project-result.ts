import { supabase } from "@/integrations/supabase/client";
import { outcomeLabel } from "@/lib/projects";

/** A student's project as it appears on Assessments and the Transcript. */
export interface ProjectResult {
  id: string;
  title: string;
  isGroup: boolean;
  /** The panel's average as a percentage; null until a result is recorded. */
  percent: number | null;
  /** "Passed", "Passed with corrections", "To defend again", or null. */
  outcome: string | null;
  note: string | null;
  decidedAt: string | null;
  /** How many courses the project counts as in the overall grade (cohort setting). */
  weight: number;
}

/**
 * The signed-in student's approved project, or null when they have none.
 *
 * Found through membership so it works for every member of a group, and for
 * staff previewing the student portal (who could otherwise read everybody's).
 * The project is its own line on the record: it belongs to no course.
 */
export const fetchMyProjectResult = async (studentId: string): Promise<ProjectResult | null> => {
  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("student_id", studentId)
    .eq("active", true)
    .maybeSingle();
  if (!membership?.project_id) return null;
  const { data } = await supabase
    .from("project_overview")
    .select("id, title, is_group, status, outcome, outcome_note, outcome_at, final_score, cohort_id")
    .eq("id", membership.project_id)
    .maybeSingle();
  if (!data?.id || data.status !== "approved") return null;
  const { data: cohort } = data.cohort_id
    ? await supabase.from("cohorts").select("project_weight").eq("id", data.cohort_id).maybeSingle()
    : { data: null };
  return toProjectResult(data, Number(cohort?.project_weight ?? 1));
};

/**
 * A student's project at any stage, for the admin's student record. Null when
 * the student is in no project.
 */
export const fetchStudentProject = async (studentId: string) => {
  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("student_id", studentId)
    .eq("active", true)
    .maybeSingle();
  if (!membership?.project_id) return null;
  const { data } = await supabase.from("project_overview").select("*").eq("id", membership.project_id).maybeSingle();
  return data ?? null;
};

export const toProjectResult = (row: {
  id: string | null;
  title: string | null;
  is_group: boolean | null;
  outcome: string | null;
  outcome_note: string | null;
  outcome_at: string | null;
  final_score: number | null;
}, weight = 1): ProjectResult => ({
  id: row.id ?? "",
  title: row.title ?? "Project",
  isGroup: Boolean(row.is_group),
  // No percentage without a recorded result, even if some scores are in.
  percent: row.outcome && row.final_score !== null ? Math.round(Number(row.final_score) * 100) / 100 : null,
  outcome: outcomeLabel(row.outcome)?.label ?? null,
  note: row.outcome_note,
  decidedAt: row.outcome_at,
  weight: Number.isFinite(weight) && weight >= 0 ? weight : 1,
});

/**
 * The overall average with the project counted beside the courses.
 *
 * Each course average counts once. The project counts `weight` times: 1 is the
 * same as one course, 2 is double, 0 leaves it out of the average while it
 * still shows on the record. The weight is the cohort's setting.
 */
export const overallWithProject = (courseAverages: number[], projectPercent: number | null, weight = 1): number => {
  const w = projectPercent === null || !(weight > 0) ? 0 : weight;
  const units = courseAverages.length + w;
  if (units === 0) return 0;
  const sum = courseAverages.reduce((total, value) => total + value, 0) + (projectPercent ?? 0) * w;
  return Math.round(sum / units);
};
