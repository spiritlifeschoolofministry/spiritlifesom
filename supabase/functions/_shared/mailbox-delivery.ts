/**
 * Getting a new mailbox's details to the person they belong to.
 *
 * Two channels, both carrying the same thing: the address and the password
 * that was just generated for it. Email goes to the personal address already
 * on file; WhatsApp goes to the number the school already uses for fee
 * reminders and announcements.
 *
 * Why both rather than one: a student who has changed phone still has their
 * Gmail, and a student who never opens email reads WhatsApp within the hour.
 * Sending to both is how the credentials actually arrive, and the admin still
 * has the on-screen copy when neither is set up.
 *
 * The honest cost, which the portal says out loud rather than hiding: a
 * password sent this way sits in an inbox and a chat history indefinitely.
 * That is why both messages lead with "change it now" rather than burying it,
 * and why the password is described as temporary in both. Replacing this with
 * a one-time set-your-own-password link would remove the cost entirely and is
 * the obvious next step if the school wants it.
 *
 * Nothing here ever writes the password anywhere persistent. `email_send_history`
 * is logged with the *type* of mail and no body -- that table has no body
 * column, which is the only reason logging it is safe at all.
 */

/**
 * Deno's globals are not in the browser tsconfig, and
 * `src/test/mailbox-delivery.test.ts` imports this file so the two message
 * templates are tested as they actually go out. Same narrow declaration as in
 * stalwart.ts, for the same reason.
 */
declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * The sliver of the Supabase client this module uses.
 *
 * Narrower than SupabaseClient on purpose: this file writes one row to one
 * table, and typing the whole client here would be a licence to reach for the
 * rest of it.
 */
export interface HistoryWriter {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<unknown>;
  };
}

export interface Recipient {
  profileId: string;
  name: string;
  /** Their personal address, from `profiles.email`. */
  email: string | null;
  /** Resolved through whatsapp_target_for_profile, so the opt-out is honoured. */
  whatsappJid: string | null;
  /** Null for staff; only used to attribute the email in the send history. */
  studentId: string | null;
}

export interface DeliveryOutcome {
  emailed: boolean;
  whatsapp: boolean;
  /** One short sentence per channel that did not work, for the admin. */
  problems: string[];
}

const MAIL_HOST = "mail.spiritlifesom.org";
/** The webmail client. Stalwart has none of its own; this is SnappyMail. */
const WEBMAIL_HOST = "webmail.spiritlifesom.org";

/**
 * The sender.
 *
 * `school.spiritlifesom.org` is the domain Resend has verified; the apex is
 * only partially verified, so sending from it would be refused. It matters
 * more here than on other mail the school sends: a message telling somebody
 * their password, arriving from `onboarding@resend.dev`, is indistinguishable
 * from a phishing attempt and teaches exactly the wrong reflex.
 */
const DEFAULT_FROM = "Spirit Life SOM <noreply@school.spiritlifesom.org>";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));

export const credentialsEmail = (name: string, address: string, password: string) => {
  const safeName = escapeHtml(name.split(" ")[0] || name);
  const safeAddress = escapeHtml(address);
  const safePassword = escapeHtml(password);
  return {
    subject: "Your Spirit Life email account",
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px">Your school email is ready</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">Hello ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
      Spirit Life School of Ministry has given you an official email address.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px">
      <tr><td style="padding:10px 12px;background:#f3f4f6;border-radius:8px 8px 0 0">
        <strong>Address</strong><br><code style="font-size:15px">${safeAddress}</code>
      </td></tr>
      <tr><td style="padding:10px 12px;background:#f3f4f6;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb">
        <strong>Temporary password</strong><br><code style="font-size:15px">${safePassword}</code>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;padding:12px 14px;background:#fff7ed;border-left:4px solid #f59e0b;font-size:14px;line-height:1.55">
      <strong>Change this password now.</strong> It was generated for you and has been sent by
      email and WhatsApp, so treat it as temporary. Sign in and set your own password straight away.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
      <strong>To read your mail,</strong> go to
      <a href="https://${WEBMAIL_HOST}" style="color:#4f46e5">${WEBMAIL_HOST}</a> and sign in with
      the address and password above. Nothing to install.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
      You can also add the account to the mail app on your phone — Gmail, Outlook and Apple Mail all
      work, and most find the settings on their own once you type the address.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
      <strong>To change your password,</strong> sign in at
      <a href="https://${MAIL_HOST}" style="color:#4f46e5">${MAIL_HOST}</a>. That page is for
      settings only — your messages are not shown there.
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280"><strong>If your mail app asks:</strong></p>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6">
      IMAP — ${MAIL_HOST}, port 993, SSL<br>
      SMTP — ${MAIL_HOST}, port 465 (SSL) or 587 (STARTTLS)
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280">
      If you were not expecting this, tell the school office — do not use the password above.
    </p>
  </div>
</body></html>`,
  };
};

export const credentialsWhatsApp = (name: string, address: string, password: string) =>
  [
    `Hello ${name.split(" ")[0] || name},`,
    "",
    "Your official Spirit Life email address is ready:",
    "",
    `Address: ${address}`,
    `Temporary password: ${password}`,
    "",
    `To read your mail: go to https://${WEBMAIL_HOST} and sign in with the address and password above. Nothing to install.`,
    "",
    `You can also add the account to the mail app on your phone (Gmail, Outlook, Apple Mail all work).`,
    "",
    `To change your password: sign in at https://${MAIL_HOST} — that page is for settings only, it does not show your messages. Please change this password straight away, as it was sent by email and WhatsApp.`,
    "",
    "If you were not expecting this, tell the school office and do not use the password above.",
  ].join("\n");

/**
 * Sends on both channels, and never throws.
 *
 * A failed delivery must not undo a mailbox that was really created: the
 * account exists on the mail server either way, and the admin still has the
 * password on screen. So every failure is collected and reported, and the
 * caller decides what to say about it.
 */
export const deliverCredentials = async (
  recipient: Recipient,
  address: string,
  password: string,
  admin: HistoryWriter,
): Promise<DeliveryOutcome> => {
  const out: DeliveryOutcome = { emailed: false, whatsapp: false, problems: [] };

  // --- email ---------------------------------------------------------------
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!recipient.email) {
    out.problems.push("No personal email address on file.");
  } else if (!resendKey) {
    out.problems.push("Email is not configured, so nothing was emailed.");
  } else {
    const template = credentialsEmail(recipient.name, address, password);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: Deno.env.get("MAILBOX_FROM") || DEFAULT_FROM,
          to: recipient.email,
          subject: template.subject,
          html: template.html,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.id) {
        out.emailed = true;
        // Logged for the admin's email history. Deliberately no body and no
        // password in the metadata -- only that this kind of mail went out.
        await admin.from("email_send_history").insert({
          recipient_email: recipient.email,
          email_type: "mailbox_credentials",
          trigger_source: "manual",
          student_id: recipient.studentId,
          status: "sent",
          resend_message_id: payload.id,
          metadata: { mailbox_address: address },
        }).then(() => {}, () => {});
      } else {
        const reason = String(payload?.message || payload?.name || `HTTP ${res.status}`);
        out.problems.push(`Email failed: ${reason}`);
        await admin.from("email_send_history").insert({
          recipient_email: recipient.email,
          email_type: "mailbox_credentials",
          trigger_source: "manual",
          student_id: recipient.studentId,
          status: "failed",
          error_message: reason.slice(0, 500),
          metadata: { mailbox_address: address },
        }).then(() => {}, () => {});
      }
    } catch (error) {
      out.problems.push(`Email failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- whatsapp ------------------------------------------------------------
  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  if (!recipient.whatsappJid) {
    // Not a failure worth alarming anyone about: plenty of people have not
    // given a number, and opting out is a choice the school must respect.
    out.problems.push("No WhatsApp number on file, or they have opted out.");
  } else if (!gatewayUrl || !gatewaySecret) {
    out.problems.push("WhatsApp is not configured, so nothing was sent there.");
  } else {
    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
        body: JSON.stringify({
          to: recipient.whatsappJid,
          text: credentialsWhatsApp(recipient.name, address, password),
          // A new password each time, so each send is genuinely distinct --
          // the key must not collapse two resets into one message.
          idempotency_key: `mailbox-credentials:${recipient.profileId}:${Date.now()}`,
          source: "mailbox_credentials",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) out.whatsapp = true;
      else out.problems.push(`WhatsApp failed: HTTP ${res.status}`);
    } catch (error) {
      out.problems.push(`WhatsApp failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return out;
};
