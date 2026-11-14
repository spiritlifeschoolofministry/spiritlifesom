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
    .maybeSingle();
  if (!membership?.project_id) return null;
  const { data } = await supabase
    .from("project_overview")
    .select("id, title, is_group, status, outcome, outcome_note, outcome_at, final_score")
    .eq("id", membership.project_id)
    .maybeSingle();
  if (!data?.id || data.status !== "approved") return null;
  return toProjectResult(data);
};

export const toProjectResult = (row: {
  id: string | null;
  title: string | null;
  is_group: boolean | null;
  outcome: string | null;
  outcome_note: string | null;
  outcome_at: string | null;
  final_score: number | null;
}): ProjectResult => ({
  id: row.id ?? "",
  title: row.title ?? "Project",
  isGroup: Boolean(row.is_group),
  // No percentage without a recorded result, even if some scores are in.
  percent: row.outcome && row.final_score !== null ? Math.round(Number(row.final_score) * 100) / 100 : null,
  outcome: outcomeLabel(row.outcome)?.label ?? null,
  note: row.outcome_note,
  decidedAt: row.outcome_at,
});

/**
 * The overall average with the project counted as one more unit beside the
 * courses: each course average and the project percentage weigh the same.
 */
export const overallWithProject = (courseAverages: number[], projectPercent: number | null): number => {
  const units = projectPercent === null ? courseAverages : [...courseAverages, projectPercent];
  return units.length ? Math.round(units.reduce((sum, value) => sum + value, 0) / units.length) : 0;
};
