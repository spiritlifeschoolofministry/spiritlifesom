import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { formatMinutes } from "@/lib/exam-windows";
import type { TodayPlan } from "@/components/redesign/student/useTodayPlan";

/** "starts in 10 min" while it is close, the day otherwise. */
const startsLabel = (start: Date, now: Date) => {
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return "opening now";
  if (isToday(start) && minutes < 6 * 60) return `starts in ${formatMinutes(minutes)}`;
  if (isToday(start)) return `today at ${format(start, "h:mm a")}`;
  return format(start, "EEEE d MMMM");
};

const time = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
};

/**
 * The first thing on Today: what the student should do next. An open exam
 * window wins, then the soonest window in the next two weeks, then the next
 * class. Renders nothing when none of those exist, rather than an empty card.
 *
 * Reads nothing itself: Today loads the plan once (useTodayPlan) and hands it
 * here and to the timetable below, so the two always agree.
 */
const UpNext = ({ plan }: { plan: TodayPlan }) => {
  // Keeps "starts in 10 min" true while the page stays open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const { loaded, window: window_, nextClass } = plan;
  if (!loaded || (!window_ && !nextClass)) return null;

  if (window_) {
    const count = window_.exams.length;
    const many = count > 1;
    const live = window_.state === "live";
    const short = live && window_.minutesNeeded > window_.minutesLeft;
    const single = !many ? window_.exams[0] : null;
    // One open paper: straight to its lobby. Several: the list, where the
    // student chooses the order.
    const target = live && single ? `/student/exams/${single.id}/lobby` : "/student/exams";
    const action = live ? (single ? "Enter exam lobby" : "Go to my exams") : "See the papers";
    return (
      <section aria-label="Up next" className="flex flex-col gap-3.5 rounded-[22px] bg-[#5B21B6] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#E4DAFB]">
            Up next · {live ? "exams open now" : startsLabel(window_.start, now)}
          </p>
          {many && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
              {window_.done} of {count} done
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-[21px] font-extrabold leading-tight tracking-tight">
            {many ? `${count} papers` : single?.title}
          </h2>
          <p className="text-sm text-[#E4DAFB]">
            {format(window_.start, "h:mm")} – {format(window_.end, "h:mm a")}
            {many ? " · sit them in any order" : single ? ` · ${formatMinutes(Number(single.duration_minutes) || 0)}` : ""}
            {live && ` · ${formatMinutes(window_.minutesLeft)} left`}
            {live && many && window_.minutesNeeded > 0 && ` · the papers left need ${formatMinutes(window_.minutesNeeded)}`}
          </p>
        </div>
        {short && (
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Not enough time left for every paper. Start now.
          </p>
        )}
        <Link
          to={target}
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-white text-[15px] font-bold text-[#3F1585] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#5B21B6]"
        >
          {action} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const cls = nextClass!;
  const date = new Date(`${cls.date}T00:00:00`);
  const today = isToday(date);
  const title = [cls.activity_type || "Class", cls.course ? `${cls.course.code} ${cls.course.title}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-label="Up next" className="flex flex-col gap-3.5 rounded-[22px] bg-[#5B21B6] p-5 text-white shadow-lg">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#E4DAFB]">
        Up next · {today ? "today" : format(date, "EEEE d MMMM")}
      </p>
      <div className="flex flex-col gap-1">
        <h2 className="text-[21px] font-extrabold leading-tight tracking-tight">{title}</h2>
        <p className="text-sm text-[#E4DAFB]">
          {cls.start_time ? `${time(cls.start_time)}${cls.end_time ? ` – ${time(cls.end_time)}` : ""} · ` : ""}
          It counts for attendance. Check in from the app while the window is open.
        </p>
      </div>
      <Link
        to="/student/attendance"
        className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-white text-[15px] font-bold text-[#3F1585] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#5B21B6]"
      >
        {today ? "Check in" : "Attendance"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
};

export default UpNext;
