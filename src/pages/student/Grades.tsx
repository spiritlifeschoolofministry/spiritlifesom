import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap, BookOpen, Users, Briefcase, ClipboardList, FileText,
  Clock, PencilRuler, Timer,
} from "lucide-react";
import { Bar, DarkPanel, ListCard, Panel, Pill, ScreenHeader, SectionTitle } from "@/components/redesign/student-pages/ui";
import { cn } from "@/lib/utils";
import { getLetterGrade } from "@/lib/grading";
import { ASSESSMENT_TYPES } from "@/lib/exam-utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";
import { fetchResultGuidance } from "@/lib/ai-student";
import { useAiFeature, useAssistantName } from "@/lib/ai-flags";
import AssistantAttribution from "@/components/student/AssistantAttribution";
import { fetchStudentHistory } from "@/lib/student-sessions";

/**
 * One line on a student's record. Both sources land in this shape: work handed
 * in (assignment_submissions) and anything sat through the exam engine
 * (exam_attempts), whatever that assessment calls itself.
 */
interface GradedItem {
  id: string;
  title: string;
  /** Exam, Test, Quiz, Assignment, Project… — the label this carries on the record. */
  category: string;
  max_points: number;
  grade: number | null;
  feedback: string | null;
  reviewed_at: string | null;
  course_title: string;
  /**
   * graded   — marked, grade is set.
   * awaiting — sat and submitted, but the result has not been released yet.
   * pending  — set for the student, not yet done or not yet marked.
   */
  state: "graded" | "awaiting" | "pending";
  /**
   * Set only for a sitting that went through the exam engine.
   *
   * Revision guidance is built from the individual answers on an attempt, so a
   * task submission — which has one mark and no answers — has nothing to build
   * from. This is what distinguishes the two in a list that deliberately mixes
   * them.
   */
  attemptId?: string;
}

/** An earlier session's marks, kept apart from the current session's. */
interface PastSessionGrades {
  cohortId: string;
  cohortName: string;
  studentCode: string | null;
  items: GradedItem[];
}

interface GuidanceState {
  title: string;
  body: string;
}

interface CategorySummary {
  category: string;
  icon: React.ElementType;
  totalPoints: number;
  earnedPoints: number;
  count: number;
  gradedCount: number;
  percentage: number;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Exam: GraduationCap,
  Test: PencilRuler,
  Quiz: Timer,
  Assignment: ClipboardList,
  Project: Briefcase,
  "Class Work": BookOpen,
  "Group Activity": Users,
  "Group Assignment": FileText,
};

const StudentGrades = () => {
  const { student } = useAuth();
  const [items, setItems] = useState<GradedItem[]>([]);
  const [pastSessions, setPastSessions] = useState<PastSessionGrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("All");

  // Revision guidance, opened per sitting. Written once per attempt and cached
  // server-side, so re-opening it costs nothing.
  const aiGuidance = useAiFeature("ai_result_guidance");
  const assistantName = useAssistantName();
  const [guidance, setGuidance] = useState<GuidanceState | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState<string | null>(null);

  const loadGrades = useCallback(async () => {
    if (!student?.id || !student?.cohort_id) return;
    try {
      setLoading(true);
      const { data: assignments, error: aErr } = await supabase
        .from("assignments")
        .select("id, title, category, max_points, course_id, is_manual_record, courses(title)")
        .eq("cohort_id", student.cohort_id);
      if (aErr) throw aErr;

      const { data: submissions, error: sErr } = await supabase
        .from("assignment_submissions")
        .select("assignment_id, grade, feedback, reviewed_at")
        .eq("student_id", student.id);
      if (sErr) throw sErr;

      const subMap = new Map((submissions || []).map((s) => [s.assignment_id, s]));

      const gradedItems: GradedItem[] = (assignments || [])
        // Offline records are entered per student, not set for the cohort, so
        // one only belongs on this page when this student actually has a mark
        // on it — otherwise every student would see everyone else's onsite work
        // listed as ungraded.
        .filter((a) => !a.is_manual_record || subMap.has(a.id))
        .map((a) => {
        const sub = subMap.get(a.id);
        return {
          id: a.id,
          title: a.title,
          category: a.category || "Assignment",
          max_points: a.max_points || 100,
          grade: sub?.grade ?? null,
          feedback: sub?.feedback ?? null,
          reviewed_at: sub?.reviewed_at ?? null,
          course_title: a.courses?.title || "—",
          state: (sub?.grade ?? null) != null ? "graded" as const : "pending" as const,
        };
      });
      // Anything sat through the exam engine belongs here too — exams, tests,
      // quizzes alike. It used to live only on the exams page, so a mark
      // counted for nothing in the student's summary even though the release
      // dialog promised it went "into Grades".
      const { data: examAttempts } = await supabase
        .from("exam_attempts")
        .select("id, score, manual_score_override, status, submitted_at, max_points, exams(id, title, assessment_type, total_points, results_released, cohort_id, course_id, courses(title))")
        .eq("student_id", student.id)
        .in("status", ["submitted", "graded"]);

      // A sitting the student has finished but staff have not released shows as
      // "Awaiting result" rather than not showing at all — otherwise a student
      // who sat a test this morning opens this page and finds no trace of it.
      const examOf = (a: { exams: { cohort_id: string | null } | null }) => a.exams?.cohort_id ?? null;

      const toExamItem = (a: NonNullable<typeof examAttempts>[number]): GradedItem => {
        const released = !!a.exams!.results_released;
        return {
          id: a.id,
          title: a.exams!.title,
          category: a.exams!.assessment_type || "Exam",
          // The attempt's own denominator where it has one: the whole
          // paper is the wrong divisor for a sitting served a subset of it,
          // or marked on only its best few answers.
          max_points: Number(a.max_points ?? a.exams!.total_points) || 0,
          grade: released ? Number(a.manual_score_override ?? a.score ?? 0) : null,
          feedback: null,
          reviewed_at: a.submitted_at ?? null,
          // A combined paper carries no course, deliberately.
          course_title: a.exams!.courses?.title || (a.exams!.course_id ? "—" : "All courses"),
          state: released ? "graded" as const : "awaiting" as const,
          attemptId: a.id,
        };
      };

      const examItems: GradedItem[] = (examAttempts ?? [])
        .filter((a) => a.exams)
        // A sitting from an earlier session belongs to that session's block, not
        // to this one. An exam with no cohort cannot be placed, so it stays here.
        .filter((a) => !examOf(a) || examOf(a) === student.cohort_id)
        .map(toExamItem);

      setItems([...gradedItems, ...examItems]);

      // Earlier sessions: the student was moved forward rather than re-registered,
      // so the work they were graded on back then is still theirs to see.
      const history = await fetchStudentHistory(student.id, null);
      const earlier = await Promise.all(
        history.past.map(async (past) => {
          const { data: pastAssignments } = await supabase
            .from("assignments")
            .select("id, title, category, max_points, courses(title)")
            .eq("cohort_id", past.cohortId);

          const pastItems: GradedItem[] = (pastAssignments || [])
            // Only what they were actually marked on. An assignment set for that
            // cohort which this student never submitted is not their record.
            .filter((a) => subMap.get(a.id)?.grade != null)
            .map((a) => {
              const sub = subMap.get(a.id)!;
              return {
                id: a.id,
                title: a.title,
                category: a.category || "Assignment",
                max_points: a.max_points || 100,
                grade: sub.grade,
                feedback: sub.feedback ?? null,
                reviewed_at: sub.reviewed_at ?? null,
                course_title: a.courses?.title || "—",
                state: "graded" as const,
              };
            });

          const pastExams = (examAttempts ?? [])
            .filter((a) => a.exams && examOf(a) === past.cohortId && a.exams.results_released)
            .map(toExamItem);

          return {
            cohortId: past.cohortId,
            cohortName: past.cohortName,
            studentCode: past.studentCode,
            items: [...pastItems, ...pastExams],
          };
        })
      );
      setPastSessions(earlier.filter((sess) => sess.items.length > 0));
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [student?.id, student?.cohort_id]);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);


  const categories = Object.entries(
    items.reduce<Record<string, GradedItem[]>>((acc, item) => {
      const cat = item.category || "Assignment";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {})
  ).map(([category, catItems]): CategorySummary => {
    const graded = catItems.filter((i) => i.grade != null);
    const totalPoints = graded.reduce((s, i) => s + i.max_points, 0);
    const earnedPoints = graded.reduce((s, i) => s + (i.grade || 0), 0);
    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    return {
      category,
      icon: CATEGORY_ICONS[category] || ClipboardList,
      totalPoints,
      earnedPoints,
      count: catItems.length,
      gradedCount: graded.length,
      percentage,
    };
  });

  // Every type actually present, in the order staff would name them, so the
  // filter never offers a type this student has nothing under.
  const presentTypes = [
    ...ASSESSMENT_TYPES.filter((t) => items.some((i) => i.category === t)),
    ...[...new Set(items.map((i) => i.category))]
      .filter((c) => !ASSESSMENT_TYPES.includes(c as (typeof ASSESSMENT_TYPES)[number]))
      .sort(),
  ];

  const openGuidance = async (item: GradedItem) => {
    if (!item.attemptId) return;
    setLoadingGuidance(item.attemptId);
    try {
      const body = await fetchResultGuidance(item.attemptId);
      setGuidance({ title: item.title, body });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not work out what to revise");
    } finally {
      setLoadingGuidance(null);
    }
  };

  const visible = typeFilter === "All" ? items : items.filter((i) => i.category === typeFilter);

  const allGraded = items.filter((i) => i.grade != null);
  const overallTotal = allGraded.reduce((s, i) => s + i.max_points, 0);
  const overallEarned = allGraded.reduce((s, i) => s + (i.grade || 0), 0);
  const overallPct = overallTotal > 0 ? Math.round((overallEarned / overallTotal) * 100) : 0;
  const overallGrade = getLetterGrade(overallPct);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-36 rounded-[20px]" />
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-24 rounded-2xl" />))}
        </div>
        <Skeleton className="h-64 rounded-[18px]" />
      </div>
    );
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted",
    );

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader
          title="Assessments"
          description="Every assessment you have taken — exams, tests, quizzes and coursework — with your marks."
        />

        {/* Overall */}
        <DarkPanel className="space-y-3" aria-label="Overall grade">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#C4B5FD]">Overall · this session</p>
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-end gap-3.5">
              <strong className="text-[44px] font-extrabold leading-none tracking-tight">{overallPct}%</strong>
              <span className="flex flex-col gap-1 pb-1">
                <span className="text-sm text-[#CFC9DE]">
                  {overallEarned}/{overallTotal} points · {allGraded.length} of {items.length} graded
                </span>
                <span className="self-start rounded-full bg-primary px-2 py-[3px] text-xs font-extrabold text-primary-foreground">
                  {overallGrade.label} · Point {overallGrade.point}
                </span>
              </span>
            </div>
            <span className="text-5xl font-black leading-none text-white" aria-label={`Grade ${overallGrade.letter}`}>
              {overallGrade.letter}
            </span>
          </div>
          <Bar
            value={overallPct}
            tone="gold"
            label={`Overall grade, ${overallPct}%`}
            className="h-1.5"
            trackClassName="bg-[#3A3254] dark:bg-[#3A3254]"
          />
        </DarkPanel>

        {/* Category breakdown */}
        {categories.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {categories.map((cat) => {
              const grade = getLetterGrade(cat.percentage);
              const Icon = cat.icon;
              return (
                <Panel key={cat.category} as="div" className="space-y-2 rounded-2xl p-3.5 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="truncate text-sm font-bold">{cat.category}</span>
                    </span>
                    <span className={`text-lg font-black ${grade.color}`}>{grade.letter}</span>
                  </div>
                  <Bar value={cat.percentage} label={`${cat.category}, ${cat.percentage}%`} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {cat.percentage}% · {cat.earnedPoints}/{cat.totalPoints} pts · {cat.gradedCount}/{cat.count} graded
                  </p>
                </Panel>
              );
            })}
          </div>
        )}

        {/* Every assessment */}
        <section aria-labelledby="grades-all" className="space-y-2.5">
          <SectionTitle id="grades-all">Every assessment</SectionTitle>
          {presentTypes.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by type">
              <div className="flex w-max gap-2">
                {["All", ...presentTypes].map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={typeFilter === t}
                    className={chip(typeFilter === t)}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t}
                    <span className="ml-1.5 opacity-70">
                      {t === "All" ? items.length : items.filter((i) => i.category === t).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {visible.length === 0 ? (
            <Panel className="py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "Nothing to show yet." : `No ${typeFilter.toLowerCase()} on your record yet.`}
            </Panel>
          ) : (
            <ListCard>
              {visible.map((item) => {
                const pct = item.grade != null ? Math.round((item.grade / item.max_points) * 100) : null;
                const lg = pct != null ? getLetterGrade(pct) : null;
                return (
                  <li key={item.id} className="flex min-h-[64px] items-center gap-3 px-3.5 py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="text-sm">{item.title}</strong>
                      <span className="text-xs text-muted-foreground">
                        {item.category} · {item.course_title}
                        {item.grade != null && ` · ${item.grade}/${item.max_points}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {lg ? (
                        <Pill tone={lg.isPassing ? "success" : "danger"}>
                          {lg.letter} · {pct}%
                        </Pill>
                      ) : item.state === "awaiting" ? (
                        // Sat and submitted; staff have not released the result.
                        <Pill tone="info"><Clock className="h-3 w-3" aria-hidden="true" /> Awaiting result</Pill>
                      ) : (
                        <Pill tone="neutral">Not graded</Pill>
                      )}
                      {lg && aiGuidance && item.attemptId && (
                        <button
                          type="button"
                          className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          aria-label={`Ask ${assistantName} what to revise for ${item.title}`}
                          title={`Ask ${assistantName} what to revise`}
                          disabled={loadingGuidance === item.attemptId}
                          onClick={() => openGuidance(item)}
                        >
                          {loadingGuidance === item.attemptId
                            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ListCard>
          )}
        </section>

        {/* Earlier sessions */}
        {pastSessions.map((session) => {
          const graded = session.items.filter((i) => i.grade != null);
          const total = graded.reduce((sum, i) => sum + i.max_points, 0);
          const earned = graded.reduce((sum, i) => sum + (i.grade || 0), 0);
          const pct = total > 0 ? Math.round((earned / total) * 100) : null;
          const lg = pct != null ? getLetterGrade(pct) : null;
          return (
            <section key={session.cohortId} aria-label={`${session.cohortName}, previous session`} className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  {session.cohortName} · previous session
                </h2>
                <span className="text-xs text-muted-foreground">
                  {session.studentCode && <span className="font-mono">{session.studentCode} · </span>}
                  {lg ? `${lg.letter} · ${pct}%` : "Not graded"}
                </span>
              </div>
              <ListCard className="border-dashed">
                {session.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{item.title}</strong>
                      <span className="text-xs text-muted-foreground">{item.category} · {item.course_title}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold">
                      {item.grade != null ? `${item.grade}/${item.max_points}` : "—"}
                    </span>
                  </li>
                ))}
              </ListCard>
              <p className="text-xs text-muted-foreground">
                These marks are from a session you have since moved on from. They do not count towards
                your current grade.
              </p>
            </section>
          );
        })}

        {/* Grading scale reference */}
        <Panel className="space-y-3" aria-labelledby="grades-scale">
          <h2 id="grades-scale" className="text-base font-bold">Grading scale</h2>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
            {[
              { letter: "A", range: "70%+", label: "Excellent", point: 5, color: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20" },
              { letter: "B", range: "60-69%", label: "Very Good", point: 4, color: "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20" },
              { letter: "C", range: "50-59%", label: "Good", point: 3, color: "text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-900/20" },
              { letter: "D", range: "45-49%", label: "Satisfactory", point: 2, color: "text-yellow-800 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-900/20" },
              { letter: "E", range: "40-44%", label: "Pass", point: 1, color: "text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-900/20" },
              { letter: "F", range: "0-39%", label: "Fail", point: 0, color: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20" },
            ].map(g => (
              <div key={g.letter} className={`rounded-[14px] p-2.5 ${g.color}`}>
                <p className="text-2xl font-black">{g.letter}</p>
                <p className="font-semibold">{g.range}</p>
                <p className="opacity-80">{g.label}</p>
                <p className="opacity-70">Point {g.point}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Dialog open={!!guidance} onOpenChange={(open) => !open && setGuidance(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> What to revise, from {assistantName}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{guidance?.title}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{guidance?.body}</p>
          <AssistantAttribution
            className="border-t pt-3"
            source="the questions you did not get full marks on, and those only"
            fallback="Your lecturer is the place to go for anything it does not cover."
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentGrades;
