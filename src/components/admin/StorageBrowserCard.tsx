import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Folder, ChevronLeft, RefreshCw, Trash2, Loader2, FileText, Download, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface StorageItem {
  name: string;
  id: string | null;
  metadata: { size?: number; mimetype?: string } | null;
  updated_at?: string | null;
}

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function StorageBrowserCard() {
  const [buckets, setBuckets] = useState<{ name: string; public: boolean }[]>([]);
  const [bucket, setBucket] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadBuckets = async () => {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      toast.error("Failed to load buckets");
      return;
    }
    const list = (data || []).map((b: any) => ({ name: b.name, public: !!b.public }));
    setBuckets(list);
    if (!bucket && list[0]) setBucket(list[0].name);
  };

  const loadItems = async () => {
    if (!bucket) return;
    setLoading(true);
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

  const goUp = () => {
    if (!prefix) return;
    const parts = prefix.split("/");
    parts.pop();
    setPrefix(parts.join("/"));
  };

  const handleDelete = async (it: StorageItem) => {
    if (isFolder(it)) {
      toast.error("Open the folder, then delete files individually.");
      return;
    }
    const path = fullPath(it.name);
    if (!window.confirm(`Permanently delete "${path}" from "${bucket}"? This cannot be undone.`)) return;
    setDeleting(path);
    const { error } = await supabase.storage.from(bucket).remove([path]);
    setDeleting(null);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("File deleted");
    setItems((prev) => prev.filter((x) => x.name !== it.name));
  };

  const openFile = async (it: StorageItem) => {
    const path = fullPath(it.name);
    const currentBucket = buckets.find((b) => b.name === bucket);
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button size="sm" variant="ghost" onClick={goUp} disabled={!prefix} className="h-7 px-2 gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Up
          </Button>
          <span className="font-mono truncate">/{prefix}</span>
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
              return (
                <div key={it.name} className="flex items-center gap-3 p-2.5 hover:bg-muted/50 text-sm">
                  {folder ? (
                    <Folder className="h-4 w-4 text-primary shrink-0" />
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
                      onClick={() => handleDelete(it)}
                      disabled={deleting === path}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title="Delete"
                    >
                      {deleting === path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
    </Card>
  );
}