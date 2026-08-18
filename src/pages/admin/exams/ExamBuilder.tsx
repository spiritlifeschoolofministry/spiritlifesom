import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { sanitizeHtml, QUESTION_TYPE_LABELS, QuestionType } from "@/lib/exam-utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Download, Loader2, Lock, Save, Send } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  closed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  archived: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Scheduled",
  in_progress: "Live",
  closed: "Closed",
  archived: "Archived",
};

const DEFAULT: any = {
  title: "",
  description: "",
  instructions: "Read all instructions carefully before starting.",
  course_id: "",
  cohort_id: "",
  start_at: "",
  end_at: "",
  duration_minutes: 60,
  passing_score: 50,
  status: "draft",
  randomize_questions: true,
  randomize_options: true,
  enforce_fullscreen: true,
  block_shortcuts: true,
  allow_mobile: true,
  max_tab_switches: 3,
  autosave_interval_seconds: 15,
  allow_late_entry: false,
  late_entry_cutoff_minutes: 15,
  show_correct_answers: false,
  target_audience: "cohort",
  target_student_ids: [],
  questions_per_attempt: null,
  enable_webcam_proctoring: false,
  snapshot_interval_seconds: 30,
  enable_audio_proctoring: false,
  audio_clip_seconds: 60,
};

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="text-xs text-destructive mt-1">{message}</p> : null;

/** Shift a datetime-local string ("2026-08-17T15:30") by n minutes, keeping the same format. */
const addMinutes = (local: string, minutes: number) => {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Minutes between two datetime-local strings, or null if either is unusable. */
const minutesBetween = (from: string, to: string) => {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
};

const humanDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

export default function ExamBuilder() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [exam, setExam] = useState<any>(DEFAULT);
  const [courses, setCourses] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [bank, setBank] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(params.get("tab") || "settings");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [otherExams, setOtherExams] = useState<any[]>([]);
  const [importExamId, setImportExamId] = useState<string>("");
  const [importQids, setImportQids] = useState<string[]>([]);
  const [importQuestions, setImportQuestions] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  /** Patch the exam and mark the form dirty, clearing any error on the touched fields. */
  const update = (patch: Record<string, unknown>) => {
    setExam((prev: any) => {
      const next = { ...prev, ...patch };
      // Picking a start time with no sensible close time yet is the common case, so
      // derive one from the duration rather than making the admin compute it.
      if ("start_at" in patch && next.start_at) {
        const span = next.end_at ? minutesBetween(next.start_at, next.end_at) : null;
        if (span === null || span <= 0) {
          next.end_at = addMinutes(next.start_at, Number(next.duration_minutes) || 60);
        }
      }
      return next;
    });
    setDirty(true);
    setErrors((prev) => {
      if (!Object.keys(patch).some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  // Warn before a browser reload/close throws away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const leaveBuilder = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    navigate("/admin/exams");
  };

  useEffect(() => {
    (async () => {
      const [cRes, ccRes, bRes] = await Promise.all([
        supabase.from("courses").select("id, code, title").order("code"),
        supabase.from("cohorts").select("id, name, is_active").order("created_at", { ascending: false }),
        supabase.from("question_bank").select("*").eq("archived", false),
      ]);
      setCourses(cRes.data ?? []);
      setCohorts(ccRes.data ?? []);
      setBank(bRes.data ?? []);

      if (!isNew) {
        const { data } = await supabase.from("exams").select("*").eq("id", id).maybeSingle();
        if (data) {
          setExam({
            ...data,
            start_at: data.start_at ? toLocal(data.start_at) : "",
            end_at: data.end_at ? toLocal(data.end_at) : "",
          });
          const { data: eq } = await supabase
            .from("exam_questions")
            .select("question_id, display_order")
            .eq("exam_id", id)
            .order("display_order");
          setPicked((eq ?? []).map((q) => q.question_id));
        }
      }
      setLoading(false);
    })();
  }, [id, isNew]);

  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };

  const totalPoints = picked.reduce((sum, qid) => {
    const q = bank.find((b) => b.id === qid);
    return sum + (q ? Number(q.points) : 0);
  }, 0);

  /** Returns a per-field message for everything that would stop this exam being saved. */
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!exam.title?.trim()) errs.title = "Give the exam a title.";
    if (!exam.course_id) errs.course_id = "Pick the course this exam belongs to.";
    if (!exam.cohort_id) errs.cohort_id = "Pick the cohort that will sit this exam.";
    if (!exam.start_at) errs.start_at = "Set when the exam opens.";
    if (!exam.end_at) errs.end_at = "Set when the exam closes.";
    if (exam.start_at && exam.end_at) {
      const start = new Date(exam.start_at);
      const end = new Date(exam.end_at);
      if (end <= start) {
        errs.end_at = "The closing time must be after the opening time.";
      } else if ((end.getTime() - start.getTime()) / 60000 < Number(exam.duration_minutes || 0)) {
        const span = Math.round((end.getTime() - start.getTime()) / 60000);
        errs.end_at =
          `The exam is only open for ${humanDuration(span)} (${format(start, "p")} to ${format(end, "p")}), ` +
          `but each student needs ${humanDuration(Number(exam.duration_minutes))} to finish. ` +
          `Push the closing time back, or lower the time limit.`;
      }
    }
    if (Number(exam.duration_minutes) < 1) errs.duration_minutes = "Duration must be at least 1 minute.";
    return errs;
  };

  const save = async (newStatus?: string) => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTab("settings");
      return toast.error(Object.values(errs)[0]);
    }
    if (exam.locked_at) return toast.error("Exam is locked — students have started");

    setSaving(true);
    try {
      const payload = {
        ...exam,
        start_at: new Date(exam.start_at).toISOString(),
        end_at: new Date(exam.end_at).toISOString(),
        total_points: totalPoints,
        status: newStatus ?? exam.status,
      };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.locked_at;
      if (isNew) payload.created_by = (await supabase.auth.getUser()).data.user?.id ?? null;

      const { data: saved, error } = isNew
        ? await supabase.from("exams").insert(payload).select().single()
        : await supabase.from("exams").update(payload).eq("id", id).select().single();
      if (error) throw error;

      // Sync exam_questions. These failing silently used to leave a "Saved" exam with no questions.
      const examId = saved.id;
      const { error: clearError } = await supabase.from("exam_questions").delete().eq("exam_id", examId);
      if (clearError) throw clearError;
      if (picked.length) {
        const { error: linkError } = await supabase.from("exam_questions").insert(
          picked.map((qid, i) => ({ exam_id: examId, question_id: qid, display_order: i })),
        );
        if (linkError) throw linkError;
      }

      setExam((prev: any) => ({ ...prev, id: examId, status: payload.status }));
      setDirty(false);
      toast.success(
        newStatus === "published"
          ? "Exam published — students in this cohort can see it now"
          : `Saved as ${payload.status === "draft" ? "draft" : payload.status}`,
      );
      if (isNew) navigate(`/admin/exams/${examId}/edit`, { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Could not save the exam");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const pickedQuestions = picked.map((id) => bank.find((q) => q.id === id)).filter(Boolean);
  const previewQ = pickedQuestions[previewIdx];
  const windowMinutes =
    exam.start_at && exam.end_at ? minutesBetween(exam.start_at, exam.end_at) : null;
  const windowTooShort = windowMinutes !== null && windowMinutes < Number(exam.duration_minutes || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={leaveBuilder}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{isNew ? "New Exam" : exam.title || "Edit Exam"}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className={STATUS_STYLES[exam.status] || ""}>
                {STATUS_LABELS[exam.status] ?? exam.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {picked.length} question{picked.length === 1 ? "" : "s"} · {totalPoints} pts
              </span>
              {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
              {exam.locked_at && (
                <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" /> Locked — attempts started</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save draft
          </Button>
          {exam.status !== "published" && (
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={saving || picked.length === 0}
              title={picked.length === 0 ? "Add at least one question before publishing" : undefined}
            >
              <Send className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          )}
        </div>
      </div>

      {picked.length === 0 && (
        <Card className="p-3 flex items-start gap-2 border-amber-500/30 bg-amber-500/5">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm">
            This exam has no questions yet. Saving keeps it as a draft; add questions on the{" "}
            <button type="button" className="underline font-medium" onClick={() => setTab("questions")}>
              Questions
            </button>{" "}
            tab before publishing.
          </p>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="questions">Questions ({picked.length})</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={exam.title} onChange={(e) => update({ title: e.target.value })} maxLength={200}
                aria-invalid={!!errors.title} />
              <FieldError message={errors.title} />
            </div>
            <div><Label>Description</Label><Textarea value={exam.description ?? ""} onChange={(e) => update({ description: e.target.value })} rows={2} /></div>
            <div><Label>Instructions (shown on rules page)</Label><Textarea value={exam.instructions ?? ""} onChange={(e) => update({ instructions: e.target.value })} rows={4} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Course *</Label>
                <Select value={exam.course_id} onValueChange={(v) => update({ course_id: v })}>
                  <SelectTrigger aria-invalid={!!errors.course_id}><SelectValue placeholder="Pick course" /></SelectTrigger>
                  <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError message={errors.course_id} />
              </div>
              <div><Label>Cohort *</Label>
                <Select value={exam.cohort_id} onValueChange={(v) => update({ cohort_id: v })}>
                  <SelectTrigger aria-invalid={!!errors.cohort_id}><SelectValue placeholder="Pick cohort" /></SelectTrigger>
                  <SelectContent>{cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_active ? " (active)" : ""}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError message={errors.cohort_id} />
              </div>
              <div>
                <Label>Opens *</Label>
                <Input type="datetime-local" value={exam.start_at} onChange={(e) => update({ start_at: e.target.value })}
                  aria-invalid={!!errors.start_at} />
                <FieldError message={errors.start_at} />
                <p className="text-xs text-muted-foreground mt-1">Earliest a student may start.</p>
              </div>
              <div>
                <Label>Closes *</Label>
                <Input type="datetime-local" value={exam.end_at} onChange={(e) => update({ end_at: e.target.value })}
                  aria-invalid={!!errors.end_at} />
                <FieldError message={errors.end_at} />
                <p className="text-xs text-muted-foreground mt-1">Everyone is submitted by this time.</p>
              </div>
              <div>
                <Label>Time limit per student (minutes)</Label>
                <Input type="number" min={1} value={exam.duration_minutes}
                  onChange={(e) => update({ duration_minutes: Number(e.target.value) })} aria-invalid={!!errors.duration_minutes} />
                <FieldError message={errors.duration_minutes} />
                <p className="text-xs text-muted-foreground mt-1">
                  Each student's own countdown, which starts when they begin — not the same as the window above.
                </p>
              </div>
              <div>
                <Label>Passing score (% of total)</Label>
                <Input type="number" min={0} max={100} value={exam.passing_score} onChange={(e) => update({ passing_score: Number(e.target.value) })} />
                {totalPoints > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round((Number(exam.passing_score) / 100) * totalPoints * 100) / 100} of {totalPoints} pts to pass.
                  </p>
                )}
              </div>
            </div>
            {windowMinutes !== null && windowMinutes > 0 && (
              <div
                className={`p-3 rounded-md border text-sm ${
                  windowTooShort ? "border-amber-500/30 bg-amber-500/5" : "border-border"
                }`}
              >
                <p>
                  The exam is open for <strong>{humanDuration(windowMinutes)}</strong>, and each student gets{" "}
                  <strong>{humanDuration(Number(exam.duration_minutes) || 0)}</strong> once they start.
                </p>
                {windowTooShort ? (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-amber-700 dark:text-amber-500">
                      Nobody can finish — the window is shorter than the time limit.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => update({ end_at: addMinutes(exam.start_at, Number(exam.duration_minutes) || 60) })}
                    >
                      Close at {format(new Date(addMinutes(exam.start_at, Number(exam.duration_minutes) || 60)), "PPp")} instead
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    A student who starts after{" "}
                    {format(new Date(addMinutes(exam.end_at, -(Number(exam.duration_minutes) || 0))), "p")} will be
                    submitted when the window closes, before their own time is up.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-md border border-border">
              <div><Label>Allow late entry</Label><p className="text-xs text-muted-foreground">Students may join after start time</p></div>
              <Switch checked={exam.allow_late_entry} onCheckedChange={(v) => update({ allow_late_entry: v })} />
            </div>
            {exam.allow_late_entry && (
              <div><Label>Late entry cutoff (minutes after start)</Label><Input type="number" min={1} value={exam.late_entry_cutoff_minutes ?? 15} onChange={(e) => update({ late_entry_cutoff_minutes: Number(e.target.value) })} /></div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm">Select questions from the bank ({picked.length} selected, {totalPoints} pts total)</p>
              <Dialog open={importOpen} onOpenChange={async (o) => {
                setImportOpen(o);
                if (o && otherExams.length === 0) {
                  const { data } = await supabase
                    .from("exams")
                    .select("id, title, course_id, courses(code)")
                    .neq("id", id ?? "00000000-0000-0000-0000-000000000000")
                    .order("created_at", { ascending: false });
                  setOtherExams(data ?? []);
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" /> Import from previous exam</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Import questions from another exam</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Source exam</Label>
                      <Select value={importExamId} onValueChange={async (v) => {
                        setImportExamId(v);
                        setImportQids([]);
                        const { data: eq } = await supabase
                          .from("exam_questions")
                          .select("question_id, display_order, question_bank(*)")
                          .eq("exam_id", v)
                          .order("display_order");
                        setImportQuestions((eq ?? []).map((r: any) => r.question_bank).filter(Boolean));
                      }}>
                        <SelectTrigger><SelectValue placeholder="Pick an exam to import from" /></SelectTrigger>
                        <SelectContent>
                          {otherExams.map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>{e.courses?.code ? `${e.courses.code} — ` : ""}{e.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {importQuestions.length > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span>{importQids.length} of {importQuestions.length} selected</span>
                          <Button size="sm" variant="ghost" onClick={() => setImportQids(
                            importQids.length === importQuestions.length ? [] : importQuestions.map((q) => q.id)
                          )}>{importQids.length === importQuestions.length ? "Clear all" : "Select all"}</Button>
                        </div>
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                          {importQuestions.map((q: any) => {
                            const already = picked.includes(q.id);
                            const checked = importQids.includes(q.id) || already;
                            return (
                              <div key={q.id} className="flex items-start gap-3 p-2 rounded-md border border-border">
                                <Checkbox checked={checked} disabled={already} onCheckedChange={(v) => {
                                  setImportQids(v ? [...importQids, q.id] : importQids.filter((x) => x !== q.id));
                                }} className="mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex gap-1.5 mb-1">
                                    <Badge variant="secondary" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type as QuestionType]}</Badge>
                                    <Badge variant="outline" className="text-[10px]">{q.points} pt</Badge>
                                    {already && <Badge variant="outline" className="text-[10px] bg-muted">Already added</Badge>}
                                  </div>
                                  <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-2 text-xs"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                    <Button disabled={importQids.length === 0} onClick={() => {
                      const merged = Array.from(new Set([...picked, ...importQids]));
                      setPicked(merged);
                      setDirty(true);
                      toast.success(`Imported ${importQids.length} question${importQids.length === 1 ? "" : "s"}`);
                      setImportOpen(false);
                      setImportQids([]);
                      setImportExamId("");
                      setImportQuestions([]);
                    }}>Import {importQids.length || ""}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {bank
                .filter((q) => !exam.course_id || q.course_id === exam.course_id)
                .map((q) => {
                  const checked = picked.includes(q.id);
                  return (
                    <div key={q.id} className="flex items-start gap-3 p-3 rounded-md border border-border">
                      <Checkbox checked={checked} onCheckedChange={(v) => {
                        setPicked(v ? [...picked, q.id] : picked.filter((p) => p !== q.id));
                        setDirty(true);
                      }} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          <Badge variant="secondary" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type as QuestionType]}</Badge>
                          <Badge variant="outline" className="text-[10px]">{q.points} pt</Badge>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-2 text-sm"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                      </div>
                    </div>
                  );
                })}
              {bank.filter((q) => !exam.course_id || q.course_id === exam.course_id).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No questions available for this course. Add some in the Question Bank.
                </p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-3">
          <Card className="p-4 space-y-3">
            {[
              { k: "randomize_questions", label: "Randomize question order per student" },
              { k: "randomize_options", label: "Randomize option order" },
              { k: "enforce_fullscreen", label: "Require fullscreen" },
              { k: "block_shortcuts", label: "Block keyboard shortcuts (copy/paste/devtools)" },
              { k: "allow_mobile", label: "Allow mobile devices (with reduced security)" },
              { k: "show_correct_answers", label: "Show correct answers after release" },
              { k: "enable_webcam_proctoring", label: "Webcam proctoring (snapshots every 30s)" },
              { k: "enable_audio_proctoring", label: "Audio monitoring (microphone recorded in clips)" },
            ].map((row) => (
              <div key={row.k} className="flex items-center justify-between">
                <Label>{row.label}</Label>
                <Switch checked={!!exam[row.k]} onCheckedChange={(v) => update({ [row.k]: v })} />
              </div>
            ))}
            <div><Label>Max tab switches before auto-submit</Label><Input type="number" min={0} value={exam.max_tab_switches} onChange={(e) => update({ max_tab_switches: Number(e.target.value) })} /></div>
            <div><Label>Autosave interval (seconds)</Label><Input type="number" min={5} value={exam.autosave_interval_seconds} onChange={(e) => update({ autosave_interval_seconds: Number(e.target.value) })} /></div>
            {exam.enable_webcam_proctoring && (
              <div><Label>Snapshot interval (seconds, min 10)</Label><Input type="number" min={10} value={exam.snapshot_interval_seconds ?? 30} onChange={(e) => update({ snapshot_interval_seconds: Number(e.target.value) })} /></div>
            )}
            {exam.enable_audio_proctoring && (
              <div><Label>Audio clip length (seconds, min 15)</Label><Input type="number" min={15} value={exam.audio_clip_seconds ?? 60} onChange={(e) => update({ audio_clip_seconds: Number(e.target.value) })} /></div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card className="p-4">
            {pickedQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No questions selected yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Question {previewIdx + 1} of {pickedQuestions.length}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPreviewIdx(Math.max(0, previewIdx - 1))} disabled={previewIdx === 0}>Prev</Button>
                    <Button size="sm" variant="outline" onClick={() => setPreviewIdx(Math.min(pickedQuestions.length - 1, previewIdx + 1))} disabled={previewIdx === pickedQuestions.length - 1}>Next</Button>
                  </div>
                </div>
                <QuestionRenderer question={previewQ} answer={null} onChange={() => {}} disabled />
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Publish this exam?"
        description={
          <div className="space-y-2">
            <p>Students in the selected cohort will be able to see this exam and sit it during its window.</p>
            <ul className="text-sm space-y-1">
              <li>{picked.length} question{picked.length === 1 ? "" : "s"}, {totalPoints} points total</li>
              <li>{exam.duration_minutes} minutes per student</li>
              {exam.start_at && <li>Opens {new Date(exam.start_at).toLocaleString()}</li>}
              {exam.end_at && <li>Closes {new Date(exam.end_at).toLocaleString()}</li>}
            </ul>
            <p className="text-muted-foreground text-sm">
              You can unpublish it later from the exam list, as long as nobody has started an attempt.
            </p>
          </div>
        }
        confirmLabel="Publish"
        loading={saving}
        onConfirm={async () => {
          await save("published");
          setConfirmPublish(false);
        }}
      />
    </div>
  );
}
