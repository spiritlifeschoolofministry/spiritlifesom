/**
 * Walking the provider chain, once, for everything that needs a model.
 *
 * Eight features ask the same question of the same ordered list of providers,
 * and all of them need the same behaviour around it: try each enabled row in
 * turn, record which one worked, keep every failure so a screen can say what
 * actually happened, and never throw at the caller.
 *
 * Written out eight times, those copies would drift, and the half that drifted
 * would be the error handling nobody looks at until it matters.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ADAPTERS, classifyFailure, type ProviderFailure } from "./ai-providers.ts";

export interface ChainResult {
  /** The winning provider's raw answer, or null if none answered. */
  text: string | null;
  provider?: string;
  model?: string;
  /** False when no row is set up at all — a different thing from every row failing. */
  configured: boolean;
  /** Every failure along the way, in the order they happened. */
  failures: ProviderFailure[];
}

export interface ChainOptions {
  /**
   * Whether an answer is usable. A description has to survive being tidied to a
   * sentence; a batch of drafted questions has to parse as the shape asked for.
   * An answer that fails this is treated as that provider failing, so the chain
   * moves on rather than returning something the caller cannot use.
   */
  accept?: (raw: string) => boolean;
  /** Ceiling on the answer, passed through to the adapter. */
  maxTokens?: number;
}

interface ProviderRow {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
}

/** Asks each enabled provider in turn until one answers usably. */
export const runChain = async (
  service: SupabaseClient,
  prompt: string,
  options: ChainOptions = {},
): Promise<ChainResult> => {
  const { accept = (raw: string) => !!raw.trim(), maxTokens } = options;

  const { data, error } = await service
    .from("ai_providers")
    .select("id, provider, model, api_key, base_url")
    .eq("enabled", true)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  // A row needs a key, a model and an adapter to be worth trying. The model
  // check matters because gateway rows are seeded without one: their free lists
  // rotate, so an admin picks from the live list rather than a shipped guess.
  const usable = ((data ?? []) as ProviderRow[])
    .filter((p) => p.api_key && p.model && ADAPTERS[p.provider]);
  if (usable.length === 0) return { text: null, configured: false, failures: [] };

  const failures: ProviderFailure[] = [];

  for (const row of usable) {
    try {
      const raw = await ADAPTERS[row.provider]({
        apiKey: row.api_key!,
        model: row.model,
        prompt,
        baseUrl: row.base_url,
        maxTokens,
      });
      if (!accept(raw)) throw new Error("The answer was not in the shape asked for.");

      // Best-effort bookkeeping: the admin screen shows which row last worked
      // and what the last failure was, but a write failure here must not cost
      // an answer the caller already has in hand.
      await service
        .from("ai_providers")
        .update({ last_used_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);

      return {
        text: raw,
        provider: row.provider,
        model: row.model,
        configured: true,
        failures,
      };
    } catch (err) {
      const failure = classifyFailure(row.provider, row.model, err);
      failures.push(failure);
      await service
        .from("ai_providers")
        .update({ last_error: `${failure.kind}: ${failure.detail}`.slice(0, 500) })
        .eq("id", row.id);
    }
  }

  return { text: null, configured: true, failures };
};
