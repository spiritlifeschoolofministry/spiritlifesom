import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, AlertTriangle, CheckCircle2, Send, Camera, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/exam-utils";

export default function ExamMonitor() {
  const { id } = useParams();
  const [exam, setExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<any | null>(null);
  const [gradeData, setGradeData] = useState<{ answers: any[]; questions: any[]; override: string }>({ answers: [], questions: [], override: "" });
  const [snapshots, setSnapshots] = useState<Record<string, Array<{ id: string; storage_path: string; captured_at: string; signedUrl?: string }>>>({});
  const [snapshotViewer, setSnapshotViewer] = useState<{ url: string; meta: string } | null>(null);
  const [loadingSnapsFor, setLoadingSnapsFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: e } = await supabase.from("exams").select("*, courses(code,title), cohorts(name)").eq("id", id).maybeSingle();
    setExam(e);
    const { data: a } = await supabase
      .from("exam_attempts")
      .select("*, students(student_code, profile_id, profiles:profile_id(first_name, last_name, email))")
      .eq("exam_id", id)
      .order("started_at", { ascending: false });
    setAttempts(a ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`exam-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts", filter: `exam_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const releaseResults = async () => {
    if (!confirm("Release results to all students? This pushes scores into Grades.")) return;
    const { data, error } = await supabase.functions.invoke("exam-release-results", { body: { exam_id: id } });
    if (error || data?.error) return toast.error(error?.message || data?.error);
    toast.success(`Released to ${data.released} students`);
    load();
  };

  const exportCSV = () => {
    const rows = [
      ["Student Code", "Name", "Email", "Status", "Score", "Override", "Tab Switches", "Started", "Submitted", "Auto-submitted", "Reason"],
      ...attempts.map((a) => [
        a.students?.student_code ?? "",
        `${a.students?.profiles?.first_name ?? ""} ${a.students?.profiles?.last_name ?? ""}`.trim(),
        a.students?.profiles?.email ?? "",
        a.status,
        a.score ?? "",
        a.manual_score_override ?? "",
        a.tab_switch_count,
        a.started_at,
        a.submitted_at ?? "",
        a.auto_submitted ? "yes" : "no",
        a.submission_reason ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exam?.title || "exam"}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openGrading = async (attempt: any) => {
    const { data: ans } = await supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id);
    const qIds = (ans ?? []).map((a) => a.question_id);
    const { data: qs } = qIds.length ? await supabase.from("question_bank").select("*").in("id", qIds) : { data: [] };
    setGrading(attempt);
    setGradeData({ answers: ans ?? [], questions: qs ?? [], override: attempt.manual_score_override ?? "" });
  };

  const saveGrading = async () => {
    if (!grading) return;
    // Update each manual answer's points_awarded
    for (const a of gradeData.answers) {
      await supabase.from("exam_answers").update({
        points_awarded: a.points_awarded,
        is_correct: a.points_awarded != null && a.points_awarded > 0,
        manual_feedback: a.manual_feedback ?? null,
      }).eq("id", a.id);
    }
    const total = gradeData.answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
    const override = gradeData.override === "" ? null : Number(gradeData.override);
    await supabase.from("exam_attempts").update({
      score: total,
      manual_score_override: override,
      status: "graded",
      graded_at: new Date().toISOString(),
    }).eq("id", grading.id);
    toast.success("Saved grading");
    setGrading(null);
    load();
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!exam) return <p className="p-6">Exam not found</p>;

  const inProgress = attempts.filter((a) => a.status === "in_progress").length;
  const submitted = attempts.filter((a) => a.status === "submitted").length;
  const graded = attempts.filter((a) => a.status === "graded").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/admin/exams"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <div>
            <h1 className="text-xl font-bold">{exam.title}</h1>
            <p className="text-xs text-muted-foreground">{exam.courses?.code} · {exam.cohorts?.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-1.5" /> CSV</Button>
          {!exam.results_released && (
            <Button onClick={releaseResults}><Send className="w-4 h-4 mr-1.5" /> Release Results</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3"><p className="text-xs text-muted-foreground">In progress</p><p className="text-2xl font-bold text-amber-600">{inProgress}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Submitted</p><p className="text-2xl font-bold text-blue-600">{submitted}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Graded</p><p className="text-2xl font-bold text-emerald-600">{graded}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Total attempts</p><p className="text-2xl font-bold">{attempts.length}</p></Card>
      </div>

      <Card className="p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Student</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Score</th>
              <th className="py-2 pr-3">Tab switches</th>
              <th className="py-2 pr-3">Submitted</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id} className="border-b border-border/50">
                <td className="py-2 pr-3">
                  <p className="font-medium">{a.students?.profiles?.first_name} {a.students?.profiles?.last_name}</p>
                  <p className="text-xs text-muted-foreground">{a.students?.student_code}</p>
                </td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className={
                    a.status === "in_progress" ? "bg-amber-500/10 text-amber-600" :
                    a.status === "graded" ? "bg-emerald-500/10 text-emerald-600" :
                    "bg-blue-500/10 text-blue-600"
                  }>{a.status}</Badge>
                  {a.auto_submitted && <Badge variant="destructive" className="ml-1 text-[10px]">auto</Badge>}
                </td>
                <td className="py-2 pr-3 font-mono">{a.manual_score_override ?? a.score ?? "—"}</td>
                <td className="py-2 pr-3">
                  <span className={a.tab_switch_count >= exam.max_tab_switches ? "text-destructive font-bold" : ""}>
                    {a.tab_switch_count} {a.tab_switch_count >= exam.max_tab_switches && <AlertTriangle className="inline w-3 h-3" />}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</td>
                <td className="py-2 pr-3">
                  {a.status !== "in_progress" && (
                    <Button size="sm" variant="outline" onClick={() => openGrading(a)}>Grade / Review</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!grading} onOpenChange={(v) => !v && setGrading(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Grade attempt — {grading?.students?.profiles?.first_name} {grading?.students?.profiles?.last_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {gradeData.questions.map((q, idx) => {
              const ans = gradeData.answers.find((a) => a.question_id === q.id);
              if (!ans) return null;
              return (
                <Card key={q.id} className="p-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Q{idx + 1} · {q.question_type} · {q.points} pt</p>
                    {ans.is_correct === true && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                  <div className="bg-muted/50 p-2 rounded text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Student answer:</p>
                    <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(ans.answer, null, 2)}</pre>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Points awarded (max {q.points})</Label>
                      <Input type="number" min={0} max={q.points} step={0.5}
                        value={ans.points_awarded ?? ""}
                        onChange={(e) => {
                          const next = [...gradeData.answers];
                          next[next.indexOf(ans)] = { ...ans, points_awarded: e.target.value === "" ? null : Number(e.target.value) };
                          setGradeData({ ...gradeData, answers: next });
                        }} />
                    </div>
                    <div>
                      <Label className="text-xs">Feedback</Label>
                      <Input value={ans.manual_feedback ?? ""}
                        onChange={(e) => {
                          const next = [...gradeData.answers];
                          next[next.indexOf(ans)] = { ...ans, manual_feedback: e.target.value };
                          setGradeData({ ...gradeData, answers: next });
                        }} />
                    </div>
                  </div>
                </Card>
              );
            })}
            <div>
              <Label>Manual score override (optional, audited)</Label>
              <Input type="number" value={gradeData.override}
                onChange={(e) => setGradeData({ ...gradeData, override: e.target.value })}
                placeholder="Leave blank to use computed total" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrading(null)}>Cancel</Button>
            <Button onClick={saveGrading}>Save grading</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
