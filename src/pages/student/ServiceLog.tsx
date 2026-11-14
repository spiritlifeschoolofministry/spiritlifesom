import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { HandHeart, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Bar, DarkPanel, EmptyCard, ListCard, Pill, ScreenHeader, SectionTitle, type Tone } from "@/components/redesign/student-pages/ui";
import {
  SERVICE_CATEGORIES,
  categoryLabel,
  formatHours,
  serviceProgress,
  serviceTotals,
  validateServiceEntry,
} from "@/lib/service-log";
import type { Tables } from "@/integrations/supabase/types";

type Entry = Tables<"service_logs">;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
};

const todayIso = () => format(new Date(), "yyyy-MM-dd");

const EMPTY_FORM = {
  activityDate: "",
  hours: "",
  category: "evangelism",
  description: "",
  location: "",
  supervisorName: "",
  supervisorContact: "",
};

const StudentServiceLog = () => {
  const { student } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [required, setRequired] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    if (!student?.id) {
      setLoading(false);
      return;
    }
    const [entriesRes, cohortRes] = await Promise.all([
      supabase
        .from("service_logs")
        .select("*")
        .eq("student_id", student.id)
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false }),
      student.cohort_id
        ? supabase.from("cohorts").select("service_hours_required").eq("id", student.cohort_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (entriesRes.error) {
      console.error("Load service log error:", entriesRes.error);
      toast.error("Could not load your service log");
    }
    setEntries(entriesRes.data ?? []);
    setRequired(cohortRes.data?.service_hours_required ?? null);
    setLoading(false);
  }, [student?.id, student?.cohort_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = serviceTotals(entries);
  const progress = serviceProgress(totals.approved, required);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!student?.id) return;
    const problem = validateServiceEntry(form, todayIso());
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("service_logs").insert({
      student_id: student.id,
      activity_date: form.activityDate,
      hours: Number(form.hours),
      category: form.category,
      description: form.description.trim(),
      location: form.location.trim() || null,
      supervisor_name: form.supervisorName.trim() || null,
      supervisor_contact: form.supervisorContact.trim() || null,
    });
    setSaving(false);
    if (error) {
      console.error("Save service entry error:", error);
      toast.error("Could not save this entry");
      return;
    }
    toast.success("Entry saved. Staff will review it");
    setForm(EMPTY_FORM);
    setDialogOpen(false);
    void load();
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("service_logs").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) {
      toast.error("Could not delete this entry");
      return;
    }
    toast.success("Entry deleted");
    void load();
  };

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value })),
  });

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Service Log"
        description="Record the ministry work you do outside class. Staff review each entry."
        aside={
          <Button className="h-11 gap-2 font-bold" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Log service
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-32 w-full rounded-[20px]" />
      ) : (
        <DarkPanel>
          <p className="text-sm text-white/70">Approved hours</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">
            {totals.approved}
            {required ? <span className="text-lg font-semibold text-white/70"> of {required} required</span> : null}
          </p>
          {progress !== null && (
            <Bar value={progress} label="Approved service hours against the requirement" trackClassName="bg-white/15" className="mt-3" tone="gold" />
          )}
          <p className="mt-3 text-sm text-white/80">
            {totals.pending > 0 ? `${formatHours(totals.pending)} waiting for review. ` : ""}
            {required
              ? progress === 100
                ? "You have met the requirement."
                : `${formatHours(Math.max(0, Math.round((required - totals.approved) * 10) / 10))} to go.`
              : "Your cohort has no set number of hours."}
          </p>
        </DarkPanel>
      )}

      <section aria-labelledby="service-entries" className="space-y-3">
        <SectionTitle id="service-entries">Your entries</SectionTitle>
        {loading ? (
          <Skeleton className="h-24 w-full rounded-[18px]" />
        ) : entries.length === 0 ? (
          <EmptyCard icon={<HandHeart className="h-6 w-6" />} title="Nothing logged yet">
            Log outreach, teaching, prayer meetings, visitation or any other ministry work you have done.
          </EmptyCard>
        ) : (
          <ListCard>
            {entries.map((entry) => {
              const status = STATUS[entry.status] ?? STATUS.pending;
              return (
                <li key={entry.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-foreground">{format(new Date(`${entry.activity_date}T00:00:00`), "d MMM yyyy")}</strong>
                      <span className="text-sm text-muted-foreground">{formatHours(entry.hours)} · {categoryLabel(entry.category)}</span>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{entry.description}</p>
                    {(entry.location || entry.supervisor_name) && (
                      <p className="text-xs text-muted-foreground">
                        {[entry.location, entry.supervisor_name && `Supervisor: ${entry.supervisor_name}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {entry.review_note && (
                      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                        <span className="font-semibold">Note from staff: </span>{entry.review_note}
                      </p>
                    )}
                  </div>
                  {entry.status === "pending" && (
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Delete entry" onClick={() => setDeleting(entry)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ListCard>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log service</DialogTitle>
            <DialogDescription>One entry for each day you served. You can delete it until staff review it.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="service-date">Date</Label>
                <Input id="service-date" type="date" max={todayIso()} required {...field("activityDate")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service-hours">Hours</Label>
                <Input id="service-hours" type="number" inputMode="decimal" min="0.5" max="24" step="0.5" required {...field("hours")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-category">Kind of service</Label>
              <Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}>
                <SelectTrigger id="service-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-description">What did you do?</Label>
              <Textarea id="service-description" rows={3} maxLength={2000} required {...field("description")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-location">Where (optional)</Label>
              <Input id="service-location" maxLength={200} {...field("location")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="service-supervisor">Who can confirm it (optional)</Label>
                <Input id="service-supervisor" maxLength={120} autoComplete="off" {...field("supervisorName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service-contact">Their phone or email (optional)</Label>
                <Input id="service-contact" maxLength={120} autoComplete="off" {...field("supervisorContact")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="h-11 font-bold">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this entry?"
        description="It has not been reviewed yet, so it will simply be removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
};

export default StudentServiceLog;
