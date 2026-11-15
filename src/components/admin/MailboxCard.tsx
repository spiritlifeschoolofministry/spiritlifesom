/**
 * One person's official @spiritlifesom.org mailbox, on the admin side.
 *
 * Used on the admin student record and on the Mailboxes page, because both ask
 * the same question about one person -- does this person have a school address, and
 * what can I do about it -- and the answer has three states worth keeping in
 * one place: none yet, live, and removed.
 *
 * The password is the whole reason this is a component rather than a row of
 * buttons. It exists for one render: the edge function generates it, returns it
 * once, and stores nothing. So the panel that shows it says so plainly, offers
 * a copy button rather than inviting a retype, and cannot be brought back by
 * reloading the page. An admin who closes it before passing it on resets the
 * password again -- which is the correct outcome, and much better than a
 * portal that can show a student's mail password on demand.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AtSign, Check, Copy, KeyRound, Loader2, Mail, MessageCircle, Send, ShieldAlert,
  Trash2, TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Panel, StatusPill } from "@/components/redesign/admin/primitives";
import type { Tables } from "@/integrations/supabase/types";

type Mailbox = Tables<"mailboxes">;

/** What the edge function hands back once, and nowhere else. */
interface Issued {
  address: string;
  password: string;
  delivery?: Delivery | null;
}

/** Which channels actually took the credentials, and what went wrong. */
interface Delivery {
  emailed: boolean;
  whatsapp: boolean;
  problems: string[];
}

const MAIL_HOST = "mail.spiritlifesom.org";

const formatQuota = (bytes: number | null) => {
  if (!bytes) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Number(gb.toFixed(1))} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
};

const CopyField = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations (an
      // insecure origin, a locked-down browser). The value is on screen and
      // selectable, so say what happened rather than failing silently.
      toast.error("Could not copy — select the text and copy it by hand");
    }
  };
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};


/** Names the channels, so an admin sees what will happen before it does. */
const DeliveryTargets = ({ contact }: { contact: { email: string | null; hasWhatsapp: boolean } | null }) => {
  const parts: string[] = [];
  if (contact?.email) parts.push(contact.email);
  if (contact?.hasWhatsapp) parts.push("WhatsApp");
  if (parts.length === 0) {
    return (
      <span className="text-muted-foreground">
        no personal email or WhatsApp on file — you will have to pass it on yourself
      </span>
    );
  }
  return <span className="text-muted-foreground">{parts.join(" and ")}</span>;
};

export const MailboxCard = ({
  profileId,
  personName,
  onChanged,
}: {
  profileId: string;
  personName: string;
  /**
   * Called after the mail server confirms a create, reset or delete, so a
   * surrounding list can refresh. The card reloads its own row either way --
   * this is for the counts and pills *around* it, which would otherwise still
   * say "None" next to a mailbox that now exists.
   */
  onChanged?: () => void | Promise<void>;
}) => {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  /** Where the details would go, from the suggest call. */
  const [contact, setContact] = useState<{ email: string | null; hasWhatsapp: boolean } | null>(null);
  /** Ticked by default: reading a password down the phone to a hundred
   *  students is not a plan, so sending is the normal path. */
  const [notify, setNotify] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("mailboxes")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Load mailbox error:", error);
      toast.error("Could not load the mailbox");
    }
    setMailbox((data as Mailbox) ?? null);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fill the address the convention would give this person, so the common
  // case is one click and the admin only types when they want something else.
  // Runs whether or not a mailbox exists: the address suggestion is only
  // useful before one, but the contact channels are needed after one too, for
  // the reset checkbox.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke("mailbox-admin", {
        body: { action: "suggest", profile_id: profileId },
      });
      // A missing suggestion is not worth a toast -- the admin can type the
      // address. But it must reach the console: when the suggestion silently
      // stopped appearing, that was the first symptom of a broken service-role
      // key, and swallowing it hid the cause until a create failed too.
      if (error || data?.error) {
        console.error("Mailbox suggestion failed:", data?.error ?? error);
        return;
      }
      if (cancelled) return;
      if (data?.suggestion && !mailbox) setLocalPart(data.suggestion);
      setContact({ email: data?.email ?? null, hasWhatsapp: Boolean(data?.has_whatsapp) });
    })();
    return () => { cancelled = true; };
  }, [mailbox, loading, profileId]);

  /** Every action is the same call with a different verb; only the copy differs. */
  const run = async (
    body: Record<string, unknown>,
    onDone: (data: { address?: string; password?: string; delivery?: Delivery | null }) => void,
  ) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("mailbox-admin", { body });
    setBusy(false);

    // A non-2xx from an edge function arrives as an error whose body holds the
    // sentence the function wrote. Without reading it the admin gets "Edge
    // Function returned a non-2xx status code", which tells them nothing.
    if (error) {
      let message = "Something went wrong";
      try {
        const parsed = await (error as { context?: Response }).context?.json();
        if (parsed?.error) message = String(parsed.error);
      } catch { /* fall through to the generic message */ }
      toast.error(message);
      return;
    }
    if (data?.error) {
      toast.error(String(data.error));
      return;
    }
    onDone(data ?? {});
    await load();
    await onChanged?.();
  };

  /** "Created" is not the whole story when the point was to tell the student. */
  const announce = (verb: string, delivery?: Delivery | null) => {
    if (!delivery) { toast.success(`${verb}. Nothing was sent — copy the password below.`); return; }
    const sent = [delivery.emailed && "emailed", delivery.whatsapp && "sent on WhatsApp"]
      .filter(Boolean).join(" and ");
    if (sent) toast.success(`${verb} and ${sent}.`);
    else toast.warning(`${verb}, but nothing could be sent. Copy the password below.`);
  };

  const create = () =>
    run({ action: "create", profile_id: profileId, local_part: localPart.trim(), notify }, (data) => {
      if (data.address && data.password) {
        setIssued({ address: data.address, password: data.password, delivery: data.delivery ?? null });
      }
      announce("Mailbox created", data.delivery);
    });

  const reset = () =>
    run({ action: "reset", mailbox_id: mailbox?.id, notify }, (data) => {
      if (data.address && data.password) {
        setIssued({ address: data.address, password: data.password, delivery: data.delivery ?? null });
      }
      announce("New password issued", data.delivery);
    });

  const remove = () =>
    run({ action: "remove", mailbox_id: mailbox?.id }, () => {
      toast.success("Mailbox deleted");
    });

  if (loading) {
    return (
      <Panel title="School mailbox" titleId={`mailbox-${profileId}`}>
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Panel>
    );
  }

  const active = mailbox?.status === "active";
  const quota = formatQuota(mailbox?.quota_bytes ?? null);

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Mail className="h-4 w-4" /> School mailbox
        </span>
      }
      titleId={`mailbox-${profileId}`}
      actions={
        mailbox
          ? <StatusPill tone={active ? "good" : "neutral"}>{active ? "Active" : "Removed"}</StatusPill>
          : <StatusPill tone="neutral">None</StatusPill>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {/* The password, for the one render it exists. */}
        {issued && (
          <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Copy this password now — it is not stored anywhere
            </p>
            <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
              Give it to {personName} in person or by a channel they already control, and ask
              them to change it the first time they sign in. Closing this panel loses it; the
              only way back is another reset.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <CopyField label="Address" value={issued.address} />
              <CopyField label="Password" value={issued.password} />
            </div>
            {issued.delivery && (
              <div className="mt-3 space-y-1 text-[13px]">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-amber-900 dark:text-amber-200">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {issued.delivery.emailed ? "Emailed" : "Not emailed"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {issued.delivery.whatsapp ? "Sent on WhatsApp" : "Not sent on WhatsApp"}
                  </span>
                </p>
                {issued.delivery.problems.map((problem) => (
                  <p key={problem} className="text-amber-900/80 dark:text-amber-200/80">{problem}</p>
                ))}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIssued(null)}>
                I have copied it
              </Button>
            </div>
          </div>
        )}

        {!mailbox && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {personName} has no school address yet.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`local-part-${profileId}`} className="text-[13px]">Address</Label>
                <div className="mt-1 flex items-center gap-1.5">
                  <Input
                    id={`local-part-${profileId}`}
                    value={localPart}
                    onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
                    placeholder="firstname.lastname"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                  <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                    @spiritlifesom.org
                  </span>
                </div>
              </div>
              <Button onClick={create} disabled={busy || localPart.trim().length < 2}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <AtSign className="mr-1.5 h-4 w-4" />}
                Create mailbox
              </Button>
            </div>

            <label className="flex items-start gap-2.5 text-[13px]">
              <Checkbox
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
                className="mt-0.5"
                aria-label="Send the details to this person"
              />
              <span>
                Send the address and password to <DeliveryTargets contact={contact} />.
                {" "}
                <span className="text-muted-foreground">
                  The password will sit in their inbox and chat history, so the message tells them
                  to change it straight away.
                </span>
              </span>
            </label>
          </div>
        )}

        {mailbox && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-sm">{mailbox.address}</code>
              {quota && <span className="text-[13px] text-muted-foreground">{quota} quota</span>}
            </div>

            {/* A row with no account id is the crash-between-the-two case the
                edge function documents. Say so, rather than offering a reset
                that cannot work. */}
            {active && !mailbox.stalwart_account_id && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                This mailbox was never finished on the mail server. Delete it here and create it again.
              </p>
            )}

            {active && (
              <>
                <p className="text-[13px] text-muted-foreground">
                  Read with any mail app over IMAP; {MAIL_HOST} is the settings and
                  password page only, and does not show messages.
                  {mailbox.password_reset_at && (
                    <> Password last reset {new Date(mailbox.password_reset_at).toLocaleDateString()}.</>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {mailbox.credentials_emailed_at
                      ? `Emailed ${new Date(mailbox.credentials_emailed_at).toLocaleDateString()}`
                      : "Never emailed"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {mailbox.credentials_whatsapp_at
                      ? `WhatsApp ${new Date(mailbox.credentials_whatsapp_at).toLocaleDateString()}`
                      : "Never sent on WhatsApp"}
                  </span>
                </p>

                {/* The only way to send details again: the old password was
                    never kept, so "resend" can only mean a new one. */}
                <label className="flex items-start gap-2.5 text-[13px]">
                  <Checkbox
                    checked={notify}
                    onCheckedChange={(v) => setNotify(v === true)}
                    className="mt-0.5"
                    aria-label="Send the new password to this person"
                  />
                  <span>
                    On reset, send the new password to <DeliveryTargets contact={contact} />.
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} disabled={busy || !mailbox.stalwart_account_id}>
                    <KeyRound className="mr-1.5 h-4 w-4" /> Reset password
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)} disabled={busy}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete mailbox
                  </Button>
                </div>
              </>
            )}

            {!active && (
              <p className="text-[13px] text-muted-foreground">
                Deleted{mailbox.removed_at ? ` on ${new Date(mailbox.removed_at).toLocaleDateString()}` : ""}.
                This address is kept on file and will not be given to anyone else.
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Issue a new password?"
        description={
          <>
            <p>
              A new password is generated for <strong>{mailbox?.address}</strong> and shown to
              you once. The current password stops working immediately, and anyone signed in
              on a phone or mail app will be asked for the new one.
            </p>
            <p>
              {notify
                ? "The new password will be emailed and sent on WhatsApp, and shown to you here as well."
                : "Nothing will be sent — you will need to pass the new password on yourself."}
            </p>
            <p>Nothing in the mailbox is deleted.</p>
          </>
        }
        confirmLabel="Reset password"
        loading={busy}
        onConfirm={reset}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Delete this mailbox?"
        variant="destructive"
        description={
          <>
            <p>
              <strong>{mailbox?.address}</strong> and every message in it are deleted from the
              mail server. This cannot be undone, and the mail is not backed up anywhere the
              portal can reach.
            </p>
            <p>
              The address stays on file so it is never given to another person, and mail sent
              to it from now on will bounce.
            </p>
          </>
        }
        confirmLabel="Delete mailbox"
        loading={busy}
        onConfirm={remove}
      />
    </Panel>
  );
};

export default MailboxCard;
