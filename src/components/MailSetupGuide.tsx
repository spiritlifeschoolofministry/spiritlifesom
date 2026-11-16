/**
 * How to actually read a school mailbox.
 *
 * Needed because Stalwart ships no webmail: mail.spiritlifesom.org is a
 * settings portal and shows nobody their messages. Without this, a student is
 * handed an address and a password and has no idea what to do with either, and
 * the school's answer has to be a phone call per person.
 *
 * Written for someone who has never heard of IMAP. The server settings are at
 * the bottom rather than the top, because almost nobody needs them -- every
 * app here finds them on its own from the address -- and leading with a table
 * of ports is how you convince a first-year student this is not for them.
 *
 * Shared by the student profile and the staff profile. Staff get the same
 * screen deliberately: a lecturer setting up their own mail has exactly the
 * same problem as a student, and a second, subtly different copy of these
 * steps would be one more thing to keep true.
 */
import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Globe, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const MAIL_HOST = "mail.spiritlifesom.org";
/** The webmail client (SnappyMail). Stalwart ships none of its own. */
export const WEBMAIL_HOST = "webmail.spiritlifesom.org";

interface Guide {
  id: string;
  app: string;
  where: string;
  steps: string[];
}

/**
 * One entry per app the school actually sees, most common first.
 *
 * Gmail leads because nearly every student already has it on their phone, so
 * for most people this is the whole answer. The steps name what is on screen
 * rather than describing it ("Add another account", not "the account option"),
 * since someone following along is matching words to buttons.
 */
const GUIDES: Guide[] = [
  {
    id: "gmail",
    app: "Gmail",
    where: "Android or iPhone",
    // Spelled out to the last port number rather than promising Gmail will
    // work it out: on an "Other" account it asks for both server screens, and
    // someone stuck on one of them cannot be talked through it over the phone.
    steps: [
      "Open the Gmail app.",
      "Tap your profile picture in the top right corner.",
      "Tap “Add another account”.",
      "Tap “Other” at the bottom of the list.",
      "Type your full school address and tap “Next”. If it asks what kind of account, choose “Personal (IMAP)” — on an iPhone this is “Other (IMAP)”.",
      "Type your password and tap “Next”.",
      "Incoming server settings — Username: your full address. Server: mail.spiritlifesom.org. Port: 993. Security: SSL/TLS. Tap “Next”.",
      "Outgoing server settings — turn “Require sign-in” on. Username: your full address. Server: mail.spiritlifesom.org. Port: 465. Security: SSL/TLS. Tap “Next”.",
      "Name the account if it asks, then tap “Next”. Your school mail now appears in Gmail alongside your other accounts.",
    ],
  },
  {
    id: "outlook",
    app: "Outlook",
    where: "Phone or computer",
    steps: [
      "Open Outlook and go to Settings, then “Add account”.",
      "Type your full school address and continue.",
      "Choose “IMAP” if Outlook asks you to pick an account type.",
      "Enter your password and finish.",
      "If it asks for servers, use mail.spiritlifesom.org for both.",
    ],
  },
  {
    id: "apple",
    app: "Apple Mail",
    where: "iPhone, iPad or Mac",
    steps: [
      "Open Settings, then “Apps”, then “Mail” (on a Mac: Mail → Settings → Accounts).",
      "Tap “Mail Accounts”, then “Add Account”, then “Other”.",
      "Tap “Add Mail Account” and fill in your name, school address and password.",
      "Tap “Next”, then choose “IMAP” at the top.",
      "For both Incoming and Outgoing Mail Server, enter mail.spiritlifesom.org, with your full address as the user name and your password.",
    ],
  },
  {
    // Not a mail app, but the same shape of problem: a screen three levels into
    // a server admin console that nobody finds by looking. Every message tells
    // people to change the password immediately, which is only an instruction
    // if they can reach the page.
    id: "password",
    app: "Change your password",
    where: "In the browser — do this first",
    steps: [
      `Go to ${MAIL_HOST} and sign in with your full address and current password.`,
      "In the menu on the left, open “Credentials”, then “Password”.",
      "In “New Password”, type the password you want from now on.",
      "In “Current Password”, type the one you are using at the moment.",
      "Save. Then sign in again with the new password everywhere, including the mail app on your phone, which will ask for it.",
    ],
  },
  {
    id: "thunderbird",
    app: "Thunderbird",
    where: "Windows, Mac or Linux",
    steps: [
      "Open Thunderbird and choose “New” then “Existing Mail Account”.",
      "Enter your name, your full school address and your password.",
      "Click “Continue”. Thunderbird finds the settings automatically.",
      "Make sure IMAP is selected, not POP3, then click “Done”.",
    ],
  },
];

const SETTINGS = [
  { label: "Incoming (IMAP)", value: `${MAIL_HOST}, port 993, SSL/TLS` },
  { label: "Outgoing (SMTP)", value: `${MAIL_HOST}, port 465, SSL/TLS` },
  { label: "User name", value: "your full email address" },
];

export const MailSetupGuide = ({ address }: { address?: string | null }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy — select the address and copy it by hand");
    }
  };

  return (
    <div className="space-y-3">
      {/* The browser option goes first and on its own: it needs no setup at
          all, so for most people the steps below are something they never have
          to open. */}
      <a
        href={`https://${WEBMAIL_HOST}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-[12px] border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
      >
        <Globe className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            Read your mail in the browser
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {WEBMAIL_HOST} — sign in with your address and password. Nothing to install.
          </span>
        </span>
        <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </a>

      <div className="flex items-start gap-2.5">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Prefer the mail app on your phone? Pick the one you already use and follow the steps.
        </p>
      </div>

      {address && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {address}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copyAddress} aria-label="Copy your address">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      )}

      <div className="divide-y divide-border rounded-[12px] border border-border">
        {GUIDES.map((guide) => (
          <Collapsible
            key={guide.id}
            open={open === guide.id}
            onOpenChange={(isOpen) => setOpen(isOpen ? guide.id : null)}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{guide.app}</span>
                <span className="block text-[13px] text-muted-foreground">{guide.where}</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  open === guide.id ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 text-[13px] leading-relaxed text-muted-foreground">
                {guide.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <details className="rounded-[12px] border border-border px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-semibold text-foreground">
          If your app asks for server settings
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {SETTINGS.map((row) => (
            <div key={row.label} className="rounded-md bg-muted px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-[13px] text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
};

export default MailSetupGuide;
