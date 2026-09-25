import express from "express";
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { state, canSend, reportStatus } from "./socket.js";

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * The line appended to everything this gateway sends.
 *
 * Applied here rather than in each caller, because "every message says who sent
 * it" is only true if it is impossible to forget -- and a rule enforced at the
 * last point before the wire cannot be forgotten by whatever is written next.
 *
 * A message from the school's own number is indistinguishable from one a person
 * typed. Students should know nobody is reading the reply they are about to
 * send, and the school should not appear to have personally written a fee
 * reminder at seven on a Monday morning.
 *
 * Cached for a minute: this is read on every send, and the wording changes
 * about once a year.
 */
let signature: string | null = null;
let signatureFetchedAt = 0;
const SIGNATURE_TTL_MS = 60_000;

async function currentSignature(): Promise<string> {
  if (signature !== null && Date.now() - signatureFetchedAt < SIGNATURE_TTL_MS) {
    return signature;
  }
  try {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("message_signature")
      .eq("id", true)
      .maybeSingle();
    signature = data?.message_signature ?? "";
    signatureFetchedAt = Date.now();
  } catch {
    // An unreachable database must not stop an alert going out. Falling back to
    // the last known value -- or to nothing on a cold start -- is better than
    // failing the send.
    signature ??= "";
  }
  return signature ?? "";
}

export const app = express();
app.use(express.json({ limit: "256kb" }));

/** Constant-time comparison, so the secret cannot be recovered a byte at a time
 *  by timing repeated requests. */
function secretMatches(provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.gatewaySecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when the caller presented the pairing token, which opens the QR page
 *  and nothing else. Compared in constant time like the main secret, and
 *  refused outright when no token is configured -- so an empty or unset
 *  PAIRING_TOKEN cannot be satisfied by an empty query parameter. */
function pairingTokenMatches(provided: unknown): boolean {
  if (!env.pairingToken || typeof provided !== "string" || provided === "") {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(env.pairingToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireSecret(req: Request, res: Response, next: NextFunction): void {
  if (!secretMatches(req.header("x-gateway-secret"))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/**
 * Liveness, for Render's own health check and for the scheduled ping.
 *
 * Deliberately unauthenticated and deliberately dumb: it answers 200 whenever
 * the process is up, which is exactly what Render needs to decide whether to
 * restart the container. It says nothing about the WhatsApp socket -- see
 * /status for that, and note that a process answering 200 here while its socket
 * is closed is the precise failure the status row exists to expose.
 */
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/**
 * What the socket is actually doing.
 *
 * Authenticated, because it names the paired number and the last error, and
 * both are more than an anonymous caller needs.
 */
app.get("/status", requireSecret, async (_req, res) => {
  // Touch last_seen_at on every poll. The scheduled check reads staleness to
  // detect a dead process, and a gateway that is up but idle must keep proving
  // it, or it will be reported as dead the moment traffic goes quiet.
  await reportStatus();
  res.json({
    connection: state.connection,
    jid: state.jid,
    canSend: canSend(),
    needsPairing: state.needsPairing,
    reconnectCount: state.reconnectCount,
    lastError: state.lastError,
  });
});

/**
 * The pairing QR, as a scannable page.
 *
 * Authenticated: whoever scans this QR links a device to the school's WhatsApp
 * account, so an open endpoint here would hand the school's number to anyone
 * who loaded the URL at the wrong moment.
 */
app.get("/qr", (req, res) => {
  // Either credential opens this page: the gateway secret, for scripts, or the
  // pairing token, for a link someone can open on the machine next to the
  // phone. Nothing else in the API accepts the token.
  const authorised =
    secretMatches(req.header("x-gateway-secret")) ||
    pairingTokenMatches(req.query.token);
  if (!authorised) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!state.qr) {
    res
      .status(409)
      .json({ error: "no pairing in progress", connection: state.connection });
    return;
  }
  res.type("html").send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
     <body style="display:grid;place-items:center;min-height:100vh;margin:0;font-family:system-ui;background:#111;color:#eee">
       <div style="text-align:center">
         <h1 style="font-size:1rem;font-weight:600">Link SLSOM Gateway</h1>
         <img src="${state.qr}" width="320" height="320" alt="WhatsApp pairing QR code"
              style="background:#fff;padding:12px;border-radius:12px">
         <p style="opacity:.7;font-size:.85rem;max-width:320px">
           WhatsApp &rarr; Settings &rarr; Linked devices &rarr; Link a device.
           This code expires in about a minute; reload for a fresh one.
         </p>
       </div>
     </body>`,
  );
});

/**
 * The groups this number belongs to.
 *
 * WhatsApp shows a group's name everywhere and its id nowhere, so there is no
 * way to copy a JID off a phone. Without this, wiring the official group up
 * means guessing, and a wrong guess sends school announcements to whichever
 * chat the id happened to belong to.
 *
 * Authenticated, and read-only: it lists what the number is already in. It
 * cannot join, leave or post.
 */
app.get("/groups", requireSecret, async (_req, res) => {
  if (!canSend()) {
    res.status(503).json({ error: "gateway not connected", connection: state.connection });
    return;
  }
  try {
    const groups = await state.sock!.groupFetchAllParticipating();

    // Identifying ourselves in a participant list is not as simple as matching
    // our number, for two reasons:
    //
    //  - Baileys appends a device suffix to sock.user.id
    //    ("2349165822262:4@s.whatsapp.net") that participant ids do not carry.
    //  - A group may address its members by LID rather than phone number (see
    //    GroupMetadata.addressingMode). In those groups our phone JID appears
    //    nowhere at all, and matching on it silently reports us as a non-admin
    //    -- which reads exactly like "you were never promoted".
    //
    // So: compare the local part only, against both of our identities, and
    // against both identities a participant may be listed under.
    const localPart = (value: string | null | undefined) =>
      (value ?? "").split("@")[0].split(":")[0];
    const mine = new Set([localPart(state.jid), localPart(state.lid)].filter(Boolean));

    const rows = Object.values(groups).map((group) => {
      const self = group.participants?.find(
        (p) => mine.has(localPart(p.id)) || mine.has(localPart(p.lid)),
      );
      return {
        jid: group.id,
        subject: group.subject,
        participants: group.participants?.length ?? 0,
        // Announcement groups are the ones where only admins may post, which is
        // usually exactly what an "official" school group is.
        announceOnly: group.announce ?? false,
        // 'pn' means members are listed by phone number, 'lid' by anonymous id.
        addressingMode: group.addressingMode ?? "pn",
        // In an announce-only group a non-admin cannot post at all, and the
        // failure is quiet. Better to know before wiring anything to it than to
        // find out from an announcement that never arrived.
        iAmAdmin: self?.admin === "admin" || self?.admin === "superadmin",
        canPost: !(group.announce ?? false) || self?.admin === "admin" || self?.admin === "superadmin",
      };
    });
    rows.sort((a, b) => b.participants - a.participants);
    res.json({ count: rows.length, groups: rows });
  } catch (err) {
    res.status(502).json({
      error: "could not list groups",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Recent idempotency keys.
 *
 * Every caller that retries -- pg_cron re-firing, an Edge Function retried
 * after a timeout -- can send the same message twice. For a fee reminder that
 * means a student reading "you owe N45,000" three times, which reads as
 * dunning rather than as a bug. Callers pass a stable key and a repeat is
 * acknowledged without sending.
 *
 * In-memory on purpose: it guards against retry storms over minutes, not
 * against a redeploy hours later, and the gateway runs as a single instance
 * because a Baileys session cannot be shared across two.
 */
const seen = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

function alreadySent(key: string | undefined): boolean {
  if (!key) return false;
  const now = Date.now();
  for (const [k, at] of seen) {
    if (now - at > IDEMPOTENCY_TTL_MS) seen.delete(k);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

type SendBody = {
  to?: string;
  text?: string;
  idempotency_key?: string;
  student_id?: string;
};

/**
 * Send one message.
 *
 * The guard below is the one rule worth enforcing in code rather than in
 * review: anything carrying a student_id is personal -- a balance, a score, a
 * rejected receipt -- and must never reach a group. The official group contains
 * staff and every other student, and its membership is maintained by hand in
 * WhatsApp, entirely outside this system's access control. A copy-pasted
 * workflow six months from now will not remember that. This will.
 */
app.post("/send", requireSecret, async (req, res) => {
  const { to, text, idempotency_key, student_id } = req.body as SendBody;

  if (!to || !text) {
    res.status(400).json({ error: "to and text are required" });
    return;
  }

  const isGroup = to.endsWith("@g.us");
  if (isGroup && student_id) {
    res.status(422).json({
      error: "refusing to send student-specific content to a group",
      detail:
        "A payload carrying student_id is personal data. Send it to the student's own JID.",
    });
    return;
  }

  if (!canSend()) {
    // 503, not 500: this is temporary and retryable, and the caller should be
    // able to tell the difference between "the line is down" and "the request
    // was wrong".
    res.status(503).json({
      error: "gateway not connected",
      connection: state.connection,
      needsPairing: state.needsPairing,
    });
    return;
  }

  if (alreadySent(idempotency_key)) {
    res.json({ ok: true, deduplicated: true });
    return;
  }

  try {
    // Appended unless the caller already ended with it, so a retry that passes
    // back a previously-signed body does not sign it twice.
    const suffix = await currentSignature();
    const body = suffix && !text.trimEnd().endsWith(suffix.trim()) ? `${text}${suffix}` : text;
    const result = await state.sock!.sendMessage(to, { text: body });
    res.json({ ok: true, id: result?.key?.id ?? null });
  } catch (err) {
    res.status(502).json({
      error: "send failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
