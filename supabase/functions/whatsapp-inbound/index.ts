import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gateway-secret",
};

/**
 * What to do when somebody writes to the school's number.
 *
 * Stage one deliberately answers nothing personal. Certificate verification is
 * already a public endpoint, help is a menu, and stopping is about this
 * service rather than about the student's record -- so none of it depends on
 * being sure who is holding the phone. The questions that do depend on that
 * (balance, results) come later, and the thinking about how much to say in a
 * chat window belongs with them rather than here.
 *
 * The one rule worth stating: this function never reveals whether a number
 * belongs to a student. Replying differently to a stranger and to a student
 * would turn the number into a way of testing whether somebody attends this
 * school.
 */

/** Minutes a confirmation stays valid. Long enough to type it, short enough
 *  that a stray word tomorrow is not read as today's answer. */
const CONFIRM_WINDOW_MINUTES = 10;

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  if (!gatewaySecret || !gatewayUrl) {
    return new Response(JSON.stringify({ error: "gateway not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only the gateway may report an inbound message. Without this anyone who
  // found the URL could put words into any student's mouth -- including "stop".
  if (req.headers.get("x-gateway-secret") !== gatewaySecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { from, text } = (await req.json().catch(() => ({}))) as {
    from?: string;
    text?: string;
  };
  if (!from || !text) {
    return new Response(JSON.stringify({ error: "from and text are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  const { data: settings } = await admin
    .from("whatsapp_settings")
    .select("enabled, inbound_enabled, inbound_replies_per_hour")
    .eq("id", true)
    .maybeSingle();

  const { data: studentId } = await admin.rpc("whatsapp_student_for_jid", { p_jid: from });

  const body = normalise(text);
  let command: string | null = null;
  let reply: string | null = null;

  const log = async (replied: boolean) => {
    await admin.from("whatsapp_inbound_log").insert({
      from_jid: from,
      student_id: studentId ?? null,
      body: text.slice(0, 2000),
      command,
      replied,
    });
  };

  if (settings && (settings.enabled === false || settings.inbound_enabled === false)) {
    // Recorded but not answered, so turning replies off does not also make the
    // school blind to people trying to reach it.
    command = "inbound_disabled";
    await log(false);
    return new Response(JSON.stringify({ replied: false, reason: "inbound is switched off" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit per number, in a rolling hour.
  const limit = Number(settings?.inbound_replies_per_hour ?? 20);
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("jid, awaiting, awaiting_until, window_started_at, messages_in_window")
    .eq("jid", from)
    .maybeSingle();

  const windowStarted = conversation?.window_started_at
    ? new Date(conversation.window_started_at as string).getTime()
    : 0;
  const freshWindow = Date.now() - windowStarted > 60 * 60 * 1000;
  const count = freshWindow ? 0 : Number(conversation?.messages_in_window ?? 0);

  if (count >= limit) {
    command = "rate_limited";
    await log(false);
    return new Response(JSON.stringify({ replied: false, reason: "rate limited" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const awaiting =
    conversation?.awaiting &&
    conversation.awaiting_until &&
    new Date(conversation.awaiting_until as string).getTime() > Date.now()
      ? String(conversation.awaiting)
      : null;

  let clearAwaiting = true;
  let setAwaiting: { action: string } | null = null;

  const setOptOut = async (optedOut: boolean) => {
    if (!studentId) return;
    const { data: student } = await admin
      .from("students")
      .select("profile_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!student?.profile_id) return;
    await admin
      .from("profiles")
      .update({
        whatsapp_opted_out_at: optedOut ? new Date().toISOString() : null,
        ...(optedOut ? {} : { whatsapp_opted_in_at: new Date().toISOString() }),
      })
      .eq("id", student.profile_id);
  };

  // A pending confirmation takes precedence: the person was asked a question
  // and this is their answer.
  if (awaiting === "stop") {
    if (body === "stop confirm" || body === "confirm" || body === "yes") {
      command = "stop_confirmed";
      await setOptOut(true);
      reply = [
        "*Updated*",
        "",
        "You will no longer receive WhatsApp updates from the school.",
        "",
        "You can turn them back on any time by replying START, or from your",
        "profile in the portal.",
      ].join("\n");
    } else {
      command = "stop_cancelled";
      reply = "No change made — you will keep receiving updates.";
    }
  } else if (/^(stop|unsubscribe|opt out|optout)$/.test(body)) {
    command = "stop_requested";
    if (!studentId) {
      // Said the same way to everyone. Confirming that a number is not on the
      // school's books is still information about that number.
      reply = "No school updates are being sent to this number.";
    } else {
      // Deliberately two steps. "Stop" is a word people type in ordinary
      // conversation, and one of them silently ending a student's results
      // notifications is a failure nobody would notice -- least of all the
      // student, who would simply stop hearing from the school.
      setAwaiting = { action: "stop" };
      clearAwaiting = false;
      reply = [
        "*Stop school updates?*",
        "",
        "This would stop results, payment confirmations and reminders being sent",
        "to this number. Group announcements are separate and would continue.",
        "",
        `Reply *STOP CONFIRM* within ${CONFIRM_WINDOW_MINUTES} minutes to confirm.`,
        "Anything else leaves things as they are.",
      ].join("\n");
    }
  } else if (/^(start|resume|subscribe)$/.test(body)) {
    command = "start";
    if (studentId) await setOptOut(false);
    // Same wording either way, for the same reason as above.
    reply = "School updates are on for this number.";
  } else if (/^(help|menu|hi|hello|\?)$/.test(body)) {
    command = "help";
    reply = [
      "*Spirit Life School of Ministry*",
      "",
      "This number sends automatic updates. It can also answer:",
      "",
      "• *HELP* — this message",
      "• *VERIFY <serial>* — check a certificate",
      "• *STOP* — stop updates to this number",
      "• *START* — turn them back on",
      "",
      appUrl ? `Everything else is in the portal: ${appUrl}` : "",
      "",
      "Messages here are not read by a person.",
    ]
      .filter(Boolean)
      .join("\n");
  } else if (/^(verify|certificate|cert)\s+\S+/.test(body)) {
    command = "verify";
    const serial = text.trim().split(/\s+/).slice(1).join(" ").trim();
    const { data: certificate } = await admin
      .from("certificates")
      .select("serial, student_code_at_issue, issued_at, revoked_at, student_id")
      .ilike("serial", serial)
      .maybeSingle();

    if (!certificate) {
      reply = `No certificate found with serial ${serial}.`;
    } else if (certificate.revoked_at) {
      reply = [`*Certificate ${certificate.serial}*`, "", "This certificate has been revoked and is not valid."].join("\n");
    } else {
      // The same facts the public verification page shows, and nothing more:
      // a serial, that it is genuine, and when it was issued.
      const { data: student } = await admin
        .from("students")
        .select("name_on_certificate, profile_id")
        .eq("id", certificate.student_id)
        .maybeSingle();
      const { data: profile } = student?.profile_id
        ? await admin.from("profiles").select("first_name, last_name").eq("id", student.profile_id).maybeSingle()
        : { data: null };
      const name =
        student?.name_on_certificate ||
        [profile?.first_name, profile?.last_name].map((p) => p?.trim()).filter(Boolean).join(" ") ||
        "a graduate";
      reply = [
        `*Certificate ${certificate.serial}*`,
        "",
        "Valid.",
        `Issued to ${name}`,
        certificate.issued_at
          ? `Issued ${new Date(certificate.issued_at as string).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric" })}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  } else {
    command = null;
    reply = [
      "This number sends automatic updates and is not read by a person.",
      "",
      "Reply *HELP* to see what it can answer.",
      appUrl ? `For anything else, use the portal: ${appUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  let delivered = false;
  if (reply) {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
      body: JSON.stringify({
        to: from,
        text: reply,
        // No idempotency key: a person who sends the same word twice means it
        // twice, and a deduplicated reply would look like being ignored.
      }),
      signal: AbortSignal.timeout(15_000),
    });
    delivered = response.ok;
  }

  await admin.from("whatsapp_conversations").upsert(
    {
      jid: from,
      awaiting: setAwaiting ? setAwaiting.action : clearAwaiting ? null : conversation?.awaiting ?? null,
      awaiting_until: setAwaiting
        ? new Date(Date.now() + CONFIRM_WINDOW_MINUTES * 60_000).toISOString()
        : null,
      window_started_at: freshWindow ? new Date().toISOString() : conversation?.window_started_at ?? new Date().toISOString(),
      messages_in_window: count + 1,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "jid" },
  );

  await log(delivered);

  return new Response(JSON.stringify({ command, replied: delivered }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
