import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Folder,
  ChevronLeft,
  RefreshCw,
  Trash2,
  Loader2,
  FileText,
  Download,
  FolderOpen,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

interface StorageItem {
  name: string;
  id: string | null;
  metadata: { size?: number; mimetype?: string } | null;
  updated_at?: string | null;
}

const CHALLENGE = "DELETE";

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const isImage = (it: StorageItem) => {
  const mime = it.metadata?.mimetype || "";
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(it.name);
};

export default function StorageBrowserCard() {
  const [buckets, setBuckets] = useState<{ name: string; public: boolean }[]>([]);
  const [bucket, setBucket] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [challenge, setChallenge] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [grandTotal, setGrandTotal] = useState<{ files: number; bytes: number; perBucket: Record<string, { files: number; bytes: number }> } | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(false);

  const currentBucket = useMemo(() => buckets.find((b) => b.name === bucket), [buckets, bucket]);

  // Recursively walk every folder in a bucket and tally file count + size
  const walkBucket = async (bucketName: string): Promise<{ files: number; bytes: number }> => {
    let files = 0;
    let bytes = 0;
    const queue: string[] = [""];
    let safety = 0;
    while (queue.length > 0 && safety < 5000) {
      safety++;
      const current = queue.shift()!;
      const { data, error } = await supabase.storage.from(bucketName).list(current, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) continue;
      for (const entry of data as StorageItem[]) {
        const isDir = entry.id === null || entry.metadata == null;
        const path = current ? `${current}/${entry.name}` : entry.name;
        if (isDir) {
          queue.push(path);
        } else {
          files++;
          bytes += Number(entry.metadata?.size ?? 0);
        }
      }
    }
    return { files, bytes };
  };

  const loadGrandTotal = async (bucketList: { name: string; public: boolean }[]) => {
    if (bucketList.length === 0) return;
    setTotalsLoading(true);
    const perBucket: Record<string, { files: number; bytes: number }> = {};
    let files = 0;
    let bytes = 0;
    await Promise.all(
      bucketList.map(async (b) => {
        const stats = await walkBucket(b.name);
        perBucket[b.name] = stats;
        files += stats.files;
        bytes += stats.bytes;
      }),
    );
    setGrandTotal({ files, bytes, perBucket });
    setTotalsLoading(false);
  };

  const loadBuckets = async () => {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      toast.error("Failed to load buckets");
      return;
    }
    const list = (data || []).map((b: any) => ({ name: b.name, public: !!b.public }));
    setBuckets(list);
    if (!bucket && list[0]) setBucket(list[0].name);
    loadGrandTotal(list);
  };

  const loadItems = async () => {
    if (!bucket) return;
    setLoading(true);
    setSelected(new Set());
    setThumbs({});
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 200,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      toast.error(error.message || "Failed to list files");
      setItems([]);
    } else {
      setItems((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadBuckets(); }, []);
  useEffect(() => { loadItems(); /* eslint-disable-next-line */ }, [bucket, prefix]);

  const isFolder = (it: StorageItem) => it.id === null || it.metadata == null;
  const fullPath = (name: string) => (prefix ? `${prefix}/${name}` : name);

  // Lazy-load thumbnails for image files in the current view
  useEffect(() => {
    if (!bucket || loading) return;
    const imageFiles = items.filter((it) => !isFolder(it) && isImage(it));
    if (imageFiles.length === 0) return;

    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const it of imageFiles) {
        const path = fullPath(it.name);
        if (currentBucket?.public) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          next[path] = data.publicUrl;
        } else {
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
          if (data?.signedUrl) next[path] = data.signedUrl;
        }
        if (cancelled) return;
      }
      if (!cancelled) setThumbs((prev) => ({ ...prev, ...next }));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, bucket, currentBucket?.public, loading]);

  const goUp = () => {
    if (!prefix) return;
    const parts = prefix.split("/");
    parts.pop();
    setPrefix(parts.join("/"));
  };

  const openDeleteSingle = (it: StorageItem) => {
    if (isFolder(it)) {
      toast.error("Open the folder, then delete files individually.");
      return;
    }
    setPendingPaths([fullPath(it.name)]);
    setChallenge("");
    setConfirmOpen(true);
  };

  const openDeleteSelected = () => {
    if (selected.size === 0) return;
    setPendingPaths(Array.from(selected));
    setChallenge("");
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (challenge !== CHALLENGE || pendingPaths.length === 0) return;
    setDeleting(true);
    const { error } = await supabase.storage.from(bucket).remove(pendingPaths);
    setDeleting(false);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success(`${pendingPaths.length} file${pendingPaths.length === 1 ? "" : "s"} deleted`);
    const removed = new Set(pendingPaths);
    setItems((prev) => prev.filter((x) => !removed.has(fullPath(x.name))));
    setSelected(new Set());
    setConfirmOpen(false);
    setPendingPaths([]);
    setChallenge("");
  };

  const openFile = async (it: StorageItem) => {
    const path = fullPath(it.name);
    if (currentBucket?.public) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const filtered = items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()));
  const selectableFiles = filtered.filter((it) => !isFolder(it));
  const allSelected =
    selectableFiles.length > 0 && selectableFiles.every((it) => selected.has(fullPath(it.name)));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableFiles.map((it) => fullPath(it.name))));
    }
  };

  const toggleOne = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Storage Browser
          </CardTitle>
          <Button size="sm" variant="outline" onClick={loadItems} disabled={loading || !bucket} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={bucket} onValueChange={(v) => { setBucket(v); setPrefix(""); }}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Select bucket" /></SelectTrigger>
            <SelectContent>
              {buckets.map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name} {b.public ? "(public)" : "(private)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Total storage (all buckets)
            </div>
            {totalsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : grandTotal ? (
              <div className="text-sm font-bold tabular-nums">
                {fmt(grandTotal.bytes)}{" "}
                <span className="text-muted-foreground font-normal">
                  · {grandTotal.files.toLocaleString()} files
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          {grandTotal && buckets.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
              {buckets.map((b) => {
                const s = grandTotal.perBucket[b.name];
                if (!s) return null;
                return (
                  <div key={b.name} className="flex items-center justify-between gap-2 truncate">
                    <span className="truncate text-muted-foreground">{b.name}</span>
                    <span className="tabular-nums shrink-0">{fmt(s.bytes)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Button size="sm" variant="ghost" onClick={goUp} disabled={!prefix} className="h-7 px-2 gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Up
          </Button>
          <span className="font-mono truncate flex-1">/{prefix}</span>
          {!loading && selectableFiles.length > 0 && (
            <span className="shrink-0 tabular-nums">
              {selectableFiles.length} file{selectableFiles.length === 1 ? "" : "s"} ·{" "}
              {fmt(selectableFiles.reduce((s, it) => s + Number(it.metadata?.size ?? 0), 0))}
            </span>
          )}
          {selectableFiles.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span>Select all</span>
            </label>
          )}
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={openDeleteSelected}
              className="h-7 gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">This folder is empty.</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
            {filtered.map((it) => {
              const folder = isFolder(it);
              const path = fullPath(it.name);
              const img = !folder && isImage(it) ? thumbs[path] : undefined;
              const checked = selected.has(path);
              return (
                <div key={it.name} className="flex items-center gap-3 p-2.5 hover:bg-muted/50 text-sm">
                  {!folder ? (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOne(path)}
                      className="shrink-0"
                    />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  {folder ? (
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                  ) : img ? (
                    <img
                      src={img}
                      alt={it.name}
                      loading="lazy"
                      className="h-9 w-9 rounded object-cover border shrink-0 bg-muted"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : isImage(it) ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => folder ? setPrefix(path) : openFile(it)}
                    className="flex-1 text-left truncate font-medium hover:underline"
                    title={it.name}
                  >
                    {it.name}
                  </button>
                  {!folder && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmt(Number(it.metadata?.size ?? 0))}
                    </span>
                  )}
                  {!folder && (
                    <Button size="sm" variant="ghost" onClick={() => openFile(it)} className="h-7 w-7 p-0" title="Open">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!folder && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openDeleteSingle(it)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground italic">
          Showing up to 200 entries per folder. Folder deletion is disabled — open the folder and delete files individually.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete {pendingPaths.length} file{pendingPaths.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected file{pendingPaths.length === 1 ? "" : "s"} from
              bucket <span className="font-mono font-semibold text-foreground">{bucket}</span>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {pendingPaths.length <= 5 ? (
              <ul className="rounded border bg-muted/40 p-2 font-mono text-xs space-y-0.5 max-h-32 overflow-y-auto">
                {pendingPaths.map((p) => <li key={p} className="truncate">{p}</li>)}
              </ul>
            ) : (
              <p className="text-xs italic">{pendingPaths.length} files selected.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="del-challenge" className="text-foreground">
                Type <span className="font-mono font-bold">{CHALLENGE}</span> to confirm
              </Label>
              <Input
                id="del-challenge"
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
                placeholder={CHALLENGE}
                autoComplete="off"
                disabled={deleting}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || challenge !== CHALLENGE}
              className="gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
