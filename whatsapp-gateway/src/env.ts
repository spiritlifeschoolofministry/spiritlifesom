/**
 * Configuration, read once and validated at boot.
 *
 * A gateway that starts with a missing secret is worse than one that refuses
 * to: it pairs successfully, answers health checks, and then rejects or -- far
 * worse -- fails to authenticate every send, which looks like a WhatsApp
 * problem rather than a deployment one. So anything whose absence would produce
 * a confusing failure later is required here, loudly, before the socket opens.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the Render dashboard under Environment.`,
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  supabaseUrl: required("SUPABASE_URL"),

  // The service role key, not the anon key. The gateway is the only thing that
  // can read whatsapp_auth_state, and that table has RLS on with no policy, so
  // the anon key would silently read back nothing -- which presents as "asks
  // for a QR code on every boot" rather than as an auth error.
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Shared secret for inbound calls. Render web services are on the public
  // internet, so without this anyone who finds the URL can send WhatsApp
  // messages as the school.
  gatewaySecret: required("GATEWAY_SECRET"),

  // A second, weaker secret that opens the QR page from a plain browser link.
  //
  // The pairing QR has to be scanned from a screen, and a browser cannot be
  // made to send a custom header, so pairing otherwise means curling the page
  // to a file. This exists to make that one step a link. It is deliberately
  // *not* the gateway secret: a URL ends up in Render's access log, in shell
  // history and in whatever chat it was pasted into, and the gateway secret can
  // send messages as the school. This one can only display a QR that is already
  // being offered, and only during the minute it stays valid.
  //
  // Unset means the query-parameter route is closed entirely and only the
  // header works.
  pairingToken: process.env.PAIRING_TOKEN ?? null,

  // The official group's JID (ends @g.us). Optional at boot because the group
  // send path is not needed to pair or to run the health check.
  officialGroupJid: process.env.OFFICIAL_GROUP_JID ?? null,

  // Shown in WhatsApp's "linked devices" list on the paired phone. Naming it
  // after the service makes it obvious which entry not to revoke.
  deviceName: process.env.DEVICE_NAME ?? "SLSOM Gateway",

  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;
