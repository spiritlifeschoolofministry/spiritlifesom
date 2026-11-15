/**
 * A freshly issued address and password, for the one render they exist.
 *
 * Shared by the two places a mailbox can be created -- a portal person's card
 * and the off-portal form -- because this panel is the only moment the password
 * is ever visible. The edge function generates it, hands it back once, and
 * stores nothing; there is no column for it and no way to ask for it again. A
 * second copy of this panel would be a second chance to get that wrong.
 *
 * It says so plainly rather than relying on the admin knowing, offers copy
 * buttons instead of inviting a retype, and reports which channels the details
 * actually reached.
 */
import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Which channels took the credentials, and what stopped the others. */
export interface Delivery {
  emailed: boolean;
  whatsapp: boolean;
  problems: string[];
}

export interface Issued {
  address: string;
  password: string;
  delivery?: Delivery | null;
}

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

export const IssuedCredentials = ({
  issued,
  personName,
  onDismiss,
}: {
  issued: Issued;
  personName: string;
  onDismiss: () => void;
}) => (
  <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
    <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      Copy this password now — it is not stored anywhere
    </p>
    <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
      Give it to {personName} in person or by a channel they already control, and ask them to
      change it the first time they sign in. Closing this panel loses it; the only way back is
      another reset.
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
      <Button size="sm" variant="outline" onClick={onDismiss}>I have copied it</Button>
    </div>
  </div>
);

export default IssuedCredentials;
