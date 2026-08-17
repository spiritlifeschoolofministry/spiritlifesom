import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { r2Storage, R2_PUBLIC_BASE } from '@/lib/r2-storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, HardDrive, Database, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const SOURCE_LABELS: Record<string, string> = {
  payments: 'Payment receipts',
  course_materials: 'Course materials',
  assignment_submissions: 'Assignment submissions',
  exam_snapshots: 'Proctoring snapshots',
  'profiles.avatar_url': 'Student & staff avatars',
  'faculty_members.photo_url': 'Faculty photos',
};

interface ScanResult {
  pending: Record<string, number>;
  migrated: Record<string, number>;
  totalPending: number;
  totalMigrated: number;
  relinkPending: number;
  publicBase: string;
}

export default function StorageManagement() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<Array<{ ref: string; error?: string }>>([]);
  const [r2Status, setR2Status] = useState<'unknown' | 'ok' | 'down'>('unknown');

  const runScan = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-storage', { body: { action: 'scan' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScan(data as ScanResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan storage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const testR2 = async () => {
    try {
      await r2Storage.ping();
      setR2Status('ok');
      toast.success('R2 is reachable');
    } catch (err) {
      setR2Status('down');
      toast.error(err instanceof Error ? err.message : 'R2 is unreachable');
    }
  };

  /** Keeps invoking the function until it reports nothing left to do. */
  const runMigration = async () => {
    setMigrating(true);
    setFailures([]);
    const total = scan?.totalPending ?? 0;
    setProgress({ done: 0, total });

    let done = 0;
    const collected: Array<{ ref: string; error?: string }> = [];

    try {
      // Bounded so a persistently failing row cannot spin forever.
      for (let round = 0; round < 200; round++) {
        const { data, error } = await supabase.functions.invoke('migrate-storage', {
          body: { action: 'migrate', limit: 20 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (!data.processed) break;
        done += data.processed;
        setProgress({ done, total: Math.max(total, done) });
        if (data.failures?.length) collected.push(...data.failures);

        // Every row in this round failed, so another identical round is pointless.
        if (data.succeeded === 0) break;
      }

      setFailures(collected);
      if (collected.length) toast.warning(`Migration finished with ${collected.length} failure(s)`);
      else toast.success('Migration complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setMigrating(false);
      await runScan(true);
    }
  };

  /** Repoint legacy URL columns (payment_proof_url, file_url) at R2. */
  const runRelink = async () => {
    setRelinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-storage', { body: { action: 'relink' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.skipped) toast.warning(`Relinked ${data.updated}, skipped ${data.skipped}`);
      else toast.success(`Relinked ${data.updated} record(s) to R2`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Relink failed');
    } finally {
      setRelinking(false);
      await runScan(true);
    }
  };

  const runCleanup = async () => {
    setCleaning(true);
    let deleted = 0;
    let kept = 0;
    try {
      for (let round = 0; round < 200; round++) {
        const { data, error } = await supabase.functions.invoke('migrate-storage', {
          body: { action: 'cleanup', limit: 25 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data.processed) break;
        deleted += data.deleted;
        kept += data.kept;
        if (data.deleted === 0) break;
      }
      toast.success(`Cleanup done — ${deleted} original(s) removed${kept ? `, ${kept} kept back` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      setCleaning(false);
      await runScan(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const rows = Object.keys(SOURCE_LABELS)
    .map((key) => ({
      key,
      label: SOURCE_LABELS[key],
      pending: scan?.pending?.[key] ?? 0,
      migrated: scan?.migrated?.[key] ?? 0,
    }))
    .filter((r) => r.pending > 0 || r.migrated > 0);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const allMigrated = (scan?.totalPending ?? 0) === 0;
  const relinkPending = scan?.relinkPending ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Storage Management</h1>
          <p className="text-sm text-muted-foreground">
            Track and migrate files between Supabase Storage and Cloudflare R2
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runScan()} disabled={migrating || cleaning}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Rescan
          </Button>
          <Button variant="outline" size="sm" onClick={testR2}>
            <PlugZap className="w-4 h-4 mr-1.5" /> Test R2
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="w-4 h-4" /> Supabase Storage
              </CardTitle>
              <Badge variant="secondary">Legacy</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{scan?.totalPending ?? 0}</p>
            <p className="text-sm text-muted-foreground">files still to migrate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="w-4 h-4" /> Cloudflare R2
              </CardTitle>
              <Badge variant={r2Status === 'down' ? 'destructive' : 'default'}>
                {r2Status === 'ok' ? 'Reachable' : r2Status === 'down' ? 'Unreachable' : 'Active'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{scan?.totalMigrated ?? 0}</p>
            <p className="text-sm text-muted-foreground">files served from R2</p>
            <p className="text-xs text-muted-foreground mt-2 truncate">{scan?.publicBase || R2_PUBLIC_BASE}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="migrate">Migrate</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where every file lives</CardTitle>
              <CardDescription>Counted from the database, grouped by what the files are</CardDescription>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No files found in any tracked location.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File type</TableHead>
                        <TableHead className="text-right">On Supabase</TableHead>
                        <TableHead className="text-right">On R2</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="text-right">{r.pending}</TableCell>
                          <TableCell className="text-right">{r.migrated}</TableCell>
                          <TableCell className="text-right">
                            {r.pending === 0 ? (
                              <Badge variant="default" className="text-[10px]">Done</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="migrate" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Copy files to R2</CardTitle>
              <CardDescription>
                Runs server-side in batches. Originals are left untouched in Supabase — removing them is the
                separate Cleanup step.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {migrating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Migrating…</span>
                    <span>{progress.done} / {progress.total || '?'}</span>
                  </div>
                  <Progress value={pct} />
                </div>
              )}

              {allMigrated ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Nothing pending</AlertTitle>
                  <AlertDescription>Every tracked file already lives in R2.</AlertDescription>
                </Alert>
              ) : (
                <Button onClick={() => setConfirmMigrate(true)} disabled={migrating} className="w-full">
                  {migrating && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {migrating ? 'Migrating…' : `Migrate ${scan?.totalPending ?? 0} file(s) to R2`}
                </Button>
              )}

              {failures.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{failures.length} file(s) could not be migrated</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 space-y-1 text-xs font-mono max-h-40 overflow-y-auto">
                      {failures.map((f, i) => (
                        <li key={i}>{f.ref} — {f.error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cleanup" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delete Supabase originals</CardTitle>
              <CardDescription>
                Only files re-verified as present in R2 are deleted. Anything that cannot be confirmed is kept.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!allMigrated && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Finish migrating first</AlertTitle>
                  <AlertDescription>
                    {scan?.totalPending} file(s) are still only on Supabase. Deleting now would lose them.
                  </AlertDescription>
                </Alert>
              )}
              {relinkPending > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Repoint the old links first</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      {relinkPending} record(s) have their file in R2 but their legacy link column still pointing at
                      Supabase. Pages that use those columns would break if the originals were deleted.
                    </p>
                    <Button size="sm" variant="outline" onClick={runRelink} disabled={relinking}>
                      {relinking && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                      Relink {relinkPending} record(s) to R2
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <Button
                variant="destructive"
                className="w-full"
                disabled={cleaning || !allMigrated || relinkPending > 0}
                onClick={() => setConfirmCleanup(true)}
              >
                {cleaning && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {cleaning ? 'Deleting…' : 'Delete originals from Supabase Storage'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Avatar and faculty photo originals are not touched here — their database rows now point at R2, and the
                old bucket objects can be dropped from the Supabase dashboard once you are happy.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmMigrate}
        onOpenChange={setConfirmMigrate}
        title="Migrate files to R2?"
        description={`This copies ${scan?.totalPending ?? 0} file(s) into Cloudflare R2 and repoints their database records. Supabase originals are kept.`}
        confirmLabel="Start migration"
        onConfirm={() => { setConfirmMigrate(false); runMigration(); }}
      />

      <ConfirmDialog
        open={confirmCleanup}
        onOpenChange={setConfirmCleanup}
        title="Delete Supabase originals?"
        description="Each file is re-checked in R2 before its Supabase copy is deleted. This cannot be undone."
        confirmLabel="Delete originals"
        variant="destructive"
        onConfirm={() => { setConfirmCleanup(false); runCleanup(); }}
      />
    </div>
  );
}
