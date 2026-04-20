import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import StudentLayout from "@/components/StudentLayout";
import { format, isAfter, isBefore } from "date-fns";
import { ChevronDown, CheckCircle2, XCircle, Trophy, Download } from "lucide-react";
import { sanitizeHtml, QUESTION_TYPE_LABELS, QuestionType } from "@/lib/exam-utils";
import { downloadCSV } from "@/lib/csv-export";

export default function StudentExamsList() {
  const { student } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [breakdowns, setBreakdowns] = useState<Record<string, any[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!student?.cohort_id) return;
    (async () => {
      const { data: ex } = await supabase
        .from("exams")
        .select("*, courses(code,title)")
        .in("status", ["published", "in_progress", "closed"])
        .or(`cohort_id.eq.${student.cohort_id},target_student_ids.cs.{${student.id}}`)
        .order("start_at", { ascending: false });
      setExams(ex ?? []);
      const { data: at } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", student.id);
      const map: Record<string, any> = {};
      (at ?? []).forEach((a) => { map[a.exam_id] = a; });
      setAttempts(map);
      setLoading(false);
    })();
  }, [student?.id, student?.cohort_id]);

  const loadBreakdown = async (exam: any) => {
    if (breakdowns[exam.id]) return;
    const attempt = attempts[exam.id];
    if (!attempt) return;
    const { data: ans } = await supabase
      .from("exam_answers")
      .select("*, question_bank(question_text, question_type, options, correct_answer, explanation, points)")
      .eq("attempt_id", attempt.id);
    setBreakdowns((b) => ({ ...b, [exam.id]: ans ?? [] }));
  };

  const renderAnswer = (val: unknown, q: any) => {
    if (val === null || val === undefined || val === "") return <span className="italic text-muted-foreground">No answer</span>;
    if (q.question_type === "mcq_single" && Array.isArray(q.options)) return String(q.options[val as number] ?? val);
    if (q.question_type === "mcq_multi" && Array.isArray(q.options) && Array.isArray(val)) {
      return (val as number[]).map((i) => q.options[i]).filter(Boolean).join(", ");
    }
    if (q.question_type === "true_false") return val ? "True" : "False";
    return String(val);
  };

  return (
    <StudentLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">My Exams</h1>
          <p className="text-sm text-muted-foreground">Online assessments and released results</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : exams.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No exams scheduled.</Card>
        ) : (
          <div className="grid gap-3">
            {exams.map((e) => {
              const now = new Date();
              const start = new Date(e.start_at);
              const end = new Date(e.end_at);
              const attempt = attempts[e.id];
              const upcoming = isBefore(now, start);
              const live = !isBefore(now, start) && !isAfter(now, end);
              const closed = isAfter(now, end) || e.status === "closed";
              const released = e.results_released && (attempt?.status === "graded" || attempt?.status === "submitted");
              const finalScore = attempt?.manual_score_override ?? attempt?.score ?? 0;
              const total = Number(e.total_points || 0);
              const pct = total > 0 ? Math.round((Number(finalScore) / total) * 100) : 0;
              const passed = pct >= Number(e.passing_score || 0);
              const breakdown = breakdowns[e.id];
              const isOpen = openId === e.id;

              return (
                <Card key={e.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{e.title}</h3>
                      <p className="text-xs text-muted-foreground">{e.courses?.code} · {e.duration_minutes} min · {e.total_points} pts</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(start, "PPp")} → {format(end, "PPp")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {upcoming && <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Upcoming</Badge>}
                        {live && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 animate-pulse">Live</Badge>}
                        {closed && !released && <Badge variant="outline" className="bg-muted text-muted-foreground">Closed</Badge>}
                        {attempt?.status === "submitted" && !released && <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Submitted · awaiting results</Badge>}
                        {released && (
                          <Badge variant="outline" className={passed ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                            <Trophy className="w-3 h-3 mr-1" />
                            {finalScore}/{total} ({pct}%) · {passed ? "Passed" : "Failed"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!attempt && (live || (upcoming && (start.getTime() - now.getTime()) < 60 * 60_000)) && (
                        <Button asChild><Link to={`/student/exams/${e.id}/lobby`}>Enter</Link></Button>
                      )}
                      {attempt?.status === "in_progress" && live && (
                        <Button asChild><Link to={`/student/exams/${e.id}/take`}>Resume</Link></Button>
                      )}
                    </div>
                  </div>

                  {released && (
                    <Collapsible
                      open={isOpen}
                      onOpenChange={(o) => {
                        setOpenId(o ? e.id : null);
                        if (o) loadBreakdown(e);
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="mt-3 -ml-2 text-xs">
                          <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          {isOpen ? "Hide" : "View"} result details
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 pt-3 border-t border-border space-y-3">
                        {!breakdown ? (
                          <p className="text-xs text-muted-foreground">Loading…</p>
                        ) : breakdown.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No answers recorded.</p>
                        ) : (
                          breakdown.map((a, i) => {
                            const q = a.question_bank;
                            if (!q) return null;
                            const showCorrect = e.show_correct_answers;
                            return (
                              <div key={a.id} className="rounded-md border border-border p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-medium">Q{i + 1}</span>
                                    <Badge variant="secondary" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type as QuestionType]}</Badge>
                                    <span className="text-muted-foreground">{a.points_awarded ?? 0}/{q.points} pt</span>
                                  </div>
                                  {showCorrect && a.is_correct !== null && (
                                    a.is_correct
                                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                      : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                                  )}
                                </div>
                                <div
                                  className="prose prose-sm dark:prose-invert max-w-none text-sm"
                                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                                />
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Your answer: </span>
                                  <span className="font-medium">{renderAnswer(a.answer, q)}</span>
                                </div>
                                {showCorrect && q.correct_answer !== null && q.correct_answer !== undefined && (
                                  <div className="text-xs">
                                    <span className="text-muted-foreground">Correct answer: </span>
                                    <span className="font-medium text-emerald-600">{renderAnswer(q.correct_answer, q)}</span>
                                  </div>
                                )}
                                {showCorrect && q.explanation && (
                                  <div className="text-xs bg-muted/50 rounded p-2">
                                    <span className="text-muted-foreground">Explanation: </span>{q.explanation}
                                  </div>
                                )}
                                {a.manual_feedback && (
                                  <div className="text-xs bg-primary/5 rounded p-2 border-l-2 border-primary">
                                    <span className="text-muted-foreground">Feedback: </span>{a.manual_feedback}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
