import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { HardDrive, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BucketStat { name: string; bytes: number; files: number; }
interface UsageData {
  total_bytes: number;
  total_files: number;
  limit_bytes: number;
  percent_used: number;
  plan?: string | null;
  limit_source?: string;
  buckets: BucketStat[];
}

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function StorageUsageCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("storage-usage");
    if (error || res?.error) {
      toast.error(res?.error || error?.message || "Failed to load storage usage");
    } else {
      setData(res);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pct = data?.percent_used ?? 0;
  const barColor = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <HardDrive className="h-5 w-5" /> Storage Usage
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <p className="text-sm text-muted-foreground">{loading ? "Calculating…" : "No data yet"}</p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-2xl font-bold">{fmt(data.total_bytes)}</p>
                <p className="text-sm text-muted-foreground">of {fmt(data.limit_bytes)} ({pct.toFixed(1)}%)</p>
              </div>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{data.total_files.toLocaleString()} files across {data.buckets.length} buckets</p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per Bucket</p>
              {data.buckets.map((b) => (
                <div key={b.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground">{fmt(b.bytes)} · {b.files} files</span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              {data.plan ? <>Detected plan: <span className="font-semibold uppercase">{data.plan}</span> ({data.limit_source}). </> : null}
              Auto-detects via Management API using <code>SB_MGMT_ACCESS_TOKEN</code>. Override with <code>SUPABASE_PLAN</code> (free/pro/team) or <code>STORAGE_LIMIT_BYTES</code>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
