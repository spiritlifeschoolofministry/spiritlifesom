/** Academic project and defence: the rubric, statuses and small rules. */

/** What the panel scores a defence on. Marks add up to 100. */
export const DEFENCE_RUBRIC = [
  { key: "content", label: "Content and research", max: 30 },
  { key: "biblical", label: "Biblical and theological grounding", max: 25 },
  { key: "presentation", label: "Presentation", max: 20 },
  { key: "questions", label: "Answers to questions", max: 15 },
  { key: "writing", label: "Writing and referencing", max: 10 },
] as const;

export type RubricKey = (typeof DEFENCE_RUBRIC)[number]["key"];
export type RubricScores = Partial<Record<RubricKey, number>>;

export const RUBRIC_TOTAL = DEFENCE_RUBRIC.reduce((sum, criterion) => sum + criterion.max, 0);

/** The first problem with a set of marks, or null when every criterion is in range. */
export const rubricProblem = (scores: RubricScores): string | null => {
  for (const criterion of DEFENCE_RUBRIC) {
    const value = scores[criterion.key];
    if (typeof value !== "number" || !Number.isFinite(value)) return `Enter a mark for "${criterion.label}".`;
    if (value < 0 || value > criterion.max) return `"${criterion.label}" is marked out of ${criterion.max}.`;
  }
  return null;
};

export const rubricTotal = (scores: RubricScores): number =>
  Math.round(DEFENCE_RUBRIC.reduce((sum, criterion) => sum + (Number(scores[criterion.key]) || 0), 0) * 100) / 100;

/** Reads the jsonb column back, ignoring anything that is not a rubric mark. */
export const parseRubricScores = (value: unknown): RubricScores => {
  const out: RubricScores = {};
  if (!value || typeof value !== "object") return out;
  for (const criterion of DEFENCE_RUBRIC) {
    const mark = (value as Record<string, unknown>)[criterion.key];
    if (typeof mark === "number" && Number.isFinite(mark)) out[criterion.key] = mark;
  }
  return out;
};

export type TopicStatus = "proposed" | "changes_requested" | "approved" | "rejected";
export type Outcome = "pass" | "pass_with_corrections" | "redefend";
export type SubmissionStatus = "submitted" | "approved" | "changes_requested";

type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

export const TOPIC_STATUS: Record<TopicStatus, { label: string; tone: PillTone }> = {
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
