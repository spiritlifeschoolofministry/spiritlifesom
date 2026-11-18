import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface WhatsAppRecipient {
  profileId: string;
  name: string;
}

/** Must match MAX_RECIPIENTS / MAX_TEXT in the whatsapp-direct-send function. */
export const WHATSAPP_MAX_RECIPIENTS = 10;
const MAX_TEXT = 1000;

interface Props {
  recipients: WhatsAppRecipient[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Type a WhatsApp message to up to ten chosen people.
 *
 * The limits live in the edge function; this only explains them. Messages go
 * from the school's own number, so the dialog says so before anything is sent.
 */
export const WhatsAppSendDialog = ({ recipients, open, onOpenChange }: Props) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (open) setText(""); }, [open]);

  const tooMany = recipients.length > WHATSAPP_MAX_RECIPIENTS;

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-direct-send", {
        body: { profile_ids: recipients.map((r) => r.profileId), text },
      });
      // A 4xx from the function arrives as `error`; its JSON body has the reason.
      if (error) {
        let reason = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          const parsed = ctx ? await ctx.json() : null;
          if (parsed?.error) reason = parsed.error;
        } catch { /* keep the generic message */ }
        throw new Error(reason);
      }
      const res = data as {
        sent: number;
        total: number;
        results: { name: string; sent: boolean; reason?: string }[];
      };
      const failed = res.results.filter((r) => !r.sent);
      if (res.sent > 0) toast.success(`WhatsApp sent to ${res.sent} of ${res.total}`);
      failed.forEach((f) => toast.error(`${f.name}: ${f.reason ?? "not sent"}`));
      if (res.sent > 0) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WhatsApp could not be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {recipients.length === 1 ? `WhatsApp ${recipients[0].name}` : `WhatsApp ${recipients.length} people`}
          </DialogTitle>
          <DialogDescription>
            Sent from the school's WhatsApp number. Anyone without a number on file, or who has opted out, is skipped.
          </DialogDescription>
        </DialogHeader>

        {recipients.length > 1 && (
          <p className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
            {recipients.map((r) => r.name).join(", ")}
          </p>
        )}

        {tooMany ? (
          <p className="text-sm text-destructive">
            At most {WHATSAPP_MAX_RECIPIENTS} people per message. Messaging many people this way can get the
            school's number blocked; use an announcement instead.
          </p>
        ) : (
          <div className="space-y-1">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              placeholder="Type your message…"
              rows={5}
              disabled={sending}
            />
            <p className="text-[11px] text-muted-foreground text-right">{text.length}/{MAX_TEXT}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || tooMany || !text.trim()}>
            {sending ? "Sending…" : "Send WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
