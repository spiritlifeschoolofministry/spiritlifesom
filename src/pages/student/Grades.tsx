import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  GraduationCap, Award, BookOpen, Users, Briefcase, ClipboardList, FileText,
  Clock, PencilRuler, Timer,
} from "lucide-react";
import { getLetterGrade } from "@/lib/grading";
import { ASSESSMENT_TYPES } from "@/lib/exam-utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";
import { fetchResultGuidance } from "@/lib/ai-student";
import { useAiFeature, useAssistantName } from "@/lib/ai-flags";
import AssistantAttribution from "@/components/student/AssistantAttribution";
import { Button } from "@/components/ui/button";
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
        .select("id, score, manual_score_override, status, submitted_at, max_points, exams(id, title, assessment_type, total_points, results_released, cohort_id, courses(title))")
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
          course_title: a.exams!.courses?.title || "—",
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
      <>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-28 rounded-xl" />))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Assessments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every assessment you have taken — exams, tests, quizzes and coursework — with your marks.
          </p>
        </div>

        {/* Overall Grade Card */}
        <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            <div className="flex-1 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Overall Grade</p>
                  <p className="text-3xl font-bold text-foreground">{overallPct}%</p>
                </div>
              </div>
              <Progress value={overallPct} className="h-3 mb-2" />
              <p className="text-xs text-muted-foreground">
                {overallEarned}/{overallTotal} points · {allGraded.length} of {items.length} graded
              </p>
            </div>
            <div className="flex items-center justify-center p-6 sm:border-l border-t sm:border-t-0 border-border bg-secondary/30">
              <div className="text-center">
                <p className={`text-6xl font-black ${overallGrade.color}`}>{overallGrade.letter}</p>
                <p className="text-xs text-muted-foreground mt-1">{overallGrade.label} · Point {overallGrade.point}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const grade = getLetterGrade(cat.percentage);
              const Icon = cat.icon;
              return (
                <Card key={cat.category} className="shadow-[var(--shadow-card)] border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{cat.category}</p>
                      </div>
                      <span className={`text-lg font-bold ${grade.color}`}>{grade.letter}</span>
                    </div>
                    <Progress value={cat.percentage} className="h-2 mb-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{cat.percentage}% · {cat.earnedPoints}/{cat.totalPoints} pts</span>
                      <span>{cat.gradedCount}/{cat.count} graded</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detailed Grades Table */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" /> Every assessment
            </CardTitle>
            {presentTypes.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {["All", ...presentTypes].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={typeFilter === t ? "default" : "outline"}
                    className="h-7 px-3 text-xs"
                    onClick={() => setTypeFilter(t)}
                  >
                    {t}
                    <span className="ml-1.5 opacity-60">
                      {t === "All" ? items.length : items.filter((i) => i.category === t).length}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {items.length === 0 ? "Nothing to show yet." : `No ${typeFilter.toLowerCase()} on your record yet.`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden sm:table-cell">Category</TableHead>
                      <TableHead className="hidden md:table-cell">Course</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((item) => {
                      const pct = item.grade != null ? Math.round((item.grade / item.max_points) * 100) : null;
                      const lg = pct != null ? getLetterGrade(pct) : null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.title}
                            {/* Category and course get their own columns from sm/md up;
                                on a phone they ride under the title instead of
                                pushing the score off the screen. */}
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">
                              <span className="sm:hidden">{item.category} · </span>
                              {item.course_title}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell"><Badge variant="secondary" className="text-xs">{item.category}</Badge></TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{item.course_title}</TableCell>
                          <TableCell>
                            {item.grade != null ? (
                              <span className="font-semibold">{item.grade}/{item.max_points}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {item.state === "awaiting" ? "—" : "Not graded"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lg ? (
                              <span className="flex items-center gap-2">
                                <span className={`font-bold ${lg.color}`}>{lg.letter} ({pct}%)</span>
                                {aiGuidance && item.attemptId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title={`Ask ${assistantName} what to revise`}
                                    disabled={loadingGuidance === item.attemptId}
                                    onClick={() => openGuidance(item)}
                                  >
                                    {loadingGuidance === item.attemptId
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Sparkles className="h-3 w-3" />}
                                  </Button>
                                )}
                              </span>
                            ) : item.state === "awaiting" ? (
                              // Sat and submitted; staff have not released the result.
                              <Badge variant="outline" className="text-xs gap-1">
                                <Clock className="w-3 h-3" /> Awaiting result
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Earlier sessions */}
        {pastSessions.map((session) => {
          const graded = session.items.filter((i) => i.grade != null);
          const total = graded.reduce((sum, i) => sum + i.max_points, 0);
          const earned = graded.reduce((sum, i) => sum + (i.grade || 0), 0);
          const pct = total > 0 ? Math.round((earned / total) * 100) : null;
          const lg = pct != null ? getLetterGrade(pct) : null;
          return (
            <Card key={session.cohortId} className="shadow-[var(--shadow-card)] border-border border-dashed">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {session.cohortName}
                    <Badge variant="outline" className="text-[10px]">Previous session</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {session.studentCode && <span className="font-mono">{session.studentCode} · </span>}
                    {lg ? `${lg.letter} · ${pct}%` : "Not graded"}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {session.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.category} · {item.course_title}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      {item.grade != null ? `${item.grade}/${item.max_points}` : "—"}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  These marks are from a session you have since moved on from. They do not count towards
                  your current grade.
                </p>
              </CardContent>
            </Card>
          );
        })}

        {/* Grading Scale Reference */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Grading Scale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
              {[
                { letter: "A", range: "70%+", label: "Excellent", point: 5, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" },
                { letter: "B", range: "60-69%", label: "Very Good", point: 4, color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
                { letter: "C", range: "50-59%", label: "Good", point: 3, color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20" },
                { letter: "D", range: "45-49%", label: "Satisfactory", point: 2, color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20" },
                { letter: "E", range: "40-44%", label: "Pass", point: 1, color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20" },
                { letter: "F", range: "0-39%", label: "Fail", point: 0, color: "text-red-600 bg-red-50 dark:bg-red-900/20" },
              ].map(g => (
                <div key={g.letter} className={`rounded-lg p-3 ${g.color}`}>
                  <p className="text-2xl font-black">{g.letter}</p>
                  <p className="font-semibold">{g.range}</p>
                  <p className="opacity-70">{g.label}</p>
                  <p className="opacity-50">Point {g.point}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!guidance} onOpenChange={(open) => !open && setGuidance(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> What to revise, from {assistantName}
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
