import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * Drafting questions, and filling in the explanations a bank is missing.
 *
 * Unlike a description there is no fallback here, and there should not be: a
 * question nobody wrote is not a question, and a template one would be worse
 * than none. When no model answers, this reports why and the bank is unchanged.
 */

/** The types a draft may produce. Deliberately not `matching` — see below. */
export const DRAFTABLE_TYPES = [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'short_answer',
  'essay',
] as const;

export type DraftableType = (typeof DRAFTABLE_TYPES)[number];

export const DRAFTABLE_LABELS: Record<DraftableType, string> = {
  mcq_single: 'Multiple choice (one answer)',
  mcq_multi: 'Multiple choice (several answers)',
  true_false: 'True or false',
  short_answer: 'Short answer',
  essay: 'Essay',
};

export interface DraftResult {
  drafted: number;
  /** How many came back malformed and were dropped rather than saved. */
  discarded: number;
  /** Why each was dropped, for the rare case that all of them were. */
  rejected: string[];
  provider?: string;
  model?: string;
}

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('ai-questions', { body });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The AI call failed.'));
  return data;
};

/**
 * Drafts questions from a material into the bank, as drafts.
 *
 * `matching` is not offered. Its answer key is a map of pairs, and a model
 * that gets one pair subtly wrong produces a question that marks partially
 * wrong for every student — the failure is proportional and quiet, where every
 * other type either works or is rejected outright by the validator.
 */
export const draftQuestions = async (args: {
  materialId: string;
  count: number;
  types: DraftableType[];
}): Promise<DraftResult> => {
  const data = await call({
    action: 'draft',
    material_id: args.materialId,
    count: args.count,
    types: args.types,
  });
  return {
    drafted: Number(data?.drafted ?? 0),
    discarded: Number(data?.discarded ?? 0),
    rejected: Array.isArray(data?.rejected) ? data.rejected.map(String) : [],
    provider: data?.provider,
    model: data?.model,
  };
};

/**
 * Writes the explanation a question is missing, and saves it.
 *
 * The explanation is what a student sees beside a wrong answer when results
 * are released. A bank full of blanks means the review screen shows them a red
 * cross and nothing else, which teaches nobody anything.
 */
export const writeExplanation = async (questionId: string): Promise<string> => {
  const data = await call({ action: 'explain', question_id: questionId });
  return String(data?.explanation ?? '');
};
