import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Tell the admins something happened, over WhatsApp.
 *
 * This is the spine for the admin-only alerts: a caller names an *event*, not a
 * message and not a recipient. The text is composed here from the database, and
 * the destination comes from configuration. That is what makes it safe to leave
 * open to pg_cron and to table triggers, which cannot hold a secret -- the most
 * an unauthorised caller can achieve is to make the school's own admins receive
 * an alert about a real payment that really was submitted, and even that is
 * deduplicated by the gateway.
 *
 * It deliberately does not accept `text`. The moment it does, it becomes an
 * open relay for sending WhatsApp messages as the school.
 */

type Kind = "payment_submitted" | "admissions_digest";

type Alert = {
  /** Lines of the message, joined with newlines. */
  lines: string[];
  /** Passed through to the gateway. Present whenever the alert concerns one
   *  student, which also means a misconfigured group JID in ADMIN_WHATSAPP_JIDS
   *  is refused by the gateway rather than leaking their details to everyone. */
  studentId: string | null;
  /** Stable across retries, so pg_net firing twice does not alert twice. */
  idempotencyKey: string;
};

/** Nigerian Naira, grouped. WhatsApp has no formatting, so the message has to
 *  carry its own legibility. */
function naira(amount: number | string | null): string {
  const value = Number(amount ?? 0);
  return "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

/** Names in `profiles` carry stray leading and trailing spaces from
 *  registration, which render as gaps mid-sentence once joined. Trim each part
 *  rather than the result, so "Adebisi  Oluwafemi " does not become
 *  "Adebisi  Oluwafemi". */
function fullName(profile: { first_name?: string; last_name?: string } | null): string {
  if (!profile) return "Unknown student";
  const parts = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.join(" ") || "Unknown student";
}

async function buildPaymentSubmitted(
  admin: ReturnType<typeof createClient>,
  paymentId: string,
): Promise<Alert | null> {
  // Column names here are the live table's, which has moved on from the
  // migration that created it: amount_paid not amount, payment_proof_url not
  // receipt_url, and a status enum in UPPERCASE. A lowercase 'pending'
  // comparison silently matches nothing.
  const { data: payment, error } = await admin
    .from("payments")
    .select(
      "id, student_id, student_fee_id, fee_id, amount_paid, payment_type, " +
        "payment_proof_url, admin_notes, status, is_manual_record, created_at",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw new Error(`payment lookup failed: ${error.message}`);

  // Not an error. The row can legitimately be gone by the time this runs -- a
  // payment deleted straight after submission, or a replayed call naming an old
  // id. Silence is the right response to an event that no longer exists.
  if (!payment) return null;

  // Only ever announce a submission awaiting review. The trigger fires on
  // insert, but a retry could arrive after an admin has already verified or
  // rejected it, and "awaiting your review" would then be wrong.
  if (payment.status !== "PENDING") return null;

  // A payment an admin keyed in themselves is not news to admins.
  if (payment.is_manual_record) return null;

  const { data: student } = await admin
    .from("students")
    .select("student_code, profile_id")
    .eq("id", payment.student_id)
    .maybeSingle();

  const { data: profile } = student?.profile_id
    ? await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", student.profile_id)
        .maybeSingle()
    : { data: null };

  // What the money is for lives on the fee, not the payment.
  const feeId = payment.student_fee_id ?? payment.fee_id;
  const { data: fee } = feeId
    ? await admin
        .from("fees")
        .select("fee_type, amount_due, amount_paid")
        .eq("id", feeId)
        .maybeSingle()
    : { data: null };

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  const lines = [
    "*New payment receipt*",
    "",
    `${fullName(profile)}${student?.student_code ? ` (${student.student_code})` : ""}`,
    `${fee?.fee_type ?? "Payment"} — ${naira(payment.amount_paid)}${
      payment.payment_type === "PART" ? " (part payment)" : ""
    }`,
  ];

  // The outstanding figure is the one that decides whether this clears the fee,
  // and it is the thing an admin would otherwise open the portal to work out.
  if (fee?.amount_due != null) {
    const outstanding = Number(fee.amount_due) - Number(fee.amount_paid ?? 0);
    if (outstanding > 0) lines.push(`Outstanding before this: ${naira(outstanding)}`);
  }

  if (payment.admin_notes) lines.push(`Note: ${payment.admin_notes}`);
  if (!payment.payment_proof_url) lines.push("_No proof of payment attached._");

  lines.push("", "Awaiting your review.");
  if (appUrl) lines.push(`${appUrl}/admin/payments`);

  return {
    lines,
    studentId: payment.student_id,
    // Keyed on the payment, not on the moment: the same receipt announced twice
    // is the exact duplicate this prevents.
    idempotencyKey: `payment_submitted-${payment.id}`,
  };
}

/** Whole days since a timestamp, for "waiting 3 days". */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** How long a queue entry has waited, phrased for a glance. */
function waited(iso: string | null): string {
  const days = daysSince(iso);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Keeps a digest readable on a phone. A list of forty names is a list nobody
 *  reads, and the count above it is the part that actually prompts action. */
function capped(items: string[], limit = 8): string[] {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `_…and ${items.length - limit} more_`];
}

async function buildAdmissionsDigest(
  admin: ReturnType<typeof createClient>,
): Promise<Alert | null> {
  // The admissions screen is three queues, not one -- an application, a
  // certificate name change and a learning-mode change each wait for a
  // different decision, and each is invisible until somebody opens the page.
  // A digest that covered only the first would quietly let the other two rot.
  //
  // `admission_status` is matched in both casings because the screen itself
  // does: the column holds 'Pending' on some rows and 'PENDING' on others, and
  // picking one would hide half the queue.
  const nameSelect =
    "id, created_at, pending_name_change, name_on_certificate, " +
    "requested_learning_mode, learning_mode, " +
    "profile:profiles(first_name, last_name)";

  const [applications, nameChanges, modeChanges] = await Promise.all([
    admin
      .from("students")
      .select(nameSelect)
      .eq("is_staff_preview", false)
      .in("admission_status", ["Pending", "PENDING"])
      .order("created_at", { ascending: true }),
    admin
      .from("students")
      .select(nameSelect)
      .eq("is_staff_preview", false)
      .not("pending_name_change", "is", null)
      .order("created_at", { ascending: true }),
    admin
      .from("students")
      .select(nameSelect)
      .eq("is_staff_preview", false)
      .not("requested_learning_mode", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  for (const result of [applications, nameChanges, modeChanges]) {
    if (result.error) throw new Error(`admissions lookup failed: ${result.error.message}`);
  }

  const apps = applications.data ?? [];
  const names = nameChanges.data ?? [];
  const modes = modeChanges.data ?? [];

  // Say nothing when there is nothing to do. A daily "no pending admissions"
  // is a message that teaches its reader to stop looking at messages, and the
  // one day it matters it will be skimmed past with the rest.
  if (apps.length + names.length + modes.length === 0) return null;

  const who = (row: Record<string, unknown>) =>
    fullName(row.profile as { first_name?: string; last_name?: string } | null);

  const lines: string[] = ["*Admissions awaiting review*"];

  if (apps.length > 0) {
    lines.push("", `New applications — ${apps.length}`);
    lines.push(
      ...capped(apps.map((a) => `• ${who(a)} — ${waited(a.created_at as string)}`)),
    );
  }

  if (names.length > 0) {
    lines.push("", `Certificate name changes — ${names.length}`);
    lines.push(
      ...capped(
        names.map(
          (n) =>
            `• ${who(n)} — "${n.name_on_certificate ?? "—"}" → "${n.pending_name_change}"`,
        ),
      ),
    );
  }

  if (modes.length > 0) {
    lines.push("", `Learning mode changes — ${modes.length}`);
    lines.push(
      ...capped(
        modes.map(
          (m) => `• ${who(m)} — ${m.learning_mode ?? "—"} → ${m.requested_learning_mode}`,
        ),
      ),
    );
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  if (appUrl) lines.push("", `${appUrl}/admin/admissions`);

  return {
    lines,
    // A digest is about the school, not about one student, so no student_id --
    // and with none set, the gateway's group guard does not apply. That is
    // correct here and must stay deliberate: this message names applicants, so
    // it still goes only to ADMIN_WHATSAPP_JIDS, never to a group.
    studentId: null,
    // Keyed to the day: pg_cron retrying within the day must not send twice,
    // but tomorrow's digest is a new message.
    idempotencyKey: `admissions_digest-${new Date().toISOString().slice(0, 10)}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  const recipients = (Deno.env.get("ADMIN_WHATSAPP_JIDS") ?? "")
    .split(",")
    .map((jid) => jid.trim())
    .filter(Boolean);

  if (!gatewayUrl || !gatewaySecret) {
    return new Response(
      JSON.stringify({ error: "GATEWAY_URL and GATEWAY_SECRET must be set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (recipients.length === 0) {
    // Not a failure of the caller, and not worth retrying. Logged loudly so a
    // silent "nobody is being told anything" is visible in the function logs.
    console.error("ADMIN_WHATSAPP_JIDS is empty -- no admin alerts will be sent");
    return new Response(JSON.stringify({ sent: 0, reason: "no recipients configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const { kind, payment_id } = body as { kind?: Kind; payment_id?: string };

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  let alert: Alert | null = null;
  try {
    switch (kind) {
      case "payment_submitted":
        if (!payment_id) {
          return new Response(JSON.stringify({ error: "payment_id is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        alert = await buildPaymentSubmitted(admin, payment_id);
        break;
      case "admissions_digest":
        alert = await buildAdmissionsDigest(admin);
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown kind: ${kind}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("composing alert failed", err);
    return new Response(
      JSON.stringify({ error: "could not compose alert", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!alert) {
    return new Response(JSON.stringify({ sent: 0, reason: "nothing to report" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = alert.lines.join("\n");
  const results: { to: string; ok: boolean; status: number; detail?: string }[] = [];

  for (const to of recipients) {
    try {
      const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gateway-secret": gatewaySecret,
        },
        body: JSON.stringify({
          to,
          text,
          student_id: alert.studentId,
          // Per recipient: two admins must each get their copy, and only a
          // repeat to the *same* admin is a duplicate.
          idempotency_key: `${alert.idempotencyKey}-${to}`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      results.push({
        to,
        ok: response.ok,
        status: response.status,
        detail: response.ok ? undefined : await response.text(),
      });
    } catch (err) {
      results.push({ to, ok: false, status: 0, detail: String(err) });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  if (sent < recipients.length) console.error("some admin alerts failed", results);

  return new Response(JSON.stringify({ sent, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
