import { useEffect, useState, Fragment } from "react";
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
import { AUTO_GRADED_TYPES, formatAnswer, sanitizeHtml } from "@/lib/exam-utils";
import { r2Storage } from "@/lib/r2-storage";

export default function ExamMonitor() {
  const { id } = useParams();
  const [exam, setExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<any | null>(null);
  const [gradeData, setGradeData] = useState<{ answers: any[]; questions: any[]; override: string }>({ answers: [], questions: [], override: "" });
  const [snapshots, setSnapshots] = useState<Record<string, Array<{ id: string; storage_path: string; captured_at: string; storage_provider: string; signedUrl?: string }>>>({});
  const [snapshotViewer, setSnapshotViewer] = useState<{ url: string; meta: string } | null>(null);
  const [loadingSnapsFor, setLoadingSnapsFor] = useState<string | null>(null);
  const [showRehearsals, setShowRehearsals] = useState(false);
  const [hiddenRehearsals, setHiddenRehearsals] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data: e } = await supabase.from("exams").select("*, courses(code,title), cohorts(name)").eq("id", id).maybeSingle();
    setExam(e);
    // Staff rehearsals are real attempts, so they have to be excluded here or
    // they read as a candidate sitting the paper. Resolved as a separate id
    // lookup rather than an embed filter to keep this working whatever shape
    // the exam foreign keys are in.
    const [{ data: a }, { data: previewRows }] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("*, students(student_code, profile_id, profiles:profile_id(first_name, last_name, email))")
        .eq("exam_id", id)
        .order("started_at", { ascending: false }),
      supabase.from("students").select("id").eq("is_staff_preview", true),
    ]);
    const previewIds = new Set((previewRows ?? []).map((r: any) => r.id));
    const rows = (a ?? []).map((att: any) => ({ ...att, isRehearsal: previewIds.has(att.student_id) }));
    setHiddenRehearsals(rows.filter((r: any) => r.isRehearsal).length);
    setAttempts(showRehearsals ? rows : rows.filter((r: any) => !r.isRehearsal));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`exam-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts", filter: `exam_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, showRehearsals]);

  /**
   * Delete an attempt outright.
   *
   * exam-start resumes an unfinished attempt and refuses a second sitting after
   * submission, so this is the only way to give a student another go — after a
   * genuine technical failure, say — and the way staff clear their own dry runs.
   * Answers, events and snapshots cascade with the row.
   */
  const deleteAttempt = async (attempt: any) => {
    const who = attempt.isRehearsal
      ? "this rehearsal attempt"
      : `${attempt.students?.profiles?.first_name ?? ""} ${attempt.students?.profiles?.last_name ?? ""}`.trim() || "this student";
    if (!confirm(
      `Delete the attempt for ${who}? Their answers, score and snapshots are permanently deleted, and they will be able to sit the exam again.`,
    )) return;
    const { error } = await supabase.from("exam_attempts").delete().eq("id", attempt.id);
    if (error) {
      toast.error(error.message || "Could not delete the attempt");
      return;
    }
    toast.success("Attempt deleted");
    load();
  };

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

    // Every question this attempt was served, in the order it was served —
    // not only the ones with a saved answer. A question the student skipped
    // still has to be visible and markable.
    const served: string[] = Array.isArray(attempt.question_order)
      ? attempt.question_order
      : (ans ?? []).map((a: any) => a.question_id);
    const { data: qs } = served.length
      ? await supabase.from("question_bank").select("*").in("id", served)
      : { data: [] };
    const byId = new Map((qs ?? []).map((q: any) => [q.id, q]));
    const questions = served.map((qid) => byId.get(qid)).filter(Boolean);

    // Stand-in rows for skipped questions so they can be marked; saveGrading
    // inserts the ones that were never persisted.
    const answers = questions.map((q: any) =>
      (ans ?? []).find((a: any) => a.question_id === q.id) ?? {
        id: null,
        attempt_id: attempt.id,
        question_id: q.id,
        answer: null,
        points_awarded: null,
        is_correct: null,
        manual_feedback: null,
      },
    );

    setGrading(attempt);
    setGradeData({ answers, questions, override: "" });
  };

  const saveGrading = async () => {
    if (!grading) return;
    // Save each question's mark. Rows that never existed — questions the
    // student skipped — are inserted rather than silently dropped.
    for (const a of gradeData.answers) {
      const fields = {
        points_awarded: a.points_awarded,
        is_correct: a.points_awarded != null && a.points_awarded > 0,
        manual_feedback: a.manual_feedback ?? null,
      };
      if (a.id) {
        await supabase.from("exam_answers").update(fields).eq("id", a.id);
      } else {
        await supabase.from("exam_answers").insert({
          attempt_id: grading.id,
          question_id: a.question_id,
          answer: null,
          ...fields,
        });
      }
    }

    // The total is the sum of the question marks, full stop. There is no
    // separate figure to type in: a score has to be traceable to the answers
    // it came from, and any change is made by regrading the question itself.
    const total = gradeData.answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);

    // Regrading is allowed, so keep what the mark used to be. Without this a
    // score can change after release with no record of the previous figure.
    const priorScore = grading.manual_score_override ?? grading.score;
    const history = Array.isArray(grading.regrade_history) ? grading.regrade_history : [];
    const changed = grading.status === "graded" && Number(priorScore) !== Number(total);

    await supabase.from("exam_attempts").update({
      score: total,
      // Clear any legacy typed-in figure so the question marks always govern.
      manual_score_override: null,
      status: "graded",
      graded_at: new Date().toISOString(),
      regrade_history: changed
        ? [...history, { at: new Date().toISOString(), from: priorScore, to: total }]
        : history,
    }).eq("id", grading.id);
    toast.success(grading.status === "graded" ? "Regraded" : "Saved grading");
    setGrading(null);
    load();
  };

  const gradedTotal = gradeData.answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
  const gradeMax = gradeData.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
  const manualRemaining = gradeData.questions.filter((q) => {
    const ans = gradeData.answers.find((a) => a.question_id === q.id);
    if (!ans) return false;
    const needsMark = !AUTO_GRADED_TYPES.includes(q.question_type) || q.correct_answer == null;
    return needsMark && ans.points_awarded == null;
  }).length;

  const loadSnapshots = async (attemptId: string) => {
    setLoadingSnapsFor(attemptId);
    const { data, error } = await supabase
      .from("exam_snapshots")
      .select("id, storage_path, captured_at, storage_provider")
      .eq("attempt_id", attemptId)
      .order("captured_at", { ascending: false });
    if (error) { toast.error(error.message); setLoadingSnapsFor(null); return; }
    
    const withUrls = await Promise.all((data ?? []).map(async (s) => {
      let url = null;
      try {
        url = await r2Storage.getDownloadUrl(s.storage_path);
      } catch (err) {
        console.error("Failed to get snapshot URL:", err);
      }
      return { ...s, signedUrl: url };
    }));
    
    setSnapshots((prev) => ({ ...prev, [attemptId]: withUrls }));
    setLoadingSnapsFor(null);
  };

  const deleteSnapshot = async (attemptId: string, snap: { id: string; storage_path: string; storage_provider: string }) => {
    if (!confirm("Delete this snapshot permanently?")) return;

    try {
      await r2Storage.deleteFile(snap.storage_path);

      const { error: dErr } = await supabase.from("exam_snapshots").delete().eq("id", snap.id);
      if (dErr) throw dErr;
      
      setSnapshots((prev) => ({
        ...prev,
        [attemptId]: (prev[attemptId] ?? []).filter((s) => s.id !== snap.id),
      }));
      toast.success("Snapshot deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete snapshot");
    }
  };

  const deleteAllSnapshots = async (attemptId: string) => {
    const list = snapshots[attemptId] ?? [];
    if (list.length === 0) return;
    if (!confirm(`Delete all ${list.length} snapshots for this attempt?`)) return;

    try {
      for (const s of list) {
        await r2Storage.deleteFile(s.storage_path);
      }

      await supabase.from("exam_snapshots").delete().eq("attempt_id", attemptId);
      setSnapshots((prev) => ({ ...prev, [attemptId]: [] }));
      toast.success("All snapshots deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete snapshots");
    }
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

      {(hiddenRehearsals > 0 || showRehearsals) && (
        <p className="text-xs text-muted-foreground">
          {hiddenRehearsals} staff rehearsal{hiddenRehearsals === 1 ? "" : "s"}{" "}
          {showRehearsals ? "shown in the list below" : "excluded from these figures"}.{" "}
          <button className="underline hover:text-foreground" onClick={() => setShowRehearsals((v) => !v)}>
            {showRehearsals ? "Hide" : "Show"}
          </button>
        </p>
      )}

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
              <Fragment key={a.id}>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-3">
                  <p className="font-medium">
                    {a.students?.profiles?.first_name} {a.students?.profiles?.last_name}
                    {a.isRehearsal && <Badge variant="outline" className="ml-2 text-[10px]">rehearsal</Badge>}
                  </p>
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
                  <div className="flex flex-wrap gap-1.5">
                    {a.status !== "in_progress" && (
                      <Button size="sm" variant="outline" onClick={() => openGrading(a)}>
                        {a.status === "graded" ? "Regrade" : "Grade"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => loadSnapshots(a.id)} disabled={loadingSnapsFor === a.id}>
                      {loadingSnapsFor === a.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                      Snapshots
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteAttempt(a)}>
                      <Trash2 className="w-3 h-3 mr-1" /> {a.isRehearsal ? "Discard" : "Delete"}
                    </Button>
                  </div>
                </td>
              </tr>
              {snapshots[a.id] && (
                <tr key={`${a.id}-snaps`}>
                  <td colSpan={6} className="py-2 px-3 bg-muted/30">
                    {snapshots[a.id].length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No snapshots captured for this attempt.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium">{snapshots[a.id].length} snapshots</p>
                          <Button size="sm" variant="destructive" onClick={() => deleteAllSnapshots(a.id)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Delete all
                          </Button>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                          {snapshots[a.id].map((s) => (
                            <div key={s.id} className="relative group">
                              <button
                                onClick={() => s.signedUrl && setSnapshotViewer({ url: s.signedUrl, meta: new Date(s.captured_at).toLocaleString() })}
                                className="block w-full aspect-[4/3] rounded overflow-hidden border border-border hover:border-primary"
                              >
                                {s.signedUrl ? (
                                  <img src={s.signedUrl} alt="snapshot" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">…</div>
                                )}
                              </button>
                              <button
                                onClick={() => deleteSnapshot(a.id, s)}
                                className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete snapshot"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{new Date(s.captured_at).toLocaleTimeString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!grading} onOpenChange={(v) => !v && setGrading(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {grading?.students?.profiles?.first_name} {grading?.students?.profiles?.last_name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {gradedTotal} out of {gradeMax} marks
              {manualRemaining > 0
                ? ` · ${manualRemaining} answer${manualRemaining === 1 ? "" : "s"} still to mark`
                : " · nothing left to mark"}
            </p>
          </DialogHeader>
          <div className="space-y-3">
            {gradeData.questions.map((q, idx) => {
              const ans = gradeData.answers.find((a) => a.question_id === q.id);
              if (!ans) return null;
              const needsMark = !AUTO_GRADED_TYPES.includes(q.question_type) || q.correct_answer == null;
              const max = Number(q.points) || 0;
              const setAnswer = (patch: any) => {
                const next = [...gradeData.answers];
                next[next.indexOf(ans)] = { ...ans, ...patch };
                setGradeData({ ...gradeData, answers: next });
              };
              return (
                <Card key={q.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Question {idx + 1}</p>
                    {needsMark ? (
                      <Badge variant="outline" className="text-[10px]">Needs your mark</Badge>
                    ) : ans.is_correct ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Correct · {ans.points_awarded ?? 0}/{max}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                        Wrong · 0/{max}
                      </Badge>
                    )}
                  </div>

                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />

                  <div className="text-sm">
                    <span className="text-muted-foreground">Their answer: </span>
                    {formatAnswer(ans.answer, q) || <span className="italic text-muted-foreground">No answer given</span>}
                  </div>
                  {!needsMark && q.correct_answer != null && !ans.is_correct && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Correct answer: </span>
                      <span className="text-emerald-600">{formatAnswer(q.correct_answer, q)}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Marks:</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={Number(ans.points_awarded) === max && max > 0 ? "default" : "outline"}
                      onClick={() => setAnswer({ points_awarded: max })}
                    >
                      Full ({max})
                    </Button>
                    {max > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant={Number(ans.points_awarded) === max / 2 ? "default" : "outline"}
                        onClick={() => setAnswer({ points_awarded: max / 2 })}
                      >
                        Half ({max / 2})
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={Number(ans.points_awarded) === 0 ? "default" : "outline"}
                      onClick={() => setAnswer({ points_awarded: 0 })}
                    >
                      None (0)
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      step={0.5}
                      className="w-20 h-9"
                      value={ans.points_awarded ?? ""}
                      onChange={(e) => setAnswer({ points_awarded: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>

                  <Input
                    placeholder="Comment for the student (optional)"
                    value={ans.manual_feedback ?? ""}
                    onChange={(e) => setAnswer({ manual_feedback: e.target.value })}
                  />
                </Card>
              );
            })}

            <Card className="p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Total</p>
                <p className="text-xs text-muted-foreground">Adds up the marks you gave each question above.</p>
              </div>
              <p className="text-xl font-bold tabular-nums">
                {gradedTotal}<span className="text-sm font-normal text-muted-foreground"> / {gradeMax}</span>
              </p>
            </Card>

            {Array.isArray(grading?.regrade_history) && grading.regrade_history.length > 0 && (
              <Card className="p-3">
                <p className="text-sm font-medium mb-1">Previous marks</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {grading.regrade_history.map((h: any, i: number) => (
                    <li key={i}>
                      {new Date(h.at).toLocaleString()} · changed from {h.from ?? 0} to {h.to ?? 0}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrading(null)}>Cancel</Button>
            <Button onClick={saveGrading}>
              {grading?.status === "graded" ? "Save regrade" : "Save marks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!snapshotViewer} onOpenChange={(v) => !v && setSnapshotViewer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Snapshot · {snapshotViewer?.meta}</DialogTitle></DialogHeader>
          {snapshotViewer && <img src={snapshotViewer.url} alt="snapshot" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
