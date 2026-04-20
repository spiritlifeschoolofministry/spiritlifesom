import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
const RichTextEditor = lazy(() =>
  import("@/components/exam/RichTextEditor").then((m) => ({ default: m.RichTextEditor }))
);
import { QUESTION_TYPE_LABELS, QuestionType, parseQuestionCSV, sanitizeHtml } from "@/lib/exam-utils";
import { toast } from "sonner";
import { Plus, Upload, Archive, Edit, Trash2, Search } from "lucide-react";

export default function QuestionBank() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importCourse, setImportCourse] = useState("");

  const load = async () => {
    setLoading(true);
    const [qRes, cRes] = await Promise.all([
      supabase.from("question_bank").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, code, title").order("code"),
    ]);
    setQuestions(qRes.data ?? []);
    setCourses(cRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = questions.filter((q) => {
    if (q.archived !== showArchived) return false;
    if (filterCourse !== "all" && q.course_id !== filterCourse) return false;
    if (filterType !== "all" && q.question_type !== filterType) return false;
    if (search && !(q.question_text || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const newQuestion = () => {
    setEditing({
      question_type: "mcq_single",
      question_text: "",
      options: ["", ""],
      correct_answer: 0,
      points: 1,
      course_id: courses[0]?.id ?? "",
      explanation: "",
      image_url: "",
      code_snippet: "",
      tags: [],
    });
    setOpenEditor(true);
  };

  const saveQuestion = async () => {
    if (!editing.course_id) return toast.error("Select a course");
    if (!editing.question_text?.trim()) return toast.error("Question text is required");
    const payload = { ...editing };
    delete payload.id;
    const { error } = editing.id
      ? await supabase.from("question_bank").update(payload).eq("id", editing.id)
      : await supabase.from("question_bank").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Question saved");
    setOpenEditor(false);
    setEditing(null);
    load();
  };

  const toggleArchive = async (q: any) => {
    const { error } = await supabase.from("question_bank").update({ archived: !q.archived }).eq("id", q.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (q: any) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    const { error } = await supabase.from("question_bank").delete().eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const handleImport = async () => {
    if (!importCourse) return toast.error("Pick a course");
    const rows = parseQuestionCSV(csvText);
    if (!rows.length) return toast.error("No rows parsed");
    const payload = rows.map((r: any) => ({
      course_id: importCourse,
      question_type: r.question_type,
      question_text: r.question_text,
      options: r.options,
      correct_answer: r.correct_answer,
      points: r.points,
      explanation: r.explanation,
    }));
    const { error } = await supabase.from("question_bank").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${rows.length} question(s)`);
    setImportOpen(false);
    setCsvText("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Question Bank</h1>
          <p className="text-sm text-muted-foreground">Reusable questions for online exams</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Import CSV
          </Button>
          <Button onClick={newQuestion}>
            <Plus className="w-4 h-4 mr-1.5" /> New Question
          </Button>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8" />
        </div>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Showing archived" : "Show archived"}
        </Button>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No questions found.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((q) => (
            <Card key={q.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Badge variant="secondary">{QUESTION_TYPE_LABELS[q.question_type as QuestionType] ?? q.question_type}</Badge>
                    <Badge variant="outline">{q.points} pt</Badge>
                    {q.archived && <Badge variant="destructive">Archived</Badge>}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(q); setOpenEditor(true); }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleArchive(q)}>
                    <Archive className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(q)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={openEditor} onOpenChange={(v) => { setOpenEditor(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Question</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Course</Label>
                  <Select value={editing.course_id} onValueChange={(v) => setEditing({ ...editing, course_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick course" /></SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={editing.question_type} onValueChange={(v) => {
                    const next: any = { ...editing, question_type: v };
                    if (v === "mcq_single") { next.options = ["", ""]; next.correct_answer = 0; }
                    else if (v === "mcq_multi") { next.options = ["", ""]; next.correct_answer = []; }
                    else if (v === "true_false") { next.options = null; next.correct_answer = true; }
                    else if (v === "essay" || v === "matching") { next.options = null; next.correct_answer = null; }
                    else { next.options = null; next.correct_answer = []; }
                    setEditing(next);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Question</Label>
                <RichTextEditor value={editing.question_text} onChange={(v) => setEditing({ ...editing, question_text: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Image URL (optional)</Label>
                  <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
                </div>
                <div>
                  <Label>Points</Label>
                  <Input type="number" min={0} step={0.5} value={editing.points}
                    onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <Label>Code snippet (optional)</Label>
                <Textarea value={editing.code_snippet ?? ""} onChange={(e) => setEditing({ ...editing, code_snippet: e.target.value })}
                  rows={3} className="font-mono text-xs" />
              </div>

              {(editing.question_type === "mcq_single" || editing.question_type === "mcq_multi") && (
                <div>
                  <Label>Options</Label>
                  {editing.options?.map((opt: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 mt-2">
                      <Input value={opt} onChange={(e) => {
                        const opts = [...editing.options]; opts[i] = e.target.value;
                        setEditing({ ...editing, options: opts });
                      }} placeholder={`Option ${i + 1}`} />
                      {editing.question_type === "mcq_single" ? (
                        <input type="radio" checked={editing.correct_answer === i}
                          onChange={() => setEditing({ ...editing, correct_answer: i })} />
                      ) : (
                        <input type="checkbox"
                          checked={Array.isArray(editing.correct_answer) && editing.correct_answer.includes(i)}
                          onChange={(e) => {
                            const arr = Array.isArray(editing.correct_answer) ? [...editing.correct_answer] : [];
                            const next = e.target.checked ? [...arr, i] : arr.filter((n: number) => n !== i);
                            setEditing({ ...editing, correct_answer: next.sort() });
                          }} />
                      )}
                      <Button size="sm" variant="ghost" onClick={() => {
                        const opts = editing.options.filter((_: any, idx: number) => idx !== i);
                        setEditing({ ...editing, options: opts });
                      }}>×</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="mt-2"
                    onClick={() => setEditing({ ...editing, options: [...(editing.options ?? []), ""] })}>
                    Add option
                  </Button>
                </div>
              )}

              {editing.question_type === "true_false" && (
                <div>
                  <Label>Correct answer</Label>
                  <Select value={String(editing.correct_answer)} onValueChange={(v) => setEditing({ ...editing, correct_answer: v === "true" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(editing.question_type === "short_answer" || editing.question_type === "fill_blank") && (
                <div>
                  <Label>Accepted answers (one per line)</Label>
                  <Textarea
                    value={Array.isArray(editing.correct_answer) ? editing.correct_answer.join("\n") : ""}
                    onChange={(e) => setEditing({ ...editing, correct_answer: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    rows={3}
                  />
                </div>
              )}

              <div>
                <Label>Explanation (shown only to admins)</Label>
                <Textarea value={editing.explanation ?? ""} onChange={(e) => setEditing({ ...editing, explanation: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEditor(false)}>Cancel</Button>
            <Button onClick={saveQuestion}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bulk import from CSV</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Target course</Label>
              <Select value={importCourse} onValueChange={setImportCourse}>
                <SelectTrigger><SelectValue placeholder="Pick course" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CSV content</Label>
              <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={10} className="font-mono text-xs"
                placeholder="question_type,question_text,option_a,option_b,option_c,option_d,correct,points,explanation" />
              <p className="text-xs text-muted-foreground mt-1">
                Header required. <code>correct</code> uses letters (a/b/c/d), separated by | for multi-select. true/false uses "true"/"false".
                Short answer accepts multiple values joined with |.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
