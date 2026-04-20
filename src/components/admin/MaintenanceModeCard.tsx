import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wrench, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function MaintenanceModeCard() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("We'll be back shortly. Thank you for your patience.");
  const [returnAt, setReturnAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["maintenance_mode", "maintenance_message", "maintenance_return_at"]);
    const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    const raw = map.maintenance_mode;
    setEnabled(raw === true || raw === "true" || (typeof raw === "string" && raw.toLowerCase() === "true"));
    if (map.maintenance_message) {
      const m = typeof map.maintenance_message === "string" ? map.maintenance_message : JSON.stringify(map.maintenance_message);
      setMessage(m.replace(/^"|"$/g, ""));
    }
    const eta = map.maintenance_return_at;
    setReturnAt(typeof eta === "string" ? eta.slice(0, 16) : "");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (next: boolean, nextMsg?: string, nextReturnAt?: string) => {
    setSaving(true);
    const upserts = [
      { key: "maintenance_mode", value: next as any, updated_at: new Date().toISOString() },
      { key: "maintenance_message", value: (nextMsg ?? message) as any, updated_at: new Date().toISOString() },
      { key: "maintenance_return_at", value: (nextReturnAt ? new Date(nextReturnAt).toISOString() : null) as any, updated_at: new Date().toISOString() },
    ];
    for (const u of upserts) {
      const { error } = await supabase.from("system_settings").upsert(u, { onConflict: "key" });
      if (error) {
        toast.error("Failed to update maintenance mode");
        setSaving(false);
        return;
      }
    }
    setEnabled(next);
    if (typeof nextReturnAt === "string") setReturnAt(nextReturnAt);
    toast.success(next ? "Maintenance mode ENABLED — students locked out" : "Maintenance mode disabled");
    setSaving(false);
  };

  return (
    <Card className={enabled ? "border-amber-500/60 shadow-[0_0_0_1px_hsl(var(--destructive)/0.2)]" : ""}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wrench className="h-5 w-5" /> Maintenance Mode
          {enabled && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
              <AlertTriangle className="h-3 w-3" /> ACTIVE
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/40">
              <div className="pr-4">
                <Label className="text-base font-medium">Lock public & student access</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Visitors and students will see a maintenance screen. Admins and teachers always retain access.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={(v) => save(v)} disabled={saving} />
            </div>

            <div>
              <Label htmlFor="maint-msg">Message shown to users</Label>
              <Textarea
                id="maint-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="mt-2"
                placeholder="We'll be back shortly. Thank you for your patience."
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="outline" onClick={() => save(enabled, message, returnAt)} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save Message
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="maint-return-at">Estimated return time</Label>
              <Input
                id="maint-return-at"
                type="datetime-local"
                value={returnAt}
                onChange={(e) => setReturnAt(e.target.value)}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Leave blank if you do not want to show a countdown on the maintenance screen.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
