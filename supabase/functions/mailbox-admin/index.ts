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
import { deliverCredentials, type Recipient } from "../_shared/mailbox-delivery.ts";

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

    /**
     * The service-role client.
     *
     * Two names, because this project carries both: `SERVICE_ROLE_KEY` is the
     * one the older functions use, and `SUPABASE_SERVICE_ROLE_KEY` is the one
     * the platform injects and keeps current. Preferring the platform's own
     * means a key rotation does not quietly leave this function talking to the
     * database with a dead key -- which fails as "row not found", not as "not
     * authorised", and so reads as a missing person rather than a broken key.
     */
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("mailbox-admin: no service role key in the environment");
      return json({ error: "The portal is missing its database key. Tell whoever set up the project." }, 503);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    /**
     * Reads one profile, telling a failure apart from an absence.
     *
     * Collapsing the two is how a dead key, a network blip and a deleted
     * person all came back as "No such person" -- which sent an admin looking
     * for a profile that was there all along.
     */
    const loadPerson = async (profileId: string) => {
      const { data, error } = await admin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", profileId)
        .maybeSingle();
      if (error) {
        console.error("mailbox-admin: profile lookup failed", error);
        return { person: null, failure: `Could not read that person's record: ${error.message}` };
      }
      return { person: data, failure: null as string | null };
    };

    /**
     * Who to send the new details to, and where.
     *
     * The WhatsApp number comes from whatsapp_target_for_profile rather than
     * from the profile row, so a person who opted out is skipped here the same
     * way they are skipped everywhere else. The student id is looked up only
     * to attribute the email in the send history; staff simply have none.
     */
    /**
     * A recipient built from a mailbox row rather than a profile.
     *
     * Off-portal holders carry their own contact details on the mailbox, and
     * `holder_whatsapp_jid` is generated by the database from the phone, so
     * there is no opt-out table to consult -- somebody who hands the school a
     * number for this purpose has asked to be written to.
     */
    const holderRecipient = (row: {
      id?: string;
      holder_name: string | null;
      holder_email: string | null;
      holder_whatsapp_jid: string | null;
    }): Recipient => ({
      profileId: row.id ?? "holder",
      name: (row.holder_name || "there").trim(),
      email: row.holder_email ?? null,
      whatsappJid: row.holder_whatsapp_jid ?? null,
      studentId: null,
    });

    const resolveRecipient = async (
      person: { id: string; first_name: string | null; last_name: string | null; email: string | null },
    ): Promise<Recipient> => {
      const [{ data: jid }, { data: student }] = await Promise.all([
        admin.rpc("whatsapp_target_for_profile", { p_profile_id: person.id }),
        admin.from("students").select("id").eq("profile_id", person.id)
          .eq("is_staff_preview", false).maybeSingle(),
      ]);
      return {
        profileId: person.id,
        name: [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "there",
        email: person.email ?? null,
        whatsappJid: typeof jid === "string" && jid ? jid : null,
        studentId: student?.id ?? null,
      };
    };

    // --- suggest -----------------------------------------------------------
    // What this person's address would be, and whether it is free. Read-only,
    // and it never touches the mail server: the portal's own table is the
    // record of what has been issued.
    if (action === "suggest") {
      // Either a portal person, or a name typed into the off-portal form --
      // which wants the same convention and the same clash check as everyone
      // else, so it asks the same question here rather than guessing locally.
      const profileId = String(body?.profile_id || "");
      const holderName = String(body?.holder_name || "").trim();
      if (!profileId && !holderName) {
        return json({ error: "Missing profile_id or holder_name" }, 400);
      }

      let person: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null = null;
      if (profileId) {
        const loaded = await loadPerson(profileId);
        if (loaded.failure) return json({ error: loaded.failure }, 500);
        if (!loaded.person) return json({ error: "No such person" }, 404);
        person = loaded.person;
      }

      const words = holderName.split(/\s+/).filter(Boolean);
      const base = person
        ? localPartFromName(person.first_name, person.last_name)
        : localPartFromName(words[0] ?? null, words.length > 1 ? words[words.length - 1] : null);

      if (!base) {
        const contact = person ? await resolveRecipient(person) : null;
        return json({
          suggestion: "", taken: [],
          reason: person ? "This person has no name on file." : "Type a name first.",
          email: contact?.email ?? null, has_whatsapp: Boolean(contact?.whatsappJid),
        });
      }

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

      // The card names where the details would go, so an admin can see before
      // clicking that a student has no number and will only get an email. An
      // off-portal holder has no contact details until the form is filled in,
      // so it is told nothing rather than something wrong.
      const contact = person ? await resolveRecipient(person) : null;
      return json({
        suggestion: free || "",
        taken: Array.from(taken),
        email: contact?.email ?? null,
        has_whatsapp: Boolean(contact?.whatsappJid),
      });
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
      // Two kinds of holder. A portal person is named by profile_id; anyone
      // else -- a visiting lecturer, a board member, a role somebody answers --
      // is named outright, so the school need not create a login that will
      // never be used and would then appear in every list of people.
      const profileId = String(body?.profile_id || "");
      const holderName = String(body?.holder_name || "").trim();
      if (!profileId && !holderName) {
        return json({ error: "Name the person this mailbox is for." }, 400);
      }
      if (profileId && holderName) {
        return json({ error: "A mailbox belongs either to a portal account or to a named holder, not both." }, 400);
      }

      let person: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null = null;
      if (profileId) {
        const loaded = await loadPerson(profileId);
        if (loaded.failure) return json({ error: loaded.failure }, 500);
        if (!loaded.person) return json({ error: "No such person" }, 404);
        person = loaded.person;
      }

      const holderEmail = String(body?.holder_email || "").trim() || null;
      const holderPhone = String(body?.holder_phone || "").trim() || null;
      if (holderEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(holderEmail)) {
        return json({ error: "That personal email address does not look right." }, 400);
      }

      // An off-portal holder has one name written as one string, so the
      // convention is applied to its first and last words.
      const holderWords = holderName.split(/\s+/).filter(Boolean);
      const localPart = String(body?.local_part || "").trim().toLowerCase() ||
        (person
          ? localPartFromName(person.first_name, person.last_name)
          : localPartFromName(holderWords[0] ?? null, holderWords.length > 1 ? holderWords[holderWords.length - 1] : null));
      const check = checkLocalPart(localPart);
      if (!check.ok) return json({ error: check.reason }, 400);

      const quotaBytes = Number.isFinite(Number(body?.quota_bytes)) && Number(body?.quota_bytes) > 0
        ? Math.floor(Number(body.quota_bytes))
        : DEFAULT_QUOTA_BYTES;

      /**
       * Has this address been used before, and by whom?
       *
       * The database now only stops two *live* mailboxes sharing an address.
       * Whether a deleted one may be handed out again is a judgement, and it
       * depends entirely on who held it:
       *
       *   - The same person getting their own address back -- after a mistake,
       *     a rename, or leaving and returning -- is no risk. It is their mail,
       *     and refusing was the bug.
       *   - A different person is the case worth stopping. Mail keeps arriving
       *     at an old address for years, so a graduate's correspondence would
       *     start landing in a new student's inbox. That still goes ahead only
       *     if the admin says so, having been told whose address it was.
       */
      const { data: history } = await admin
        .from("mailboxes")
        .select("status, profile_id, holder_name, removed_at")
        .eq("local_part", localPart);

      const priorHolders = (history ?? []).filter((h: { status: string }) => h.status !== "active");
      const sameHolder = (h: { profile_id: string | null; holder_name: string | null }) =>
        (profileId && h.profile_id === profileId) ||
        (holderName && (h.holder_name || "").trim().toLowerCase() === holderName.toLowerCase());

      const someoneElse = priorHolders.filter((h) => !sameHolder(h));
      if (someoneElse.length > 0 && body?.allow_reuse !== true) {
        const previous = someoneElse[0];
        let whose = previous.holder_name || "someone else";
        if (previous.profile_id) {
          const { person: prior } = await loadPerson(previous.profile_id);
          whose = [prior?.first_name, prior?.last_name].filter(Boolean).join(" ").trim() || "someone else";
        }
        return json({
          error: `${localPart}@spiritlifesom.org belonged to ${whose}` +
            (previous.removed_at ? `, deleted on ${new Date(previous.removed_at).toLocaleDateString("en-GB")}` : "") +
            ". Mail sent to it would now reach this person instead.",
          code: "address_previously_used",
          previous_holder: whose,
        }, 409);
      }

      // Reserve the address first. A unique-index violation here is the
      // concurrent case, and it is the right answer: whoever lost the race is
      // told the address is taken rather than both creating it.
      const { data: reserved, error: reserveError } = await admin
        .from("mailboxes")
        .insert({
          // Exactly one of these is set; the CHECK constraint enforces it.
          profile_id: profileId || null,
          holder_name: holderName || null,
          holder_email: holderName ? holderEmail : null,
          holder_phone: holderName ? holderPhone : null,
          local_part: localPart,
          created_by: actor.id,
          quota_bytes: quotaBytes,
        })
        .select("id, address, holder_name, holder_email, holder_whatsapp_jid")
        .single();

      if (reserveError || !reserved) {
        const message = String(reserveError?.message || "");
        if (message.includes("mailboxes_one_active_per_profile")) {
          return json({ error: "This person already has a mailbox." }, 409);
        }
        if (message.includes("mailboxes_holder_or_profile")) {
          return json({ error: "A mailbox needs either a portal account or a holder name." }, 400);
        }
        if (message.includes("mailboxes_address_active_unique")) {
          return json({ error: `${localPart}@spiritlifesom.org is already taken.` }, 409);
        }
        console.error("mailbox-admin: reserve failed", reserveError);
        return json({ error: "Could not record the mailbox." }, 500);
      }

      const password = generatePassword();
      const fullName = person
        ? [person.first_name, person.last_name].filter(Boolean).join(" ").trim()
        : holderName;
      // The description is what an admin sees against the account in Stalwart,
      // so it says which of the two kinds this is.
      const description = `${fullName || "Unnamed"} (SLSOM${person ? "" : ", not on the portal"})`;

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

        // Delivery is deliberately after the account exists and the row is
        // written. A failed email must never roll back a mailbox that is
        // really there -- the admin still has the password on screen, and the
        // reset button can send it again.
        const delivery = body?.notify === false
          ? null
          : await deliverCredentials(
              person ? await resolveRecipient(person) : holderRecipient(reserved),
              reserved.address,
              password,
              admin,
            );

        if (delivery) {
          await admin.from("mailboxes").update({
            credentials_emailed_at: delivery.emailed ? new Date().toISOString() : null,
            credentials_whatsapp_at: delivery.whatsapp ? new Date().toISOString() : null,
          }).eq("id", reserved.id);
        }

        await audit(
          admin, actor, "mailbox.created", reserved.id,
          `Created mailbox ${reserved.address} for ${fullName || "a user"}`,
          {
            profile_id: profileId || null,
            holder_name: holderName || null,
            address: reserved.address,
            quota_bytes: quotaBytes,
            // Recorded because "was the student ever told?" is a real question
            // later. The password itself is not here and never is.
            emailed: delivery?.emailed ?? false,
            whatsapp: delivery?.whatsapp ?? false,
          },
        );

        // The password leaves the server exactly once, here.
        return json({
          ok: true,
          mailbox_id: reserved.id,
          address: reserved.address,
          password,
          quota_bytes: quotaBytes,
          delivery,
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
        .select("id, address, stalwart_account_id, status, profile_id, holder_name, holder_email, holder_whatsapp_jid")
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

      // A reset is the only way to re-send credentials at all, because the
      // old password was never kept. So it delivers by default too.
      // An off-portal mailbox carries its holder's details on the row itself,
      // so there is no profile to load for it.
      const owner = mailbox.profile_id ? (await loadPerson(mailbox.profile_id)).person : null;
      const recipient = mailbox.profile_id
        ? (owner ? await resolveRecipient(owner) : null)
        : holderRecipient(mailbox);
      const delivery = body?.notify === false || !recipient
        ? null
        : await deliverCredentials(recipient, mailbox.address, password, admin);

      await admin
        .from("mailboxes")
        .update({
          password_reset_at: new Date().toISOString(),
          ...(delivery?.emailed ? { credentials_emailed_at: new Date().toISOString() } : {}),
          ...(delivery?.whatsapp ? { credentials_whatsapp_at: new Date().toISOString() } : {}),
        })
        .eq("id", mailbox.id);

      await audit(
        admin, actor, "mailbox.password_reset", mailbox.id,
        `Reset the password for ${mailbox.address}`,
        {
          profile_id: mailbox.profile_id,
          address: mailbox.address,
          emailed: delivery?.emailed ?? false,
          whatsapp: delivery?.whatsapp ?? false,
        },
      );

      return json({ ok: true, address: mailbox.address, password, delivery });
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
