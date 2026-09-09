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

export interface AiFlags {
  /** Off disables every feature regardless of its own flag. */
  enabled: boolean;
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

  return {
    enabled,
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
