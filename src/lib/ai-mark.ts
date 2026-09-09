import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * Suggested marks for written answers.
 *
 * A suggestion is not a mark. Everything in this file and the screen that uses
 * it is arranged so that the number an examiner saves is one they chose:
 * suggestions arrive in their own fields, are shown beside the real controls
 * rather than in them, and are copied across one answer at a time by a click.
 *
 * There is deliberately no "accept all". Suggesting thirty marks in one go is
 * the time saved; accepting thirty in one go is the examiner not having marked
 * the paper.
 */

export interface MarkSuggestion {
  points: number;
  feedback: string;
  /** 'blank' for an unanswered question, decided without a model. */
  note?: string;
}

export interface MarkSuggestions {
  /** Keyed by `exam_answers.id`. */
  suggestions: Record<string, MarkSuggestion>;
  /** Providers that failed on individual answers, where some others worked. */
  failures: string[];
}

/**
 * Suggests marks for the written answers on one attempt.
 *
 * With no `answerId`, every essay and short-answer question that is still
 * unmarked is considered — questions already marked are left alone, because the
 * examiner has already decided those.
 */
export const suggestMarks = async (
  attemptId: string,
  answerId?: string,
): Promise<MarkSuggestions> => {
  const { data, error } = await supabase.functions.invoke('ai-mark', {
    body: { attempt_id: attemptId, answer_id: answerId },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not suggest a mark.'));

  return {
    suggestions: (data?.suggestions ?? {}) as Record<string, MarkSuggestion>,
    failures: Array.isArray(data?.failures) ? data.failures.map(String) : [],
  };
};
