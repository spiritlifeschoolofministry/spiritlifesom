import { app } from "./server.js";
import { connect, reportStatus } from "./socket.js";
import { env } from "./env.js";

/**
 * Boot order matters.
 *
 * HTTP comes up first and the WhatsApp socket connects behind it. Render marks
 * a deploy live on its health check, and a socket that is still negotiating --
 * or waiting for someone to scan a QR -- would otherwise fail that check and
 * get the container killed and restarted, forever. The gateway is therefore
 * "healthy" as a process as soon as it can answer, and whether it can actually
 * send is reported separately.
 */

const server = app.listen(env.port, () => {
  console.log(`gateway listening on :${env.port}`);

  connect().catch((err) => {
    // A first connect that throws is usually a bad SUPABASE_SERVICE_ROLE_KEY or
    // an unreachable database -- both fatal and both worth exiting for, so
    // Render restarts rather than leaving a gateway that will never send.
    console.error("initial connect failed", err);
    process.exit(1);
  });
});

/**
 * Keep the status row warm.
 *
 * The scheduled check treats a stale last_seen_at as a dead gateway. Socket
 * events alone do not refresh it -- a healthy, idle connection can go hours
 * without one -- so a quiet weekend would otherwise read as an outage.
 */
const heartbeat = setInterval(() => {
  reportStatus().catch(() => {});
}, 60_000);

/**
 * Never die on an unhandled rejection.
 *
 * A WhatsApp socket throws from places no caller can wrap -- a decrypt that
 * fails inside an event handler, a stream error mid-frame. Node's default is
 * to kill the process, which on Render means a restart, which means a fresh
 * connection, which is the churn WhatsApp reads as abuse. Logging and carrying
 * on is strictly better: the socket's own close handler already knows how to
 * reconnect deliberately.
 */
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection (continuing)", reason);
});
process.on("uncaughtException", (error) => {
  console.error("uncaught exception (continuing)", error);
});

/** Render sends SIGTERM on deploy. Closing the socket deliberately means
 *  WhatsApp sees a clean disconnect rather than a dropped one, which is both
 *  faster to reconnect from and less likely to be read as flapping. */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
