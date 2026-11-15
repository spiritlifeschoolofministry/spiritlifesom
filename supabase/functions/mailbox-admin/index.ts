/**
 * Issuing, resetting and removing official @spiritlifesom.org mailboxes.
 *
 * One function rather than four, because all four actions need the same three
 * things: a strict-admin caller, the mail server's API key, and a row in
 * `mailboxes` that stays true to what the mail server actually holds.
 *
 * Why the API key cannot be anywhere else: it belongs to a service account with
 * Stalwart's Admin role -- the only role Stalwart 1.1 offers -- so it can create
 * or delete any account on the server, including the school's own admin@
 * mailbox. It is read from the function's environment and never returned to the
 * caller, not even in an error.
 *
 * Passwords are generated here, sent to Stalwart, returned to the admin once in
 * the response, and never written down. `mailboxes` has no column for one.
 *
 * Ordering, which is the part that is easy to get wrong: the row is written
 * *before* the mail server is called, and rolled back if the server refuses.
 * The unique index on (local_part, domain) is then the lock that stops two
 * admins issuing the same address at the same time -- a check-then-create would
 * let both pass the check. The cost is that a crash between the two leaves a
 * row with no stalwart_account_id, which `status` reports and an admin can
 * clear; the alternative is an orphaned mailbox on the server that nothing in
 * the portal knows about, which is worse because nobody goes looking for it.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  checkLocalPart,
  createAccount,
  deleteAccount,
  DEFAULT_QUOTA_BYTES,
  generatePassword,
  localPartFromName,
  probe,
  readConfig,
  setPassword,
  StalwartError,
} from "../_shared/stalwart.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Actor {
  id: string;
  email: string | null;
  role: string | null;
}

/**
 * The audit trail for an action that happens on another server.
 *
 * Written with the service role, so `audit_log_event`'s auth.uid() lookup would
 * find nobody -- the actor is therefore passed explicitly from the verified
 * token rather than inferred. Never throws: an audit write that fails must not
 * turn a mailbox that was really created into an error the admin retries.
 */
const audit = async (
  admin: SupabaseClient,
  actor: Actor,
  action: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown>,
) => {
  try {
    await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      entity_type: "mailbox",
      entity_id: entityId,
      summary,
      metadata,
    });
  } catch (error) {
    console.error("mailbox-admin: audit write failed", error);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await caller
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .single();

    // Strict admin only. Teachers reach the general admin routes but have no
    // business issuing or deleting anyone's mail account.
    if (!profile || profile.role !== "admin") {
      return json({ error: "Unauthorized: only admins can manage mailboxes" }, 403);
    }
    const actor: Actor = { id: user.id, email: profile.email ?? null, role: profile.role };

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
    );

    // --- suggest -----------------------------------------------------------
    // What this person's address would be, and whether it is free. Read-only,
    // and it never touches the mail server: the portal's own table is the
    // record of what has been issued.
    if (action === "suggest") {
      const profileId = String(body?.profile_id || "");
      if (!profileId) return json({ error: "Missing profile_id" }, 400);

      const { data: person } = await admin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", profileId)
        .single();
      if (!person) return json({ error: "No such person" }, 404);

      const base = localPartFromName(person.first_name, person.last_name);
      if (!base) return json({ suggestion: "", taken: [], reason: "This person has no name on file." });

      // Offer the plain form first, then numbered variants, skipping anything
      // already claimed -- including by a removed mailbox, since those
      // addresses are never reissued.
      const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}${i + 2}`)];
      const { data: clashes } = await admin
        .from("mailboxes")
        .select("local_part")
        .in("local_part", candidates);
      const taken = new Set((clashes || []).map((r: { local_part: string }) => r.local_part));
      const free = candidates.find((c) => !taken.has(c) && checkLocalPart(c).ok);

      return json({ suggestion: free || "", taken: Array.from(taken) });
    }

    // --- probe -------------------------------------------------------------
    // Confirms the mail server is reachable and the API shape is right, without
    // creating anything. See _shared/stalwart.ts for why this exists.
    if (action === "probe") {
      const config = readConfig();
      const result = await probe(config);
      return json({ ...result, url: config.url, apiPath: config.apiPath });
    }

    // Everything past here talks to the mail server.
    const config = readConfig();

    // --- create ------------------------------------------------------------
    if (action === "create") {
      const profileId = String(body?.profile_id || "");
      if (!profileId) return json({ error: "Missing profile_id" }, 400);

      const { data: person } = await admin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", profileId)
        .single();
      if (!person) return json({ error: "No such person" }, 404);

      const localPart = String(body?.local_part || "").trim().toLowerCase() ||
        localPartFromName(person.first_name, person.last_name);
      const check = checkLocalPart(localPart);
      if (!check.ok) return json({ error: check.reason }, 400);

      const quotaBytes = Number.isFinite(Number(body?.quota_bytes)) && Number(body?.quota_bytes) > 0
        ? Math.floor(Number(body.quota_bytes))
        : DEFAULT_QUOTA_BYTES;

      // Reserve the address first. A unique-index violation here is the
      // concurrent case, and it is the right answer: whoever lost the race is
      // told the address is taken rather than both creating it.
      const { data: reserved, error: reserveError } = await admin
        .from("mailboxes")
        .insert({
          profile_id: profileId,
          local_part: localPart,
          created_by: actor.id,
          quota_bytes: quotaBytes,
        })
        .select("id, address")
        .single();

      if (reserveError || !reserved) {
        const message = String(reserveError?.message || "");
        if (message.includes("mailboxes_one_active_per_profile")) {
          return json({ error: "This person already has a mailbox." }, 409);
        }
        if (message.includes("mailboxes_address_unique")) {
          return json({ error: `${localPart}@spiritlifesom.org is already taken.` }, 409);
        }
        console.error("mailbox-admin: reserve failed", reserveError);
        return json({ error: "Could not record the mailbox." }, 500);
      }

      const password = generatePassword();
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
      const description = `${fullName || "Unnamed"} (SLSOM)`;

      try {
        const accountId = await createAccount(config, {
          localPart,
          password,
          description,
          quotaBytes,
        });
        await admin
          .from("mailboxes")
          .update({ stalwart_account_id: accountId })
          .eq("id", reserved.id);

        await audit(
          admin, actor, "mailbox.created", reserved.id,
          `Created mailbox ${reserved.address} for ${fullName || "a user"}`,
          { profile_id: profileId, address: reserved.address, quota_bytes: quotaBytes },
        );

        // The password leaves the server exactly once, here.
        return json({
          ok: true,
          mailbox_id: reserved.id,
          address: reserved.address,
          password,
          quota_bytes: quotaBytes,
        });
      } catch (error) {
        // The mail server said no, so the reservation was never true. Undo it,
        // otherwise the address is blocked for a mailbox that does not exist.
        await admin.from("mailboxes").delete().eq("id", reserved.id);
        console.error("mailbox-admin: create failed", error);
        return json(
          { error: error instanceof StalwartError ? error.message : "Could not create the mailbox." },
          502,
        );
      }
    }

    // --- reset -------------------------------------------------------------
    if (action === "reset") {
      const mailboxId = String(body?.mailbox_id || "");
      if (!mailboxId) return json({ error: "Missing mailbox_id" }, 400);

      const { data: mailbox } = await admin
        .from("mailboxes")
        .select("id, address, stalwart_account_id, status, profile_id")
        .eq("id", mailboxId)
        .single();
      if (!mailbox) return json({ error: "No such mailbox" }, 404);
      if (mailbox.status !== "active") return json({ error: "That mailbox has been removed." }, 409);
      if (!mailbox.stalwart_account_id) {
        return json({ error: "This mailbox was never finished on the mail server. Remove it and create it again." }, 409);
      }

      const password = generatePassword();
      try {
        await setPassword(config, mailbox.stalwart_account_id, password);
      } catch (error) {
        console.error("mailbox-admin: reset failed", error);
        return json(
          { error: error instanceof StalwartError ? error.message : "Could not reset the password." },
          502,
        );
      }

      await admin
        .from("mailboxes")
        .update({ password_reset_at: new Date().toISOString() })
        .eq("id", mailbox.id);

      await audit(
        admin, actor, "mailbox.password_reset", mailbox.id,
        `Reset the password for ${mailbox.address}`,
        { profile_id: mailbox.profile_id, address: mailbox.address },
      );

      return json({ ok: true, address: mailbox.address, password });
    }

    // --- remove ------------------------------------------------------------
    if (action === "remove") {
      const mailboxId = String(body?.mailbox_id || "");
      if (!mailboxId) return json({ error: "Missing mailbox_id" }, 400);

      const { data: mailbox } = await admin
        .from("mailboxes")
        .select("id, address, stalwart_account_id, status, profile_id")
        .eq("id", mailboxId)
        .single();
      if (!mailbox) return json({ error: "No such mailbox" }, 404);
      if (mailbox.status !== "active") return json({ ok: true, address: mailbox.address, already: true });

      if (mailbox.stalwart_account_id) {
        try {
          await deleteAccount(config, mailbox.stalwart_account_id);
        } catch (error) {
          console.error("mailbox-admin: remove failed", error);
          return json(
            { error: error instanceof StalwartError ? error.message : "Could not remove the mailbox." },
            502,
          );
        }
      }

      // Kept, not deleted: the address must never be reissued to someone else.
      await admin
        .from("mailboxes")
        .update({ status: "removed", removed_at: new Date().toISOString() })
        .eq("id", mailbox.id);

      await audit(
        admin, actor, "mailbox.removed", mailbox.id,
        `Deleted the mailbox ${mailbox.address} and everything in it`,
        { profile_id: mailbox.profile_id, address: mailbox.address },
      );

      return json({ ok: true, address: mailbox.address });
    }

    return json({ error: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (error) {
    console.error("mailbox-admin error:", error);
    // readConfig throws a sentence an admin can act on; anything else is ours.
    const message = error instanceof Error ? error.message : "Server error";
    const configProblem = message.startsWith("Mail server is not configured");
    return json({ error: configProblem ? message : "Server error" }, configProblem ? 503 : 500);
  }
});
