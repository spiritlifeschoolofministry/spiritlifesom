import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertCircle, BookOpen, Camera, Edit, Eye, FileQuestion, Keyboard, Loader2,
  Lock, LogIn, Maximize, Mic, Plus, RotateCcw, Search, Send, Shuffle, Smartphone,
  Square, Trash2, Users, Archive,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from '@/components/ui/skeleton';
import { effectiveExamStatus, entryClosesAt } from "@/lib/exam-utils";

type Exam = {
  id: string;
  title: string;
  assessment_type: string;
  status: string;
  course_id: string;
  cohort_id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  total_points: number;
  passing_score: number;
  results_released: boolean;
  show_correct_answers: boolean;
  locked_at: string | null;
  created_at: string;
  allow_late_entry: boolean | null;
  late_entry_cutoff_minutes: number | null;
  randomize_questions: boolean;
  randomize_options: boolean;
  questions_per_attempt: number | null;
  count_best_n: number | null;
  target_audience: string | null;
  target_student_ids: string[] | null;
  target_learning_modes: string[] | null;
  target_languages: string[] | null;
  max_tab_switches: number;
  enforce_fullscreen: boolean;
  block_shortcuts: boolean;
  allow_mobile: boolean;
  enable_webcam_proctoring: boolean;
  enable_audio_proctoring: boolean;
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
  { key: "archived", label: "Archived" },
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

/** One setting, stated in the words a lecturer would use rather than a field name. */
const Chip = ({ icon: Icon, children, tone = "muted" }: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "muted" | "warn";
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
      tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
        : "border-border bg-muted/40 text-muted-foreground"
    }`}
  >
    <Icon className="w-3 h-3" /> {children}
  </span>
);

/**
 * How the exam is invigilated, as a row of chips.
 *
 * These are all set in the builder and then never shown again, so a paper that
 * went out with proctoring off — or with a tab-switch limit nobody meant to
 * change — looked exactly like one that did not. Staff were opening the editor
 * on each exam in turn to compare them the morning of a sitting.
 *
 * Only the settings worth a second look are listed: a protection that is off,
 * a limit that differs from the rest, or a surveillance feature that is on.
 */
const securityChips = (e: Exam) => {
  const chips: React.ReactNode[] = [];
  if (e.enable_webcam_proctoring) chips.push(<Chip key="cam" icon={Camera}>Webcam</Chip>);
  if (e.enable_audio_proctoring) chips.push(<Chip key="mic" icon={Mic}>Audio</Chip>);
  chips.push(
    e.enforce_fullscreen
      ? <Chip key="fs" icon={Maximize}>Fullscreen</Chip>
      : <Chip key="fs" icon={Maximize} tone="warn">No fullscreen</Chip>,
  );
  // A limit of zero is unlimited in exam-autosave, which is easy to set by
  // accident and reads the same as a strict "0" on a card that only shows a
  // number.
  chips.push(
    Number(e.max_tab_switches) > 0
      ? <Chip key="tabs" icon={Square}>{e.max_tab_switches} tab switches</Chip>
      : <Chip key="tabs" icon={Square} tone="warn">Tab switches unlimited</Chip>,
  );
  if (!e.block_shortcuts) chips.push(<Chip key="keys" icon={Keyboard} tone="warn">Shortcuts allowed</Chip>);
  if (!e.allow_mobile) chips.push(<Chip key="mob" icon={Smartphone}>Desktop only</Chip>);
  if (e.randomize_questions || e.randomize_options) {
    chips.push(
      <Chip key="rand" icon={Shuffle}>
        {e.randomize_questions && e.randomize_options ? "Shuffled" : e.randomize_questions ? "Questions shuffled" : "Options shuffled"}
      </Chip>,
    );
  }
  if (e.questions_per_attempt) {
    chips.push(<Chip key="qpa" icon={FileQuestion}>{e.questions_per_attempt} served per student</Chip>);
  }
  if (e.count_best_n) {
    chips.push(<Chip key="best" icon={FileQuestion}>Best {e.count_best_n} count</Chip>);
  }
  // Who the paper is for. Only worth a chip when it is not simply everyone —
  // a narrowed audience is the setting most likely to be forgotten, and the
  // one whose mistake looks identical to students not turning up.
  if (e.target_audience === "specific") {
    const n = e.target_student_ids?.length ?? 0;
    chips.push(<Chip key="aud" icon={Users}>{n} named student{n === 1 ? "" : "s"}</Chip>);
  } else if (e.target_learning_modes?.length || e.target_languages?.length) {
    chips.push(
      <Chip key="aud" icon={Users}>
        {[...(e.target_learning_modes ?? []), ...(e.target_languages ?? [])].join(" · ")} only
      </Chip>,
    );
  }
  return chips;
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

    const courseById = new Map((courseRes.data ?? []).map((c) => [c.id, c]));
    const cohortById = new Map((cohortRes.data ?? []).map((c) => [c.id, c]));
    const tally = (rows: { exam_id: string }[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.exam_id, (m.get(r.exam_id) ?? 0) + 1);
      return m;
    };
    const questionCounts = tally(linkRes.data);
    // Staff rehearsals must not inflate the sat-the-paper count.
    const previewIds = new Set((previewRes.data ?? []).map((r) => r.id));
    const attemptCounts = tally((attemptRes.data ?? []).filter((r) => !previewIds.has(r.student_id)));

    setExams(
      (examRes.data ?? []).map((e) => {
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
      const s = effectiveExamStatus(e);
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [exams]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((e) => {
      if (filter !== "all" && effectiveExamStatus(e) !== filter) return false;
      if (!q) return true;
      return `${e.title} ${e.assessment_type} ${e.courseLabel} ${e.cohortLabel}`.toLowerCase().includes(q);
    });
  }, [exams, filter, query]);

  const setStatus = async (exam: Exam, status: string, successMsg: string) => {
    try {
      setBusyId(exam.id);
      const { error } = await supabase.from("exams").update({ status }).eq("id", exam.id);
      if (error) throw error;
      setExams((prev) => prev.map((e) => (e.id === exam.id ? { ...e, status } : e)));
      toast.success(successMsg);
    } catch (err) {
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

  /**
   * Retire an assessment without touching what anyone scored on it.
   *
   * Deleting used to be the only way to clear an old paper off the list, and it
   * took every attempt with it — the scores, the transcript lines, the course
   * averages. Archiving keeps all of that and simply stops the exam appearing
   * to students, which is what "we're done with this one" actually means.
   */
  const archive = (exam: Exam) =>
    setStatus(exam, "archived", `"${exam.title}" archived — results are kept`);

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
    } catch (err) {
      // The database refuses to delete an exam that students have sat, so their
      // scores cannot be lost to a mis-click. Say what to do instead.
      const msg = String(err?.message ?? "");
      toast.error(
        /foreign key|violates|restrict/i.test(msg)
          ? "This exam has student attempts, so deleting it would erase their scores. Archive it instead."
          : msg || "Failed to delete exam",
      );
    } finally {
      setBusyId(null);
    }
  };

  /**
   * The exam's whole schedule, not just the next thing to happen to it.
   *
   * The card used to show one of "Opens…", "Ended…" or "Open until…", so before
   * a sitting opened there was no closing time anywhere on the page — the only
   * way to see how long the window ran was to open the editor. The three dates
   * that decide whether a student gets a full paper are all different, and
   * staff need them side by side:
   *
   *   opens        start_at
   *   entry closes start_at + cutoff, or the close when late entry is open
   *   closes       end_at, which also caps every sitting still running
   */
  const scheduleNotes = (exam: Exam) => {
    if (exam.status === "draft") return [{ key: "draft", text: "Not visible to students", warn: false }];

    const now = Date.now();
    const start = new Date(exam.start_at);
    const end = new Date(exam.end_at);
    const entryCloses = new Date(entryClosesAt(exam));
    // Same day is the norm, so repeating the date on the closing time is noise.
    const sameDay = start.toDateString() === end.toDateString();
    const notes: { key: string; text: string; warn: boolean }[] = [];

    notes.push({
      key: "opens",
      text: now < start.getTime() ? `Opens ${format(start, "PPp")}` : `Opened ${format(start, "PPp")}`,
      warn: false,
    });
    notes.push({
      key: "closes",
      text: now > end.getTime()
        ? `Ended ${format(end, sameDay ? "p" : "PPp")}`
        : `Closes ${format(end, sameDay ? "p" : "PPp")}`,
      warn: false,
    });

    // Entry closing with the exam is the common case and needs no line of its
    // own; an earlier cutoff is the one that turns students away.
    if (now <= end.getTime() && entryCloses.getTime() < end.getTime()) {
      notes.push({
        key: "entry",
        text: `${now > entryCloses.getTime() ? "Entry closed" : "Entry closes"} ${format(entryCloses, "p")}`,
        warn: now > entryCloses.getTime(),
      });
    }

    return notes;
  };

  /** Settings that are legal but almost never intended. */
  const scheduleWarning = (exam: Exam) => {
    if (exam.status === "draft") return null;
    const windowMinutes = (new Date(exam.end_at).getTime() - new Date(exam.start_at).getTime()) / 60_000;
    if (Number(exam.duration_minutes) > windowMinutes) {
      return `This paper runs ${exam.duration_minutes} min but its window is only ${Math.round(windowMinutes)} min — nobody can finish it.`;
    }
    return null;
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
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Loading exams</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
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
            const shown = effectiveExamStatus(e);
            return (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold">{e.title}</h3>
                      {/* What students will see this called on their record. */}
                      <Badge variant="secondary" className="text-xs">{e.assessment_type || "Exam"}</Badge>
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
                      {e.courseLabel} · {e.cohortLabel} · {e.duration_minutes} min · {e.total_points} pts ·
                      {" "}{e.passing_score}% to pass
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
                      {scheduleNotes(e).map((n) => (
                        <span key={n.key} className={n.warn ? "text-amber-600" : ""}>
                          {n.key === "entry" && <LogIn className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                          {n.text}
                        </span>
                      ))}
                    </div>
                    {!isDraft && (
                      <div className="flex flex-wrap items-center gap-1 text-[11px] mt-1.5">
                        {securityChips(e)}
                        {e.show_correct_answers && (
                          <Chip icon={Eye}>Answers shown after release</Chip>
                        )}
                      </div>
                    )}
                    {scheduleWarning(e) && (
                      <p className="text-xs text-amber-600 mt-1.5">{scheduleWarning(e)}</p>
                    )}
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
                    {shown !== "archived" && !isDraft && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => archive(e)}
                        title="Hide from students, keep every result"
                      >
                        <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
                      </Button>
                    )}
                    {shown === "archived" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setStatus(e, "published", `"${e.title}" is back on the students' list`)}
                      >
                        Restore
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
            {examToDelete?.attemptCount ? (
              <p className="text-destructive font-medium">
                Deleting is blocked while students have sat this exam, because their scores would go with it.
                Archive it instead — it disappears from the students' list and every result is kept.
              </p>
            ) : (
              <p className="text-destructive font-medium">
                This will permanently delete the exam and all its questions. This action cannot be undone.
              </p>
            )}
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
