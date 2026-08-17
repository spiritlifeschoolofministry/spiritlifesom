import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertCircle, BookOpen, Edit, Eye, FileQuestion, Loader2, Lock, Plus,
  RotateCcw, Search, Send, Square, Trash2, Users,
} from "lucide-react";
import { format, isAfter, isBefore } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Exam = {
  id: string;
  title: string;
  status: string;
  course_id: string;
  cohort_id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  total_points: number;
  results_released: boolean;
  locked_at: string | null;
  created_at: string;
  courseLabel: string;
  cohortLabel: string;
  questionCount: number;
  attemptCount: number;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Scheduled" },
  { key: "in_progress", label: "Live" },
  { key: "ended", label: "Ended" },
  { key: "closed", label: "Closed" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  ended: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  closed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  archived: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Scheduled",
  in_progress: "Live",
  ended: "Ended",
  closed: "Closed",
  archived: "Archived",
};

/**
 * What the exam is doing right now, as opposed to the lifecycle stage stored on
 * the row.
 *
 * `status` only ever moves when an admin moves it — nothing flips a published
 * exam to in_progress when its window opens. The student list works off the
 * clock instead, so the same exam read "Scheduled" here and "Live" there. This
 * derives the same answer the student side reaches, so both agree.
 */
const effectiveStatus = (exam: Pick<Exam, "status" | "start_at" | "end_at">) => {
  if (exam.status !== "published") return exam.status;
  const now = new Date();
  if (isBefore(now, new Date(exam.start_at))) return "published";
  if (isAfter(now, new Date(exam.end_at))) return "ended";
  return "in_progress";
};

export default function ExamsList() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const loadExams = async () => {
    setLoading(true);
    setLoadError(null);
    // Courses/cohorts are fetched separately rather than as PostgREST embeds so the
    // list keeps working regardless of how the exam foreign keys are configured.
    const [examRes, courseRes, cohortRes, linkRes, attemptRes, previewRes] = await Promise.all([
      supabase.from("exams").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, code, title"),
      supabase.from("cohorts").select("id, name"),
      supabase.from("exam_questions").select("exam_id"),
      supabase.from("exam_attempts").select("exam_id, student_id"),
      supabase.from("students").select("id").eq("is_staff_preview", true),
    ]);

    if (examRes.error) {
      setLoadError(examRes.error.message);
      setExams([]);
      setLoading(false);
      return;
    }

    const courseById = new Map((courseRes.data ?? []).map((c: any) => [c.id, c]));
    const cohortById = new Map((cohortRes.data ?? []).map((c: any) => [c.id, c]));
    const tally = (rows: any[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.exam_id, (m.get(r.exam_id) ?? 0) + 1);
      return m;
    };
    const questionCounts = tally(linkRes.data);
    // Staff rehearsals must not inflate the sat-the-paper count.
    const previewIds = new Set((previewRes.data ?? []).map((r: any) => r.id));
    const attemptCounts = tally((attemptRes.data ?? []).filter((r: any) => !previewIds.has(r.student_id)));

    setExams(
      (examRes.data ?? []).map((e: any) => {
        const course = courseById.get(e.course_id);
        return {
          ...e,
          courseLabel: course ? `${course.code} — ${course.title}` : "Unknown course",
          cohortLabel: cohortById.get(e.cohort_id)?.name ?? "Unknown cohort",
          questionCount: questionCounts.get(e.id) ?? 0,
          attemptCount: attemptCounts.get(e.id) ?? 0,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    loadExams();
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: exams.length };
    for (const e of exams) {
      const s = effectiveStatus(e);
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [exams]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((e) => {
      if (filter !== "all" && effectiveStatus(e) !== filter) return false;
      if (!q) return true;
      return `${e.title} ${e.courseLabel} ${e.cohortLabel}`.toLowerCase().includes(q);
    });
  }, [exams, filter, query]);

  const setStatus = async (exam: Exam, status: string, successMsg: string) => {
    try {
      setBusyId(exam.id);
      const { error } = await supabase.from("exams").update({ status }).eq("id", exam.id);
      if (error) throw error;
      setExams((prev) => prev.map((e) => (e.id === exam.id ? { ...e, status } : e)));
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.message || "Could not update the exam");
    } finally {
      setBusyId(null);
    }
  };

  const publish = (exam: Exam) => {
    if (exam.questionCount === 0) {
      return toast.error("Add at least one question before publishing this exam.");
    }
    return setStatus(exam, "published", `"${exam.title}" is now visible to students`);
  };

  const handleDelete = async (exam: Exam) => {
    try {
      setBusyId(exam.id);
      const { error: questionsError } = await supabase.from("exam_questions").delete().eq("exam_id", exam.id);
      if (questionsError) throw questionsError;
      const { error } = await supabase.from("exams").delete().eq("id", exam.id);
      if (error) throw error;
      toast.success("Exam deleted");
      setExamToDelete(null);
      setExams((prev) => prev.filter((e) => e.id !== exam.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete exam");
    } finally {
      setBusyId(null);
    }
  };

  /** A short note about where the exam sits relative to its scheduled window. */
  const windowNote = (exam: Exam) => {
    if (exam.status === "draft") return "Not visible to students";
    const now = new Date();
    const start = new Date(exam.start_at);
    const end = new Date(exam.end_at);
    if (isBefore(now, start)) return `Opens ${format(start, "PPp")}`;
    if (isAfter(now, end)) return `Ended ${format(end, "PPp")}`;
    return `Open until ${format(end, "p")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Online Exams</h1>
          <p className="text-sm text-muted-foreground">Create, monitor and grade course exams</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/exams/questions"><BookOpen className="w-4 h-4 mr-1.5" /> Question Bank</Link>
          </Button>
          <Button asChild>
            <Link to="/admin/exams/new"><Plus className="w-4 h-4 mr-1.5" /> New Exam</Link>
          </Button>
        </div>
      </div>

      {!loading && !loadError && exams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{counts[f.key] ?? 0}</span>
              </Button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, course or cohort…"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {loading ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading exams…
        </Card>
      ) : loadError ? (
        <Card className="p-8 text-center space-y-3">
          <AlertCircle className="w-6 h-6 mx-auto text-destructive" />
          <div>
            <p className="font-medium">Could not load exams</p>
            <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadExams}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> Try again
          </Button>
        </Card>
      ) : exams.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <p className="font-medium">No exams yet</p>
          <p className="text-sm text-muted-foreground">
            Build your question bank first, then create an exam and pick questions from it.
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <Button variant="outline" asChild>
              <Link to="/admin/exams/questions"><BookOpen className="w-4 h-4 mr-1.5" /> Question Bank</Link>
            </Button>
            <Button asChild>
              <Link to="/admin/exams/new"><Plus className="w-4 h-4 mr-1.5" /> New Exam</Link>
            </Button>
          </div>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center space-y-3 text-muted-foreground">
          <p>No exams match this view.</p>
          <Button variant="outline" size="sm" onClick={() => { setFilter("all"); setQuery(""); }}>
            Clear filters
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((e) => {
            const busy = busyId === e.id;
            const isDraft = e.status === "draft";
            const shown = effectiveStatus(e);
            return (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold">{e.title}</h3>
                      <Badge variant="outline" className={STATUS_STYLES[shown] || ""}>
                        {STATUS_LABELS[shown] ?? shown}
                      </Badge>
                      {e.results_released && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">Released</Badge>
                      )}
                      {e.locked_at && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive">
                          <Lock className="w-3 h-3 mr-1" /> Locked
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e.courseLabel} · {e.cohortLabel} · {e.duration_minutes} min · {e.total_points} pts
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                      <span className={`inline-flex items-center gap-1 ${e.questionCount === 0 ? "text-amber-600" : ""}`}>
                        <FileQuestion className="w-3.5 h-3.5" />
                        {e.questionCount} question{e.questionCount === 1 ? "" : "s"}
                      </span>
                      {e.attemptCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {e.attemptCount} attempt{e.attemptCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>{windowNote(e)}</span>
                    </div>
                    {isDraft && e.questionCount === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        This draft has no questions yet — add some before publishing.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    {isDraft && (
                      <Button size="sm" onClick={() => publish(e)} disabled={busy}>
                        {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                        Publish
                      </Button>
                    )}
                    {e.status === "published" && !e.locked_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setStatus(e, "draft", `"${e.title}" moved back to draft`)}
                      >
                        Unpublish
                      </Button>
                    )}
                    {(e.status === "published" || e.status === "in_progress") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setStatus(e, "closed", `"${e.title}" closed`)}
                      >
                        <Square className="w-3.5 h-3.5 mr-1.5" /> Close
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild title="Edit">
                      <Link to={`/admin/exams/${e.id}/edit`}><Edit className="w-4 h-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Preview">
                      <Link to={`/admin/exams/${e.id}/edit?tab=preview`}><Eye className="w-4 h-4" /></Link>
                    </Button>
                    {!isDraft && (
                      <Button variant="ghost" size="icon" asChild title="Monitor">
                        <Link to={`/admin/exams/${e.id}/monitor`}><Activity className="w-4 h-4" /></Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExamToDelete(e)}
                      title="Delete"
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!examToDelete}
        onOpenChange={(open) => !open && setExamToDelete(null)}
        title="Delete Exam"
        description={
          <>
            <p>Are you sure you want to delete <strong>{examToDelete?.title}</strong>?</p>
            {!!examToDelete?.attemptCount && (
              <p className="text-destructive font-medium">
                {examToDelete.attemptCount} student attempt{examToDelete.attemptCount === 1 ? " has" : "s have"} already
                been recorded for this exam.
              </p>
            )}
            <p className="text-destructive font-medium">
              This will permanently delete the exam, all its questions, and any student results/attempts. This action
              cannot be undone.
            </p>
          </>
        }
        confirmLabel="Delete Exam"
        variant="destructive"
        loading={!!busyId}
        onConfirm={() => examToDelete && handleDelete(examToDelete)}
      />
    </div>
  );
}
