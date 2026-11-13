import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from '@/integrations/supabase/types';

/** An exam_result_answers row, plus the question_bank shape the UI reads. */
type ResultAnswer = Tables<'exam_result_answers'> & {
  question_bank: {
    question_text: string | null;
    question_type: string | null;
    options: Tables<'exam_result_answers'>['options'];
    correct_answer: Tables<'exam_result_answers'>['correct_answer'];
    explanation: string | null;
    points: number | null;
  };
};

type ExamWithCourse = Tables<'exams'> & { courses: { code: string; title: string } | null };
import { useAuth } from "@/contexts/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, isToday } from "date-fns";
import { AlertTriangle, ChevronDown, Clock, Download, FileText } from "lucide-react";
import { formatAnswer, sanitizeHtml, QUESTION_TYPE_LABELS, QuestionType, type AnswerFormattable } from "@/lib/exam-utils";
import { downloadCSV } from "@/lib/csv-export";
import { groupExamWindows, formatMinutes, type ExamWindow } from "@/lib/exam-windows";
import { Bar, DarkPanel, EmptyCard, Pill, ScreenHeader, SectionTitle, type Tone } from "@/components/redesign/student-pages/ui";
import { paperState, type PaperState } from "@/components/redesign/student-pages/exam-paper";
import { cn } from "@/lib/utils";

/** How many earlier windows to list before "All previous exams". */
const PAST_WINDOWS_SHOWN = 6;

export default function StudentExamsList() {
  const { student } = useAuth();
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Tables<'exam_attempts'>>>({});
  const [loading, setLoading] = useState(true);
  const [breakdowns, setBreakdowns] = useState<Record<string, ResultAnswer[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);

  useEffect(() => {
    if (!student?.cohort_id) return;
    (async () => {
      const { data: ex } = await supabase
        .from("exams")
        .select("*, courses(code,title)")
        .in("status", ["published", "in_progress", "closed"])
        // No audience filter here on purpose. This used to say "my cohort OR I
        // am named", which widened rather than narrowed — an exam set for three
        // students listed itself to everyone in their cohort. The row-level
        // policy now asks exam_targets_student, the one rule exam-start also
        // enforces, so a student is sent exactly the exams they may sit and the
        // list cannot promise a paper the runner will refuse.
        .order("start_at", { ascending: false });
      setExams(ex ?? []);
      // Note that this student came looking. A student who opens this page and
      // never starts anything is otherwise indistinguishable from one who never
      // opened it — and after the September sitting that was exactly the
      // question nobody could answer. Fire-and-forget: the record is worth
      // having, never at the cost of the page.
      void supabase.rpc("log_exam_access", {
        p_event: "listed",
        p_exam_id: null,
        p_detail: `${(ex ?? []).length} exams listed`,
        p_user_agent: navigator.userAgent,
      });
      const { data: at } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", student.id);
      const map: Record<string, Tables<'exam_attempts'>> = {};
      (at ?? []).forEach((a) => { map[a.exam_id] = a; });
      setAttempts(map);
      setLoading(false);
    })();
  }, [student?.id, student?.cohort_id]);

  /**
   * Read a marked paper back through exam_result_answers.
   *
   * Not exam_answers embedding question_bank: the bank is staff-only under RLS,
   * so that embed came back null for every real student. The view also withholds
   * the answer key unless the exam is released and set to show it.
   *
   * Rows arrive flat and are nested back into `question_bank` so the renderer
   * and the CSV export keep the shape they already expect.
   */
  const fetchBreakdown = async (attemptId: string) => {
    const { data } = await supabase
      .from("exam_result_answers")
      .select("*")
      .eq("attempt_id", attemptId);
    return (data ?? []).map((r) => ({
      ...r,
      question_bank: {
        question_text: r.question_text,
        question_type: r.question_type,
        options: r.options,
        correct_answer: r.correct_answer,
        explanation: r.explanation,
        points: r.points,
      },
    }));
  };

  const loadBreakdown = async (exam: ExamWithCourse) => {
    if (breakdowns[exam.id]) return;
    const attempt = attempts[exam.id];
    if (!attempt) return;
    const rows = await fetchBreakdown(attempt.id);
    setBreakdowns((b) => ({ ...b, [exam.id]: rows }));
  };

  const renderAnswer = (val: unknown, q: AnswerFormattable) => {
    if (val === null || val === undefined || val === "") return <span className="italic text-muted-foreground">No answer</span>;
    // Shared with the marking screen so a matching answer reads "A → 2" in both
    // places rather than "[object Object]" here.
    return formatAnswer(val, q);
  };

  const answerToText = (val: unknown, q: AnswerFormattable): string => formatAnswer(val, q);

  const stripHtml = (html: string) => (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const exportBreakdown = async (exam: ExamWithCourse) => {
    let rows = breakdowns[exam.id];
    if (!rows) {
      const attempt = attempts[exam.id];
      if (!attempt) return;
      rows = await fetchBreakdown(attempt.id);
      setBreakdowns((b) => ({ ...b, [exam.id]: rows! }));
    }
    const csv = rows.map((a, i) => {
      const q = a.question_bank;
      return {
        "Q#": i + 1,
        Type: q ? QUESTION_TYPE_LABELS[q.question_type as QuestionType] : "",
        Question: q ? stripHtml(q.question_text) : "",
        "Your Answer": q ? answerToText(a.answer, q) : "",
        "Correct Answer": q && exam.show_correct_answers ? answerToText(q.correct_answer, q) : "",
        "Points Awarded": a.points_awarded ?? 0,
        "Max Points": q?.points ?? 0,
        Correct: a.is_correct === null ? "" : a.is_correct ? "Yes" : "No",
        Feedback: a.manual_feedback ?? "",
        Explanation: exam.show_correct_answers ? (q?.explanation ?? "") : "",
      };
    });
    downloadCSV(csv, `exam_${exam.title.replace(/\s+/g, "_")}_results`);
  };

  const windows = groupExamWindows(exams, attempts);
  const liveWindows = windows.filter((w) => w.state === "live");
  const upcomingWindows = windows.filter((w) => w.state === "upcoming");
  const pastWindows = windows.filter((w) => w.state === "past");
  const shownPast = showAllPast ? pastWindows : pastWindows.slice(0, PAST_WINDOWS_SHOWN);
  const pastPaperCount = pastWindows.reduce((n, w) => n + w.exams.length, 0);
  const papersLeft = liveWindows.reduce((n, w) => n + (w.exams.length - w.done), 0);

  const windowLabel = (w: ExamWindow<ExamWithCourse>) =>
    `${isToday(w.start) ? "Today" : format(w.start, "EEE d MMM")} · ${format(w.start, "p")} – ${format(w.end, "p")}`;

  /** The released-result toggle and CSV export, shared by every paper card. */
  const resultControls = (e: ExamWithCourse, st: PaperState, onDark: boolean) => {
    if (!st.released) return null;
    const isOpen = openId === e.id;
    const breakdown = breakdowns[e.id];
    const linkClass = cn(
      "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      onDark ? "text-white" : "text-primary",
    );
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={(o) => {
          setOpenId(o ? e.id : null);
          if (o) loadBreakdown(e);
        }}
      >
        <div className="flex flex-wrap items-center gap-x-4">
          <CollapsibleTrigger className={linkClass}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            {isOpen ? "Hide" : "View"} result and answers
          </CollapsibleTrigger>
          <button type="button" className={linkClass} onClick={() => exportBreakdown(e)}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download CSV
          </button>
        </div>
        <CollapsibleContent className="mt-2 space-y-3 text-foreground">
          <ResultDetail exam={e} st={st} attempt={attempts[e.id]} breakdown={breakdown} renderAnswer={renderAnswer} />
        </CollapsibleContent>
      </Collapsible>
    );
  };

  /** One paper: its kind and course, state pill, title, facts and the one action it allows. */
  const paperCard = (e: ExamWithCourse, opts: { emphasise: boolean; showWhen?: boolean }) => {
    const attempt = attempts[e.id];
    const st = paperState(e, attempt);
    const filled = opts.emphasise && st.action === "resume";
    const dashed = opts.emphasise && (st.action === "start" || st.action === "enter");
    const facts = [
      `${e.duration_minutes} min`,
      `${e.total_points} pts`,
      opts.showWhen ? format(new Date(e.start_at), "d MMM yyyy") : null,
      st.done && attempt?.submitted_at ? `submitted ${format(new Date(attempt.submitted_at), "p")}` : null,
      st.action === "resume" && attempt?.started_at ? `started ${format(new Date(attempt.started_at), "p")}, answers saved` : null,
      st.released ? `${st.finalScore}/${st.total}` : null,
      !attempt && st.live ? "not started" : null,
    ].filter(Boolean).join(" · ");
    const ctaLabel = st.action === "resume" ? "Resume" : st.action === "start" ? "Start" : st.action === "enter" ? "Enter lobby" : null;
    const ctaTo = st.action === "resume" ? `/student/exams/${e.id}/take` : `/student/exams/${e.id}/lobby`;

    return (
      <article
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3.5",
          filled
            ? "bg-primary text-primary-foreground"
            : dashed
              ? "border border-dashed border-[#CFC8DE] bg-card dark:border-border"
              : "border border-border bg-card",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-xs font-bold", filled ? "text-white/85" : "text-muted-foreground")}>
            {/* Say what this is: sitting a ten-minute quiz should not be
                announced to a student as an exam. */}
            {e.assessment_type || "Exam"} · {e.courses?.code ?? "All courses"}
          </span>
          <Pill tone={st.pill.tone}>{st.pill.label}</Pill>
        </div>
        <h3 className="text-base font-extrabold leading-snug tracking-tight">{e.title}</h3>
        <p className={cn("text-[13px]", filled ? "text-white/85" : "text-muted-foreground")}>{facts}</p>
        {ctaLabel && (
          <Link
            to={ctaTo}
            className={cn(
              "inline-flex min-h-11 items-center self-start rounded-xl px-4 text-sm font-bold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              filled
                ? "bg-white text-[#3F1585] focus-visible:ring-white focus-visible:ring-offset-primary"
                : "bg-[#EFE9FB] text-[#3F1585] focus-visible:ring-ring dark:bg-primary dark:text-primary-foreground",
            )}
          >
            {ctaLabel}
          </Link>
        )}
        {resultControls(e, st, filled)}
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ScreenHeader
        title="Exams"
        aside={
          papersLeft > 0 ? (
            <span className="rounded-full bg-[#17112B] px-2.5 py-1 text-[13px] font-bold text-white dark:border dark:border-white/15">
              {papersLeft} paper{papersLeft === 1 ? "" : "s"} left {liveWindows.every((w) => isToday(w.end)) ? "today" : "now"}
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : exams.length === 0 ? (
        <EmptyCard icon={<FileText className="h-6 w-6" aria-hidden="true" />} title="No exams scheduled">
          When an exam, test or quiz is set for you it appears here.
        </EmptyCard>
      ) : (
        <>
          {/* Open now: the window, then its papers in order. */}
          {liveWindows.map((w) => {
            const many = w.exams.length > 1;
            const left = w.exams.length - w.done;
            const short = w.minutesNeeded > w.minutesLeft;
            return (
              <section key={w.key} aria-label={`${format(w.start, "EEEE d MMMM")} exam window`} className="space-y-2.5">
                <DarkPanel className="space-y-1.5 rounded-2xl px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-base font-bold">{windowLabel(w)}</h2>
                    <span className="shrink-0 text-[13px] font-bold text-[#E0A526]">
                      {many ? `${w.done} of ${w.exams.length} done` : w.done ? "Done" : "Open now"}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#CFC9DE]">
                    {many
                      ? `All ${w.exams.length} papers open in the same window. Sit them in any order.`
                      : "Open now."}
                  </p>
                  {many && (
                    <Bar
                      value={(w.done / w.exams.length) * 100}
                      tone="gold"
                      label={`${w.done} of ${w.exams.length} papers done`}
                      className="h-1.5"
                      trackClassName="bg-[#3A3254] dark:bg-[#3A3254]"
                    />
                  )}
                  {w.minutesNeeded > 0 && (
                    <p className={cn("flex items-start gap-2 pt-0.5 text-[13px] font-semibold", short && "text-[#F5C766]")}>
                      {short
                        ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        : <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                      <span>
                        {formatMinutes(w.minutesLeft)} left in the window · the {left === 1 ? "paper" : `${left} papers`} left
                        {left === 1 ? " needs" : " need"} {formatMinutes(w.minutesNeeded)}
                      </span>
                    </p>
                  )}
                </DarkPanel>
                <ol className="space-y-2.5">
                  {w.exams.map((e, i) => (
                    <li key={e.id} className="flex gap-3">
                      {many && (
                        <div className="flex w-10 shrink-0 flex-col items-end pt-3.5 text-right">
                          <strong className="text-[13px]">{i + 1}</strong>
                          <span className="text-[11px] text-muted-foreground">of {w.exams.length}</span>
                        </div>
                      )}
                      {paperCard(e, { emphasise: true })}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}

          {upcomingWindows.length > 0 && (
            <section aria-labelledby="exams-upcoming" className="space-y-2.5">
              <SectionTitle id="exams-upcoming">Coming up</SectionTitle>
              {upcomingWindows.map((w) => (
                <div key={w.key} className="space-y-2 rounded-[18px] bg-muted/50 p-2.5">
                  <div className="flex items-center gap-3 px-1 pt-1">
                    <span className="flex w-[46px] shrink-0 flex-col text-center" aria-hidden="true">
                      <strong className="text-base">{format(w.start, "d")}</strong>
                      <span className="text-[11px] font-semibold uppercase text-muted-foreground">{format(w.start, "MMM")}</span>
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h3 className="text-sm font-bold">
                        {w.exams.length > 1 ? w.exams.map((e) => e.title).join(" · ") : w.exams[0].title}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {format(w.start, "EEE d MMM")}, {format(w.start, "p")} – {format(w.end, "p")}
                        {w.exams.length > 1 ? ` · ${w.exams.length} papers · one window` : ""}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {w.exams.map((e) => (
                      <li key={e.id} className="flex">{paperCard(e, { emphasise: true })}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {pastWindows.length > 0 && (
            <section aria-labelledby="exams-past" className="space-y-2.5">
              <SectionTitle id="exams-past">Results and past papers</SectionTitle>
              {shownPast.map((w) => (
                <div key={w.key} className="space-y-2">
                  {w.exams.length > 1 && (
                    <h3 className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {format(w.start, "EEE d MMM yyyy")} · {w.exams.length} {w.exams.length === 1 ? "paper" : "papers"} · {w.done} of {w.exams.length} sat
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {w.exams.map((e) => (
                      <li key={e.id} className="flex">{paperCard(e, { emphasise: false, showWhen: w.exams.length === 1 })}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {pastWindows.length > PAST_WINDOWS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllPast((v) => !v)}
                  aria-expanded={showAllPast}
                  className="min-h-11 rounded-lg px-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showAllPast ? "Show fewer" : `All previous exams (${pastPaperCount})`}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

const marksTone = (awarded: number, max: number): Tone =>
  max > 0 && awarded >= max ? "success" : awarded > 0 ? "warning" : "danger";

/** A released paper, read back: the score up top, then every answer. */
function ResultDetail({
  exam,
  st,
  attempt,
  breakdown,
  renderAnswer,
}: {
  exam: ExamWithCourse;
  st: PaperState;
  attempt?: Tables<'exam_attempts'>;
  breakdown?: ResultAnswer[];
  renderAnswer: (val: unknown, q: AnswerFormattable) => React.ReactNode;
}) {
  const showCorrect = exam.show_correct_answers;
  const sat = attempt?.submitted_at ?? exam.start_at;
  return (
    <>
      <DarkPanel className="space-y-2.5 rounded-[18px]">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#E0A526]">
          {exam.assessment_type || "Exam"} · {exam.courses?.code ?? "All courses"} · sat {format(new Date(sat), "d MMM")}
        </p>
        {exam.courses?.title && <p className="text-lg font-extrabold leading-snug">{exam.courses.title}</p>}
        <div className="flex items-end gap-3.5">
          <strong className="text-[44px] font-extrabold leading-none tracking-tight">{st.pct}%</strong>
          <span className="flex flex-col gap-1 pb-1">
            <span className="text-sm text-[#CFC9DE]">
              {st.finalScore} of {st.total} marks · pass mark {Number(exam.passing_score || 0)}%
            </span>
            <span
              className={cn(
                "self-start rounded-full px-2 py-[3px] text-xs font-extrabold text-white",
                st.passed ? "bg-[#157F5B]" : "bg-[#B4380F]",
              )}
            >
              {st.passed ? "Passed" : "Failed"}
            </span>
          </span>
        </div>
      </DarkPanel>

      <h4 className="pt-1 text-base font-bold">Your answers</h4>
      {!breakdown ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No answers recorded.</p>
      ) : (
        <ol className="space-y-2.5">
          {breakdown.map((a, i) => {
            const q = a.question_bank;
            if (!q) return null;
            const awarded = Number(a.points_awarded ?? 0);
            const max = Number(q.points ?? 0);
            return (
              <li key={a.id} className="space-y-1.5 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    Q{i + 1} · {QUESTION_TYPE_LABELS[q.question_type as QuestionType] ?? "Question"}
                  </span>
                  <Pill tone={marksTone(awarded, max)}>
                    {awarded} / {max}
                    {showCorrect && a.is_correct !== null && <span className="sr-only">{a.is_correct ? ", correct" : ", incorrect"}</span>}
                  </Pill>
                </div>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm font-semibold"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                />
                <p className="text-[13px] text-foreground/80">
                  Your answer: <span className="font-medium text-foreground">{renderAnswer(a.answer, q)}</span>
                </p>
                {showCorrect && q.correct_answer !== null && q.correct_answer !== undefined && (
                  <p className="text-[13px] text-[#11603F] dark:text-emerald-300">
                    Correct answer: <span className="font-semibold">{renderAnswer(q.correct_answer, q)}</span>
                  </p>
                )}
                {showCorrect && q.explanation && (
                  <p className="rounded-lg bg-muted/60 p-2 text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Explanation: </span>{q.explanation}
                  </p>
                )}
                {a.manual_feedback && (
                  <p className="text-[13px] italic text-muted-foreground">
                    <span className="font-semibold not-italic text-foreground">Lecturer: </span>{a.manual_feedback}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Correct answers show only when the lecturer allows it for this exam.</p>
    </>
  );
}
