import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyCard, Panel, Pill } from "@/components/redesign/student-pages/ui";
import { PROJECT_FILE_ACCEPT, archiveEntryProblem, archiveYears, matchesArchiveSearch, projectFileProblem } from "@/lib/projects";
import { r2Storage } from "@/lib/r2-storage";
import type { Tables } from "@/integrations/supabase/types";

type Archived = Tables<"project_archive">;

const openFile = async (path: string) => {
  try {
    window.open(await r2Storage.getDownloadUrl(path), "_blank", "noopener");
  } catch {
    toast.error("Could not open the file");
  }
};

const EMPTY = { title: "", authors: "", year: "", cohort: "", abstract: "" };

/** Staff only: add a project from before the portal. */
const AddDialog = ({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) => {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = archiveEntryProblem(form) ?? (file ? projectFileProblem(file) : null);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const path = file
        ? await r2Storage.uploadFile(file, `projects/archive/${Date.now()}_${file.name.replace(/[^\w.\- ]+/g, "_").slice(-120)}`)
        : null;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("project_archive_entries").insert({
        title: form.title.trim(),
        authors: form.authors.trim(),
        year: form.year ? Number(form.year) : null,
        cohort_label: form.cohort.trim() || null,
        abstract: form.abstract.trim(),
        file_path: path,
        file_name: file?.name ?? null,
        added_by: auth.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Added to the archive");
      setForm(EMPTY);
      setFile(null);
      onOpenChange(false);
      onAdded();
    } catch (err) {
      console.error("Add archive entry error:", err);
      toast.error("Could not add the project");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a past project</DialogTitle>
          <DialogDescription>For projects done before the portal, or outside it. Every signed-in student can read it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="archive-title">Title</Label>
            <Input id="archive-title" maxLength={300} required {...field("title")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="archive-authors">Author or authors</Label>
            <Input id="archive-authors" maxLength={500} required placeholder="Names, separated by commas" {...field("authors")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="archive-year">Year</Label>
              <Input id="archive-year" type="number" inputMode="numeric" min="1980" max="2100" {...field("year")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive-cohort">Cohort or session (optional)</Label>
              <Input id="archive-cohort" maxLength={120} {...field("cohort")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="archive-abstract">What it is about (optional)</Label>
            <Textarea id="archive-abstract" rows={4} maxLength={5000} {...field("abstract")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="archive-file">The project file (PDF or Word, up to 25 MB, optional)</Label>
            <Input id="archive-file" type="file" accept={PROJECT_FILE_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="font-bold">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add to archive
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The project archive: projects completed in the portal plus the past ones
 * staff have added. Students read it; with `staff` it can also be added to.
 */
const ProjectArchiveList = ({ staff = false }: { staff?: boolean }) => {
  const [rows, setRows] = useState<Archived[] | null>(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Archived | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_archive")
      .select("*")
      .order("year", { ascending: false, nullsFirst: false })
      .order("title");
    if (error) console.error("Load archive error:", error);
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => archiveYears(rows ?? []), [rows]);
  const shown = (rows ?? []).filter(
    (row) => (year === "all" || String(row.year) === year) && matchesArchiveSearch(row, search),
  );

  const remove = async () => {
    if (!removing?.id) return;
    const { error } = await supabase.from("project_archive_entries").delete().eq("id", removing.id);
    setRemoving(null);
    if (error) {
      toast.error("Could not remove it");
      return;
    }
    toast.success("Removed from the archive");
    void load();
  };

  if (rows === null) return <Skeleton className="h-24 w-full rounded-[20px]" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, topic or name" aria-label="Search the archive" className="h-11 pl-9" />
        </div>
        {years.length > 1 && (
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-11 sm:w-40" aria-label="Year"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {staff && (
          <Button className="h-11 gap-2 font-bold" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a past project
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyCard icon={<FileText className="h-6 w-6" />} title="The archive is empty">
          {staff
            ? "Projects appear here once they are defended and passed. You can also add projects from earlier years."
            : "Projects appear here once they have been defended and passed."}
        </EmptyCard>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No project matches that search.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{shown.length} project{shown.length === 1 ? "" : "s"}</p>
          <ul className="space-y-3">
            {shown.map((row) => (
              <Panel as="li" key={`${row.source}-${row.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 text-base font-bold text-foreground">{row.title}</h3>
                  <span className="flex shrink-0 items-center gap-2">
                    {row.is_group && <Pill tone="neutral">Group project</Pill>}
                    {row.year && <Pill tone="info">{row.year}</Pill>}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{[row.authors, row.cohort_name].filter(Boolean).join(" · ")}</p>
                {row.abstract && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-foreground">{row.abstract}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.file_path && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => openFile(row.file_path!)}>
                      <Download className="h-4 w-4" /> Read the project
                    </Button>
                  )}
                  {staff && row.source === "added" && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setRemoving(row)}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </ul>
        </>
      )}

      {staff && <AddDialog open={adding} onOpenChange={setAdding} onAdded={load} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this project from the archive?"
        description="Only projects that were added by hand can be removed here. This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
};

export default ProjectArchiveList;
