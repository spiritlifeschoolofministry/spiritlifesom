import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * The chatbox's answer rules, as the admin screen sees them.
 *
 * The prompt is deliberately in two halves. The safety rules live in
 * `ai-chat/index.ts` and cannot be edited from anywhere — a freely editable
 * system prompt is also a way to delete "never state a figure you were not
 * given", and someone tidying the box would have no way of knowing that line
 * was the only thing between a student and a confidently wrong balance.
 *
 * Everything here is the other half: the voice, the school's own guidance, who
 * to send someone to, what not to discuss. Real control over how it sounds,
 * with the floor kept underneath it.
 *
 * `chat-answer-rules.test.ts` checks this list still matches the function's,
 * so the screen cannot end up claiming a guard that is no longer there.
 */

/**
 * Shown read-only, so it is visible what is being relied on.
 *
 * Mirrors FIXED_RULES in `supabase/functions/ai-chat/index.ts`, which is the
 * copy that actually runs. A Deno function cannot import from `src/`, so this
 * duplication is unavoidable and is tested rather than trusted.
 */
export const NON_NEGOTIABLE_RULES = [
  'Use ONLY the figures in the context given to you. Never state a number, a date, a name, a mark or a deadline that is not there. If the context does not contain the answer, say you do not have it and name the page where it can be found.',
  'Never guess at, predict or imply a mark, a pass, a graduation or a certificate outcome.',
  'Never claim to have done anything. You cannot change any record; you can only tell someone where to do it themselves.',
  "Never discuss another named person's record.",
] as const;

export interface ChatAnswerRules {
  voice: string;
  maxWords: number;
  decline: string;
  escalation: string;
  /** Off means an unrecognised question never reaches a model at all. */
  modelFallback: boolean;
}

/** Ceilings, applied here and again server-side. */
export const LIMITS = {
  voice: 1500,
  decline: 600,
  escalation: 200,
  minWords: 20,
  maxWords: 200,
} as const;

export const DEFAULT_RULES: ChatAnswerRules = {
  voice: '',
  maxWords: 70,
  decline: '',
  escalation: '',
  modelFallback: true,
};

/** Keeps a value inside the range the prompt can sensibly ask for. */
export const clampWords = (value: number): number =>
  Number.isFinite(value) && value > 0
    ? Math.min(Math.max(Math.round(value), LIMITS.minWords), LIMITS.maxWords)
    : DEFAULT_RULES.maxWords;

/**
 * Reads the rules.
 *
 * Through `ai-settings` rather than from a table, because these live in
 * `ai_private_settings` — RLS on, no policies — for the same reason the
 * provider keys do. `system_settings`, where they used to sit, is readable by
 * `anon` on purpose, so the school's own guidance was public to anyone who
 * opened devtools on the site. None of it was a credential and none of it was
 * holding the security line, but there was no reason for it to be public.
 */
export const fetchChatAnswerRules = async (): Promise<ChatAnswerRules> => {
  const { data, error } = await supabase.functions.invoke('ai-settings', {
    body: { action: 'chat_rules_get' },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not read the answer rules.'));
  return normalise(data?.rules);
};

/**
 * Saves whichever rules are passed, and returns the stored result.
 *
 * A patch rather than the whole object, so two admins editing different boxes
 * cannot overwrite each other's field. The function clamps every value again
 * on its side; the clamps here are for the editor's benefit, not the
 * database's.
 */
export const saveChatAnswerRules = async (
  patch: Partial<ChatAnswerRules>,
): Promise<ChatAnswerRules> => {
  const { data, error } = await supabase.functions.invoke('ai-settings', {
    body: { action: 'chat_rules_set', rules: patch },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not save the answer rules.'));
  return normalise(data?.rules);
};

/** Whatever the function returned, in the shape the editor expects. */
const normalise = (raw: unknown): ChatAnswerRules => {
  const rules = (raw ?? {}) as Partial<Record<keyof ChatAnswerRules, unknown>>;
  return {
    voice: String(rules.voice ?? '').slice(0, LIMITS.voice),
    maxWords: clampWords(Number(rules.maxWords)),
    decline: String(rules.decline ?? '').slice(0, LIMITS.decline),
    escalation: String(rules.escalation ?? '').slice(0, LIMITS.escalation),
    modelFallback: rules.modelFallback !== false,
  };
};
