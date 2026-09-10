import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { aiDb, type MaterialRow, type PracticeQuestionRow } from '@/lib/ai-db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Info, Loader2, Pencil, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/portal/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAiFeature, useAssistantName } from '@/lib/ai-flags';
import { draftQuestions, DRAFTABLE_LABELS, PRACTISABLE_TYPES } from '@/lib/ai-questions';
import { QuestionHealthPanel } from '@/components/admin/QuestionHealthPanel';

type PractisableType = (typeof PRACTISABLE_TYPES)[number];

/** The editor's working copy, with the Json columns unpacked. */
type Draft = Partial<Omit<PracticeQuestionRow, 'options' | 'correct_answer'>> & {
  options?: string[] | null;
  correct_answer?: number | number[] | boolean | string[] | null;
};

interface CourseOption {
  id: string;
  code: string;
  title: string;
}

/**
 * The questions students practise against.
 *
 * A separate screen from the question bank, and a separate table behind it,
 * because they hold different things. The bank holds the real exam and test
 * questions. This holds questions written to be practised — and practice shows
 * the student the correct answer and the explanation straight after they
 * answer, which is exactly what must never happen to a question from a paper
 * they have not sat yet.
 *
 * Keeping them apart is the point. Two screens that look alike but cannot
 * reach each other's rows is a better guarantee than one screen with a filter.
 */
export default function PracticeQuestions() {
  const assistantName = useAssistantName();
  const aiDrafting = useAiFeature('ai_question_drafting');

  const [questions, setQuestions] = useState<PracticeQuestionRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCourse, setFilterCourse] = useState('all');
  const [showDrafts, setShowDrafts] = useState(true);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftMaterial, setDraftMaterial] = useState('');
  const [draftCount, setDraftCount] = useState(10);
  const [draftTypes, setDraftTypes] = useState<PractisableType[]>([
    'mcq_single',
    'true_false',
  ]);
  const [drafting, setDrafting] = useState(false);

  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PracticeQuestionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [qRes, cRes, mRes] = await Promise.all([
      aiDb.from('practice_questions').select('*').eq('archived', false)
        .order('created_at', { ascending: false }),
      supabase.from('courses').select('id, code, title').order('code'),
      // Only materials whose text was captured can be drafted from, so the
      // picker never offers one the drafter would refuse.
      aiDb
        .from('course_materials')
        .select('id, title, course_id, cohort_id, ai_excerpt')
        .not('ai_excerpt', 'is', null)
        .order('created_at', { ascending: false }),
    ]);
    setQuestions((qRes.data ?? []) as PracticeQuestionRow[]);
    setCourses((cRes.data ?? []) as CourseOption[]);
    setMaterials((mRes.data ?? []) as MaterialRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftCount_ = questions.filter((q) => q.status === 'draft').length;

  const visible = useMemo(
    () => questions.filter((q) => {
      if ((q.status === 'draft') !== showDrafts) return false;
      if (filterCourse !== 'all' && q.course_id !== filterCourse) return false;
      return true;
    }),
    [questions, showDrafts, filterCourse],
  );

  /** How many approved questions each course has — the number that decides
      whether a student can practise it at all. */
  const approvedPerCourse = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      if (q.status !== 'approved') continue;
      counts.set(q.course_id, (counts.get(q.course_id) ?? 0) + 1);
    }
    return counts;
  }, [questions]);

  const runDraft = async () => {
    if (!draftMaterial) return toast.error('Pick a material to draft from');
    if (draftTypes.length === 0) return toast.error('Pick at least one question type');
    setDrafting(true);
    try {
      const result = await draftQuestions({
        materialId: draftMaterial,
        count: draftCount,
        types: draftTypes,
        // The whole point of this screen. Never 'exam' from here.
        target: 'practice',
      });
      setDraftOpen(false);
      setShowDrafts(true);
      await load();
      toast.success(
        `${assistantName} drafted ${result.drafted} question${result.drafted === 1 ? '' : 's'} — read them before approving.` +
          (result.discarded ? ` ${result.discarded} were malformed and discarded.` : '') +
          (result.duplicates
            ? ` ${result.duplicates} repeated questions this course already has and were dropped.`
            : ''),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not draft questions');
    } finally {
      setDrafting(false);
    }
  };

  const approve = async (q: PracticeQuestionRow) => {
    setApproving(q.id);
    try {
      const { error } = await aiDb
        .from('practice_questions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', q.id);
      if (error) throw error;
      setQuestions((prev) =>
        prev.map((row) => (row.id === q.id ? { ...row, status: 'approved' } : row)));
      toast.success('Approved — students can practise it now');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve it');
    } finally {
      setApproving(null);
    }
  };

  const remove = async (q: PracticeQuestionRow) => {
    try {
      const { error } = await aiDb.from('practice_questions').delete().eq('id', q.id);
      if (error) throw error;
      setQuestions((prev) => prev.filter((row) => row.id !== q.id));
      toast.success('Deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete it');
    } finally {
      setConfirmDelete(null);
    }
  };

  const save = async () => {
    if (!editing?.id) return;
    if (!(editing.question_text ?? '').trim()) return toast.error('The question needs text');
    setSaving(true);
    try {
      const { error } = await aiDb
        .from('practice_questions')
        .update({
          question_text: editing.question_text,
          options: editing.options ?? null,
          correct_answer: editing.correct_answer ?? null,
          explanation: editing.explanation ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id);
      if (error) throw error;
      await load();
      setEditing(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save it');
    } finally {
      setSaving(false);
    }
  };

  const openEditor = (q: PracticeQuestionRow) =>
    setEditing({
      ...q,
      options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : null,
      correct_answer: q.correct_answer as Draft['correct_answer'],
    });

  const courseName = (id: string) => {
    const course = courses.find((c) => c.id === id);
    return course ? `${course.code} — ${course.title}` : 'Unknown course';
  };

  /** What a student would be shown as the right answer. */
  const answerText = (q: PracticeQuestionRow): string => {
    const options = Array.isArray(q.options) ? q.options.map(String) : [];
    const value = q.correct_answer;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number') return options[value] ?? String(value);
    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'number' ? options[v] ?? String(v) : String(v)))
        .join(', ');
    }
    return value === null || value === undefined ? '—' : String(value);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Practice questions"
        description="What students practise against on their study page"
      />

      {/* Stated at the top because the two screens look alike, and an admin who
          thinks this is the exam bank might write a real paper into it. */}
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>These are not exam questions</AlertTitle>
        <AlertDescription>
          Practice shows the student the correct answer and the explanation straight after they
          answer, so nothing here can be a question from a paper they have not sat. This is a
          separate store from the question bank — nothing written here can be picked into an exam,
          and nothing in the bank can be practised.
        </AlertDescription>
      </Alert>

      {/* Before the list, because a fault worth fixing is worth seeing before
          approving fifty more questions on top of it. */}
      <QuestionHealthPanel
        questions={questions}
        onOpen={(id) => {
          const found = questions.find((row) => row.id === id);
          if (found) openEditor(found);
        }}
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {showDrafts ? 'Drafts waiting to be read' : 'Approved'}
              </CardTitle>
              <CardDescription>
                {showDrafts
                  ? 'No student sees any of these until it is approved.'
                  : 'These are live on the study page.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showDrafts ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowDrafts(true)}
              >
                Drafts {draftCount_ > 0 && <Badge variant="secondary" className="ml-1.5">{draftCount_}</Badge>}
              </Button>
              <Button
                variant={!showDrafts ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowDrafts(false)}
              >
                Approved
              </Button>
              {aiDrafting && (
                <Button size="sm" onClick={() => setDraftOpen(true)}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Draft from a material
                </Button>
              )}
            </div>
          </div>

          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code} — {course.title}
                  {approvedPerCourse.get(course.id)
                    ? ` (${approvedPerCourse.get(course.id)} approved)`
                    : ' (none yet)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="space-y-3">
          {visible.length === 0
            ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {showDrafts
                  ? 'Nothing waiting. Draft some from a course material to get started.'
                  : 'Nothing approved yet, so no course can be practised.'}
              </p>
            )
            : visible.map((q) => (
              <div key={q.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{q.question_text}</p>
                    <p className="text-xs text-muted-foreground">{courseName(q.course_id)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline">
                      {DRAFTABLE_LABELS[q.question_type as PractisableType] ?? q.question_type}
                    </Badge>
                    {q.ai_generated && <Badge variant="secondary">{assistantName}</Badge>}
                  </div>
                </div>

                {Array.isArray(q.options) && q.options.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {q.options.map((option, i) => (
                      <li key={i}>{String.fromCharCode(65 + i)}. {String(option)}</li>
                    ))}
                  </ul>
                )}

                <p className="text-xs">
                  <span className="text-muted-foreground">Answer: </span>
                  <span className="font-medium">{answerText(q)}</span>
                </p>
                {q.explanation && (
                  <p className="text-xs text-muted-foreground">{q.explanation}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {q.status === 'draft' && (
                    <Button
                      size="sm"
                      disabled={approving === q.id}
                      onClick={() => approve(q)}
                    >
                      {approving === q.id
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                      Approve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEditor(q)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(q)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ drafting */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draft practice questions</DialogTitle>
            <DialogDescription>
              {assistantName} writes them from the material you pick and from nothing else. They
              arrive as drafts — read each one before approving it, because an answer key nobody
              has read is a wrong answer waiting to be taught as right.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Material</Label>
              <Select value={draftMaterial} onValueChange={setDraftMaterial}>
                <SelectTrigger><SelectValue placeholder="Pick a material" /></SelectTrigger>
                <SelectContent>
                  {materials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>{material.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {materials.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No material has readable text yet. Capture it on the materials page first.
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
                onChange={(e) =>
                  setDraftCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>

            <div>
              <Label>Types</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRACTISABLE_TYPES.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={draftTypes.includes(type) ? 'default' : 'outline'}
                    onClick={() =>
                      setDraftTypes((prev) =>
                        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type])}
                  >
                    {DRAFTABLE_LABELS[type]}
                  </Button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                No essays — practice has to be able to tell the student whether they were right.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftOpen(false)}>Cancel</Button>
            <Button disabled={drafting || !draftMaterial} onClick={runDraft}>
              {drafting
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Drafting…</>
                : <>Draft</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------- editor */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit practice question</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Question</Label>
                <Textarea
                  rows={3}
                  value={editing.question_text ?? ''}
                  onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
                />
              </div>

              {(editing.question_type === 'mcq_single' || editing.question_type === 'mcq_multi') && (
                <div className="space-y-2">
                  <Label>Options — tap the correct one{editing.question_type === 'mcq_multi' ? 's' : ''}</Label>
                  {(editing.options ?? []).map((option, i) => {
                    const picked = editing.question_type === 'mcq_multi'
                      ? (Array.isArray(editing.correct_answer)
                        ? (editing.correct_answer as number[]).includes(i)
                        : false)
                      : editing.correct_answer === i;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={picked ? 'default' : 'outline'}
                          className="shrink-0"
                          onClick={() => {
                            if (editing.question_type === 'mcq_multi') {
                              const current = Array.isArray(editing.correct_answer)
                                ? (editing.correct_answer as number[])
                                : [];
                              setEditing({
                                ...editing,
                                correct_answer: current.includes(i)
                                  ? current.filter((n) => n !== i)
                                  : [...current, i],
                              });
                            } else {
                              setEditing({ ...editing, correct_answer: i });
                            }
                          }}
                        >
                          {String.fromCharCode(65 + i)}
                        </Button>
                        <Input
                          value={option}
                          onChange={(e) => {
                            const next = [...(editing.options ?? [])];
                            next[i] = e.target.value;
                            setEditing({ ...editing, options: next });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {editing.question_type === 'true_false' && (
                <div>
                  <Label>Correct answer</Label>
                  <Select
                    value={String(editing.correct_answer)}
                    onValueChange={(v) => setEditing({ ...editing, correct_answer: v === 'true' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.question_type === 'short_answer' && (
                <div>
                  <Label>Accepted answers (one per line)</Label>
                  <Textarea
                    rows={3}
                    value={Array.isArray(editing.correct_answer)
                      ? (editing.correct_answer as string[]).join('\n')
                      : ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        correct_answer: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                      })}
                  />
                </div>
              )}

              <div>
                <Label>Explanation</Label>
                <Textarea
                  rows={2}
                  value={editing.explanation ?? ''}
                  onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Shown to the student straight after they answer. This is where the practice
                  actually teaches something.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={saving} onClick={save}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this practice question?"
        description="It is removed for good. Nothing about any exam or mark is affected."
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />

      {!aiDrafting && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Drafting is switched off, so questions here have to be written by hand for now.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
