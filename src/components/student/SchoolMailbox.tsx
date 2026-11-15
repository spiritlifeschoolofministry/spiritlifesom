/**
 * A student's own @spiritlifesom.org address, on their profile.
 *
 * Read-only by design. A student cannot create, rename or delete their school
 * mailbox -- an official address is issued by the school -- so this card exists
 * to answer the questions they actually have: what is my address, where do I
 * sign in, and what do I type into the mail app on my phone.
 *
 * It renders nothing at all when there is no mailbox. Most students will not
 * have one, and an empty card headed "School mailbox" invites a support message
 * asking why it is empty.
 *
 * The RLS policy `mailboxes_select_own` is what makes this safe to query from
 * the browser: a student sees their row and no one else's, and the table holds
 * no password to leak in the first place.
 */
import { useEffect, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MAIL_HOST = "mail.spiritlifesom.org";

/** From the handover; autoconfig fills these in, but people still ask. */
const SETTINGS = [
  { label: "IMAP (incoming)", value: `${MAIL_HOST}, port 993, SSL` },
  { label: "SMTP (outgoing)", value: `${MAIL_HOST}, port 465 (SSL) or 587 (STARTTLS)` },
];

export const SchoolMailbox = ({ userId }: { userId: string }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("mailboxes")
        .select("address, status")
        .eq("profile_id", userId)
        .eq("status", "active")
        .maybeSingle();
      // A student with no mailbox is the normal case, not a fault: log a real
      // error, but never put a toast in front of them for it.
      if (error) console.error("Load school mailbox error:", error);
      if (!cancelled) setAddress(data?.address ?? null);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy — select the address and copy it by hand");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5" /> School mailbox
        </CardTitle>
        <CardDescription>Your official Spirit Life address.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {address}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy your address">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">To read your mail,</strong> add this account to a mail
          app — Gmail, Outlook and Apple Mail all work, and most find the settings on their own once
          you type the address. The settings are below if yours asks.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">To change your password,</strong> sign in at{" "}
          <a className="underline" href={`https://${MAIL_HOST}`} target="_blank" rel="noreferrer">
            {MAIL_HOST}
          </a>
          . That page is for settings only and does not show your messages. If you have forgotten
          the password, ask the school office to reset it — nobody can look it up for you.
        </p>

        <dl className="grid gap-2 sm:grid-cols-2">
          {SETTINGS.map((row) => (
            <div key={row.label} className="rounded-md border border-border px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-[13px] text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};

export default SchoolMailbox;
