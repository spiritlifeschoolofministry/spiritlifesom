import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Chase the numbers that cannot be used, so they stop being invisible.
 *
 * A student whose number cannot be read is not told anything and does not know
 * it: from where they sit the school has simply gone quiet. Nothing fails, no
 * error is raised, and the gap only surfaces when they complain months later
 * about a result they never received.
 *
 * Two shapes of problem, handled differently because only one of them can be
 * asked:
 *
 *   ambiguous  more than one number in the field -- "0706... / 0915..." is one
 *              person with two phones, which is a reasonable thing to write and
 *              impossible for a machine to choose between. Both numbers came
 *              from the student, so both can be written to, and the person can
 *              settle it in a way no rule could.
 *
 *   unusable   nothing readable at all. There is nowhere to send the question,
 *              so it goes to the admins instead.
 */

/** Long enough that nobody is nagged, short enough that it is not forgotten. */
const ASK_AGAIN_AFTER_DAYS = 14;

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

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: settings } = await admin
    .from("whatsapp_settings")
    .select("enabled, notify_number_fix, admin_jids")
    .eq("id", true)
    .maybeSingle();

  if (settings && (settings.enabled === false || settings.notify_number_fix === false)) {
    return new Response(JSON.stringify({ sent: 0, reason: "number checks are switched off" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  const send = async (to: string, text: string, key: string, studentId: string | null) => {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
      body: JSON.stringify({ to, text, idempotency_key: key, student_id: studentId }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  };

  // Everyone whose number needs attention. The opt-out is honoured here even
  // though these people have no usable address: somebody who asked not to be
  // messaged has not asked to be messaged about why they cannot be messaged.
  const { data: broken, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, phone, whatsapp_number_issue, whatsapp_number_asked_at")
    .not("whatsapp_number_issue", "is", null)
    .is("whatsapp_opted_out_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: `lookup failed: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cutoff = Date.now() - ASK_AGAIN_AFTER_DAYS * 24 * 60 * 60 * 1000;
  let asked = 0;
  const unusable: string[] = [];

  for (const profile of broken ?? []) {
    const name =
      [profile.first_name, profile.last_name].map((p) => p?.trim()).filter(Boolean).join(" ") ||
      "Unknown";

    // Students only: a staff member with a bad number is a different
    // conversation, and one that can be had in the office.
    const { data: student } = await admin
      .from("students")
      .select("id, is_staff_preview")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!student || student.is_staff_preview) continue;

    if (profile.whatsapp_number_issue !== "ambiguous") {
      unusable.push(`• ${name} — ${profile.phone ?? "no number"}`);
      continue;
    }

    const recentlyAsked =
      profile.whatsapp_number_asked_at &&
      new Date(profile.whatsapp_number_asked_at as string).getTime() > cutoff;
    if (recentlyAsked) continue;

    const { data: candidates } = await admin.rpc("whatsapp_msisdn_candidates", {
      raw: profile.phone,
    });
    const numbers = (candidates ?? []) as string[];
    if (numbers.length < 2) continue;

    // Written to be understood by someone who has no idea why they are getting
    // it, and asking for exactly one action. No personal data beyond their own
    // name: until the right number is known, every one of these is a number
    // that might belong to somebody else.
    const readable = numbers.map((n) => `+${n}`).join(" and ");
    const text = [
      "*Which number should we use?*",
      "",
      `Hello ${profile.first_name?.trim() || "there"},`,
      "",
      `Your student profile lists ${readable}, so we are not sure which one to send`,
      "school updates to — results, payment confirmations and reminders.",
      "",
      "Please open your profile and leave only the number you want us to use.",
      appUrl ? `${appUrl}/student/profile` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let delivered = false;
    for (const number of numbers) {
      const ok = await send(
        `${number}@s.whatsapp.net`,
        text,
        `number_check-${profile.id}-${number}`,
        student.id as string,
      );
      delivered = delivered || ok;
    }

    if (delivered) {
      await admin
        .from("profiles")
        .update({ whatsapp_number_asked_at: new Date().toISOString() })
        .eq("id", profile.id);
      asked += 1;
    }
  }

  // Whatever could not be asked, the admins are told about -- once a run, and
  // only when there is something to say.
  let reported = 0;
  const recipients = (settings?.admin_jids ?? []) as string[];
  if (unusable.length > 0 && recipients.length > 0) {
    const lines = [
      `*${unusable.length} student number${unusable.length === 1 ? "" : "s"} cannot be used*`,
      "",
      "These students receive nothing over WhatsApp and have no way of knowing it.",
      "",
      ...unusable.slice(0, 15),
      ...(unusable.length > 15 ? [`_…and ${unusable.length - 15} more_`] : []),
      "",
      "Correct the number on their profile and messages resume automatically.",
    ];
    if (appUrl) lines.push(`${appUrl}/admin/students`);

    for (const to of recipients) {
      const ok = await send(
        to,
        lines.join("\n"),
        `number_issues-${new Date().toISOString().slice(0, 10)}-${to}`,
        null,
      );
      if (ok) reported += 1;
    }
  }

  return new Response(JSON.stringify({ asked, unusable: unusable.length, reported }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
