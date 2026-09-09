import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

/** Only the columns the course picker query selects. */
type CourseOption = Pick<Tables<'courses'>, 'id' | 'code' | 'title'>;

/**
 * The editor's working copy of a question. `options` and `correct_answer` are
 * Json columns on question_bank, but the editor manipulates them unpacked —
 * options as a list of strings, correct_answer as whatever the question type
 * calls for — so the draft names those forms and toDraft converts a loaded row
 * into them. Every other column is optional because a new question starts from
 * a handful of fields rather than a full row.
 */
type QuestionDraft = Partial<Omit<Tables<'question_bank'>, 'options' | 'correct_answer'>> & {
  options?: string[] | null;
  correct_answer?: number | number[] | boolean | string[] | Record<string, string> | null;
};

/** A multi-answer question keeps its answer as a list of option indices. */
const selectedIndices = (value: QuestionDraft['correct_answer']): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];

const toDraft = (q: Tables<'question_bank'>): QuestionDraft => ({
  ...q,
  options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : null,
  correct_answer: q.correct_answer as QuestionDraft['correct_answer'],
});
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
import { QUESTION_TYPE_LABELS, QuestionType, parseMatchingQuestion, parseQuestionCSV, sanitizeHtml } from "@/lib/exam-utils";
import { toast } from "sonner";
import { Plus, Upload, Archive, Edit, Trash2, Search, Loader2, Sparkles, CheckCircle2, MessageSquare } from "lucide-react";
import { draftQuestions, DRAFTABLE_LABELS, DRAFTABLE_TYPES, type DraftableType, writeExplanation } from "@/lib/ai-questions";
import { useAiFeature, useAssistantName } from "@/lib/ai-flags";
import { aiDb, type MaterialRow } from "@/lib/ai-db";
import PageHeader from "@/components/portal/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function QuestionBank() {
  const [questions, setQuestions] = useState<Tables<'question_bank'>[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCourse, setImportCourse] = useState("");
  const [importPreview, setImportPreview] = useState<ReturnType<typeof parseQuestionCSV>>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<Tables<'question_bank'> | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Drafting from a material. `showDrafts` swaps the list over to the drafts
  // waiting for approval, which is a different job from browsing the bank.
  const aiDrafting = useAiFeature("ai_question_drafting");
  const assistantName = useAssistantName();
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [draftMaterial, setDraftMaterial] = useState("");
  const [draftCount, setDraftCount] = useState(10);
  const [draftTypes, setDraftTypes] = useState<DraftableType[]>([
    "mcq_single",
    "true_false",
    "short_answer",
  ]);
  const [drafting, setDrafting] = useState(false);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [qRes, cRes, mRes] = await Promise.all([
      supabase.from("question_bank").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, code, title").order("code"),
      // Only materials whose text was actually captured can be drafted from,
      // so the picker never offers one that would be refused.
      aiDb
        .from("course_materials")
        .select("id, title, course_id, cohort_id, ai_excerpt")
        .not("ai_excerpt", "is", null)
        .order("created_at", { ascending: false }),
    ]);
    setQuestions(qRes.data ?? []);
    setCourses(cRes.data ?? []);
    setMaterials((mRes.data ?? []) as MaterialRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /** A row's status, defaulting to approved for anything written before drafts existed. */
  const statusOf = (q: Tables<'question_bank'>) =>
    String((q as unknown as { status?: string }).status ?? "approved");

  const draftCountWaiting = questions.filter(
    (q) => statusOf(q) === "draft" && !q.archived,
  ).length;

  const filtered = questions.filter((q) => {
    if ((statusOf(q) === "draft") !== showDrafts) return false;
    if (q.archived !== showArchived) return false;
    if (filterCourse !== "all" && q.course_id !== filterCourse) return false;
    if (filterType !== "all" && q.question_type !== filterType) return false;
    if (search && !(q.question_text || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const runDraft = async () => {
    if (!draftMaterial) return toast.error("Pick a material to draft from");
    if (draftTypes.length === 0) return toast.error("Pick at least one question type");
    setDrafting(true);
    try {
      const result = await draftQuestions({
        materialId: draftMaterial,
        count: draftCount,
        types: draftTypes,
      });
      setDraftOpen(false);
      // Land the admin on the drafts, since reviewing them is the next step
      // and finding them otherwise means knowing the filter exists.
      setShowDrafts(true);
      await load();
      toast.success(
        `${assistantName} drafted ${result.drafted} question${result.drafted === 1 ? "" : "s"} — read them before approving.` +
          (result.discarded ? ` ${result.discarded} were malformed and discarded.` : "") +
          (result.duplicates
            ? ` ${result.duplicates} repeated questions this course already has and were dropped.`
            : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft questions");
    } finally {
      setDrafting(false);
    }
  };

  /** Approving is the only way a draft becomes usable, and it is one at a time. */
  const approve = async (q: Tables<'question_bank'>) => {
    setApproving(q.id);
    try {
      const { error } = await aiDb
        .from("question_bank")
        .update({ status: "approved" })
        .eq("id", q.id);
      if (error) throw error;
      setQuestions((prev) =>
        prev.map((row) =>
          row.id === q.id
            ? ({ ...row, status: "approved" } as Tables<'question_bank'>)
            : row
        )
      );
      toast.success("Approved — it can now be picked into an exam");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve it");
    } finally {
      setApproving(null);
    }
  };

  const explain = async (q: Tables<'question_bank'>) => {
    setExplaining(q.id);
    try {
      const explanation = await writeExplanation(q.id);
      setQuestions((prev) =>
        prev.map((row) => (row.id === q.id ? { ...row, explanation } : row))
      );
      toast.success("Explanation written");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not write an explanation");
    } finally {
      setExplaining(null);
    }
  };

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
    // The two guards above are the course_id and question_text that
    // TablesInsert requires and the draft type leaves optional.
    const payload = { ...editing } as TablesInsert<'question_bank'> & { id?: string };
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

  const toggleArchive = async (q) => {
    const { error } = await supabase.from("question_bank").update({ archived: !q.archived }).eq("id", q.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (q) => {
    try {
      setDeleting(true);
      const { error } = await supabase.from("question_bank").delete().eq("id", q.id);
      if (error) throw error;
      toast.success("Deleted");
      setQuestionToDelete(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const rows = parseQuestionCSV(text);
      if (!rows.length) {
        toast.error("No valid questions found in file");
        setImportPreview([]);
      } else {
        setImportPreview(rows);
        toast.success(`Parsed ${rows.length} question(s) from file`);
      }
    } catch (err) {
      toast.error(err.message || "Failed to read file");
      setImportPreview([]);
    } finally {
      setImportLoading(false);
      e.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!importCourse) return toast.error("Pick a course");
    if (!importPreview.length) return toast.error("No questions to import");
    try {
      setImportLoading(true);
      const payload = importPreview.map((r) => ({
        course_id: importCourse,
        question_type: r.question_type,
        question_text: r.question_text,
        options: r.options,
        correct_answer: r.correct_answer,
        points: r.points,
        explanation: r.explanation,
      }));
      const { error } = await supabase
        .from("question_bank")
        .insert(payload as TablesInsert<'question_bank'>[]);
      if (error) throw error;
      toast.success(`Imported ${payload.length} question(s)`);
      setImportOpen(false);
      setImportPreview([]);
      setImportCourse("");
      load();
    } catch (err) {
      toast.error(err.message || "Import failed");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Question Bank"
        description="Reusable questions for online exams"
        breadcrumbs={[{ label: "Exams", to: "/admin/exams" }]}
        backTo="/admin/exams"
        backLabel="Back to exams"
        actions={
          <>
            {aiDrafting && (
              <Button variant="outline" onClick={() => setDraftOpen(true)}>
                <Sparkles className="w-4 h-4 mr-1.5" /> Ask {assistantName}
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Import CSV
            </Button>
            <Button onClick={newQuestion}>
              <Plus className="w-4 h-4 mr-1.5" /> New Question
            </Button>
          </>
        }
      />

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
        <Button
          variant={showDrafts ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDrafts(!showDrafts)}
        >
          {showDrafts ? "Showing drafts" : "Drafts"}
          {draftCountWaiting > 0 && !showDrafts && (
            <Badge variant="secondary" className="ml-1.5">{draftCountWaiting}</Badge>
          )}
        </Button>
      </Card>

      {showDrafts && (
        <Card className="p-3 text-sm bg-muted/40 border-dashed">
          {assistantName} drafted these. Students cannot see them and they cannot be picked into
          an exam until you approve them. Read each one against the material it came from —
          {assistantName} can be fluent and still wrong about what a lecturer actually taught.
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {showDrafts ? "No drafts waiting." : "No questions found."}
        </Card>
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
                    {statusOf(q) === "draft" && <Badge>Draft</Badge>}
                    {(q as unknown as { ai_generated?: boolean }).ai_generated && (
                      <Badge variant="outline" className="gap-1">
                        <Sparkles className="w-3 h-3" /> AI
                      </Badge>
                    )}
                    {!q.explanation && q.question_type !== "essay" && (
                      <Badge variant="outline" className="text-muted-foreground">
                        no explanation
                      </Badge>
                    )}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                </div>
                <div className="flex gap-1 shrink-0">
                  {statusOf(q) === "draft" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Approve this question"
                      disabled={approving === q.id}
                      onClick={() => approve(q)}
                    >
                      {approving === q.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </Button>
                  )}
                  {aiDrafting && !q.explanation && q.question_type !== "essay" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={`${assistantName}: write the explanation students see after marking`}
                      disabled={explaining === q.id}
                      onClick={() => explain(q)}
                    >
                      {explaining === q.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <MessageSquare className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(toDraft(q)); setOpenEditor(true); }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleArchive(q)}>
                    <Archive className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setQuestionToDelete(q)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Draft-from-material dialog */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{assistantName}: draft questions from a material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material</Label>
              <Select value={draftMaterial} onValueChange={setDraftMaterial}>
                <SelectTrigger><SelectValue placeholder="Pick a material" /></SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {materials.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No materials have readable text yet. Text is captured when a file is uploaded, so
                  re-upload a PDF to draft from it — and note that a scanned PDF has no text to
                  read.
                </p>
              )}
            </div>

            <div>
              <Label>How many</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={draftCount}
                onChange={(e) => setDraftCount(Number(e.target.value))}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Fewer may come back. If the material does not support twenty questions, it is
                asked to write fewer rather than pad.
              </p>
            </div>

            <div>
              <Label>Types</Label>
              <div className="mt-1.5 space-y-1.5">
                {DRAFTABLE_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={draftTypes.includes(type)}
                      onChange={(e) =>
                        setDraftTypes((prev) =>
                          e.target.checked ? [...prev, type] : prev.filter((t) => t !== type)
                        )}
                    />
                    {DRAFTABLE_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>

            <Button className="w-full" disabled={drafting || !draftMaterial} onClick={runDraft}>
              {drafting
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> {assistantName} is reading…</>
                : <><Sparkles className="w-4 h-4 mr-1.5" /> Draft into the bank</>}
            </Button>
            <p className="text-xs text-muted-foreground">
              Everything {assistantName} writes lands as a draft for you to read, edit or delete.
              Nothing reaches a student, or the exam builder, until you approve it.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editor dialog */}
      <Dialog open={openEditor} onOpenChange={(v) => { setOpenEditor(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Question</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    const next: QuestionDraft = { ...editing, question_type: v };
                    if (v === "mcq_single") { next.options = ["", ""]; next.correct_answer = 0; }
                    else if (v === "mcq_multi") { next.options = ["", ""]; next.correct_answer = []; }
                    else if (v === "true_false") { next.options = null; next.correct_answer = true; }
                    else if (v === "essay") { next.options = null; next.correct_answer = null; }
                    else if (v === "matching") { next.options = null; next.correct_answer = {}; }
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
                <Suspense fallback={<Skeleton className="h-32 w-full" />}>
                  <RichTextEditor value={editing.question_text} onChange={(v) => setEditing({ ...editing, question_text: v })} />
                </Suspense>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                          checked={selectedIndices(editing.correct_answer).includes(i)}
                          onChange={(e) => {
                            const arr = selectedIndices(editing.correct_answer);
                            const next = e.target.checked ? [...arr, i] : arr.filter((n) => n !== i);
                            setEditing({ ...editing, correct_answer: next.sort((a, b) => a - b) });
                          }} />
                      )}
                      <Button size="sm" variant="ghost" onClick={() => {
                        const opts = editing.options.filter((_, idx: number) => idx !== i);
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

              {editing.question_type === "matching" && (() => {
                // The pairs live in the question text as "A) …" and "1) …"
                // lines, so the key is built from whatever is written there.
                const parsed = parseMatchingQuestion(editing.question_text || "");
                if (!parsed) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Write the pairs in the question text as "A) …" / "B) …" and "1) …" / "2) …" lines,
                      then set the correct match for each. Until then this question is marked by hand.
                    </p>
                  );
                }
                const key: Record<string, string> =
                  editing.correct_answer && typeof editing.correct_answer === "object" && !Array.isArray(editing.correct_answer)
                    ? (editing.correct_answer as Record<string, string>)
                    : {};
                return (
                  <div className="space-y-2">
                    <Label>Correct matches</Label>
                    {parsed.left.map((item) => (
                      <div key={item.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="flex-1 text-sm"><span className="font-medium mr-1">{item.key})</span>{item.text}</p>
                        <Select
                          value={key[item.key] ?? ""}
                          onValueChange={(v) => setEditing({ ...editing, correct_answer: { ...key, [item.key]: v } })}
                        >
                          <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Correct match" /></SelectTrigger>
                          <SelectContent>
                            {parsed.right.map((opt) => (
                              <SelectItem key={opt.key} value={opt.key}>{opt.key}) {opt.text}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Marked automatically, one pair at a time — get one of two right and half the marks follow.
                      You can still change any mark when reviewing.
                    </p>
                  </div>
                );
              })()}

              <div>
                <Label>Explanation (shown only to admins)</Label>
                <Textarea value={editing.explanation ?? ""} onChange={(e) => setEditing({ ...editing, explanation: e.target.value })} rows={2} />
              </div>

              {/* A rubric only matters where a person has to judge the answer. */}
              {(editing.question_type === "essay" || editing.question_type === "short_answer") && (
                <div>
                  <Label>Marking rubric</Label>
                  <Textarea
                    value={(editing as { rubric?: string | null }).rubric ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, rubric: e.target.value } as typeof editing)}
                    rows={3}
                    placeholder="What a full-marks answer must contain."
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Write this yourself. It is the standard a suggested mark is judged against, so
                    a rubric written by {assistantName} would just be it marking its own work —
                    without one, suggestions are deliberately generous and say so.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEditor(false)}>Cancel</Button>
            <Button onClick={saveQuestion}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => {
        setImportOpen(open);
        if (!open) { setImportPreview([]); setImportCourse(""); }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk import from CSV</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="csv-file">Choose CSV file</Label>
              <div className="mt-2">
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={importLoading}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-accent cursor-pointer"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>
                  Header row required. Columns: question_type, question_text, option_a, option_b, option_c,
                  option_d, correct, points, explanation — only question_type and question_text are needed.
                </p>
                <p>
                  question_type accepts the labels shown above (e.g. "Multiple Choice (one answer)") or the short
                  codes (mcq_single). Options can go in the option_a–option_d columns, or be written inside the
                  question text as "A) …", "B) …" lines. For correct, use the option letters or the option text
                  (separate multiple answers with a comma), "true"/"false" for True / False, and separate
                  alternative short answers with |.
                </p>
              </div>
            </div>

            {importPreview.length > 0 && (
              <div>
                <Label>Preview ({importPreview.length} questions)</Label>
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Type</th>
                          <th className="text-left px-3 py-2 font-medium">Question</th>
                          <th className="text-left px-3 py-2 font-medium">Options</th>
                          <th className="text-right px-3 py-2 font-medium">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importPreview.map((q, i) => (
                          <tr key={i} className="hover:bg-muted/50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <Badge variant="secondary" className="text-[10px]">
                                {QUESTION_TYPE_LABELS[q.question_type] || q.question_type}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <div className="line-clamp-2 max-w-sm text-xs">{q.question_text}</div>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {q.options && Array.isArray(q.options) ? (
                                <div className="space-y-0.5">
                                  {q.options.map((opt, j) => (
                                    <div key={j} className="line-clamp-1 max-w-xs">
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              ) : q.question_type === "true_false" ? (
                                "True/False"
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{q.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportPreview([]); }}>Cancel</Button>
            <Button onClick={handleImport} disabled={importLoading || importPreview.length === 0}>
              {importLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Import {importPreview.length > 0 ? `(${importPreview.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!questionToDelete}
        onOpenChange={(v) => !v && setQuestionToDelete(null)}
        title="Delete Question"
        description="Are you sure you want to delete this question? This cannot be undone."
        confirmLabel="Delete Permanently"
        variant="destructive"
        loading={deleting}
        onConfirm={() => questionToDelete && remove(questionToDelete)}
      />
    </div>
  );
}
