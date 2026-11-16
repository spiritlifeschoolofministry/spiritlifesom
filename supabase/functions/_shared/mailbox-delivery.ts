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

/**
 * The settings every mail app eventually asks for, in one place.
 *
 * Written out at the point each one is needed rather than gathered in a table
 * at the bottom, because somebody halfway through a phone setup will not
 * scroll back to find a port number -- they will guess, and get it wrong.
 */
const IMAP_PORT = "993";
const SMTP_PORT = "465";

/**
 * Adding the account to the Gmail app, step by step.
 *
 * Gmail is the one worth spelling out: nearly every student already has it on
 * their phone, so for most people this is the whole answer. The steps name
 * what is on screen ("Add another account", not "the account option") because
 * someone following along is matching words to buttons, and they include the
 * server screens rather than promising Gmail will fill them in -- on an
 * "Other" account it usually does not.
 *
 * Android and iPhone differ only at step 5, which is called out inline rather
 * than split into two lists nobody reads twice.
 */
const gmailSteps = (address: string): string[] => [
  "Open the Gmail app.",
  "Tap your profile picture in the top right corner.",
  "Tap <strong>Add another account</strong>.",
  "Tap <strong>Other</strong> at the bottom of the list.",
  `Type <strong>${address}</strong> and tap <strong>Next</strong>. If it asks what kind of account, choose <strong>Personal (IMAP)</strong> — on an iPhone this is <strong>Other (IMAP)</strong>.`,
  "Type your password from above and tap <strong>Next</strong>.",
  `<strong>Incoming server settings.</strong> Username is your full address <strong>${address}</strong>. Server is <strong>${MAIL_HOST}</strong>. Port <strong>${IMAP_PORT}</strong>, security <strong>SSL/TLS</strong>. Tap <strong>Next</strong>.`,
  `<strong>Outgoing server settings.</strong> Turn <strong>Require sign-in</strong> on. Username is again <strong>${address}</strong>. Server is <strong>${MAIL_HOST}</strong>. Port <strong>${SMTP_PORT}</strong>, security <strong>SSL/TLS</strong>. Tap <strong>Next</strong>.`,
  "Give the account a name if it asks, then tap <strong>Next</strong>. Your school mail now appears in Gmail alongside your other accounts.",
];

export const credentialsEmail = (name: string, address: string, password: string) => {
  const safeName = escapeHtml(name.split(" ")[0] || name);
  const safeAddress = escapeHtml(address);
  const safePassword = escapeHtml(password);
  const steps = gmailSteps(safeAddress)
    .map((step) => `<li style="margin:0 0 9px;padding-left:4px">${step}</li>`)
    .join("");
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
    <p style="margin:0 0 22px;padding:12px 14px;background:#fff7ed;border-left:4px solid #f59e0b;font-size:14px;line-height:1.55">
      <strong>Change this password now.</strong> It was generated for you and has been sent by
      email and WhatsApp, so treat it as temporary. Sign in and set your own password straight away.
    </p>

    <h2 style="margin:0 0 6px;font-size:17px">Option 1 — read it in your browser</h2>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55">
      Go to <a href="https://${WEBMAIL_HOST}" style="color:#4f46e5">${WEBMAIL_HOST}</a> and sign in
      with the address and password above. Nothing to install.
    </p>

    <h2 style="margin:0 0 6px;font-size:17px">Option 2 — add it to the Gmail app on your phone</h2>
    <p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#4b5563">
      Your school mail then arrives in Gmail with your other mail. Follow these in order.
    </p>
    <ol style="margin:0 0 22px;padding-left:22px;font-size:14px;line-height:1.6">${steps}</ol>

    <h2 style="margin:0 0 6px;font-size:17px">Using a different app?</h2>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563">
      Outlook, Apple Mail and Thunderbird all work. Choose <strong>IMAP</strong>, and use:<br>
      Incoming — ${MAIL_HOST}, port ${IMAP_PORT}, SSL/TLS<br>
      Outgoing — ${MAIL_HOST}, port ${SMTP_PORT}, SSL/TLS<br>
      Username — your full address, ${safeAddress}
    </p>

    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#4b5563">
      <strong>To change your password,</strong> sign in at
      <a href="https://${MAIL_HOST}" style="color:#4f46e5">${MAIL_HOST}</a>. That page is for
      settings only — your messages are not shown there.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280">
      Stuck, or not expecting this? Tell the school office — and do not use the password above.
    </p>
  </div>
</body></html>`,
  };
};

/**
 * The same thing for WhatsApp.
 *
 * Plain text, no markup, and the Gmail steps numbered one per line: a wall of
 * prose in a chat window does not get read, and these are steps somebody
 * follows with the phone in their hand while switching between two apps.
 *
 * It repeats the address on the server lines rather than saying "as above",
 * because by the time they reach step 7 the address has scrolled off a phone
 * screen.
 */
export const credentialsWhatsApp = (name: string, address: string, password: string) =>
  [
    `Hello ${name.split(" ")[0] || name},`,
    "",
    "Your official Spirit Life email address is ready:",
    "",
    `Address: ${address}`,
    `Temporary password: ${password}`,
    "",
    "Please change this password as soon as you sign in — it was sent by email and WhatsApp, so it should not stay as it is.",
    "",
    "--- TO READ YOUR MAIL ---",
    "",
    `EASIEST: go to https://${WEBMAIL_HOST} and sign in with the address and password above. Nothing to install.`,
    "",
    "OR ADD IT TO THE GMAIL APP:",
    "",
    "1. Open the Gmail app.",
    "2. Tap your profile picture, top right.",
    "3. Tap \"Add another account\".",
    "4. Tap \"Other\" at the bottom.",
    `5. Type ${address} and tap Next. If it asks the account type, choose "Personal (IMAP)" — on iPhone it says "Other (IMAP)".`,
    "6. Type the password above and tap Next.",
    "7. Incoming server settings:",
    `   Username: ${address}`,
    `   Server: ${MAIL_HOST}`,
    `   Port: ${IMAP_PORT}, Security: SSL/TLS`,
    "   Then tap Next.",
    "8. Outgoing server settings:",
    "   Turn ON \"Require sign-in\"",
    `   Username: ${address}`,
    `   Server: ${MAIL_HOST}`,
    `   Port: ${SMTP_PORT}, Security: SSL/TLS`,
    "   Then tap Next.",
    "9. Name the account if asked, then tap Next. Your school mail now appears in Gmail.",
    "",
    `To change your password: sign in at https://${MAIL_HOST} — that page is for settings only and does not show your messages.`,
    "",
    "Stuck, or not expecting this? Tell the school office, and do not use the password above.",
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
