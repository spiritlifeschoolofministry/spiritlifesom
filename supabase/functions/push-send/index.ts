import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Sends one bell notification to its owner's devices as a Web Push message.
 *
 * Called by the on_notification_push trigger with a notification id and
 * nothing else. The caller is not authenticated, so nothing in the request is
 * trusted: the text and the recipient are read from the row, and the row is
 * claimed first (pushed_at) so calling this again for the same id, or for an
 * old one, sends nothing.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "https://spiritlifesom.org";
  if (!publicKey || !privateKey) return json({ error: "push not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const id = (body as { notification_id?: string }).notification_id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "notification_id is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim it. Only a notification written in the last hour and not yet pushed
  // matches, which is what makes a replayed or invented call harmless.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .gte("created_at", cutoff)
    .select("id, user_id, title, body, link")
    .maybeSingle();
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claimed) return json({ sent: 0, skipped: "already pushed, too old or not found" });

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", claimed.user_id);
  if (subsError) return json({ error: subsError.message }, 500);
  if (!subs?.length) return json({ sent: 0 });

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const payload = JSON.stringify({
    title: claimed.title,
    body: (claimed.body ?? "").slice(0, 300),
    link: claimed.link ?? "/",
    tag: claimed.id,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser has dropped this subscription; it will never work again.
        if (status === 404 || status === 410) gone.push(sub.id);
        else console.error("push failed", status, (err as Error).message);
      }
    }),
  );

  if (gone.length) await supabase.from("push_subscriptions").delete().in("id", gone);
  if (sent) {
    await supabase
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .eq("user_id", claimed.user_id)
      .not("id", "in", `(${gone.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  }

  return json({ sent, removed: gone.length });
});
