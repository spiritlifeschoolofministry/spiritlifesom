import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * An admin starting a WhatsApp message to chosen students or staff.
 *
 * Unlike `whatsapp-reply`, this may write to someone who has never written to
 * the school, which is exactly what gets a linked (unofficial) number banned
 * when it is overdone. So it is deliberately narrow:
 *
 *   - A real admin session, role read from `profiles`, never from the token.
 *   - Recipients are portal *profiles*, resolved through
 *     `whatsapp_target_for_profile`, so the opt-out is honoured and no
 *     arbitrary phone number can be typed in.
 *   - At most MAX_RECIPIENTS per send and DAILY_CAP per rolling 24 hours across
 *     all admins (counted from `whatsapp_outbound_log`, which the gateway
 *     writes). Bulk messages belong in announcements, not here.
 *   - Messages go one at a time with a pause between them, never as a burst.
 *   - Every send is written to `audit_logs` with who sent it and to whom.
 */

const SOURCE = "admin_direct";
const MAX_RECIPIENTS = 10;
const MAX_TEXT = 1000;
const DAILY_CAP = Number(Deno.env.get("WHATSAPP_DIRECT_DAILY_CAP") ?? "30");
const PAUSE_MS = 2500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  if (!gatewayUrl || !gatewaySecret) return json({ error: "WhatsApp gateway not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await caller.auth.getUser();
  if (!userRes?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: me } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (me?.role !== "admin") return json({ error: "admins only" }, 403);

  const body = (await req.json().catch(() => ({}))) as { profile_ids?: unknown; text?: unknown };
  const ids = Array.isArray(body.profile_ids)
    ? [...new Set(body.profile_ids.filter((v): v is string => typeof v === "string"))]
    : [];
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (ids.length === 0) return json({ error: "Choose at least one person." }, 400);
  if (ids.length > MAX_RECIPIENTS) {
    return json({ error: `At most ${MAX_RECIPIENTS} people per message. Use an announcement for more.` }, 400);
  }
  if (!text) return json({ error: "Type a message." }, 400);
  if (text.length > MAX_TEXT) return json({ error: `Keep it under ${MAX_TEXT} characters.` }, 400);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: usedToday } = await admin
    .from("whatsapp_outbound_log")
    .select("id", { count: "exact", head: true })
    .eq("source", SOURCE)
    .gte("sent_at", since);
  const remaining = Math.max(0, DAILY_CAP - (usedToday ?? 0));
  if (ids.length > remaining) {
    return json({
      error: remaining === 0
        ? `The daily limit of ${DAILY_CAP} direct WhatsApp messages has been reached. Try again tomorrow.`
        : `Only ${remaining} direct WhatsApp message(s) left in the last 24 hours (limit ${DAILY_CAP}).`,
    }, 429);
  }

  const { data: people } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);
  const nameOf = new Map(
    (people ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(no name)"]),
  );

  const results: { profile_id: string; name: string; sent: boolean; reason?: string }[] = [];
  let first = true;
  for (const id of ids) {
    const name = nameOf.get(id) ?? "(unknown)";
    const { data: jid } = await admin.rpc("whatsapp_target_for_profile", { p_profile_id: id });
    if (!jid) {
      results.push({ profile_id: id, name, sent: false, reason: "no WhatsApp number, or opted out" });
      continue;
    }
    if (!first) await new Promise((r) => setTimeout(r, PAUSE_MS));
    first = false;
    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
        body: JSON.stringify({
          to: jid,
          text,
          source: SOURCE,
          idempotency_key: `admin-direct:${userRes.user.id}:${id}:${Date.now()}`,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      results.push(res.ok
        ? { profile_id: id, name, sent: true }
        : { profile_id: id, name, sent: false, reason: `gateway HTTP ${res.status}` });
    } catch (error) {
      results.push({ profile_id: id, name, sent: false, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  await admin.from("audit_logs").insert({
    actor_id: userRes.user.id,
    actor_email: me?.email ?? null,
    actor_role: me?.role ?? null,
    action: "whatsapp.direct_sent",
    entity_type: "whatsapp",
    entity_id: null,
    summary: `Direct WhatsApp to ${sentCount} of ${ids.length}`,
    metadata: { results, length: text.length },
  });

  return json({ sent: sentCount, total: ids.length, results });
});
