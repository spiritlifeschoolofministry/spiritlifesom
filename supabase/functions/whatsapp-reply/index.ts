import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * An admin replying by hand, through the school's number.
 *
 * This is the one function that sends words a person typed, which makes it the
 * one that could be an open relay. Three things keep it from being one:
 *
 *   It needs a real admin session. Not a shared secret -- a JWT, checked
 *   against the profiles table, because the other functions are callable by
 *   pg_net and this one must not be.
 *
 *   It can only write to a number that has already written to us. There is no
 *   way to use it to message somebody who has not started a conversation, so
 *   it cannot become a way to send the school's number anywhere.
 *
 *   It refuses groups outright. A hand-typed reply going to seventy-seven
 *   people instead of one is the mistake this is most likely to make.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  if (!gatewayUrl || !gatewaySecret) {
    return new Response(JSON.stringify({ error: "gateway not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await caller.auth.getUser();
  if (!userRes?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // The role comes from the database, never from the token's own claims.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "admins only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { to, text, close } = (await req.json().catch(() => ({}))) as {
    to?: string;
    text?: string;
    close?: boolean;
  };

  if (!to) {
    return new Response(JSON.stringify({ error: "to is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (to.endsWith("@g.us")) {
    return new Response(JSON.stringify({ error: "this cannot send to a group" }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only somebody who has written to us. Without this, an admin account is a
  // way to send the school's number to any phone in the country.
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("jid")
    .eq("jid", to)
    .maybeSingle();

  if (!conversation) {
    return new Response(
      JSON.stringify({ error: "that number has not written to this line" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let sent = false;
  if (text && text.trim()) {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
      body: JSON.stringify({ to, text: text.trim() }),
      signal: AbortSignal.timeout(15_000),
    });
    sent = response.ok;
    if (!sent) {
      const detail = await response.text();
      return new Response(JSON.stringify({ error: "send failed", detail }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recorded beside the student's own messages, so the log reads as one
    // conversation rather than as a machine's half of it.
    await admin.from("whatsapp_inbound_log").insert({
      from_jid: to,
      body: null,
      command: "admin_reply",
      reply: text.trim().slice(0, 2000),
      replied: true,
      ai_generated: false,
    });
  }

  if (close) {
    await admin
      .from("whatsapp_conversations")
      .update({
        handover_closed_at: new Date().toISOString(),
        handover_closed_by: userRes.user.id,
        unanswered_streak: 0,
      })
      .eq("jid", to);
  }

  return new Response(JSON.stringify({ sent, closed: Boolean(close) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
