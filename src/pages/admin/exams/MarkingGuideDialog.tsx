import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/exam-utils";
import {
  adoptGuide,
  type DraftedGuide,
  discardGuide,
  draftMarkingGuides,
  fetchGuidedQuestions,
  type GuidedQuestion,
  reviseGuide,
} from "@/lib/ai-guide";

/**
 * The marking guide for one paper, question by question.
 *
 * Deliberately one screen rather than a button on each question in the bank.
 * The job this exists for is "we have just sat a test and thirty scripts need
 * marking to one standard", and that job is about a paper: the lecturer wants
 * to see, in one place, which of its written questions have a standard and
 * which are about to be marked on somebody's memory of what they wanted.
 *
 * Nothing here marks anything, and nothing here is automatic. A drafted guide
 * sits in an editable box until someone adopts it, and adopting is one click
 * per question — the reading is what makes it a standard, and a button that
 * adopted all of them would be a button for skipping the reading.
 */
export default function MarkingGuideDialog({
  examId,
  open,
  onOpenChange,
  assistantName,
}: {
  examId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantName: string;
}) {
  const [questions, setQuestions] = useState<GuidedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  /** Per-question working copy, so an edit is not lost by a reload. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Why a question came back without a guide, from the last draft run. */
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * Which adopted guides are open for editing.
   *
   * Separate from `edits`, which holds drafted text waiting to be adopted. A
   * guide already in force and a guide not yet in force are different states,
   * and one map holding both would make "is this the standard?" a question the
   * screen could get wrong.
   */
  const [revising, setRevising] = useState<Set<string>>(new Set());

  const startRevising = (question: GuidedQuestion) => {
    setEdits((current) => ({ ...current, [question.id]: question.rubric ?? "" }));
    setRevising((current) => new Set(current).add(question.id));
  };

  const stopRevising = (questionId: string) => {
    setEdits((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setRevising((current) => {
      const next = new Set(current);
      next.delete(questionId);
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchGuidedQuestions(examId);
      setQuestions(rows);
      setEdits((current) => {
        const next = { ...current };
        for (const q of rows) {
          // A draft the server already holds becomes the working copy, unless
          // this screen is already holding an edited one.
          if (q.rubric_draft && next[q.id] === undefined) next[q.id] = q.rubric_draft;
        }
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the questions.");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const missing = questions.filter((q) => !q.rubric?.trim());

  const draftMissing = async () => {
    setDrafting(true);
    try {
      const { guides, failures } = await draftMarkingGuides(examId);
      const drafted: Record<string, string> = {};
      const why: Record<string, string> = {};
      for (const [id, result] of Object.entries(guides as Record<string, DraftedGuide>)) {
        if (result.guide) drafted[id] = result.guide;
        else if (result.note) why[id] = result.note;
      }
      setEdits((current) => ({ ...current, ...drafted }));
      setNotes(why);
      await load();

      const count = Object.keys(drafted).length;
      if (count === 0 && Object.keys(why).length > 0) {
        toast.message("Nothing could be drafted", {
          description: "Each question says why below.",
        });
      } else {
        toast.success(
          `${count} guide${count === 1 ? "" : "s"} drafted. Read each one before adopting it.`,
        );
      }
      if (failures.length > 0) toast.warning(failures[0]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft the guides.");
    } finally {
      setDrafting(false);
    }
  };

  const adopt = async (question: GuidedQuestion) => {
    setBusy(question.id);
    try {
      await adoptGuide(question.id, edits[question.id] ?? "");
      setEdits((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      await load();
      toast.success("Adopted. Marks on this question are now judged against it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not adopt that guide.");
    } finally {
      setBusy(null);
    }
  };

  const saveRevision = async (question: GuidedQuestion) => {
    setBusy(question.id);
    try {
      await reviseGuide(examId, question.id, edits[question.id] ?? "");
      stopRevising(question.id);
      await load();
      toast.success("Guide updated.");
    } catch (err) {
      // Most likely someone started marking while this was open, in which case
      // reviseGuide refuses and says how many answers are already marked.
      toast.error(err instanceof Error ? err.message : "Could not save that change.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const discard = async (question: GuidedQuestion) => {
    setBusy(question.id);
    try {
      await discardGuide(question.id);
      setEdits((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not discard that guide.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marking guide</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {questions.length === 0
              ? "This paper has no written questions — everything on it is marked by its answer key."
              : missing.length === 0
              ? `All ${questions.length} written question${
                questions.length === 1 ? " has a standard" : "s have a standard"
              } to mark against.`
              : `${missing.length} of ${questions.length} written question${
                questions.length === 1 ? "" : "s"
              } has no standard to mark against yet.`}
          </p>
        </DialogHeader>

        {questions.length > 0 && missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={drafting}
              onClick={draftMissing}
            >
              {drafting
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {assistantName} is reading the material…</>
                : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Draft the missing guides</>}
            </Button>
            <p className="text-xs text-muted-foreground flex-1 min-w-48">
              {assistantName} drafts from this course's own materials and requires nothing they do
              not teach. Each draft is yours to edit, and marking uses none of them until you
              adopt them one at a time.
            </p>
          </div>
        )}

        {loading && questions.length === 0
          ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the paper…
            </div>
          )
          : (
            <div className="space-y-3">
              {questions.map((q, idx) => {
                const draft = edits[q.id];
                const adopted = !!q.rubric?.trim();
                return (
                  <Card key={q.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        Question {idx + 1} · {q.points} mark{q.points === 1 ? "" : "s"}
                      </p>
                      {adopted
                        ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          >
                            {q.rubric_source === "ai" ? "Adopted" : "Your own"}
                          </Badge>
                        )
                        : (
                          <Badge variant="outline" className="text-[10px]">
                            No standard yet
                          </Badge>
                        )}
                    </div>

                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                    />

                    {adopted && revising.has(q.id)
                      ? (
                        <div className="space-y-2">
                          <Textarea
                            value={edits[q.id] ?? q.rubric ?? ""}
                            rows={7}
                            className="text-xs"
                            onChange={(e) =>
                              setEdits((current) => ({ ...current, [q.id]: e.target.value }))}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={busy === q.id || !(edits[q.id] ?? "").trim()}
                              onClick={() => saveRevision(q)}
                            >
                              {busy === q.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : "Save changes"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={busy === q.id}
                              onClick={() => stopRevising(q.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )
                      : adopted
                      ? (
                        <div className="space-y-1.5">
                          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                            {q.rubric}
                          </p>
                          {q.marked_count === 0
                            ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => startRevising(q)}
                              >
                                <Pencil className="mr-1.5 h-3 w-3" /> Edit
                              </Button>
                            )
                            : (
                              /* Not a disabled button. A control that cannot be
                                 used says nothing about why, and the why here is
                                 the whole reason it is closed. */
                              <p className="text-xs text-muted-foreground">
                                {q.marked_count} answer{q.marked_count === 1 ? "" : "s"}{" "}
                                {q.marked_count === 1 ? "has" : "have"} been marked against this, so
                                it is fixed now — changing it would leave the rest of the paper
                                judged by a different standard.
                              </p>
                            )}
                        </div>
                      )
                      : draft !== undefined
                      ? (
                        <div className="space-y-2">
                          <Textarea
                            value={draft}
                            rows={7}
                            className="text-xs"
                            onChange={(e) =>
                              setEdits((current) => ({ ...current, [q.id]: e.target.value }))}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={busy === q.id || !draft.trim()}
                              onClick={() => adopt(q)}
                            >
                              {busy === q.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : "Adopt as the standard"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={busy === q.id}
                              onClick={() => discard(q)}
                            >
                              Discard
                            </Button>
                          </div>
                        </div>
                      )
                      : (
                        <p className="text-xs text-amber-600">
                          {notes[q.id] ??
                            "Without a standard, this question is marked on coherence alone — and a suggested mark for it is deliberately generous."}
                        </p>
                      )}
                  </Card>
                );
              })}
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
