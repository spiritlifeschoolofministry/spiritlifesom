import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ArrowRight, CalendarCheck, FileCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { groupExamWindows, formatMinutes, type ExamWindow, type WindowExam } from "@/lib/exam-windows";

/** How far ahead an exam window still counts as "up next". */
const EXAM_HORIZON_DAYS = 14;

interface NextClass {
  date: string;
  start_time: string | null;
  end_time: string | null;
  activity_type: string | null;
}

/**
 * The first thing on Today: what the student should do next. An open exam
 * window wins, then the soonest window in the next two weeks, then the next
 * class. Renders nothing when none of those exist, rather than an empty card.
 */
const UpNext = () => {
  const { student } = useAuth();
  const [window_, setWindow] = useState<ExamWindow<WindowExam> | null>(null);
  const [nextClass, setNextClass] = useState<NextClass | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!student?.id || !student.cohort_id) return;
    let cancelled = false;
    (async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const [{ data: exams }, { data: attempts }, { data: classes }] = await Promise.all([
        // Same filter as My Exams; row-level security already limits it to
        // the papers this student may sit.
        supabase
          .from("exams")
          .select("id, title, start_at, end_at, duration_minutes, status")
          .in("status", ["published", "in_progress", "closed"]),
        supabase.from("exam_attempts").select("exam_id, status").eq("student_id", student.id),
        supabase
          .from("schedule")
          .select("date, start_time, end_time, activity_type")
          .eq("cohort_id", student.cohort_id)
          .eq("counts_for_attendance", true)
          .gte("date", today)
          .order("date", { ascending: true })
          .limit(1),
      ]);
      if (cancelled) return;
      const byExam = Object.fromEntries((attempts ?? []).map((a) => [a.exam_id, { status: a.status }]));
      const horizon = Date.now() + EXAM_HORIZON_DAYS * 86400000;
      const next = groupExamWindows(exams ?? [], byExam).find(
        (w) => w.state === "live" || (w.state === "upcoming" && w.start.getTime() <= horizon),
      );
      setWindow(next ?? null);
      setNextClass(classes?.[0] ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [student?.id, student?.cohort_id]);

  if (!loaded || (!window_ && !nextClass)) return null;

  if (window_) {
    const many = window_.exams.length > 1;
    const live = window_.state === "live";
    const short = live && window_.minutesNeeded > window_.minutesLeft;
    return (
      <section aria-label="Up next" className="rounded-2xl gradient-purple p-5 text-primary-foreground shadow-lg">
        <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/75">
          {live ? "Up next · exams open now" : `Up next · ${format(window_.start, "EEEE d MMMM")}`}
        </p>
        <h2 className="mt-2 flex items-center gap-2 text-xl font-bold">
          <FileCheck className="h-5 w-5" aria-hidden="true" />
          {many ? `${window_.exams.length} papers` : window_.exams[0].title} · {format(window_.start, "p")} – {format(window_.end, "p")}
        </h2>
        <p className="mt-1 text-sm text-primary-foreground/85">
          {many && `${window_.done} of ${window_.exams.length} done. Sit them in any order.`}
          {live && window_.minutesNeeded > 0 && ` ${formatMinutes(window_.minutesLeft)} left · the papers left need ${formatMinutes(window_.minutesNeeded)}.`}
        </p>
        {short && (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Not enough time left for every paper. Start now.
          </p>
        )}
        <Link
          to="/student/exams"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-primary transition-transform hover:-translate-y-0.5"
        >
          {live ? "Go to my exams" : "See the papers"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const cls = nextClass!;
  const date = new Date(`${cls.date}T00:00:00`);
  const today = isToday(date);
  return (
    <section aria-label="Up next" className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Up next · {today ? "today" : format(date, "EEEE d MMMM")}
      </p>
      <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-foreground">
        <CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        {cls.activity_type || "Class"}
        {cls.start_time ? ` · ${cls.start_time.slice(0, 5)}${cls.end_time ? `–${cls.end_time.slice(0, 5)}` : ""}` : ""}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">It counts for attendance. Check in from the app while the window is open.</p>
      <Link
        to="/student/attendance"
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
      >
        {today ? "Check in" : "Attendance"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
};

export default UpNext;
