import { supabase } from '@/integrations/supabase/client';

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

const SETTING_KEYS = [
  'ai_chat_voice',
  'ai_chat_max_words',
  'ai_chat_decline',
  'ai_chat_escalation',
  'ai_chat_model_fallback',
];

/** `value` is jsonb, so it arrives as a real string, number or boolean. */
const asText = (raw: unknown): string =>
  String(raw ?? '').trim().replace(/^"(.*)"$/, '$1');

const asBool = (raw: unknown, fallback: boolean): boolean => {
  if (typeof raw === 'boolean') return raw;
  if (raw === undefined || raw === null || raw === '') return fallback;
  return /^(true|1|yes|on)$/i.test(asText(raw));
};

/** Keeps a value inside the range the prompt can sensibly ask for. */
export const clampWords = (value: number): number =>
  Number.isFinite(value) && value > 0
    ? Math.min(Math.max(Math.round(value), LIMITS.minWords), LIMITS.maxWords)
    : DEFAULT_RULES.maxWords;

export const fetchChatAnswerRules = async (): Promise<ChatAnswerRules> => {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', SETTING_KEYS);

  const map = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value as unknown]),
  );

  return {
    voice: asText(map.get('ai_chat_voice')).slice(0, LIMITS.voice),
    maxWords: clampWords(Number(asText(map.get('ai_chat_max_words')))),
    decline: asText(map.get('ai_chat_decline')).slice(0, LIMITS.decline),
    escalation: asText(map.get('ai_chat_escalation')).slice(0, LIMITS.escalation),
    modelFallback: asBool(map.get('ai_chat_model_fallback'), true),
  };
};
