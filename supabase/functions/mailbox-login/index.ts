import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Sign in to the portal with a school address (name@spiritlifesom.org).
 *
 * Supabase Auth allows one email per account, and that is the person's
 * personal address. A school address is therefore an *alias*: this function
 * finds the portal account its active mailbox belongs to and signs in there.
 *
 * Why it runs here and not in the browser: school addresses are guessable
 * (firstname.lastname), so a public "which email is behind this address"
 * lookup would hand anyone every student's personal email. Here the personal
 * address never leaves the server -- the browser only gets a session.
 *
 * Why it keeps its own rate limit: every sign-in from this function reaches
 * Auth from Supabase's servers, so Auth's per-visitor limit cannot tell
 * visitors apart. `mailbox_login_attempts` counts failures per address and per
 * visitor IP instead.
 *
 * Three actions:
 *   password    {address, password}  -> {access_token, refresh_token}
 *               The portal password. The mailbox password is a different
 *               secret and is not accepted here.
 *   otp_request {address}            -> {ok: true}, always
 *               Emails a one-time code to the school mailbox itself, so
 *               reading that mailbox is the proof. Answers the same whether or
 *               not the address exists.
 *   otp_verify  {address, code}      -> {access_token, refresh_token}
 *
 * Every refusal is the same "Invalid login credentials", so an unknown
 * address, a removed mailbox, an off-portal mailbox and a wrong password all
 * look identical from outside.
 */

const DOMAIN = "spiritlifesom.org";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ADDRESS = 5;
const MAX_FAILS_PER_IP = 20;
const MAX_CODES_PER_ADDRESS = 3;
const GENERIC = "Invalid login credentials";
const FROM = Deno.env.get("EMAIL_FROM") || "Spirit Life SOM <noreply@spiritlifesom.org>";

type Kind = "password" | "otp_request" | "otp_verify";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  // A fresh client per request, so no session is ever kept between visitors.
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "") as Kind;
  const address = String(body.address || "").trim().toLowerCase();
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  if (!["password", "otp_request", "otp_verify"].includes(action)) {
    return json({ error: "Unknown action" }, 400);
  }
  if (!address.endsWith(`@${DOMAIN}`) || address.length > 200) {
    return json({ error: `Use an @${DOMAIN} address here.` }, 400);
  }

  const record = async (kind: Kind, succeeded: boolean) => {
    const { error } = await admin.from("mailbox_login_attempts").insert({ address, ip, kind, succeeded });
    if (error) console.error("mailbox-login: could not record attempt", error);
  };

  // --- rate limit ---------------------------------------------------------
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const countWhere = async (column: "address" | "ip", value: string, filter: (q: any) => any) => {
    const { count } = await filter(
      admin.from("mailbox_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .gte("attempted_at", since),
    );
    return count ?? 0;
  };
  const failsFor = (column: "address" | "ip", value: string) =>
    countWhere(column, value, (q) => q.eq("succeeded", false).neq("kind", "otp_request"));

  const [addressFails, ipFails] = await Promise.all([
    failsFor("address", address),
    ip ? failsFor("ip", ip) : Promise.resolve(0),
  ]);
  if (addressFails >= MAX_FAILS_PER_ADDRESS || ipFails >= MAX_FAILS_PER_IP) {
    return json({ error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  }

  // --- who is behind this address ----------------------------------------
  // Only an active mailbox linked to a portal profile. The auth email is read
  // from Auth itself, not profiles.email, because that is what Auth signs in.
  const findAuthEmail = async (): Promise<string | null> => {
    const [localPart] = address.split("@");
    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("profile_id")
      .eq("local_part", localPart)
      .eq("domain", DOMAIN)
      .eq("status", "active")
      .not("profile_id", "is", null)
      .maybeSingle();
    if (!mailbox?.profile_id) return null;
    const { data } = await admin.auth.admin.getUserById(mailbox.profile_id);
    return data?.user?.email ?? null;
  };

  const sessionOf = (s: { access_token: string; refresh_token: string } | null) =>
    s ? { access_token: s.access_token, refresh_token: s.refresh_token } : null;

  // --- password -----------------------------------------------------------
  if (action === "password") {
    const password = String(body.password || "");
    const email = password ? await findAuthEmail() : null;
    if (!email) {
      await record("password", false);
      return json({ error: GENERIC }, 401);
    }
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    const session = sessionOf(data?.session ?? null);
    await record("password", !error && !!session);
    if (error || !session) return json({ error: GENERIC }, 401);
    return json(session);
  }

  // --- otp_request --------------------------------------------------------
  if (action === "otp_request") {
    const codesSent = await countWhere("address", address, (q) => q.eq("kind", "otp_request"));
    if (codesSent >= MAX_CODES_PER_ADDRESS) {
      return json({ error: "Too many codes requested. Wait 15 minutes and try again." }, 429);
    }
    await record("otp_request", true);

    const email = await findAuthEmail();
    // Same answer either way, so this cannot be used to test which addresses exist.
    if (!email) return json({ ok: true });

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const code = data?.properties?.email_otp;
    if (error || !code) {
      console.error("mailbox-login: could not generate a code", error);
      return json({ ok: true });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("mailbox-login: RESEND_API_KEY not set");
      return json({ ok: true });
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: address,
        subject: `Your Spirit Life portal login code: ${code}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <p>Your code to sign in to the Spirit Life SOM portal is:</p>
            <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
            <p>Enter it on the login page. If you did not ask for this, ignore this email; nobody can sign in without the code.</p>
          </div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e) => {
      console.error("mailbox-login: code email failed", e);
      return null;
    });
    if (res && !res.ok) console.error("mailbox-login: code email refused", res.status, await res.text());
    return json({ ok: true });
  }

  // --- otp_verify ---------------------------------------------------------
  const code = String(body.code || "").trim();
  const email = /^\d{6,10}$/.test(code) ? await findAuthEmail() : null;
  if (!email) {
    await record("otp_verify", false);
    return json({ error: "Invalid or expired code" }, 401);
  }
  let { data, error } = await anon.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    // Older Auth versions only accept a generated magic-link code under its own type.
    ({ data, error } = await anon.auth.verifyOtp({ email, token: code, type: "magiclink" }));
  }
  const session = sessionOf(data?.session ?? null);
  await record("otp_verify", !error && !!session);
  if (error || !session) return json({ error: "Invalid or expired code" }, 401);
  return json(session);
});
