import { Link } from "react-router-dom";
import { format } from "date-fns";
import { formatMinutes } from "@/lib/exam-windows";
import type { PaperState, PlanClass, TodayPlan } from "./useTodayPlan";

type Tone = "gold" | "lavender" | "muted" | "green";

interface Row {
  key: string;
  at: Date;
  title: string;
  meta: string;
  state: string;
  tone: Tone;
  /** Highlights the row the student should act on now. */
  current: boolean;
  href: string;
}

const PILL: Record<Tone, string> = {
  gold: "bg-primary text-primary-foreground",
  lavender: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-foreground/80",
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const BAR: Record<Tone, string> = {
  gold: "bg-primary",
  lavender: "bg-border",
  muted: "bg-primary/60",
  green: "bg-emerald-600",
};

const PAPER: Record<PaperState, { state: string; tone: Tone }> = {
  done: { state: "Submitted", tone: "lavender" },
  started: { state: "In progress", tone: "gold" },
  open: { state: "Lobby open", tone: "gold" },
  upcoming: { state: "Upcoming", tone: "muted" },
  closed: { state: "Closed", tone: "muted" },
};

const at = (date: string, hhmm: string | null) => new Date(`${date}T${hhmm ?? "00:00"}`);

const classRow = (c: PlanClass, now: Date): Row => {
  const start = at(c.date, c.start_time);
  const end = c.end_time ? at(c.date, c.end_time) : null;
  const inSession = c.start_time != null && now >= start && (!end || now <= end);
  const over = end != null && now > end;
  const title = [c.activity_type || "Class", c.course ? `${c.course.code} ${c.course.title}` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    key: `class-${c.id}`,
    at: start,
    title,
    meta: [end ? `Until ${format(end, "h:mm a")}` : null, "counts for attendance"].filter(Boolean).join(" · "),
    state: inSession ? "In session" : over ? "Ended" : "Later today",
    tone: inSession ? "green" : "muted",
    current: inSession,
    href: "/student/attendance",
  };
};

/**
 * Today's papers and classes in time order, each with where it stands. Built
 * from the same plan as Up next. Renders nothing on a day with neither.
 */
const TodayTimetable = ({ plan }: { plan: TodayPlan }) => {
  if (!plan.loaded) return null;
  const now = new Date();

  const rows: Row[] = [
    ...plan.todayPapers.map(({ exam, start, end, state }) => {
      const s = PAPER[state];
      const live = state === "open" || state === "started";
      const meta =
        state === "done"
          ? "submitted"
          : live
            ? `open until ${format(end, "h:mm a")}`
            : state === "upcoming"
              ? `opens ${format(start, "h:mm a")}`
              : "window closed";
      return {
        key: `exam-${exam.id}`,
        at: start,
        title: exam.title ?? "Exam",
        meta: `${formatMinutes(Number(exam.duration_minutes) || 0)} · ${meta}`,
        state: s.state,
        tone: s.tone,
        current: live,
        href: live ? `/student/exams/${exam.id}/lobby` : "/student/exams",
      };
    }),
    ...plan.todayClasses.map((c) => classRow(c, now)),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="today-timetable" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 id="today-timetable" className="text-base font-bold text-foreground">
          Today's timetable
        </h2>
        <Link to="/student/exams" className="text-sm font-semibold text-primary hover:underline">
          All exams
        </Link>
      </div>
      <ul className="overflow-hidden rounded-[18px] border border-border bg-card">
        {rows.map((row, i) => (
          <li key={row.key} className={i > 0 ? "border-t border-border/60" : undefined}>
            <Link
              to={row.href}
              className={`flex min-h-16 items-center gap-3 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                row.current ? "bg-secondary/60" : ""
              }`}
            >
              <span className="flex w-[52px] shrink-0 flex-col">
                <strong className="text-sm">{format(row.at, "h:mm")}</strong>
                <span className="text-[11px] text-muted-foreground">{format(row.at, "a").toLowerCase()}</span>
              </span>
              <span aria-hidden="true" className={`w-1 self-stretch rounded-sm ${BAR[row.tone]}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong className="truncate text-sm">{row.title}</strong>
                <span className="text-xs text-muted-foreground">{row.meta}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${PILL[row.tone]}`}>{row.state}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TodayTimetable;
