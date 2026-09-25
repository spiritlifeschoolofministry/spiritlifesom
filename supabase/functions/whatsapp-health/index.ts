import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Keep the WhatsApp gateway awake, and notice when it is not.
 *
 * Two jobs in one call, because they want the same request:
 *
 *   1. Ping it. Render cycles an idle web service, and a cycled container takes
 *      the Baileys socket with it. Regular traffic keeps the instance warm.
 *   2. Judge it. A Baileys socket does not fail loudly: it closes, and the
 *      process carries on answering HTTP perfectly well while sending nothing.
 *      So "responded 200" is not health. Two things are checked instead --
 *      whether the socket reports itself open, and whether the status row is
 *      still being written -- because each catches what the other misses. A
 *      closed socket in a live process fails the first; a process that died
 *      outright fails the second.
 *
 * The alert goes out by **email**, not WhatsApp. The thing being reported on is
 * the only thing that could deliver a WhatsApp alert, so sending one would mean
 * the message that matters most is the one guaranteed not to arrive.
 */

/** How long a status row may go unwritten before the process is presumed dead.
 *  The gateway writes every 60s, so three missed heartbeats. Tight enough to
 *  catch a crash within a cron interval, loose enough that one slow write or a
 *  redeploy does not page anyone. */
const STALE_AFTER_MS = 4 * 60 * 1000;

/** How long to stay quiet after an outage email. The check runs every five
 *  minutes; without this a night-long outage would send over a hundred
 *  identical emails and teach the reader to ignore all of them. One per hour
 *  keeps the outage visible without burying it. */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

type GatewayStatus = {
  connection: string;
  jid: string | null;
  canSend: boolean;
  needsPairing: boolean;
  reconnectCount: number;
  lastError: string | null;
};

type Verdict = {
  healthy: boolean;
  /** Present only when unhealthy. Leads the alert, so it is written to be read
   *  on a phone at 6am: what is wrong, and whether a human must act. */
  problem?: string;
  needsHuman: boolean;
};

function judge(
  status: GatewayStatus | null,
  reachable: boolean,
  lastSeenAt: string | null,
): Verdict {
  if (!reachable) {
    return {
      healthy: false,
      problem: "The gateway did not respond. The Render service is down or restarting.",
      needsHuman: false,
    };
  }

  if (status?.needsPairing) {
    return {
      healthy: false,
      problem:
        "The WhatsApp session was logged out. Nothing will send until someone " +
        "scans a new pairing QR at the gateway's /qr page.",
      needsHuman: true,
    };
  }

  const stale =
    lastSeenAt !== null &&
    Date.now() - new Date(lastSeenAt).getTime() > STALE_AFTER_MS;
  if (stale) {
    return {
      healthy: false,
      problem:
        `The gateway last reported at ${lastSeenAt}. The process is answering ` +
        "HTTP but no longer updating its status, which usually means a stuck socket.",
      needsHuman: false,
    };
  }

  if (!status?.canSend) {
    return {
      healthy: false,
      problem:
        `The WhatsApp socket is '${status?.connection ?? "unknown"}', not open. ` +
        `Last error: ${status?.lastError ?? "none reported"}.`,
      needsHuman: false,
    };
  }

  // Climbing reconnects with an open socket means it is flapping -- connecting,
  // dropping, connecting again. Worth knowing before WhatsApp draws its own
  // conclusion about a number that behaves this way.
  if (status.reconnectCount >= 10) {
    return {
      healthy: false,
      problem:
        `The socket is open but has reconnected ${status.reconnectCount} times ` +
        "since it last settled. A flapping session risks the number being blocked.",
      needsHuman: false,
    };
  }

  return { healthy: true, needsHuman: false };
}

async function alert(verdict: Verdict, status: GatewayStatus | null): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("GATEWAY_ALERT_EMAIL") ?? "spiritlifeschoolofministry@gmail.com";
  if (!RESEND_API_KEY) {
    console.error("cannot alert: RESEND_API_KEY not set");
    return;
  }

  const subject = verdict.needsHuman
    ? "WhatsApp gateway needs re-pairing"
    : "WhatsApp gateway is down";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Spirit Life SOM <onboarding@resend.dev>",
      to,
      subject,
      html: `
        <p>${verdict.problem}</p>
        <p style="color:#666;font-size:13px">
          Connection: ${status?.connection ?? "unreachable"}<br>
          Paired number: ${status?.jid ?? "none"}<br>
          Reconnects since last settled: ${status?.reconnectCount ?? "n/a"}<br>
          Checked at ${new Date().toISOString()}
        </p>`,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  if (!gatewayUrl || !gatewaySecret) {
    return new Response(
      JSON.stringify({ error: "GATEWAY_URL and GATEWAY_SECRET must be set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let status: GatewayStatus | null = null;
  let reachable = false;

  try {
    // Short timeout: this runs on a schedule, and a gateway that takes longer
    // than this to answer is already failing as far as sending is concerned.
    const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/status`, {
      headers: { "x-gateway-secret": gatewaySecret },
      signal: AbortSignal.timeout(10_000),
    });
    reachable = response.ok;
    if (response.ok) status = await response.json();
  } catch (err) {
    console.error("gateway unreachable", err);
  }

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: row } = await admin
    .from("whatsapp_gateway_status")
    .select("last_seen_at, last_alert_at")
    .eq("id", true)
    .maybeSingle();

  const verdict = judge(status, reachable, row?.last_seen_at ?? null);

  let alerted = false;
  if (!verdict.healthy) {
    const lastAlert = row?.last_alert_at ? new Date(row.last_alert_at).getTime() : 0;
    // A session that was logged out always alerts on its first sighting and
    // then follows the same cooldown: it is the one failure no amount of
    // waiting fixes, so it must not be lost among repeats of a transient one.
    if (Date.now() - lastAlert > ALERT_COOLDOWN_MS) {
      await alert(verdict, status);
      alerted = true;
      await admin
        .from("whatsapp_gateway_status")
        .update({ last_alert_at: new Date().toISOString() })
        .eq("id", true);
    }
  } else if (row?.last_alert_at) {
    // Recovered. Clearing this means the next outage alerts immediately rather
    // than waiting out a cooldown left over from the previous one.
    await admin
      .from("whatsapp_gateway_status")
      .update({ last_alert_at: null })
      .eq("id", true);
  }

  return new Response(JSON.stringify({ ...verdict, alerted, status }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
