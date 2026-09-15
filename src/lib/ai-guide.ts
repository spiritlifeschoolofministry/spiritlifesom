import { supabase } from '@/integrations/supabase/client';
import { aiDb } from '@/lib/ai-db';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * Marking guides: what a full-marks answer to a written question contains.
 *
 * The guide is the standard a mark is judged against, so the split here is the
 * same one `ai-mark.ts` makes about marks themselves. A drafted guide lands in
 * `rubric_draft`, which nothing reads at marking time. `rubric` — the column
 * `ai-mark` marks against and the lecturer sees in the question bank — is
 * written only by `adoptGuide`, one question at a time, by someone who has read
 * it.
 *
 * There is no "adopt all", for the reason there is no "accept all" on marks: a
 * guide nobody read is not a standard, it is a sentence that happens to be
 * stored in the right column.
 */

export interface DraftedGuide {
  /** The proposed guide, or null where the material could not ground one. */
  guide: string | null;
  /** Why there is no guide, in a sentence for the lecturer. */
  note?: string;
}

export interface GuideDraftResult {
  /** Keyed by `question_bank.id`. */
  guides: Record<string, DraftedGuide>;
  /** Providers that failed on individual questions, where others worked. */
  failures: string[];
}

/**
 * Drafts guides for the written questions on one paper.
 *
 * With no `questionId`, every essay and short-answer question that has no
 * rubric yet is considered — a question that already has one is left alone,
 * because that wording is the lecturer's own.
 */
export const draftMarkingGuides = async (
  examId: string,
  questionId?: string,
): Promise<GuideDraftResult> => {
  const { data, error } = await supabase.functions.invoke('ai-guide', {
    body: { exam_id: examId, question_id: questionId },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not draft a guide.'));

  return {
    guides: (data?.guides ?? {}) as Record<string, DraftedGuide>,
    failures: Array.isArray(data?.failures) ? data.failures.map(String) : [],
  };
};

/**
 * Makes a guide the standard for a question, under the name of whoever did it.
 *
 * `text` is what is on screen rather than what was drafted, so an edited guide
 * saves as edited. Once adopted the draft is cleared: leaving it behind would
 * put two guides on one question, and the next person to open this screen
 * could not tell which one the cohort was marked against.
 */
export const adoptGuide = async (questionId: string, text: string): Promise<void> => {
  const guide = text.trim();
  if (!guide) throw new Error('An empty guide is not a standard.');

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await aiDb
    .from('question_bank')
    .update({
      rubric: guide,
      rubric_draft: null,
      rubric_source: 'ai',
      rubric_approved_by: user?.id ?? null,
      rubric_approved_at: new Date().toISOString(),
    })
    .eq('id', questionId);
  if (error) throw new Error(error.message);
};

/**
 * Rewrites a standard that has been adopted but not yet marked against.
 *
 * A guide is only final once it has judged somebody. Until the first mark is
 * saved on this question, changing it costs nothing and catching a wrong
 * requirement early is worth far more than the tidiness of an immutable
 * record — so the screen offers this rather than making a lecturer delete and
 * redraft.
 *
 * After that first mark it refuses, and the refusal is the point: a paper
 * marked half against one standard and half against another has no standard,
 * and the students on the wrong side of the change have no way of knowing.
 * The count is re-read here rather than trusted from the screen, which may
 * have been open since before someone else started marking.
 *
 * `rubric_source` is deliberately left alone. It records where the wording
 * came from, and an edit does not change that a model drafted it; who has
 * signed for the current wording is `rubric_approved_by`, which moves to
 * whoever made this edit.
 */
export const reviseGuide = async (
  examId: string,
  questionId: string,
  text: string,
): Promise<void> => {
  const guide = text.trim();
  if (!guide) throw new Error('An empty guide is not a standard.');

  const marked = await countMarkedAgainst(examId, questionId);
  if (marked > 0) {
    throw new Error(
      `${marked} answer${marked === 1 ? ' has' : 's have'} already been marked against this ` +
        `guide, so it cannot be changed now — the rest of the paper would be judged by a ` +
        `different standard.`,
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await aiDb
    .from('question_bank')
    .update({
      rubric: guide,
      rubric_approved_by: user?.id ?? null,
      rubric_approved_at: new Date().toISOString(),
    })
    .eq('id', questionId);
  if (error) throw new Error(error.message);
};

/**
 * How many answers to this question, on this paper, already carry a mark.
 *
 * Scoped to the exam rather than the question alone: the same question can sit
 * on an earlier paper that was marked and released long ago, and that has no
 * bearing on whether this paper's standard is still open to change.
 */
const countMarkedAgainst = async (examId: string, questionId: string): Promise<number> => {
  const { data: attempts } = await aiDb
    .from('exam_attempts')
    .select('id')
    .eq('exam_id', examId);

  const attemptIds = ((attempts ?? []) as { id: string }[]).map((a) => a.id);
  if (attemptIds.length === 0) return 0;

  const { count } = await aiDb
    .from('exam_answers')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .in('attempt_id', attemptIds)
    .not('points_awarded', 'is', null);

  return count ?? 0;
};

/** Throws a drafted guide away, leaving the question as it was. */
export const discardGuide = async (questionId: string): Promise<void> => {
  const { error } = await aiDb
    .from('question_bank')
    .update({ rubric_draft: null })
    .eq('id', questionId);
  if (error) throw new Error(error.message);
};

/** A written question on a paper, with whatever standard it currently has. */
export interface GuidedQuestion {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  rubric: string | null;
  rubric_draft: string | null;
  rubric_source: string | null;
  display_order: number;
  /**
   * How many answers on this paper have already been marked against it.
   *
   * Nonzero closes the guide to editing. It is a count rather than a boolean
   * so the screen can say what is holding it — "3 answers already marked" is
   * something a lecturer can act on, where "locked" is not.
   */
  marked_count: number;
}

/**
 * The written questions on a paper, in the order they were set.
 *
 * Auto-graded questions are left out here rather than filtered in the screen:
 * a marking guide for a question with an answer key is a second, vaguer answer
 * to something already answered.
 */
export const fetchGuidedQuestions = async (examId: string): Promise<GuidedQuestion[]> => {
  const { data: links } = await aiDb
    .from('exam_questions')
    .select('question_id, display_order')
    .eq('exam_id', examId)
    .order('display_order');

  const order = new Map(
    ((links ?? []) as { question_id: string; display_order: number }[])
      .map((l) => [l.question_id, l.display_order]),
  );
  if (order.size === 0) return [];

  const { data } = await aiDb
    .from('question_bank')
    .select('id, question_text, question_type, points, rubric, rubric_draft, rubric_source')
    .in('id', [...order.keys()]);

  // Every marked answer on this paper in one read, rather than a count query
  // per question. A paper has a handful of written questions and a cohort has
  // tens of attempts, so this is one small request either way.
  const { data: attempts } = await aiDb
    .from('exam_attempts')
    .select('id')
    .eq('exam_id', examId);
  const attemptIds = ((attempts ?? []) as { id: string }[]).map((a) => a.id);

  const { data: marked } = attemptIds.length
    ? await aiDb
      .from('exam_answers')
      .select('question_id')
      .in('attempt_id', attemptIds)
      .not('points_awarded', 'is', null)
    : { data: [] };

  const markedCounts = new Map<string, number>();
  for (const row of (marked ?? []) as { question_id: string }[]) {
    markedCounts.set(row.question_id, (markedCounts.get(row.question_id) ?? 0) + 1);
  }

  return ((data ?? []) as Omit<GuidedQuestion, 'display_order' | 'marked_count'>[])
    .filter((q) => q.question_type === 'essay' || q.question_type === 'short_answer')
    .map((q) => ({
      ...q,
      display_order: order.get(q.id) ?? 0,
      marked_count: markedCounts.get(q.id) ?? 0,
    }))
    .sort((a, b) => a.display_order - b.display_order);
};
