import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateTimeRemaining } from "@/lib/timer";

interface Props { children: React.ReactNode; }

export const MaintenanceGate = ({ children }: Props) => {
  const { role } = useAuth();
  const [maintenance, setMaintenance] = useState(false);
  const [message, setMessage] = useState("We'll be back shortly. Thank you for your patience.");
  const [returnAt, setReturnAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const countdown = useMemo(() => calculateTimeRemaining(returnAt), [returnAt, now]);

  const fetchFlag = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["maintenance_mode", "maintenance_message", "maintenance_return_at"]);
      const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
      const raw = map.maintenance_mode;
      const on = raw === true || raw === "true" || (typeof raw === "string" && raw.toLowerCase() === "true");
      setMaintenance(on);
      if (map.maintenance_message) {
        const m = typeof map.maintenance_message === "string" ? map.maintenance_message : JSON.stringify(map.maintenance_message);
        setMessage(m.replace(/^"|"$/g, ""));
      }
      const eta = map.maintenance_return_at;
      if (typeof eta === "string" && eta.trim()) setReturnAt(eta);
      else setReturnAt(null);
    } catch (e) { /* fail-open */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchFlag();
    const ch = supabase
      .channel("system_settings_maintenance")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, fetchFlag)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!maintenance || !returnAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [maintenance, returnAt]);

  if (loading) return <>{children}</>;

  const normalizedRole = (role || "").toLowerCase();
  const isStaff = normalizedRole === "admin" || normalizedRole === "teacher";

  if (maintenance && !isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="max-w-lg w-full text-center space-y-6 p-8 rounded-2xl border bg-card shadow-lg">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">We're Under Maintenance</h1>
          <p className="text-muted-foreground whitespace-pre-line">{message}</p>
          {returnAt ? (
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-center gap-2">
                <Badge variant={countdown.isExpired ? "destructive" : countdown.isUrgent ? "secondary" : "outline"}>
                  {countdown.isExpired
                    ? "ETA passed"
                    : `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m ${countdown.seconds}s`}
                </Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Estimated return</p>
                <p className="font-medium text-foreground">
                  {new Date(returnAt).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Please check back soon</span>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default MaintenanceGate;
