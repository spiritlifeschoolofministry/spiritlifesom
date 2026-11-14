/** Academic project and defence: rubric maths, statuses and small rules. */

/** One line of a cohort's defence rubric (project_rubric_criteria). */
export interface RubricCriterion {
  id: string;
  label: string;
  max_marks: number;
}

/** Marks keyed by criterion id, as stored in project_scores.scores. */
export type RubricScores = Record<string, number>;

/** Offered as a starting point when a cohort has no rubric; staff then edit it. */
export const USUAL_RUBRIC = [
  { label: "Content and research", max_marks: 30 },
  { label: "Biblical and theological grounding", max_marks: 25 },
  { label: "Presentation", max_marks: 20 },
  { label: "Answers to questions", max_marks: 15 },
  { label: "Writing and referencing", max_marks: 10 },
];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** What the rubric is marked out of. */
export const rubricOutOf = (criteria: RubricCriterion[]): number =>
  round2(criteria.reduce((sum, criterion) => sum + Number(criterion.max_marks), 0));

/**
 * The first problem with a set of marks, or null when every criterion is in
 * range. The database applies the same rules (project_scores_apply_rubric);
 * this is so the person hears about it before saving.
 */
export const rubricProblem = (criteria: RubricCriterion[], scores: RubricScores): string | null => {
  if (criteria.length === 0) return "Set the scoring rubric for this cohort first.";
  for (const criterion of criteria) {
    const value = scores[criterion.id];
    if (typeof value !== "number" || !Number.isFinite(value)) return `Enter a mark for "${criterion.label}".`;
    if (value < 0 || value > Number(criterion.max_marks)) return `"${criterion.label}" is marked out of ${Number(criterion.max_marks)}.`;
  }
  return null;
};

export const rubricTotal = (criteria: RubricCriterion[], scores: RubricScores): number =>
  round2(criteria.reduce((sum, criterion) => sum + (Number(scores[criterion.id]) || 0), 0));

/** Reads the jsonb column back, keeping only marks for criteria that still exist. */
export const parseRubricScores = (criteria: RubricCriterion[], value: unknown): RubricScores => {
  const out: RubricScores = {};
  if (!value || typeof value !== "object") return out;
  for (const criterion of criteria) {
    const mark = (value as Record<string, unknown>)[criterion.id];
    if (typeof mark === "number" && Number.isFinite(mark)) out[criterion.id] = mark;
  }
  return out;
};

/** "78.5%" for a project's final score; whole numbers lose the decimals. */
export const formatPercent = (score: number | string | null | undefined): string =>
  score === null || score === undefined || score === "" ? "" : `${round2(Number(score))}%`;

/** A member of a project, as project_overview.members lists them. */
export interface ProjectMember {
  student_id: string;
  profile_id: string;
  name: string;
  code: string | null;
  lead: boolean;
  /** This member's own result as a percentage. Staff only; null for students. */
  score: number | null;
}

/** How a project is scored. */
export type ScoringMode = "group" | "individual" | "both";

export const SCORING_MODES: { value: ScoringMode; label: string; hint: string }[] = [
  { value: "group", label: "Group score", hint: "The panel scores the project once and every member gets that score." },
  { value: "individual", label: "Individual scores", hint: "The panel scores each member separately." },
  { value: "both", label: "Group and individual", hint: "The panel gives a group score and a score for each member; the two are combined." },
];

export const scoringModeLabel = (mode: string | null | undefined): string =>
  SCORING_MODES.find((option) => option.value === mode)?.label ?? "Group score";

/** Which score sheets a panel member fills in for a mode. */
export const scoreTargets = (mode: string | null | undefined): { group: boolean; individual: boolean } => ({
  group: mode !== "individual",
  individual: mode === "individual" || mode === "both",
});

/**
 * A member's result from the group and individual percentages. Mirrors
 * project_refresh_scores() in the database, which is what is actually stored;
 * this exists to explain the figure on screen. `individualWeight` is 0-100.
 */
export const combineScores = (
  mode: string | null | undefined,
  groupPercent: number | null,
  individualPercent: number | null,
  individualWeight: number,
): number | null => {
  if (mode === "individual") return individualPercent;
  if (mode === "both") {
    if (groupPercent === null || individualPercent === null) return null;
    return round2((groupPercent * (100 - individualWeight)) / 100 + (individualPercent * individualWeight) / 100);
  }
  return groupPercent;
};

/** The mean of scores as a percentage of what each was out of; null when there are none. */
export const averagePercent = (scores: { total: number | string; out_of: number | string }[]): number | null => {
  const valid = scores.filter((score) => Number(score.out_of) > 0);
  if (valid.length === 0) return null;
  return round2(valid.reduce((sum, score) => sum + (Number(score.total) / Number(score.out_of)) * 100, 0) / valid.length);
};

/** Days left before a deleted project is purged, never below 0. */
export const daysUntilPurge = (purgeAt: string | null | undefined, now: Date = new Date()): number => {
  if (!purgeAt) return 0;
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / 86_400_000));
};

/** Reads project_overview.members (jsonb) defensively. */
export const parseMembers = (value: unknown): ProjectMember[] =>
  Array.isArray(value)
    ? value
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          student_id: String(row.student_id ?? ""),
          profile_id: String(row.profile_id ?? ""),
          name: String(row.name ?? "") || "Unnamed",
          code: typeof row.code === "string" ? row.code : null,
          lead: row.lead === true,
          score: typeof row.score === "number" ? row.score : null,
        }))
        .filter((member) => member.student_id)
    : [];

/** Category used for defences on the calendars. */
export const DEFENCE_CATEGORY = "Defence";

interface DefenceLike {
  id: string | null;
  title: string | null;
  defence_at: string | null;
  defence_venue: string | null;
  member_names: string | null;
  cohort_id: string | null;
}

/**
 * Project defences as calendar entries, in the shape the calendars already
 * draw (school_events). Ids start with "defence:" so a calendar can tell them
 * from real events, which they are not: they cannot be edited there.
 */
export const defenceEvents = (projects: DefenceLike[], audience: "student" | "staff") =>
  projects
    .filter((project) => project.id && project.defence_at)
    .map((project) => ({
      id: `defence:${project.id}`,
      title: audience === "staff" ? `Defence: ${project.member_names || "project"}` : "Your project defence",
      description: [project.title, project.defence_venue].filter(Boolean).join("\n") || null,
      category: DEFENCE_CATEGORY,
      start_date: project.defence_at as string,
      end_date: null,
      target_cohort_id: project.cohort_id,
      created_at: null,
      whatsapp_reminded_at: null,
    }));

/** The project id behind a calendar entry made by defenceEvents, or null. */
export const defenceProjectId = (eventId: string): string | null =>
  eventId.startsWith("defence:") ? eventId.slice("defence:".length) : null;

export type TopicStatus = "awaiting_topic" | "proposed" | "changes_requested" | "approved" | "rejected";
export type Outcome = "pass" | "pass_with_corrections" | "redefend";
export type SubmissionStatus = "submitted" | "approved" | "changes_requested";

type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

export const TOPIC_STATUS: Record<TopicStatus, { label: string; tone: PillTone }> = {
  // A group the school formed that has not sent its topic yet.
  awaiting_topic: { label: "No topic yet", tone: "neutral" },
  proposed: { label: "Waiting for approval", tone: "warning" },
  changes_requested: { label: "Changes asked for", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
};

export const OUTCOMES: { value: Outcome; label: string; tone: PillTone }[] = [
  { value: "pass", label: "Passed", tone: "success" },
  { value: "pass_with_corrections", label: "Passed with corrections", tone: "info" },
  { value: "redefend", label: "To defend again", tone: "danger" },
];

export const outcomeLabel = (outcome: string | null | undefined) =>
  OUTCOMES.find((option) => option.value === outcome) ?? null;

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: PillTone }> = {
  submitted: { label: "Waiting for feedback", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes asked for", tone: "danger" },
};

interface ProjectLike {
  status: string | null;
  defence_at: string | null;
  outcome: string | null;
  final_approved_at: string | null;
}

/** Where a project has got to, in a few words, for lists. */
export const projectStep = (project: ProjectLike): { label: string; tone: PillTone } => {
  if (project.status !== "approved") {
    return TOPIC_STATUS[(project.status as TopicStatus) ?? "proposed"] ?? TOPIC_STATUS.proposed;
  }
  if (project.outcome === "pass") return { label: "Completed", tone: "success" };
  if (project.outcome === "pass_with_corrections") {
    return project.final_approved_at
      ? { label: "Completed", tone: "success" }
      : { label: "Corrections due", tone: "warning" };
  }
  if (project.outcome === "redefend") return { label: "To defend again", tone: "danger" };
  if (project.defence_at) return { label: "Defence scheduled", tone: "info" };
  return { label: "In progress", tone: "neutral" };
};

/** A project is complete when it passed, or passed with corrections that were signed off. */
export const isProjectComplete = (project: ProjectLike): boolean =>
  project.status === "approved" &&
  (project.outcome === "pass" || (project.outcome === "pass_with_corrections" && Boolean(project.final_approved_at)));

interface SubmissionLike {
  stage_id: string | null;
  kind: string;
  status: string;
  submitted_at: string;
}

/** The newest submission for a stage (or, with null, the newest corrected copy). */
export const latestSubmission = <T extends SubmissionLike>(submissions: T[], stageId: string | null): T | null => {
  const matching = submissions.filter((row) =>
    stageId === null ? row.kind === "correction" : row.kind === "stage" && row.stage_id === stageId,
  );
  return matching.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0] ?? null;
};

/** How many stages have an approved newest submission. */
export const stagesApproved = (stageIds: string[], submissions: SubmissionLike[]): number =>
  stageIds.filter((id) => latestSubmission(submissions, id)?.status === "approved").length;

/** The first problem with a topic, or null when it can be sent. */
export const topicProblem = (title: string, abstract: string): string | null => {
  if (title.trim().length < 5) return "Write the title of your project.";
  if (title.trim().length > 300) return "Keep the title under 300 characters.";
  if (abstract.trim().length < 30) return "Describe what the project is about in a few sentences.";
  if (abstract.length > 5000) return "Keep the description under 5,000 characters.";
  return null;
};

/** The stages most cohorts use; offered as a starting point, then edited. */
export const USUAL_STAGES = ["Proposal", "Chapters 1 to 3", "Full draft", "Final copy"];

/** A safe storage key for an uploaded project file. */
export const projectFilePath = (studentId: string, projectId: string, fileName: string, now: number): string =>
  `projects/${studentId}/${projectId}/${now}_${fileName.replace(/[^\w.\- ]+/g, "_").slice(-120)}`;

/** Files a project draft may be: documents only, up to 25 MB. */
export const PROJECT_FILE_ACCEPT = ".pdf,.doc,.docx,.odt,.rtf";
export const PROJECT_FILE_MAX_BYTES = 25 * 1024 * 1024;

export const projectFileProblem = (file: { name: string; size: number }): string | null => {
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!PROJECT_FILE_ACCEPT.split(",").includes(extension)) return "Upload a PDF or a Word document.";
  if (file.size > PROJECT_FILE_MAX_BYTES) return "The file is larger than 25 MB.";
  return null;
};

/** The pill tones above, on the admin screens' scale. */
export const ADMIN_TONE = {
  success: "good",
  warning: "warn",
  danger: "bad",
  info: "info",
  neutral: "neutral",
} as const;

/** `datetime-local` value (local time) for an ISO timestamp, and back. */
export const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInput = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

interface ArchiveRow {
  title: string | null;
  abstract: string | null;
  authors: string | null;
  cohort_name: string | null;
  year: number | null;
}

/** Whether an archive row mentions the search text in its title, topic, authors or cohort. */
export const matchesArchiveSearch = (row: ArchiveRow, search: string): boolean => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [row.title, row.abstract, row.authors, row.cohort_name].some((text) => text?.toLowerCase().includes(needle));
};

/** The years present in the archive, newest first. */
export const archiveYears = (rows: { year: number | null }[]): number[] =>
  [...new Set(rows.map((row) => row.year).filter((year): year is number => typeof year === "number"))].sort((a, b) => b - a);

/** The first problem with a past project being added, or null. */
export const archiveEntryProblem = (entry: { title: string; authors: string; year: string }): string | null => {
  if (entry.title.trim().length < 5) return "Write the project's title.";
  if (entry.authors.trim().length < 2) return "Write who the project is by.";
  if (entry.year) {
    const year = Number(entry.year);
    if (!Number.isInteger(year) || year < 1980 || year > 2100) return "Enter the year as four digits, for example 2023.";
  }
  return null;
};

/** The first problem with a cohort's project settings, or null. */
export const projectSettingsProblem = (settings: { weight: string; groupMax: string }): string | null => {
  const weight = Number(settings.weight);
  if (settings.weight.trim() === "" || !Number.isFinite(weight) || weight < 0 || weight > 20) {
    return "The weight is a number from 0 to 20.";
  }
  const max = Number(settings.groupMax);
  if (!Number.isInteger(max) || max < 2 || max > 100) return "The largest group is a whole number from 2 to 100.";
  return null;
};

interface ReportProject extends ProjectLike {
  title: string | null;
  is_group: boolean | null;
  members: unknown;
  supervisor_name: string | null;
  final_score: number | null;
  cohort_name?: string | null;
}

export interface ProjectSummary {
  total: number;
  groups: number;
  /** Students in a project, counting every member of a group. */
  students: number;
  awaitingTopic: number;
  topicsToReview: number;
  inProgress: number;
  defenceScheduled: number;
  completed: number;
  /** Mean of the students' own results on projects with a recorded outcome; null when there are none. */
  averageScore: number | null;
}

/** Headline figures for a set of projects, for Analytics. */
export const summariseProjects = (projects: ReportProject[]): ProjectSummary => {
  const scores: number[] = [];
  let students = 0;
  for (const project of projects) {
    const members = parseMembers(project.members);
    students += members.length;
    if (!project.outcome) continue;
    for (const member of members) if (member.score !== null) scores.push(member.score);
  }
  const approvedOpen = projects.filter((p) => p.status === "approved" && !isProjectComplete(p));
  return {
    total: projects.length,
    groups: projects.filter((p) => p.is_group).length,
    students,
    awaitingTopic: projects.filter((p) => p.status === "awaiting_topic").length,
    topicsToReview: projects.filter((p) => p.status === "proposed").length,
    inProgress: approvedOpen.filter((p) => !p.defence_at).length,
    defenceScheduled: approvedOpen.filter((p) => p.defence_at).length,
    completed: projects.filter(isProjectComplete).length,
    averageScore: scores.length ? round2(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
  };
};

/** One row per student per project, for the Project Results export. */
export const projectResultRows = (projects: ReportProject[]) =>
  projects.flatMap((project) =>
    parseMembers(project.members).map((member) => ({
      student: member.name,
      student_code: member.code ?? "",
      cohort: project.cohort_name ?? "",
      project: project.title?.trim() || "No topic yet",
      type: project.is_group ? "Group" : "Individual",
      supervisor: project.supervisor_name ?? "",
      stage: projectStep(project).label,
      outcome: outcomeLabel(project.outcome)?.label ?? "",
      // The student's own result, only once an outcome is recorded.
      score_percent: project.outcome && member.score !== null ? member.score : "",
    })),
  );
