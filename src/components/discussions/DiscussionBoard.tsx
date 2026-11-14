import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown, Loader2, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyCard, Panel, Pill } from "@/components/redesign/student-pages/ui";
import { questionStatus, type QuestionFilter, matchesFilter } from "@/lib/discussions";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type Question = Tables<"course_question_feed">;
type Answer = Tables<"course_answer_feed">;

export interface DiscussionCourse {
  id: string;
  /** "SLM 101" or, for staff, "SLM 101 · 2026 Session". */
  label: string;
}

const personName = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ") || "Unknown";

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "");

const Author = ({
  first,
  last,
  avatar,
  staff,
  when,
}: {
  first: string | null;
  last: string | null;
  avatar: string | null;
  staff: boolean | null;
  when: string | null;
}) => (
  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
    <Avatar className="h-6 w-6">
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback className="bg-secondary text-[10px] font-bold text-primary">
        {(first?.[0] ?? "") + (last?.[0] ?? "")}
      </AvatarFallback>
    </Avatar>
    <span className="truncate font-semibold text-foreground">{personName(first, last)}</span>
    {staff && <Pill tone="info">Staff</Pill>}
    <span className="shrink-0">{ago(when)}</span>
  </div>
);

/** The open question: its text, answers and the reply box. */
const Thread = ({
  question,
  staff,
  userId,
  onChanged,
}: {
  question: Question;
  staff: boolean;
  userId: string;
  onChanged: () => void;
}) => {
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "question" } | { kind: "answer"; id: string } | null>(null);
  const mine = question.author_id === userId;

  const loadAnswers = useCallback(async () => {
    const { data, error } = await supabase
      .from("course_answer_feed")
      .select("*")
      .eq("question_id", question.id!)
      .order("created_at");
    if (error) console.error("Load answers error:", error);
    setAnswers(data ?? []);
  }, [question.id]);

  useEffect(() => {
    void loadAnswers();
  }, [loadAnswers]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from("course_answers").insert({ question_id: question.id!, author_id: userId, body });
    setBusy(false);
    if (error) {
      console.error("Answer error:", error);
      toast.error("Could not post your answer");
      return;
    }
    setReply("");
    await loadAnswers();
    onChanged();
  };

  const setResolved = async (resolved: boolean) => {
    setBusy(true);
    const { error } = await supabase.from("course_questions").update({ is_resolved: resolved }).eq("id", question.id!);
    setBusy(false);
    if (error) {
      toast.error("Could not update the question");
      return;
    }
    onChanged();
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    const { error } =
      confirm.kind === "question"
        ? await supabase.from("course_questions").delete().eq("id", question.id!)
        : await supabase.from("course_answers").delete().eq("id", confirm.id);
    setBusy(false);
    setConfirm(null);
    if (error) {
      toast.error("Could not delete it");
      return;
    }
    toast.success(confirm.kind === "question" ? "Question deleted" : "Answer deleted");
    if (confirm.kind === "answer") await loadAnswers();
    onChanged();
  };

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3">
      {question.body && <p className="whitespace-pre-wrap text-sm text-foreground">{question.body}</p>}

      {(mine || staff) && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setResolved(!question.is_resolved)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {question.is_resolved ? "Reopen question" : "Mark as resolved"}
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "question" })}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete question
          </Button>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-foreground">
          {answers === null ? "Answers" : `${answers.length} answer${answers.length === 1 ? "" : "s"}`}
        </h3>
        {answers === null ? (
          <Skeleton className="mt-2 h-16 w-full rounded-xl" />
        ) : answers.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nobody has answered yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {answers.map((answer) => (
              <li
                key={answer.id}
                className={cn(
                  "rounded-xl border p-3",
                  answer.author_is_staff ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Author
                    first={answer.author_first_name}
                    last={answer.author_last_name}
                    avatar={answer.author_avatar_url}
                    staff={answer.author_is_staff}
                    when={answer.created_at}
                  />
                  {(staff || answer.author_id === userId) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Delete answer"
                      onClick={() => setConfirm({ kind: "answer", id: answer.id! })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{answer.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={sendReply} className="space-y-2">
        <Label htmlFor={`reply-${question.id}`}>Your answer</Label>
        <Textarea
          id={`reply-${question.id}`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={5000}
          rows={3}
        />
        <Button type="submit" disabled={busy || !reply.trim()} className="h-10 font-bold">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post answer
        </Button>
      </form>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "question" ? "Delete this question?" : "Delete this answer?"}
        description={
          confirm?.kind === "question"
            ? "The question and all its answers will be removed for everyone."
            : "The answer will be removed for everyone."
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
};

const AskDialog = ({
  open,
  onOpenChange,
  courses,
  defaultCourseId,
  userId,
  onAsked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: DiscussionCourse[];
  defaultCourseId: string;
  userId: string;
  onAsked: (id: string) => void;
}) => {
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setCourseId(defaultCourseId);
  }, [open, defaultCourseId]);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseId) {
      toast.error("Choose the course your question is about");
      return;
    }
    if (title.trim().length < 5) {
      toast.error("Write your question in a few words");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("course_questions")
      .insert({ course_id: courseId, author_id: userId, title: title.trim(), body: body.trim() })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      console.error("Ask error:", error);
      toast.error("Could not post your question");
      return;
    }
    setTitle("");
    setBody("");
    onOpenChange(false);
    toast.success("Question posted");
    onAsked(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask a question</DialogTitle>
          <DialogDescription>Everyone on the course and the school's staff can read and answer it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={ask} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ask-course">Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger id="ask-course"><SelectValue placeholder="Choose a course" /></SelectTrigger>
              <SelectContent>
                {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ask-title">Your question</Label>
            <Input id="ask-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ask-body">More detail (optional)</Label>
            <Textarea id="ask-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="h-11 font-bold">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const FILTERS: { value: QuestionFilter; label: string }[] = [
  { value: "all", label: "All questions" },
  { value: "open", label: "Not resolved" },
  { value: "unanswered", label: "No answer yet" },
  { value: "needs-staff", label: "No staff answer" },
  { value: "mine", label: "Asked by me" },
];

/**
 * The question list for course discussions. Students see the questions on
 * their cohort's courses, staff see every course; the database decides which
 * (see can_access_course_discussion), this component only draws what it gets.
 */
const DiscussionBoard = ({ staff, courses, header }: { staff: boolean; courses: DiscussionCourse[]; header: (ask: React.ReactNode) => React.ReactNode }) => {
  const { profile } = useAuth();
  const userId = profile?.id ?? "";
  const [params, setParams] = useSearchParams();
  const openId = params.get("q");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [courseFilter, setCourseFilter] = useState("all");
  const [filter, setFilter] = useState<QuestionFilter>(staff ? "needs-staff" : "all");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("course_question_feed")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .limit(300);
    if (error) {
      console.error("Load questions error:", error);
      toast.error("Could not load the discussions");
    }
    setQuestions(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("q", id);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const shown = useMemo(
    () =>
      (questions ?? []).filter(
        (question) =>
          // A question opened from a notification always shows, whatever the filters say.
          question.id === openId ||
          ((courseFilter === "all" || question.course_id === courseFilter) && matchesFilter(question, filter, userId)),
      ),
    [questions, courseFilter, filter, userId, openId],
  );

  const askButton = (
    <Button className="h-11 gap-2 font-bold" onClick={() => setAsking(true)} disabled={courses.length === 0}>
      <Plus className="h-4 w-4" /> Ask a question
    </Button>
  );

  return (
    <div className="space-y-5">
      {header(askButton)}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="h-11 sm:w-64" aria-label="Course"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(value) => setFilter(value as QuestionFilter)}>
          <SelectTrigger className="h-11 sm:w-56" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {questions === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-[20px]" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyCard icon={<MessageCircleQuestion className="h-6 w-6" />} title="No questions here">
          {questions.length === 0
            ? "Nobody has asked anything yet. Ask the first question about a course."
            : "No question matches these filters."}
        </EmptyCard>
      ) : (
        <ul className="space-y-3">
          {shown.map((question) => {
            const open = question.id === openId;
            const status = questionStatus(question);
            return (
              <Panel as="li" key={question.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={open}
                  onClick={() => setOpen(open ? null : question.id)}
                >
                  <span className="min-w-0 space-y-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone="neutral">{question.course_code}</Pill>
                      <Pill tone={status.tone}>{status.label}</Pill>
                      <span className="text-xs text-muted-foreground">
                        {question.answer_count} answer{question.answer_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="block text-base font-bold text-foreground">{question.title}</span>
                    <Author
                      first={question.author_first_name}
                      last={question.author_last_name}
                      avatar={question.author_avatar_url}
                      staff={question.author_is_staff}
                      when={question.created_at}
                    />
                  </span>
                  <ChevronDown
                    className={cn("mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                {open && userId && <Thread question={question} staff={staff} userId={userId} onChanged={load} />}
              </Panel>
            );
          })}
        </ul>
      )}

      <AskDialog
        open={asking}
        onOpenChange={setAsking}
        courses={courses}
        defaultCourseId={courseFilter === "all" ? "" : courseFilter}
        userId={userId}
        onAsked={(id) => {
          void load().then(() => setOpen(id));
        }}
      />
    </div>
  );
};

export default DiscussionBoard;
