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
  /** The school's own ceiling for this row, or null for uncapped. */
  daily_limit: number | null;
}

/** Midnight UTC tonight — when a limit set here comes back. */
const nextUtcMidnight = (): string => {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )).toISOString();
};

/** Asks each enabled provider in turn until one answers usably. */
export const runChain = async (
  service: SupabaseClient,
  prompt: string,
  options: ChainOptions = {},
): Promise<ChainResult> => {
  const { accept = (raw: string) => !!raw.trim(), maxTokens } = options;

  const { data, error } = await service
    .from("ai_providers")
    .select("id, provider, model, api_key, base_url, daily_limit")
    .eq("enabled", true)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  /**
   * Today's count for every row, read once.
   *
   * Read up front rather than per row because the common case is that no row
   * is capped, and a query per provider would spend nine round trips to learn
   * that. A count that is a call or two stale only matters at the very edge of
   * a limit, which is why the limit is set below the vendor's own.
   */
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await service
    .from("ai_model_usage")
    .select("provider_id, calls")
    .eq("day", today);
  const callsToday = new Map(
    ((usageRows ?? []) as { provider_id: string; calls: number }[])
      .map((row) => [row.provider_id, row.calls]),
  );

  // A row needs a key, a model and an adapter to be worth trying. The model
  // check matters because gateway rows are seeded without one: their free lists
  // rotate, so an admin picks from the live list rather than a shipped guess.
  const usable = ((data ?? []) as ProviderRow[])
    .filter((p) => p.api_key && p.model && ADAPTERS[p.provider]);
  if (usable.length === 0) return { text: null, configured: false, failures: [] };

  const failures: ProviderFailure[] = [];

  for (const row of usable) {
    // A row at its ceiling is skipped without being called, and the skip is
    // recorded as a failure so the screen can say why the chain moved on. A
    // silently absent provider is the thing that makes this hard to debug.
    if (row.daily_limit !== null && (callsToday.get(row.id) ?? 0) >= row.daily_limit) {
      failures.push({
        provider: row.provider,
        model: row.model,
        kind: "capped",
        detail: `${callsToday.get(row.id) ?? 0} of ${row.daily_limit} calls used today.`,
        quotaWindow: "day",
        resetsAt: nextUtcMidnight(),
      });
      continue;
    }

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
      await service.rpc("ai_record_model_call", { p_provider_id: row.id, p_ok: true });

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
      // Counted even though it failed: a vendor's free tier counts a request it
      // refused, so a count that ignored failures would run ahead of the real
      // allowance in exactly the situation the cap exists for.
      await service.rpc("ai_record_model_call", { p_provider_id: row.id, p_ok: false });
    }
  }

  return { text: null, configured: true, failures };
};
