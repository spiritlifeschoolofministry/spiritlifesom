import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { APPROVE_BUTTON, REJECT_BUTTON, type Tone } from "@/components/redesign/admin/styles";
import { categoryLabel, formatHours, serviceProgress, serviceTotals } from "@/lib/service-log";
import type { Tables } from "@/integrations/supabase/types";

type Cohort = Pick<Tables<"cohorts">, "id" | "name" | "is_active" | "service_hours_required">;

interface Entry extends Tables<"service_logs"> {
  student: {
    id: string;
    student_code: string | null;
    cohort_id: string | null;
    is_staff_preview: boolean;
    profile: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "To review", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Not approved", tone: "bad" },
};

const studentName = (entry: Entry) =>
  [entry.student?.profile?.first_name, entry.student?.profile?.last_name].filter(Boolean).join(" ") || "Unknown student";

const AdminServiceLogs = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Entry | null>(null);
  const [note, setNote] = useState("");
  const [requiredDraft, setRequiredDraft] = useState("");
  const [savingRequired, setSavingRequired] = useState(false);

  const load = useCallback(async () => {
    const [entriesRes, cohortsRes] = await Promise.all([
      supabase
        .from("service_logs")
        .select("*, student:students(id, student_code, cohort_id, is_staff_preview, profile:profiles(first_name, last_name))")
        .order("activity_date", { ascending: false }),
      supabase.from("cohorts").select("id, name, is_active, service_hours_required").order("start_date", { ascending: false }),
    ]);
    const failed = entriesRes.error ?? cohortsRes.error;
    if (failed) {
      console.error("Load service logs error:", failed);
      toast.error("Could not load the service logs");
    }
    setEntries(((entriesRes.data ?? []) as unknown as Entry[]).filter((entry) => !entry.student?.is_staff_preview));
    setCohorts(cohortsRes.data ?? []);
    setCohortId((current) => current || cohortsRes.data?.find((c) => c.is_active)?.id || cohortsRes.data?.[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cohort = cohorts.find((c) => c.id === cohortId) ?? null;
  useEffect(() => {
    setRequiredDraft(cohort?.service_hours_required != null ? String(cohort.service_hours_required) : "");
  }, [cohort?.id, cohort?.service_hours_required]);

  const inCohort = useMemo(() => entries.filter((entry) => entry.student?.cohort_id === cohortId), [entries, cohortId]);
  const pending = inCohort.filter((entry) => entry.status === "pending");
  const reviewed = inCohort.filter((entry) => entry.status !== "pending");

  const byStudent = useMemo(() => {
    const map = new Map<string, { name: string; code: string | null; id: string; rows: Entry[] }>();
    for (const entry of inCohort) {
      if (!entry.student) continue;
      const row = map.get(entry.student.id) ?? { id: entry.student.id, name: studentName(entry), code: entry.student.student_code, rows: [] };
      row.rows.push(entry);
      map.set(entry.student.id, row);
    }
    return [...map.values()]
      .map((row) => ({ ...row, totals: serviceTotals(row.rows) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inCohort]);

  const decide = async (entry: Entry, status: "approved" | "rejected", reviewNote: string | null) => {
    setBusyId(entry.id);
    const { error } = await supabase
      .from("service_logs")
      .update({ status, review_note: reviewNote, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", entry.id);
    setBusyId(null);
    if (error) {
      console.error("Review service entry error:", error);
      toast.error("Could not save the decision");
      return false;
    }
    toast.success(status === "approved" ? `Approved ${formatHours(entry.hours)} for ${studentName(entry)}` : "Entry not approved. The student has been told");
    void load();
    return true;
  };

  const saveRequired = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cohort) return;
    const value = requiredDraft.trim() === "" ? null : Number(requiredDraft);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast.error("Enter a number of hours, or leave it empty for no requirement");
      return;
    }
    setSavingRequired(true);
    const { error } = await supabase.from("cohorts").update({ service_hours_required: value }).eq("id", cohort.id);
    setSavingRequired(false);
    if (error) {
      console.error("Save required hours error:", error);
      toast.error("Could not save. Only a superadmin can change cohort settings");
      return;
    }
    toast.success(value === null ? "Requirement removed" : `${cohort.name} now requires ${formatHours(value)}`);
    void load();
  };

  if (loading) return <PageSkeleton panels={2} />;

  const entryCells = (entry: Entry) => (
    <>
      <TableCell>
        {entry.student ? (
          <Link to={`/admin/students/${entry.student.id}`} className="font-semibold underline-offset-2 hover:underline">
            {studentName(entry)}
          </Link>
        ) : studentName(entry)}
        <span className="block text-xs text-muted-foreground">{entry.student?.student_code}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {format(new Date(`${entry.activity_date}T00:00:00`), "d MMM yyyy")}
        <span className="block text-xs text-muted-foreground">{formatHours(entry.hours)}</span>
      </TableCell>
      <TableCell className="min-w-64">
        <span className="text-xs font-semibold text-muted-foreground">{categoryLabel(entry.category)}{entry.location ? ` · ${entry.location}` : ""}</span>
        <span className="block whitespace-pre-wrap text-sm">{entry.description}</span>
        {(entry.supervisor_name || entry.supervisor_contact) && (
          <span className="block text-xs text-muted-foreground">
            Can confirm: {[entry.supervisor_name, entry.supervisor_contact].filter(Boolean).join(", ")}
          </span>
        )}
      </TableCell>
    </>
  );

  return (
    <div className="space-y-5 pb-6">
      <AdminPageHeader
        section="Teaching"
        title="Service Log"
        description={`${pending.length} entr${pending.length === 1 ? "y" : "ies"} to review on this cohort`}
        actions={
          <Select value={cohortId} onValueChange={setCohortId}>
            <SelectTrigger className="h-10 w-56" aria-label="Cohort"><SelectValue placeholder="Cohort" /></SelectTrigger>
            <SelectContent>
              {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <Panel title="Required hours" titleId="service-required" description="Students see their approved hours against this. It does not block a certificate.">
        <form onSubmit={saveRequired} className="flex flex-wrap items-end gap-3 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="required-hours">Hours each student must serve{cohort ? ` (${cohort.name})` : ""}</Label>
            <Input
              id="required-hours"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              className="w-40"
              placeholder="No requirement"
              value={requiredDraft}
              onChange={(e) => setRequiredDraft(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={savingRequired || !cohort}>
            {savingRequired && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </form>
      </Panel>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">To review ({pending.length})</TabsTrigger>
          <TabsTrigger value="students">By student ({byStudent.length})</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed ({reviewed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="review">
          <Panel>
            {pending.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nothing is waiting for review.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead><TableHead>Date</TableHead><TableHead>What they did</TableHead>
                      <TableHead className="text-right">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((entry) => (
                      <TableRow key={entry.id}>
                        {entryCells(entry)}
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" className={APPROVE_BUTTON} disabled={busyId === entry.id} onClick={() => decide(entry, "approved", null)}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className={REJECT_BUTTON} disabled={busyId === entry.id} onClick={() => { setNote(""); setRejecting(entry); }}>
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="students">
          <Panel>
            {byStudent.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No student on this cohort has logged service yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead><TableHead>Approved</TableHead><TableHead>Waiting</TableHead><TableHead>Requirement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byStudent.map((row) => {
                      const progress = serviceProgress(row.totals.approved, cohort?.service_hours_required);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Link to={`/admin/students/${row.id}`} className="font-semibold underline-offset-2 hover:underline">{row.name}</Link>
                            <span className="block text-xs text-muted-foreground">{row.code}</span>
                          </TableCell>
                          <TableCell>{formatHours(row.totals.approved)}</TableCell>
                          <TableCell>{row.totals.pending ? formatHours(row.totals.pending) : "None"}</TableCell>
                          <TableCell>
                            {progress === null ? "Not set" : (
                              <StatusPill tone={progress === 100 ? "good" : "neutral"}>{progress === 100 ? "Met" : `${progress}%`}</StatusPill>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="reviewed">
          <Panel>
            {reviewed.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No entries have been reviewed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead><TableHead>Date</TableHead><TableHead>What they did</TableHead>
                      <TableHead>Decision</TableHead><TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewed.map((entry) => (
                      <TableRow key={entry.id}>
                        {entryCells(entry)}
                        <TableCell>
                          <StatusPill tone={STATUS[entry.status]?.tone ?? "neutral"}>{STATUS[entry.status]?.label ?? entry.status}</StatusPill>
                          {entry.review_note && <span className="mt-1 block text-xs text-muted-foreground">{entry.review_note}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.status === "approved" ? (
                            <Button size="sm" variant="outline" disabled={busyId === entry.id} onClick={() => { setNote(""); setRejecting(entry); }}>Reject</Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={busyId === entry.id} onClick={() => decide(entry, "approved", null)}>Approve</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this entry?</DialogTitle>
            <DialogDescription>
              {rejecting && `${studentName(rejecting)}, ${formatHours(rejecting.hours)}. These hours will not count. The student sees your note.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Reason</Label>
            <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!note.trim() || busyId !== null}
              onClick={async () => {
                if (rejecting && (await decide(rejecting, "rejected", note.trim()))) setRejecting(null);
              }}
            >
              Reject entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServiceLogs;
