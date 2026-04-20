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
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { sanitizeHtml, QUESTION_TYPE_LABELS, QuestionType } from "@/lib/exam-utils";
import { toast } from "sonner";
import { ArrowLeft, Save, Send, Lock } from "lucide-react";

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

  const save = async (newStatus?: string) => {
    if (!exam.title || !exam.course_id || !exam.cohort_id || !exam.start_at || !exam.end_at) {
      return toast.error("Fill all required fields");
    }
    if (exam.locked_at) return toast.error("Exam is locked — students have started");

    setSaving(true);
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

    const { data: saved, error } = isNew
      ? await supabase.from("exams").insert(payload).select().single()
      : await supabase.from("exams").update(payload).eq("id", id).select().single();

    if (error) { setSaving(false); return toast.error(error.message); }

    const examId = saved.id;
    // Sync exam_questions
    await supabase.from("exam_questions").delete().eq("exam_id", examId);
    if (picked.length) {
      await supabase.from("exam_questions").insert(
        picked.map((qid, i) => ({ exam_id: examId, question_id: qid, display_order: i })),
      );
    }
    setSaving(false);
    toast.success(newStatus === "published" ? "Exam published" : "Saved");
    if (isNew) navigate(`/admin/exams/${examId}/edit`);
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const pickedQuestions = picked.map((id) => bank.find((q) => q.id === id)).filter(Boolean);
  const previewQ = pickedQuestions[previewIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/exams")}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">{isNew ? "New Exam" : exam.title || "Edit Exam"}</h1>
            {exam.locked_at && (
              <Badge variant="destructive" className="mt-1"><Lock className="w-3 h-3 mr-1" /> Locked — attempts started</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save()} disabled={saving}><Save className="w-4 h-4 mr-1.5" /> Save</Button>
          {exam.status !== "published" && (
            <Button onClick={() => save("published")} disabled={saving || picked.length === 0}>
              <Send className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="questions">Questions ({picked.length})</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div><Label>Title *</Label><Input value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} maxLength={200} /></div>
            <div><Label>Description</Label><Textarea value={exam.description ?? ""} onChange={(e) => setExam({ ...exam, description: e.target.value })} rows={2} /></div>
            <div><Label>Instructions (shown on rules page)</Label><Textarea value={exam.instructions ?? ""} onChange={(e) => setExam({ ...exam, instructions: e.target.value })} rows={4} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Course *</Label>
                <Select value={exam.course_id} onValueChange={(v) => setExam({ ...exam, course_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick course" /></SelectTrigger>
                  <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cohort *</Label>
                <Select value={exam.cohort_id} onValueChange={(v) => setExam({ ...exam, cohort_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick cohort" /></SelectTrigger>
                  <SelectContent>{cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_active ? " (active)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Start *</Label><Input type="datetime-local" value={exam.start_at} onChange={(e) => setExam({ ...exam, start_at: e.target.value })} /></div>
              <div><Label>End *</Label><Input type="datetime-local" value={exam.end_at} onChange={(e) => setExam({ ...exam, end_at: e.target.value })} /></div>
              <div><Label>Duration (minutes)</Label><Input type="number" min={1} value={exam.duration_minutes} onChange={(e) => setExam({ ...exam, duration_minutes: Number(e.target.value) })} /></div>
              <div><Label>Passing score (% of total)</Label><Input type="number" min={0} max={100} value={exam.passing_score} onChange={(e) => setExam({ ...exam, passing_score: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border border-border">
              <div><Label>Allow late entry</Label><p className="text-xs text-muted-foreground">Students may join after start time</p></div>
              <Switch checked={exam.allow_late_entry} onCheckedChange={(v) => setExam({ ...exam, allow_late_entry: v })} />
            </div>
            {exam.allow_late_entry && (
              <div><Label>Late entry cutoff (minutes after start)</Label><Input type="number" min={1} value={exam.late_entry_cutoff_minutes ?? 15} onChange={(e) => setExam({ ...exam, late_entry_cutoff_minutes: Number(e.target.value) })} /></div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm">Select questions from the bank ({picked.length} selected, {totalPoints} pts total)</p>
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
            ].map((row) => (
              <div key={row.k} className="flex items-center justify-between">
                <Label>{row.label}</Label>
                <Switch checked={!!exam[row.k]} onCheckedChange={(v) => setExam({ ...exam, [row.k]: v })} />
              </div>
            ))}
            <div><Label>Max tab switches before auto-submit</Label><Input type="number" min={0} value={exam.max_tab_switches} onChange={(e) => setExam({ ...exam, max_tab_switches: Number(e.target.value) })} /></div>
            <div><Label>Autosave interval (seconds)</Label><Input type="number" min={5} value={exam.autosave_interval_seconds} onChange={(e) => setExam({ ...exam, autosave_interval_seconds: Number(e.target.value) })} /></div>
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
    </div>
  );
}
