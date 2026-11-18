import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLikelyMatch, type LinkCandidate, type OffPortalMailbox } from "@/lib/mailbox-match";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  mailbox: OffPortalMailbox | null;
  /** Portal accounts without an active mailbox. */
  candidates: LinkCandidate[];
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

/**
 * Moves an off-portal mailbox onto a portal account.
 *
 * The mail and password do not change; what changes is that the address now
 * belongs to an account, so it shows on that person's profile and can be used
 * to sign in to the portal.
 */
export const LinkMailboxDialog = ({ mailbox, candidates, onOpenChange, onLinked }: Props) => {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setQuery(""); setChosen(null); }, [mailbox?.id]);

  const { suggested, others } = useMemo(() => {
    if (!mailbox) return { suggested: [], others: [] };
    const term = query.trim().toLowerCase();
    const hit = (p: LinkCandidate) =>
      !term || `${p.name} ${p.email ?? ""}`.toLowerCase().includes(term);
    const suggested = candidates.filter((p) => isLikelyMatch(mailbox, p) && hit(p));
    const others = candidates.filter((p) => !isLikelyMatch(mailbox, p) && hit(p)).slice(0, 50);
    return { suggested, others };
  }, [mailbox, candidates, query]);

  const chosenPerson = candidates.find((p) => p.id === chosen) ?? null;

  const link = async () => {
    if (!mailbox || !chosen) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("mailbox-admin", {
      body: { action: "link", mailbox_id: mailbox.id, profile_id: chosen },
    });
    let reason: string | null = (data as { error?: string } | null)?.error ?? null;
    if (error && !reason) {
      reason = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json() : null;
        if (parsed?.error) reason = parsed.error;
      } catch { /* keep the generic message */ }
    }
    setSaving(false);
    if (reason) {
      toast.error(reason);
      return;
    }
    toast.success(`${mailbox.address} now belongs to ${chosenPerson?.name ?? "that account"}`);
    onOpenChange(false);
    onLinked();
  };

  const row = (p: LinkCandidate, tag?: string) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => setChosen(p.id)}
        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
          chosen === p.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
        }`}
      >
        <span className="font-medium text-foreground">{p.name}</span>
        {tag && <span className="ml-2 text-[11px] font-semibold text-primary">{tag}</span>}
        <span className="block truncate text-xs text-muted-foreground">
          {p.email ?? "no email"} · {p.role}
        </span>
      </button>
    </li>
  );

  return (
    <Dialog open={!!mailbox} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to portal account</DialogTitle>
          <DialogDescription>
            Give <strong>{mailbox?.address}</strong> (held by {mailbox?.holder_name}) to a portal account. Its mail
            and password stay the same. Afterwards it shows on that person's profile and they can use it to sign in
            to the portal with their portal password.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search portal accounts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={saving}
        />

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {suggested.map((p) => row(p, "Likely match"))}
          {others.map((p) => row(p))}
          {suggested.length === 0 && others.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No portal account without a mailbox matches. The person may need to register first.
            </li>
          )}
        </ul>

        {chosenPerson && (
          <p className="text-xs text-muted-foreground">
            The holder name and contact details on this mailbox will be replaced by{" "}
            <strong>{chosenPerson.name}</strong>'s own. The old details are kept in the audit log.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={link} disabled={!chosen || saving}>
            {saving ? "Linking…" : "Link mailbox"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
