import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * The admin console's view of the model providers.
 *
 * Everything goes through the `ai-settings` edge function rather than through
 * Supabase directly: `ai_providers` has RLS on and no policies at all, so an
 * admin's own session cannot read it — which is the point, since the rows hold
 * API keys. What comes back here is a masked preview, never a usable key.
 */

export interface AiProvider {
  id: string;
  /** Matches an adapter in supabase/functions/_shared/ai-providers.ts. */
  provider: string;
  /** Empty on a new gateway row until an admin picks one from the live list. */
  model: string;
  /** Set only where the admin overrode the adapter's default address. */
  base_url: string | null;
  /** What the row will actually call, defaults included. */
  effective_base_url: string | null;
  enabled: boolean;
  /** Ascending. The chain is tried in this order. */
  position: number;
  has_key: boolean;
  /** Something like `gsk_1a2b3c…X9y8z7` — enough to recognise, not to use. */
  key_preview: string | null;
  last_used_at: string | null;
  last_error: string | null;
  /** The school's own ceiling for this row per UTC day, or null for uncapped. */
  daily_limit: number | null;
  /** Attempts against this row today, failures included. */
  calls_today: number;
  failures_today: number;
}

/** One model's calls on one day. */
export interface AiModelUsage {
  day: string;
  provider: string;
  model: string;
  calls: number;
  failures: number;
}

/** A provider that speaks OpenAI's /chat/completions, and where its models are listed. */
export interface CompatibleProvider {
  label: string;
  baseUrl: string;
  modelsUrl: string;
}

export interface AiProviderList {
  providers: AiProvider[];
  /** Provider names the edge function has an adapter for. */
  supported: string[];
  /** The OpenAI-compatible subset, with labels and default addresses. */
  compatible: Record<string, CompatibleProvider>;
}

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('ai-settings', { body });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The AI settings call failed.'));
  return data;
};

export const listAiProviders = async (): Promise<AiProviderList> => {
  const data = await call({ action: 'list' });
  return {
    providers: data?.providers ?? [],
    supported: data?.supported ?? [],
    compatible: data?.compatible ?? {},
  };
};

/**
 * Per-model call counts for the last `days` days.
 *
 * Separate from `ai_usage`, which counts per student and per feature: that one
 * enforces the daily caps a person has, this one says which model is carrying
 * the school's load and which is close to its free tier's ceiling.
 */
export const fetchAiModelUsage = async (days = 30): Promise<AiModelUsage[]> => {
  const data = await call({ action: 'usage', days });
  return (data?.usage ?? []) as AiModelUsage[];
};

export interface AiProviderPatch {
  provider?: string;
  model?: string;
  /** Empty string clears it, falling back to the adapter's default address. */
  base_url?: string;
  enabled?: boolean;
  /** Zero or null clears the ceiling. */
  daily_limit?: number | null;
  /**
   * Omit to keep whatever key is stored — the console never holds the real one,
   * so it can only ever send a replacement. An empty string clears it.
   */
  api_key?: string;
}

export interface AiModelList {
  ok: boolean;
  models?: string[];
  error?: string;
}

/**
 * The models a key can actually call, read from the provider.
 *
 * Free model lists rotate, so this is how the console avoids asking an admin to
 * go and look one up and paste it exactly. `api_key` is passed for a row not
 * yet saved; for a saved one the stored key is used and this is omitted.
 */
export const listAiModels = (
  args: { id?: string; provider?: string; api_key?: string; base_url?: string },
): Promise<AiModelList> => call({ action: 'models', ...args });

export const saveAiProvider = async (
  id: string | null,
  patch: AiProviderPatch,
): Promise<AiProvider[]> => (await call({ action: 'save', id, ...patch }))?.providers ?? [];

export const deleteAiProvider = async (id: string): Promise<AiProvider[]> =>
  (await call({ action: 'delete', id }))?.providers ?? [];

export const reorderAiProviders = async (order: string[]): Promise<AiProvider[]> =>
  (await call({ action: 'reorder', order }))?.providers ?? [];

export interface AiProviderTest {
  ok: boolean;
  /** The sentence the model actually wrote, when it worked. */
  sample?: string;
  error?: string;
  providers?: AiProvider[];
}

/** Asks for a real sentence — a key can be valid and still wrong for the model. */
export const testAiProvider = (id: string): Promise<AiProviderTest> =>
  call({ action: 'test', id });

/** Labels for the rail and the picker, gateways included. */
export const providerLabel = (
  name: string,
  compatible: Record<string, CompatibleProvider>,
): string =>
  compatible[name]?.label ??
    ({ gemini: 'Google Gemini', anthropic: 'Anthropic Claude' }[name] ?? name);
