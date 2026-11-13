import { useEffect, useState } from "react";
import { format, isToday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { groupExamWindows, type ExamWindow, type WindowExam } from "@/lib/exam-windows";

/** How far ahead an exam window still counts as "up next". */
export const EXAM_HORIZON_DAYS = 14;

/** How many upcoming classes are read: enough to cover a full day. */
const CLASS_LOOKAHEAD = 12;

export interface PlanClass {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  activity_type: string | null;
  course: { code: string; title: string } | null;
}

/** Where one paper on today's timetable stands for this student. */
export type PaperState = "done" | "started" | "open" | "upcoming" | "closed";

export interface TodayPaper {
  exam: WindowExam;
  start: Date;
  end: Date;
  state: PaperState;
}

export interface TodayPlan {
  loaded: boolean;
  /** The exam window to put first: open now, else the soonest in two weeks. */
  window: ExamWindow<WindowExam> | null;
  /** The next class that counts for attendance, today or later. */
  nextClass: PlanClass | null;
  /** Every paper whose window opens today, one row each. */
  todayPapers: TodayPaper[];
  /** Today's classes that count for attendance. */
  todayClasses: PlanClass[];
}

const EMPTY: TodayPlan = { loaded: false, window: null, nextClass: null, todayPapers: [], todayClasses: [] };

/**
 * What the student has on, read once for Today: the exam windows (same read
 * as My Exams — row-level security limits it to the papers this student may
 * sit), their own attempts, and the cohort's upcoming classes. Up next and
 * Today's timetable both render from this, so they can never disagree.
 */
export const useTodayPlan = (): TodayPlan => {
  const { student } = useAuth();
  const [plan, setPlan] = useState<TodayPlan>(EMPTY);

  useEffect(() => {
    if (!student?.id || !student.cohort_id) return;
    let cancelled = false;
    (async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const [{ data: exams }, { data: attempts }, { data: classes }] = await Promise.all([
        supabase
          .from("exams")
          .select("id, title, start_at, end_at, duration_minutes, status")
          .in("status", ["published", "in_progress", "closed"]),
        supabase.from("exam_attempts").select("exam_id, status").eq("student_id", student.id),
        supabase
          .from("schedule")
          .select("id, date, start_time, end_time, activity_type, courses(code, title)")
          .eq("cohort_id", student.cohort_id)
          .eq("counts_for_attendance", true)
          .gte("date", today)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(CLASS_LOOKAHEAD),
      ]);
      if (cancelled) return;

      const byExam = Object.fromEntries((attempts ?? []).map((a) => [a.exam_id, { status: a.status }]));
      const windows = groupExamWindows(exams ?? [], byExam);
      const horizon = Date.now() + EXAM_HORIZON_DAYS * 86400000;
      const next = windows.find(
        (w) => w.state === "live" || (w.state === "upcoming" && w.start.getTime() <= horizon),
      );

      const todayPapers: TodayPaper[] = windows
        .filter((w) => isToday(w.start))
        .flatMap((w) =>
          w.exams.map((exam) => {
            const attempt = byExam[exam.id]?.status;
            const state: PaperState =
              attempt === "submitted" || attempt === "graded"
                ? "done"
                : w.state === "live"
                  ? attempt
                    ? "started"
                    : "open"
                  : w.state === "upcoming"
                    ? "upcoming"
                    : "closed";
            return { exam, start: w.start, end: w.end, state };
          }),
        );

      const rows: PlanClass[] = (classes ?? []).map((c) => ({
        id: c.id,
        date: c.date,
        start_time: c.start_time,
        end_time: c.end_time,
        activity_type: c.activity_type,
        course: (c.courses as { code: string; title: string } | null) ?? null,
      }));

      setPlan({
        loaded: true,
        window: next ?? null,
        nextClass: rows[0] ?? null,
        todayPapers,
        todayClasses: rows.filter((c) => c.date === today),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [student?.id, student?.cohort_id]);

  return plan;
};
