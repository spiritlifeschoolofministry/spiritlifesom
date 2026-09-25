import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * A student's own switch for the messages the school sends to their phone.
 *
 * Opt-out rather than opt-in: these students gave the school their number on a
 * registration form and are already in its WhatsApp group, so the starting
 * position is that the school may write to them. What has to be true is that
 * saying stop is easy, takes effect everywhere at once, and does not require
 * asking a person for a favour.
 *
 * It also shows whether the number on file can actually be reached, because a
 * student who never hears anything deserves to know it is their number and not
 * the school ignoring them.
 */
export default function WhatsAppPreference({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('whatsapp_opted_out_at, whatsapp_jid')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setOptedOut(Boolean(data.whatsapp_opted_out_at));
      setReachable(Boolean(data.whatsapp_jid));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (wantsMessages: boolean) => {
    setSaving(true);
    // The timestamp is the record: when somebody asked matters later as much as
    // that they asked. Opting back in clears it and notes the moment.
    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_opted_out_at: wantsMessages ? null : new Date().toISOString(),
        whatsapp_opted_in_at: wantsMessages ? new Date().toISOString() : undefined,
      } as never)
      .eq('id', userId);
    setSaving(false);

    if (error) {
      toast.error('Could not save your preference');
      return;
    }
    setOptedOut(!wantsMessages);
    toast.success(wantsMessages ? 'WhatsApp updates turned on' : 'WhatsApp updates turned off');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-5 w-5" /> WhatsApp updates
        </CardTitle>
        <CardDescription>
          Results, payment confirmations and admission decisions, sent to the number
          on your profile. School-wide notices in the group are separate and are not
          affected by this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="wa-opt" className="cursor-pointer">
                Send me WhatsApp updates
              </Label>
              <Switch
                id="wa-opt"
                checked={!optedOut}
                disabled={saving}
                onCheckedChange={(v) => void toggle(v)}
              />
            </div>
            {reachable === false && (
              <p className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                The phone number on your profile cannot be used for WhatsApp. Update it
                above so these messages can reach you.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
