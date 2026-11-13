/**
 * Groups a student's exams into "windows": papers that open and close at the
 * same times on the same day. SLSOM sits several papers in one window (e.g.
 * SLM 101, 102 and 105 EXAM all 8:30–13:00 on 1 Oct), so a flat list hid the
 * thing a student needs to know — how many papers are open now, how many are
 * done, and whether the time left covers the papers still to sit.
 */

export interface WindowExam {
  id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status?: string | null;
  title?: string | null;
}

export interface WindowAttempt {
  status: string | null;
}

export type WindowState = "live" | "upcoming" | "past";

export interface ExamWindow<E extends WindowExam> {
  key: string;
  start: Date;
  end: Date;
  exams: E[];
  state: WindowState;
  /** Papers with a submitted or graded attempt. */
  done: number;
  /** Minutes until the window closes (live only, else 0). */
  minutesLeft: number;
  /** Total duration of the papers not yet submitted. */
  minutesNeeded: number;
}

const isDone = (attempt?: WindowAttempt | null) =>
  attempt?.status === "submitted" || attempt?.status === "graded";

export function groupExamWindows<E extends WindowExam>(
  exams: E[],
  attempts: Record<string, WindowAttempt | undefined>,
  now: Date = new Date(),
): ExamWindow<E>[] {
  const byKey = new Map<string, E[]>();
  for (const exam of exams) {
    const key = `${exam.start_at}|${exam.end_at}`;
    const list = byKey.get(key);
    if (list) list.push(exam);
    else byKey.set(key, [exam]);
  }

  const windows = [...byKey.entries()].map(([key, list]) => {
    const start = new Date(list[0].start_at);
    const end = new Date(list[0].end_at);
    const closedByStatus = list.every((e) => e.status === "closed");
    const state: WindowState =
      now < start ? "upcoming" : now > end || closedByStatus ? "past" : "live";
    const pending = list.filter((e) => !isDone(attempts[e.id]));
    return {
      key,
      start,
      end,
      exams: [...list].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
      state,
      done: list.length - pending.length,
      minutesLeft: state === "live" ? Math.max(0, Math.floor((end.getTime() - now.getTime()) / 60000)) : 0,
      minutesNeeded: pending.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0),
    };
  });

  const rank: Record<WindowState, number> = { live: 0, upcoming: 1, past: 2 };
  return windows.sort((a, b) => {
    if (a.state !== b.state) return rank[a.state] - rank[b.state];
    // Upcoming: soonest first. Past: most recent first.
    return a.state === "past" ? b.start.getTime() - a.start.getTime() : a.start.getTime() - b.start.getTime();
  });
}

/** "2 h 10 min", "45 min". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
