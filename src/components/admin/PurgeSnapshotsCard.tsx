import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";

interface PurgeResult {
  purged?: number;
  storage_files_removed?: number;
  retention_days?: number;
  cutoff?: string;
  message?: string;
}

export default function PurgeSnapshotsCard() {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<PurgeResult | null>(null);

  const run = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("purge-old-snapshots");
    if (error) {
      toast.error(error.message || "Purge failed");
    } else if (data?.error) {
      toast.error(String(data.error));
    } else {
      setLast(data as PurgeResult);
      const n = (data as PurgeResult)?.purged ?? 0;
      toast.success(n > 0 ? `Purged ${n} old snapshot${n === 1 ? "" : "s"}` : "Nothing to purge");
    }
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Camera className="h-5 w-5" /> Proctor Snapshots
        </CardTitle>
        <Button size="sm" variant="destructive" onClick={run} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Run purge now
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Deletes proctor snapshot files & records older than 30 days. Runs automatically on a daily schedule, but you can trigger it manually.
        </p>
        {last ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
            <p><span className="font-semibold">Last run:</span> purged {last.purged ?? 0} record(s), removed {last.storage_files_removed ?? 0} file(s).</p>
            {last.cutoff ? <p className="text-muted-foreground">Cutoff: {new Date(last.cutoff).toLocaleString()}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}