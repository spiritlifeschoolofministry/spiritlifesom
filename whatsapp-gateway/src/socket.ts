import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { useSupabaseAuthState, clearAuthState } from "./auth-state.js";

/**
 * The WhatsApp connection, and the rules for keeping it up.
 *
 * Reconnecting is the whole job here, and it is the part that gets a number
 * banned when done naively. Two rules matter:
 *
 *   - Never reconnect after a loggedOut. Those credentials are dead; retrying
 *     with them is a stream of failed authentications from one number, which is
 *     indistinguishable from an attack. The session is cleared and a human is
 *     asked to re-pair.
 *   - Back off. A tight retry loop against a WhatsApp outage looks the same
 *     way. Delay grows to a cap, so a long outage costs a handful of attempts
 *     rather than thousands.
 */

const logger = pino({ level: env.logLevel });

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Connection = "open" | "connecting" | "closed" | "qr";

type GatewayState = {
  sock: WASocket | null;
  connection: Connection;
  jid: string | null;
  /** The same account's anonymous id. Groups may address participants by LID
   *  rather than phone number -- see GroupMetadata.addressingMode -- and in
   *  those groups our phone JID appears nowhere in the participant list. */
  lid: string | null;
  lastError: string | null;
  reconnectCount: number;
  /** Data-URL PNG of the current pairing QR, when one is outstanding. Held in
   *  memory only: it is short-lived by design, and a QR that outlives its own
   *  validity in a database row is a way to pair the school's number to the
   *  wrong device. */
  qr: string | null;
  /** Set once a logged-out state is seen, so the supervisor stops trying and
   *  the health check can say "needs a human" rather than "reconnecting". */
  needsPairing: boolean;
};

export const state: GatewayState = {
  sock: null,
  connection: "closed",
  jid: null,
  lid: null,
  lastError: null,
  reconnectCount: 0,
  qr: null,
  needsPairing: false,
};

/** Mirrors in-process state to the row the scheduled check reads.
 *  Best-effort: a failure to report is not a reason to drop a working socket,
 *  so it is logged and swallowed. Staleness of last_seen_at is what the check
 *  ultimately relies on, and that is unaffected. */
async function report(): Promise<void> {
  try {
    const { error } = await supabase.from("whatsapp_gateway_status").upsert(
      {
        id: true,
        connection: state.connection,
        jid: state.jid,
        last_seen_at: new Date().toISOString(),
        last_error: state.lastError,
        reconnect_count: state.reconnectCount,
      },
      { onConflict: "id" },
    );
    if (error) logger.warn({ err: error.message }, "status report failed");
  } catch (err) {
    logger.warn({ err }, "status report threw");
  }
}

export const reportStatus = report;

/** Exponential backoff, capped at five minutes. */
function backoffMs(attempt: number): number {
  return Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attempt, 8));
}

export async function connect(): Promise<void> {
  const { state: authState, saveCreds } = await useSupabaseAuthState(supabase);

  state.connection = "connecting";
  await report();

  const sock = makeWASocket({
    auth: {
      creds: authState.creds,
      // Signal keys are read repeatedly while decrypting a conversation.
      // Without this cache every read is a Supabase round trip, which turns
      // normal traffic into a latency problem and a quota problem at once.
      keys: makeCacheableSignalKeyStore(authState.keys, logger),
    },
    logger,
    // The pairing QR is served over HTTP instead, so it can be scanned from
    // wherever the phone is rather than from a Render log tail.
    printQRInTerminal: false,
    browser: [env.deviceName, "Chrome", "1.0.0"],
    // Baileys gives the first QR 60 seconds and every one after it only 20,
    // then gives up with "QR refs attempts ended" and needs a restart. Twenty
    // seconds is not enough for a person who is opening a link, unlocking a
    // phone and finding Linked devices, so the window closes while they are
    // still walking towards it. Two minutes per code makes pairing something
    // you do rather than something you race.
    qrTimeout: 120_000,
    // Nothing here reads chat history, and syncing it on every reconnect costs
    // minutes of bandwidth and a large memory spike for no benefit.
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  state.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.qr = await QRCode.toDataURL(qr);
      state.connection = "qr";
      state.needsPairing = true;
      logger.warn("pairing QR issued -- scan it at GET /qr");
      await report();
    }

    if (connection === "open") {
      state.connection = "open";
      state.jid = sock.user?.id ?? null;
      state.lid = sock.user?.lid ?? null;
      state.lastError = null;
      state.qr = null;
      state.needsPairing = false;
      // Reset only on a *successful* open. Resetting on each attempt would
      // defeat the backoff and produce the tight loop it exists to prevent.
      state.reconnectCount = 0;
      logger.info({ jid: state.jid }, "connected");
      await report();
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      state.connection = "closed";
      state.lastError =
        lastDisconnect?.error?.message ?? `closed with status ${statusCode}`;
      logger.error({ statusCode, loggedOut }, "connection closed");

      if (loggedOut) {
        // The pairing was revoked -- from the phone, or by WhatsApp. Retrying
        // cannot succeed, so stop, drop the dead credentials, and wait for a
        // human to scan a new QR.
        state.needsPairing = true;
        state.connection = "qr";
        await clearAuthState(supabase).catch((err) =>
          logger.error({ err }, "failed to clear revoked session"),
        );
        await report();
        return;
      }

      state.reconnectCount += 1;
      const delay = backoffMs(state.reconnectCount);
      await report();
      logger.info({ delay, attempt: state.reconnectCount }, "reconnecting");
      setTimeout(() => {
        connect().catch((err) => logger.error({ err }, "reconnect failed"));
      }, delay);
    }
  });
}

/** True only when a send can actually succeed. */
export function canSend(): boolean {
  return state.connection === "open" && state.sock !== null;
}
