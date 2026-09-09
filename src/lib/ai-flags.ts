import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Which AI features are switched on.
 *
 * These live in `system_settings` precisely because that table is world
 * readable: a boolean saying whether a feature exists is not a secret, and both
 * portals need to know before they render a button. The keys themselves — and
 * the reason the student-facing ones ship off — are in
 * 20260909100000_ai_foundation.sql.
 *
 * The master switch is separate from the per-feature flags so that turning AI
 * off is one edit rather than eight, and so a feature can be prepared without
 * being live.
 */

export const AI_FEATURES = [
  'ai_material_descriptions',
  'ai_question_drafting',
  'ai_message_drafting',
  'ai_essay_marking',
  'ai_practice_quizzes',
  'ai_progress_summary',
  'ai_result_guidance',
  'ai_study_assistant',
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

/**
 * What the school calls its assistant, when the setting has not loaded yet.
 *
 * A fallback rather than the source of truth: the name lives in
 * `system_settings` so it can be changed without a deploy, and every screen
 * reads it from there. This is only what shows in the instant before the
 * settings query returns.
 */
export const DEFAULT_ASSISTANT_NAME = 'Barnabas';

export interface AiFlags {
  /** Off disables every feature regardless of its own flag. */
  enabled: boolean;
  /** The name students and staff see. Never a model or provider name. */
  assistantName: string;
  features: Record<AiFeature, boolean>;
  limits: { admin: number; student: number };
  /** True for a feature only when the master switch is on as well. */
  on: (feature: AiFeature) => boolean;
}

/**
 * `value` is a jsonb column, so this arrives as whatever JSON is stored: a real
 * boolean, a real number, or a string from anything that wrote it through
 * `JSON.stringify`. All three shapes are in the table, so all three are read.
 * Anything else — including a missing row — means off.
 */
const isOn = (raw: unknown): boolean => {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  return /^(true|1|yes|on)$/i.test(String(raw ?? '').trim().replace(/^"(.*)"$/, '$1'));
};

const asNumber = (raw: unknown, fallback: number): number => {
  const value = Number(String(raw ?? '').trim().replace(/^"(.*)"$/, '$1'));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const SETTING_KEYS = [
  'ai_enabled',
  'ai_assistant_name',
  ...AI_FEATURES,
  'ai_daily_limit_admin',
  'ai_daily_limit_student',
];

export const fetchAiFlags = async (): Promise<AiFlags> => {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', SETTING_KEYS);

  const map = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value as unknown]),
  );

  const enabled = isOn(map.get('ai_enabled'));
  const features = Object.fromEntries(
    AI_FEATURES.map((feature) => [feature, isOn(map.get(feature))]),
  ) as Record<AiFeature, boolean>;

  const rawName = map.get('ai_assistant_name');
  const assistantName = String(rawName ?? '').trim().replace(/^"(.*)"$/, '$1') ||
    DEFAULT_ASSISTANT_NAME;

  return {
    enabled,
    assistantName,
    features,
    limits: {
      admin: asNumber(map.get('ai_daily_limit_admin'), 200),
      student: asNumber(map.get('ai_daily_limit_student'), 20),
    },
    on: (feature: AiFeature) => enabled && features[feature],
  };
};

/**
 * Flags are read once and cached for the session. They change when an admin
 * edits them, which is rare and always followed by a reload of that screen —
 * refetching them on every render of every AI button would cost a request per
 * button for a value that is almost never different.
 */
export const useAiFlags = () =>
  useQuery({
    queryKey: ['ai-flags'],
    queryFn: fetchAiFlags,
    staleTime: 5 * 60 * 1000,
  });

/** A single feature's state, for the common case of one button. */
export const useAiFeature = (feature: AiFeature): boolean => {
  const { data } = useAiFlags();
  return !!data?.on(feature);
};

/**
 * The assistant's name, for copy.
 *
 * Deliberately never falls back to "the AI" or to a model name: students are
 * not meant to know that nine models sit behind this, and a screen that says
 * "Groq wrote this" would be both confusing and, when the chain falls through,
 * wrong.
 */
export const useAssistantName = (): string => {
  const { data } = useAiFlags();
  return data?.assistantName || DEFAULT_ASSISTANT_NAME;
};
