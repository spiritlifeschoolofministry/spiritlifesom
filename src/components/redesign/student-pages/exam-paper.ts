import type { Tone } from "./ui";

/**
 * What one paper on the student's Exams screen is, right now, and what (if
 * anything) the student can do about it. Pure, so the rules the buttons follow
 * can be tested without rendering the page.
 *
 * The action rules are the ones the list has always used, unchanged:
 * - no attempt, and the paper is open now or opens within the hour → the lobby
 *   ("Start" while open, "Enter lobby" before it opens);
 * - an attempt in progress while the paper is open → back into the runner
 *   ("Resume").
 */

export interface PaperExam {
  start_at: string;
  end_at: string;
  status?: string | null;
  results_released?: boolean | null;
  total_points?: number | null;
  passing_score?: number | null;
}

export interface PaperAttempt {
  status: string | null;
  score?: number | null;
  manual_score_override?: number | null;
  max_points?: number | null;
}

export type PaperAction = "start" | "enter" | "resume" | null;

export interface PaperState {
  upcoming: boolean;
  live: boolean;
  closed: boolean;
  /** Sat and submitted (or marked). */
  done: boolean;
  released: boolean;
  finalScore: number;
  total: number;
  pct: number;
  passed: boolean;
  action: PaperAction;
  pill: { tone: Tone; label: string };
}

const HOUR_MS = 60 * 60_000;

export function paperState(exam: PaperExam, attempt: PaperAttempt | undefined | null, now: Date = new Date()): PaperState {
  const start = new Date(exam.start_at);
  const end = new Date(exam.end_at);
  const upcoming = now < start;
  const live = !(now < start) && !(now > end);
  const closed = now > end || exam.status === "closed";
  const done = attempt?.status === "submitted" || attempt?.status === "graded";
  const released = !!exam.results_released && done;
  const finalScore = Number(attempt?.manual_score_override ?? attempt?.score ?? 0);
  // What this student's sitting was marked out of, not what the whole paper is
  // worth: they differ whenever the exam serves a subset or counts only the
  // best few answers.
  const total = Number(attempt?.max_points ?? exam.total_points ?? 0);
  const pct = total > 0 ? Math.round((finalScore / total) * 100) : 0;
  const passed = pct >= Number(exam.passing_score || 0);

  let action: PaperAction = null;
  if (!attempt && (live || (upcoming && start.getTime() - now.getTime() < HOUR_MS))) {
    action = live ? "start" : "enter";
  } else if (attempt?.status === "in_progress" && live) {
    action = "resume";
  }

  let pill: PaperState["pill"];
  if (released) pill = { tone: passed ? "success" : "danger", label: `${pct}% · ${passed ? "Passed" : "Failed"}` };
  else if (done) pill = live ? { tone: "info", label: "Submitted" } : { tone: "info", label: "Awaiting results" };
  else if (attempt?.status === "in_progress" && live) pill = { tone: "gold", label: "In progress" };
  else if (upcoming) pill = { tone: "info", label: "Upcoming" };
  else if (!attempt && now > end) pill = { tone: "warning", label: "Missed" };
  else if (closed) pill = { tone: "neutral", label: "Closed" };
  else pill = { tone: "neutral", label: "Open" };

  return { upcoming, live, closed, done, released, finalScore, total, pct, passed, action, pill };
}
