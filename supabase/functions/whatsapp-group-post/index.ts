import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Post a published announcement to the official WhatsApp group.
 *
 * Kept separate from whatsapp-admin-alert on purpose. That function sends to
 * named admins and routinely carries one student's details; this one sends to a
 * group of seventy-seven people and must never carry anybody's. Two functions
 * with two destinations and two rules is harder to get wrong than one function
 * with a flag deciding which it is today.
 *
 * As with the admin alerts, the caller names a row and nothing else. The text
 * comes from the announcement, the destination from configuration. There is no
 * way to make this send arbitrary words to the group.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  const groupJid = Deno.env.get("OFFICIAL_GROUP_JID");

  if (!gatewayUrl || !gatewaySecret) {
    return new Response(
      JSON.stringify({ error: "GATEWAY_URL and GATEWAY_SECRET must be set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!groupJid) {
    console.error("OFFICIAL_GROUP_JID is not set -- nothing will be posted");
    return new Response(JSON.stringify({ sent: 0, reason: "no group configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const { announcement_id } = body as { announcement_id?: string };
  if (!announcement_id) {
    return new Response(JSON.stringify({ error: "announcement_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: announcement, error } = await admin
    .from("announcements")
    .select("id, title, body, category, target_cohort_id, cohort_id, is_published, send_to_whatsapp, whatsapp_sent_at")
    .eq("id", announcement_id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: `lookup failed: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Re-check every condition the trigger checked. The trigger fires on a row as
  // it was written; by the time this runs the announcement may have been
  // unpublished, un-flagged, or already sent by a call that raced this one.
  if (
    !announcement ||
    !announcement.is_published ||
    !announcement.send_to_whatsapp ||
    announcement.whatsapp_sent_at
  ) {
    return new Response(JSON.stringify({ sent: 0, reason: "nothing to post" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // The group is one cohort's group. An announcement aimed at a different
  // cohort must not go there -- those students are not in it, and the ones who
  // are would be reading somebody else's notice. Untargeted announcements are
  // for everyone and do go.
  const targetCohort = announcement.target_cohort_id ?? announcement.cohort_id ?? null;
  if (targetCohort) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("id, is_active")
      .eq("id", targetCohort)
      .maybeSingle();
    if (!cohort?.is_active) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "announcement targets a cohort that is not the active one" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const lines = [`*${announcement.title}*`, "", String(announcement.body ?? "").trim()];
  if (appUrl) lines.push("", `${appUrl}/student/announcements`);

  const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
    body: JSON.stringify({
      to: groupJid,
      text: lines.join("\n"),
      // Deliberately no student_id. This is a group message and the gateway
      // would refuse it if one were set -- which is the point: if this function
      // ever grows a per-student variant, it fails closed rather than leaking.
      idempotency_key: `announcement-${announcement.id}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("group post failed", response.status, detail);
    return new Response(JSON.stringify({ sent: 0, error: detail, status: response.status }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Marked only on success, so a failed post can be retried by re-saving the
  // announcement rather than being silently recorded as delivered.
  await admin
    .from("announcements")
    .update({ whatsapp_sent_at: new Date().toISOString() })
    .eq("id", announcement.id);

  return new Response(JSON.stringify({ sent: 1 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
