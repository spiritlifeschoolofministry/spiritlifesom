/**
 * The admin console's only way to reach `ai_providers`.
 *
 * That table has RLS on and no policies, so an admin's own session cannot
 * select from it however many roles they hold — deliberately. An API key a
 * client could read is an API key on the public internet, and `system_settings`,
 * where every other admin-editable knob lives, is world-readable by design
 * (StudentAttendance reads `class_today` before anyone signs in).
 *
 * So keys go in one direction only. `list` returns a masked preview — enough to
 * recognise which key is loaded, never enough to use it — and `save` writes a
 * new one. Nothing here ever returns `api_key`.
 *
 * This function does not use `ai-guard`: the guard is gated on the AI master
 * switch, and the screen that turns that switch on has to work while it is off.
 * The role check below is stricter than the guard's in exchange — full admin
 * only, not teachers, matching how /admin/settings and /admin/storage are
 * gated in the router.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ADAPTERS,
  classifyFailure,
  describeFailure,
  listModels,
  OPENAI_COMPATIBLE,
  resolveBaseUrl,
  SUPPORTED_PROVIDERS,
} from "../_shared/ai-providers.ts";
import { tidy } from "../_shared/ai-text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * `gsk_1a2b3c…X9y8z7` — the ends only.
 *
 * Enough to tell two keys apart when checking whether a rotation actually took,
 * and useless to anyone reading it over a shoulder. Short keys are shown as a
 * length rather than as most of themselves.
 */
const maskKey = (key: string | null): string | null => {
  if (!key) return null;
  if (key.length < 16) return `${"•".repeat(8)} (${key.length} characters)`;
  return `${key.slice(0, 8)}…${key.slice(-6)}`;
};

interface ProviderRow {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  enabled: boolean;
  position: number;
  last_used_at: string | null;
  last_error: string | null;
}

const publicShape = (row: ProviderRow) => ({
  id: row.id,
  provider: row.provider,
  model: row.model,
  base_url: row.base_url,
  // What the row will actually call, the adapter's default included, so the
  // console can show the address without keeping its own copy of that table.
  effective_base_url: resolveBaseUrl(row.provider, row.base_url) || null,
  enabled: row.enabled,
  position: row.position,
  has_key: !!row.api_key,
  key_preview: maskKey(row.api_key),
  last_used_at: row.last_used_at,
  last_error: row.last_error,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  /** A string setting, trimmed and capped. */
  const text = (raw: unknown, max: number): string =>
    String(raw ?? "").trim().slice(0, max);

  /**
   * The five answer rules, with defaults for anything unwritten.
   *
   * Returned in the client's own shape rather than as rows, so the console
   * does not need to know the key names or cope with jsonb arriving as three
   * different types.
   */
  const readChatRules = async () => {
    const { data, error } = await service
      .from("ai_private_settings")
      .select("key, value")
      .in("key", [
        "ai_chat_voice",
        "ai_chat_max_words",
        "ai_chat_decline",
        "ai_chat_escalation",
        "ai_chat_model_fallback",
      ]);
    if (error) throw new Error(error.message);

    const map = new Map(
      ((data ?? []) as { key: string; value: unknown }[]).map((row) => [row.key, row.value]),
    );
    const asText = (key: string) =>
      String(map.get(key) ?? "").trim().replace(/^"(.*)"$/, "$1");
    const words = Number(asText("ai_chat_max_words"));
    const raw = map.get("ai_chat_model_fallback");

    return {
      voice: asText("ai_chat_voice"),
      maxWords: Number.isFinite(words) && words > 0
        ? Math.min(Math.max(Math.round(words), 20), 200)
        : 70,
      decline: asText("ai_chat_decline"),
      escalation: asText("ai_chat_escalation"),
      modelFallback: typeof raw === "boolean"
        ? raw
        : raw === undefined || raw === null || raw === ""
        ? true
        : /^(true|1|yes|on)$/i.test(String(raw).replace(/^"(.*)"$/, "$1")),
    };
  };

  const listAll = async () => {
    const { data, error } = await service
      .from("ai_providers")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as ProviderRow[]).map(publicShape);
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (String((profile as { role?: string } | null)?.role ?? "").toLowerCase() !== "admin") {
      return json({ error: "Only an administrator may manage AI providers." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ----------------------------------------------------- chat answer rules
    //
    // These live in `ai_private_settings` rather than `system_settings`
    // because that table is readable by `anon` on purpose, and the school's
    // own guidance — including an office and a phone number it may name — has
    // no reason to be public. Same one-way discipline as the provider keys:
    // reachable only here, and only by a full admin.
    if (action === "chat_rules_get") {
      return json({ rules: await readChatRules() });
    }

    if (action === "chat_rules_set") {
      const patch = (body?.rules ?? {}) as Record<string, unknown>;
      const writes: { key: string; value: unknown }[] = [];

      // Only the five known keys, each clamped to what a prompt can sensibly
      // carry. A value arriving from anywhere else is ignored rather than
      // written, so this cannot become a way to put arbitrary rows in the
      // table.
      if ("voice" in patch) {
        writes.push({ key: "ai_chat_voice", value: text(patch.voice, 1500) });
      }
      if ("decline" in patch) {
        writes.push({ key: "ai_chat_decline", value: text(patch.decline, 600) });
      }
      if ("escalation" in patch) {
        writes.push({ key: "ai_chat_escalation", value: text(patch.escalation, 200) });
      }
      if ("maxWords" in patch) {
        const words = Number(patch.maxWords);
        writes.push({
          key: "ai_chat_max_words",
          value: Number.isFinite(words) && words > 0
            ? Math.min(Math.max(Math.round(words), 20), 200)
            : 70,
        });
      }
      if ("modelFallback" in patch) {
        writes.push({ key: "ai_chat_model_fallback", value: patch.modelFallback === true });
      }

      if (writes.length === 0) return json({ error: "Nothing to save." }, 400);

      const { error } = await service
        .from("ai_private_settings")
        .upsert(
          writes.map((row) => ({ ...row, updated_at: new Date().toISOString() })),
          { onConflict: "key" },
        );
      if (error) return json({ error: error.message }, 500);

      return json({ rules: await readChatRules() });
    }

    if (action === "list") {
      return json({
        providers: await listAll(),
        supported: SUPPORTED_PROVIDERS,
        compatible: OPENAI_COMPATIBLE,
      });
    }

    if (action === "save") {
      const id = body?.id ? String(body.id) : null;
      const patch: Record<string, unknown> = {};

      if (body.provider !== undefined) {
        const provider = String(body.provider);
        if (!ADAPTERS[provider]) return json({ error: `Unknown provider "${provider}".` }, 400);
        patch.provider = provider;
      }
      if (body.model !== undefined) patch.model = String(body.model).trim();
      if (body.base_url !== undefined) patch.base_url = String(body.base_url).trim() || null;
      if (body.enabled !== undefined) patch.enabled = !!body.enabled;
      // Omitted keeps whatever key is stored — the console never holds the real
      // one, so it can only ever send a replacement. An empty string clears it.
      if (body.api_key !== undefined) {
        const key = String(body.api_key).trim();
        patch.api_key = key || null;
      }

      if (id) {
        const { error } = await service.from("ai_providers").update(patch).eq("id", id);
        if (error) return json({ error: error.message }, 400);
      } else {
        if (!patch.provider) return json({ error: "Pick a provider first." }, 400);
        // New rows land at the end of the chain, so adding one never silently
        // demotes the provider that is currently working.
        const { data: last } = await service
          .from("ai_providers")
          .select("position")
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        patch.position = (((last as { position?: number } | null)?.position) ?? -1) + 1;
        const { error } = await service.from("ai_providers").insert(patch);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ providers: await listAll() });
    }

    if (action === "delete") {
      const { error } = await service.from("ai_providers").delete().eq("id", String(body.id));
      if (error) return json({ error: error.message }, 400);
      return json({ providers: await listAll() });
    }

    if (action === "reorder") {
      const order = Array.isArray(body.order) ? body.order.map(String) : [];
      // Position is what the chain reads, so it is rewritten from the order the
      // admin dragged rather than nudged, which cannot leave a gap or a tie.
      for (const [index, id] of order.entries()) {
        const { error } = await service
          .from("ai_providers")
          .update({ position: index })
          .eq("id", id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ providers: await listAll() });
    }

    if (action === "models") {
      // A key that hasn't been saved yet is passed in; for a saved row the
      // stored key is used and never leaves this function.
      let provider = body.provider ? String(body.provider) : "";
      let apiKey = body.api_key ? String(body.api_key) : "";
      let baseUrl = body.base_url ? String(body.base_url) : "";

      if (body.id) {
        const { data } = await service
          .from("ai_providers")
          .select("provider, api_key, base_url")
          .eq("id", String(body.id))
          .maybeSingle();
        const row = data as Pick<ProviderRow, "provider" | "api_key" | "base_url"> | null;
        if (!row) return json({ ok: false, error: "That provider row is gone." });
        provider = row.provider;
        apiKey = apiKey || row.api_key || "";
        baseUrl = baseUrl || row.base_url || "";
      }

      if (!apiKey) return json({ ok: false, error: "Enter an API key first." });
      try {
        return json({ ok: true, models: await listModels(provider, apiKey, baseUrl) });
      } catch (err) {
        return json({ ok: false, error: describeFailure(classifyFailure(provider, "", err)) });
      }
    }

    if (action === "test") {
      const { data } = await service
        .from("ai_providers")
        .select("*")
        .eq("id", String(body.id))
        .maybeSingle();
      const row = data as ProviderRow | null;
      if (!row) return json({ ok: false, error: "That provider row is gone." });
      if (!row.api_key) return json({ ok: false, error: "This provider has no API key saved." });
      if (!row.model) return json({ ok: false, error: "Pick a model for this provider first." });

      // A real sentence, not a ping: a key can be valid and still wrong for the
      // model, and a retired free model is the likeliest failure of all.
      const prompt =
        "Write one plain sentence, at most 140 characters, describing a Bible school " +
        "course on the book of Romans. No preamble, no quotes.";
      try {
        const raw = await ADAPTERS[row.provider]({
          apiKey: row.api_key,
          model: row.model,
          prompt,
          baseUrl: row.base_url,
          maxTokens: 200,
        });
        const sample = tidy(raw);
        if (!sample) throw new Error("The provider returned nothing usable.");
        await service
          .from("ai_providers")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id);
        return json({ ok: true, sample, providers: await listAll() });
      } catch (err) {
        const failure = classifyFailure(row.provider, row.model, err);
        await service
          .from("ai_providers")
          .update({ last_error: `${failure.kind}: ${failure.detail}`.slice(0, 500) })
          .eq("id", row.id);
        return json({
          ok: false,
          error: describeFailure(failure),
          providers: await listAll(),
        });
      }
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
