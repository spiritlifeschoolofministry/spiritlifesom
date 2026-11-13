import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";
import { Bar, EmptyCard, Panel, ScreenHeader } from "@/components/redesign/student-pages/ui";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lecturer: string | null;
  is_completed: boolean | null;
  start_date: string | null;
  semester: number | null;
}

type CourseState = "live" | "done" | "soon";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Completed, not started yet (a start date still ahead), or running now. */
const stateOf = (course: Course, today: string): CourseState => {
  if (course.is_completed) return "done";
  if (course.start_date && course.start_date > today) return "soon";
  return "live";
};

/** Board order: what is running, then what is finished, then what is to come. */
const STATE_ORDER: Record<CourseState, number> = { live: 0, done: 1, soon: 2 };

const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", opts);

/** "SLSM105" → "105": the number students actually call a course by. */
const shortCode = (code: string) => code.match(/\d+[A-Z]?$/i)?.[0] ?? code.slice(0, 4);

const StudentCourses = () => {
  const { student } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  // Class sessions per course from the schedule: held so far vs planned.
  const [sessions, setSessions] = useState<Record<string, { held: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!student?.cohort_id) {
          setCourses([]);
          return;
        }

        const { data, error } = await supabase
          .from("courses")
          .select("id, code, title, description, lecturer, is_completed, start_date, semester")
          .eq("cohort_id", student.cohort_id)
          .order("semester", { ascending: true })
          .order("start_date", { ascending: true, nullsFirst: false });

        if (error) throw error;
        setCourses((data as Course[]) || []);

        const { data: sched } = await supabase
          .from("schedule")
          .select("course_id, date")
          .eq("cohort_id", student.cohort_id)
          .eq("counts_for_attendance", true)
          .not("course_id", "is", null);
        const todayIso = new Date().toISOString().slice(0, 10);
        const bySession: Record<string, { held: number; total: number }> = {};
        for (const row of sched ?? []) {
          if (!row.course_id) continue;
          const entry = (bySession[row.course_id] ??= { held: 0, total: 0 });
          entry.total += 1;
          if (row.date <= todayIso) entry.held += 1;
        }
        setSessions(bySession);
        setError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load courses";
        console.error("[StudentCourses] Load error:", err);
        setError(msg);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [student?.cohort_id]);

  const completed = courses.filter((c) => c.is_completed);
  const progressPercent = courses.length > 0 ? Math.round((completed.length / courses.length) * 100) : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-20 rounded-[20px]" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader title="My courses" />
        <EmptyCard icon={<BookOpen className="h-6 w-6" aria-hidden="true" />} title="No courses yet">
          <p>No courses have been assigned to your cohort yet.</p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </EmptyCard>
      </div>
    );
  }

  const today = todayIso();
  const semesters = [1, 2]
    .map((sem) => ({
      sem,
      list: courses
        .filter((c) => (c.semester ?? 1) === sem)
        .sort((a, b) => STATE_ORDER[stateOf(a, today)] - STATE_ORDER[stateOf(b, today)]),
    }))
    .filter((s) => s.list.length > 0);
  const showSemesterHeadings = semesters.length > 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader title="My courses" />

      <Panel className="space-y-2 rounded-2xl px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <strong className="font-bold">Programme progress</strong>
          <span className="text-muted-foreground">
            {completed.length} of {courses.length} course{courses.length === 1 ? "" : "s"}
          </span>
        </div>
        <Bar value={progressPercent} label={`Programme progress, ${progressPercent}%`} />
      </Panel>

      {semesters.map(({ sem, list }) => (
        <section key={sem} aria-labelledby={`sem-${sem}`} className="space-y-2.5">
          <h2
            id={`sem-${sem}`}
            className={showSemesterHeadings ? "pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground" : "sr-only"}
          >
            {sem === 1 ? "First semester" : "Second semester"} · {list.length} course{list.length === 1 ? "" : "s"}
          </h2>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {list.map((course) => (
              <CourseRow key={course.id} course={course} state={stateOf(course, today)} sessions={sessions[course.id]} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const STATE_STYLE: Record<CourseState, { tile: string; text: string }> = {
  live: { tile: "bg-[#EFE9FB] text-[#5B21B6] dark:bg-primary/20 dark:text-violet-200", text: "text-[#5B21B6] dark:text-violet-300" },
  done: { tile: "bg-[#E6F4EE] text-[#11603F] dark:bg-emerald-500/15 dark:text-emerald-300", text: "text-[#11603F] dark:text-emerald-300" },
  soon: { tile: "bg-[#F1EFF6] text-muted-foreground dark:bg-muted", text: "text-muted-foreground" },
};

const CourseRow = ({ course, state, sessions }: { course: Course; state: CourseState; sessions?: { held: number; total: number } }) => {
  const style = STATE_STYLE[state];
  const stateLabel =
    state === "done"
      ? "Completed"
      : state === "soon" && course.start_date
        ? `Starts ${formatDate(course.start_date, { day: "numeric", month: "short" })}`
        : "In progress";
  const meta = [
    course.code,
    course.lecturer || "Lecturer TBA",
    state !== "soon" && course.start_date
      ? `from ${formatDate(course.start_date, { day: "numeric", month: "short", year: "numeric" })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span
        aria-hidden="true"
        className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold", style.tile)}
      >
        {shortCode(course.code)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[15px] font-bold leading-snug text-foreground">{course.title}</h3>
          <span className={cn("shrink-0 pt-0.5 text-xs font-semibold", style.text)}>{stateLabel}</span>
        </div>
        {state === "done" && <Bar value={100} tone="success" label={`${course.title}: completed`} className="h-1.5" />}
        {state !== "done" && sessions && sessions.total > 0 && (
          <div className="flex items-center gap-2">
            <Bar
              value={Math.round((sessions.held / sessions.total) * 100)}
              label={`${course.title}: ${sessions.held} of ${sessions.total} sessions held`}
              className="h-1.5 flex-1"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {sessions.held}/{sessions.total} sessions
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{meta}</p>
        {course.description && <p className="line-clamp-2 text-xs text-muted-foreground">{course.description}</p>}
      </div>
    </li>
  );
};

export default StudentCourses;
