import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, MessageCircle, Save, Users } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The switches for the WhatsApp alerts.
 *
 * Every one of these used to be an Edge Function environment variable, which
 * meant silencing a noisy alert, or changing who receives them, needed a
 * developer. They belong to whoever runs the school.
 */

type Settings = {
  enabled: boolean;
  admin_jids: string[];
  official_group_jid: string | null;
  alert_payment_receipt: boolean;
  alert_admissions_digest: boolean;
  alert_exam_integrity: boolean;
  alert_device_conflict: boolean;
  alert_exam_close_digest: boolean;
  alert_grading_backlog: boolean;
  alert_revenue_digest: boolean;
  alert_ops_check: boolean;
  mirror_announcements: boolean;
  alert_exam_published: boolean;
  alert_exam_starting_soon: boolean;
  grading_backlog_days: number;
  quota_warn_percent: number;
  exam_reminder_minutes: number;
  message_signature: string;
};

/** Grouped by who receives them, because that is the distinction that matters:
 *  the first list goes to a handful of named admins and may name a student, the
 *  second goes to a group of seventy-seven and never may. */
const DIRECT_ALERTS: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'alert_payment_receipt', label: 'New payment receipt', help: 'When a student submits a receipt awaiting review.' },
  { key: 'alert_admissions_digest', label: 'Admissions digest', help: 'Daily, 07:00 — applications, name changes and learning-mode changes waiting on a decision.' },
  { key: 'alert_exam_integrity', label: 'Exam stopped for proctoring', help: 'When a sitting is auto-submitted for tab switching or leaving fullscreen.' },
  { key: 'alert_device_conflict', label: 'Exam blocked — another device', help: 'When a student is locked out of a paper already open elsewhere.' },
  { key: 'alert_exam_close_digest', label: 'Exam close digest', help: 'Daily, 20:00 — how the papers that closed today ended.' },
  { key: 'alert_grading_backlog', label: 'Results not released', help: 'Mondays, 07:30 — papers sat but never given back to students.' },
  { key: 'alert_revenue_digest', label: 'Fees digest', help: 'Mondays, 08:00 — collected, outstanding and anything that does not reconcile.' },
  { key: 'alert_ops_check', label: 'Storage and system check', help: 'Daily, 06:00 — only when a quota is filling up or AI calls are failing.' },
];

const GROUP_ALERTS: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'mirror_announcements', label: 'Mirror announcements', help: 'Post announcements ticked for WhatsApp to the official group.' },
  { key: 'alert_exam_published', label: 'Exam published', help: 'Tell the group when a new exam opens.' },
  { key: 'alert_exam_starting_soon', label: 'Exam starting soon', help: 'Remind the group before an exam begins.' },
];

export default function WhatsAppSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jidText, setJidText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      toast.error('Could not load WhatsApp settings');
    } else if (data) {
      setSettings(data as unknown as Settings);
      setJidText((data.admin_jids ?? []).join('\n'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const onSave = async () => {
    if (!settings) return;
    // One number per line, pasted however the person had them. A missing
    // @s.whatsapp.net is the most likely mistake, so it is added rather than
    // rejected -- and a plain 0803... is turned into its international form,
    // because WhatsApp will not match the local one.
    const jids = jidText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((raw) => {
        if (raw.includes('@')) return raw;
        const digits = raw.replace(/[^\d]/g, '');
        const international = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
        return `${international}@s.whatsapp.net`;
      });

    setSaving(true);
    const { error } = await supabase
      .from('whatsapp_settings')
      .update({ ...settings, admin_jids: jids } as never)
      .eq('id', true);
    setSaving(false);

    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    toast.success('WhatsApp settings saved');
    setJidText(jids.join('\n'));
    set('admin_jids', jids);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No settings row</AlertTitle>
        <AlertDescription>The whatsapp_settings row is missing. Re-run the migration.</AlertDescription>
      </Alert>
    );
  }

  const rowFor = (item: { key: keyof Settings; label: string; help: string }) => (
    <div key={String(item.key)} className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
      <div className="space-y-0.5">
        <Label htmlFor={String(item.key)} className="cursor-pointer">{item.label}</Label>
        <p className="text-xs text-muted-foreground">{item.help}</p>
      </div>
      <Switch
        id={String(item.key)}
        checked={Boolean(settings[item.key])}
        onCheckedChange={(v) => set(item.key, v as never)}
        disabled={!settings.enabled}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageCircle className="h-6 w-6" /> WhatsApp Alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          What the school sends over WhatsApp, and who receives it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Master switch</CardTitle>
          <CardDescription>
            Off means nothing is sent at all, whatever the individual switches say.
            The one way to stop everything without unpicking eleven toggles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="cursor-pointer">WhatsApp alerts enabled</Label>
              <Badge variant={settings.enabled ? 'default' : 'secondary'}>
                {settings.enabled ? 'On' : 'Off'}
              </Badge>
            </div>
            <Switch id="enabled" checked={settings.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who receives admin alerts</CardTitle>
          <CardDescription>
            One number per line. A local number like 08066317437 is converted to its
            international form automatically. These alerts can name a student, so keep
            this list to people who should see that.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={jidText}
            onChange={(e) => setJidText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            placeholder="08066317437"
          />
          <div className="space-y-1">
            <Label htmlFor="group">Official group</Label>
            <Input
              id="group"
              value={settings.official_group_jid ?? ''}
              onChange={(e) => set('official_group_jid', e.target.value)}
              className="font-mono text-sm"
              placeholder="1203634...@g.us"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
              <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Group messages never carry one student&rsquo;s details &mdash; a balance, a
              score or a rejected receipt is refused if addressed to a group.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts to admins</CardTitle>
          <CardDescription>Sent privately to the numbers above.</CardDescription>
        </CardHeader>
        <CardContent className="py-0">{DIRECT_ALERTS.map(rowFor)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posts to the group</CardTitle>
          <CardDescription>Seen by everyone in the official group.</CardDescription>
        </CardHeader>
        <CardContent className="py-0">{GROUP_ALERTS.map(rowFor)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signature</CardTitle>
          <CardDescription>
            Added to the end of every message the system sends. A message from the
            school&rsquo;s number looks the same whether a person or the system wrote
            it, and nobody reads the replies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={settings.message_signature ?? ''}
            onChange={(e) => set('message_signature', e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Underscores make text italic in WhatsApp. Leave blank to send nothing.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thresholds</CardTitle>
          <CardDescription>When a digest decides something is worth saying.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="backlog">Unreleased after (days)</Label>
            <Input id="backlog" type="number" min={1} max={60}
              value={settings.grading_backlog_days}
              onChange={(e) => set('grading_backlog_days', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quota">Warn at quota (%)</Label>
            <Input id="quota" type="number" min={10} max={99}
              value={settings.quota_warn_percent}
              onChange={(e) => set('quota_warn_percent', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reminder">Exam reminder (minutes)</Label>
            <Input id="reminder" type="number" min={5} max={1440}
              value={settings.exam_reminder_minutes}
              onChange={(e) => set('exam_reminder_minutes', Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
}
