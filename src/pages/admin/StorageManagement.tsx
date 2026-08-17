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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Database,
  PlugZap,
  ScanSearch,
  Trash2,
} from 'lucide-react';
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

/** R2's free tier allowance. Override per-environment with VITE_R2_LIMIT_GB. */
const R2_LIMIT_BYTES = (Number(import.meta.env.VITE_R2_LIMIT_GB) || 10) * 1024 ** 3;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleDateString();
}

interface ScanResult {
  pending: Record<string, number>;
  migrated: Record<string, number>;
  totalPending: number;
  totalMigrated: number;
  relinkPending: number;
  publicBase: string;
}

interface UsageResult {
  total_bytes: number;
  total_files: number;
  limit_bytes: number;
  percent_used: number;
  plan?: string | null;
  buckets: Array<{ name: string; bytes: number; files: number }>;
}

interface AuditFile {
  key: string;
  size: number;
  lastModified: string;
  used: boolean;
  recent: boolean;
}

interface AuditResult {
  objects: number;
  bytes: number;
  usedCount: number;
  usedBytes: number;
  unusedCount: number;
  unusedBytes: number;
  recentCount: number;
  truncated: boolean;
  graceMinutes: number;
  files: AuditFile[];
  fileLimit: number;
}

/** Fraction of a quota consumed, clamped so the bar never overshoots. */
function usedPercent(bytes: number, limit: number): number {
  if (!limit) return 0;
  return Math.min(100, (bytes / limit) * 100);
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
  const [inventory, setInventory] = useState<{ objects: number; bytes: number } | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmDeleteFiles, setConfirmDeleteFiles] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState(false);

  /** Space used and left in Supabase Storage. */
  const loadUsage = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('storage-usage');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setUsage(data as UsageResult);
    } catch {
      setUsage(null);
    }
  }, []);

  /** Walks R2 and marks every object as still referenced or orphaned. */
  const runAudit = useCallback(async (quiet = false) => {
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-storage', { body: { action: 'audit' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = data as AuditResult;
      setAudit(result);
      setSelectedKeys(new Set());
      if (!quiet) {
        toast.success(
          result.unusedCount > 0
            ? `${result.unusedCount} unused file(s) found — ${formatBytes(result.unusedBytes)} reclaimable`
            : 'Every file in R2 is still in use',
        );
      }
    } catch (err) {
      if (!quiet) toast.error(err instanceof Error ? err.message : 'Storage audit failed');
    } finally {
      setAuditing(false);
    }
  }, []);

  const runScan = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-storage', { body: { action: 'scan' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScan(data as ScanResult);
      // Live figure from R2 itself — the Cloudflare dashboard's count lags badly.
      try {
        const inv = await r2Storage.list();
        setInventory({ objects: inv.objects, bytes: inv.bytes });
        setR2Status('ok');
      } catch {
        setInventory(null);
      }
      await loadUsage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan storage');
    } finally {
      setLoading(false);
    }
  }, [loadUsage]);

  useEffect(() => { runScan(); }, [runScan]);

  /** Full sweep behind the one button: counts, quotas and the orphan audit. */
  const runFullScan = async () => {
    await runScan();
    await runAudit();
  };

  const deleteSelectedFiles = async () => {
    const keys = Array.from(selectedKeys);
    setDeletingFiles(true);
    try {
      // The function caps a batch at 200, so a big selection goes in chunks.
      let deleted = 0;
      let kept = 0;
      for (let i = 0; i < keys.length; i += 200) {
        const { data, error } = await supabase.functions.invoke('migrate-storage', {
          body: { action: 'delete-unused', keys: keys.slice(i, i + 200) },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        deleted += data.deleted ?? 0;
        kept += data.kept ?? 0;
      }

      if (kept) {
        toast.warning(`Deleted ${deleted}, kept ${kept} still in use or too new`);
      } else {
        toast.success(`Deleted ${deleted} file(s)`);
      }
      setConfirmDeleteFiles(false);
      await runAudit(true);
      await runScan(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingFiles(false);
    }
  };

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

  const supabaseUsed = usage?.total_bytes ?? 0;
  const supabaseLimit = usage?.limit_bytes ?? 0;
  const r2Used = inventory?.bytes ?? audit?.bytes ?? 0;

  const files = audit?.files ?? [];
  const visibleFiles = files.filter((f) => {
    if (unusedOnly && (f.used || f.recent)) return false;
    return f.key.toLowerCase().includes(fileSearch.trim().toLowerCase());
  });
  const deletableVisible = visibleFiles.filter((f) => !f.used && !f.recent);
  const allDeletableSelected =
    deletableVisible.length > 0 && deletableVisible.every((f) => selectedKeys.has(f.key));
  const selectedBytes = files
    .filter((f) => selectedKeys.has(f.key))
    .reduce((sum, f) => sum + f.size, 0);

  const toggleFile = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllDeletable = () => {
    if (allDeletableSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(deletableVisible.map((f) => f.key)));
  };

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
          <Button size="sm" onClick={runFullScan} disabled={loading || auditing || migrating || cleaning}>
            {auditing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <ScanSearch className="w-4 h-4 mr-1.5" />
            )}
            {auditing ? 'Scanning…' : 'Scan storage'}
          </Button>
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
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-bold">{formatBytes(supabaseUsed)}</p>
                <p className="text-sm text-muted-foreground">
                  {supabaseLimit ? `of ${formatBytes(supabaseLimit)}` : 'quota unknown'}
                </p>
              </div>
              {supabaseLimit > 0 && (
                <>
                  <Progress value={usedPercent(supabaseUsed, supabaseLimit)} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(Math.max(0, supabaseLimit - supabaseUsed))} free
                    {usage?.plan ? ` · ${usage.plan} plan` : ''}
                  </p>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {usage ? `${usage.total_files.toLocaleString()} file(s) stored · ` : ''}
              {scan?.totalPending ?? 0} still to migrate
            </p>
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
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-bold">{formatBytes(r2Used)}</p>
                <p className="text-sm text-muted-foreground">of {formatBytes(R2_LIMIT_BYTES)}</p>
              </div>
              <Progress value={usedPercent(r2Used, R2_LIMIT_BYTES)} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(Math.max(0, R2_LIMIT_BYTES - r2Used))} free
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {inventory ? `${inventory.objects.toLocaleString()} object(s) · ` : ''}
              {scan?.totalMigrated ?? 0} record(s) served from R2
            </p>
            {audit && audit.unusedCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {audit.unusedCount} unused file(s) holding {formatBytes(audit.unusedBytes)}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate">{scan?.publicBase || R2_PUBLIC_BASE}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
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
          {usage && usage.buckets.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Space per Supabase bucket</CardTitle>
                <CardDescription>Measured live by walking each bucket</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {usage.buckets.map((b) => (
                  <div key={b.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatBytes(b.bytes)} · {b.files.toLocaleString()} file(s)
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files" className="pt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Files in R2</CardTitle>
                  <CardDescription>
                    Every object is checked against the database. Anything no record points at is marked unused and
                    can be deleted to reclaim space.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => runAudit()} disabled={auditing}>
                  {auditing ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <ScanSearch className="w-4 h-4 mr-1.5" />
                  )}
                  {audit ? 'Rescan files' : 'Scan files'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!audit ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {auditing ? 'Scanning the bucket…' : 'Run a scan to list every stored file and find unused ones.'}
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="text-lg font-bold">{formatBytes(audit.bytes)}</p>
                      <p className="text-xs text-muted-foreground">{audit.objects.toLocaleString()} file(s)</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">In use</p>
                      <p className="text-lg font-bold">{formatBytes(audit.usedBytes)}</p>
                      <p className="text-xs text-muted-foreground">{audit.usedCount.toLocaleString()} file(s)</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Unused</p>
                      <p className="text-lg font-bold">{formatBytes(audit.unusedBytes)}</p>
                      <p className="text-xs text-muted-foreground">
                        {audit.unusedCount.toLocaleString()} file(s) reclaimable
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Filter by name…"
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      className="sm:max-w-xs"
                    />
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                      <Checkbox checked={unusedOnly} onCheckedChange={(v) => setUnusedOnly(v === true)} />
                      Unused only
                    </label>
                    {deletableVisible.length > 0 && (
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <Checkbox checked={allDeletableSelected} onCheckedChange={toggleAllDeletable} />
                        Select all unused shown
                      </label>
                    )}
                    {selectedKeys.size > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="ml-auto"
                        onClick={() => setConfirmDeleteFiles(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Delete {selectedKeys.size} ({formatBytes(selectedBytes)})
                      </Button>
                    )}
                  </div>

                  {audit.recentCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {audit.recentCount} unreferenced file(s) uploaded in the last {audit.graceMinutes} minutes are
                      held back — a record may still be saving.
                    </p>
                  )}

                  {visibleFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No files match.</p>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-[480px] overflow-y-auto">
                      {visibleFiles.map((f) => {
                        const deletable = !f.used && !f.recent;
                        return (
                          <div key={f.key} className="flex items-center gap-3 p-2.5 text-sm hover:bg-muted/50">
                            {deletable ? (
                              <Checkbox
                                checked={selectedKeys.has(f.key)}
                                onCheckedChange={() => toggleFile(f.key)}
                                className="shrink-0"
                              />
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <a
                              href={`${scan?.publicBase || R2_PUBLIC_BASE}/${f.key.split('/').map(encodeURIComponent).join('/')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 truncate font-mono text-xs hover:underline"
                              title={f.key}
                            >
                              {f.key}
                            </a>
                            {f.used ? (
                              <Badge variant="secondary" className="text-[10px] shrink-0">In use</Badge>
                            ) : f.recent ? (
                              <Badge variant="outline" className="text-[10px] shrink-0">Just uploaded</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] shrink-0">Unused</Badge>
                            )}
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums w-20 text-right">
                              {formatBytes(f.size)}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline w-24 text-right">
                              {formatDate(f.lastModified)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground italic">
                    {audit.objects > audit.fileLimit
                      ? `Showing the ${audit.fileLimit} largest of ${audit.objects} files. `
                      : ''}
                    Counted live from R2 — the Cloudflare dashboard&apos;s totals lag by hours.
                  </p>
                </>
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
        open={confirmDeleteFiles}
        onOpenChange={setConfirmDeleteFiles}
        title={`Delete ${selectedKeys.size} unused file(s)?`}
        description={
          <>
            <p>
              This permanently removes {formatBytes(selectedBytes)} from Cloudflare R2. Each file is re-checked
              server-side first — anything a record still points at is kept.
            </p>
            <ul className="rounded border bg-muted/40 p-2 font-mono text-xs space-y-0.5 max-h-32 overflow-y-auto">
              {Array.from(selectedKeys).slice(0, 20).map((k) => (
                <li key={k} className="truncate">{k}</li>
              ))}
              {selectedKeys.size > 20 && <li>…and {selectedKeys.size - 20} more</li>}
            </ul>
          </>
        }
        confirmLabel="Delete permanently"
        variant="destructive"
        loading={deletingFiles}
        onConfirm={deleteSelectedFiles}
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
