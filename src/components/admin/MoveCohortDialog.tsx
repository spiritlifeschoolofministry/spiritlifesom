/**
 * Moving a student who did not graduate into the next session.
 *
 * The move itself is one database call — move_student_to_cohort seals the old
 * session's fees, issues a code for the new one and records what it did. This
 * dialog exists to show the admin what that will cost before they agree to it,
 * and what it actually cost afterwards, because the two halves of the policy
 * pull in opposite directions: the previous session's balance is written off,
 * and the new session bills in full, handouts included.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, AlertTriangle, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { naira } from "@/lib/money";

export interface MoveCandidate {
  id: string;
  name: string;
  cohort_id: string | null;
  cohort_name?: string | null;
  student_code?: string | null;
  learning_mode?: string | null;
  admission_status?: string | null;
}

interface MoveResult {
  student_id: string;
  moved: boolean;
  error: string | null;
  student_code?: string | null;
  previous_student_code?: string | null;
  fees_waived_count?: number;
  fees_waived_amount?: number;
  fees_raised_count?: number;
  fees_raised_amount?: number;
}

/** Same rule as fee_structure_applies: literal match, {All} covers everyone. */
const structureApplies = (modes: string[] | null, mode: string | null | undefined) =>
  (modes || []).includes("All") || (!!mode && (modes || []).includes(mode));

export const MoveCohortDialog = ({
  open,
  onOpenChange,
  students,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  students: MoveCandidate[];
  onDone?: () => void;
}) => {
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [outstanding, setOutstanding] = useState<Record<string, number> | null>(null);
  const [structures, setStructures] = useState<
    Array<{ fee_name: string; amount: number; learning_modes: string[] | null }>
  >([]);
  const [moving, setMoving] = useState(false);
  const [results, setResults] = useState<MoveResult[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setReason("");
    setTarget("");
    supabase.from("cohorts").select("id, name").order("start_date", { ascending: false })
      .then(({ data }) => setCohorts(data || []));
  }, [open]);

  // What the previous session still has against these students. Scoped to each
  // student's own current cohort, which is the session being written off.
  useEffect(() => {
    if (!open || students.length === 0) { setOutstanding(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("fees")
        .select("student_id, cohort_id, amount_due, amount_paid, waived")
        .in("student_id", students.map((s) => s.id));
      if (cancelled) return;
      const currentCohort = new Map(students.map((s) => [s.id, s.cohort_id]));
      const totals: Record<string, number> = {};
      for (const f of data || []) {
        if (f.waived) continue;
        if (!f.student_id || f.cohort_id !== currentCohort.get(f.student_id)) continue;
        const balance = Number(f.amount_due || 0) - Number(f.amount_paid || 0);
        if (balance > 0) totals[f.student_id] = (totals[f.student_id] || 0) + balance;
      }
      setOutstanding(totals);
    })();
    return () => { cancelled = true; };
  }, [open, students]);

  useEffect(() => {
    if (!target) { setStructures([]); return; }
    supabase.from("fee_structures").select("fee_name, amount, learning_modes").eq("cohort_id", target)
      .then(({ data }) => setStructures((data || []).map((f) => ({ ...f, amount: Number(f.amount) }))));
  }, [target]);

  const targetName = cohorts.find((c) => c.id === target)?.name || "";

  const willWaive = useMemo(
    () => Object.values(outstanding || {}).reduce((a, b) => a + b, 0),
    [outstanding]
  );

  const willBill = useMemo(() => {
    if (!target) return 0;
    return students.reduce(
      (sum, s) =>
        sum +
        structures
          .filter((f) => structureApplies(f.learning_modes, s.learning_mode))
          .reduce((a, f) => a + f.amount, 0),
      0
    );
  }, [students, structures, target]);

  // The two refusals the RPC will raise, surfaced before the click rather than
  // as an error afterwards.
  const notAdmitted = students.filter((s) => s.admission_status !== "ADMITTED");
  const alreadyThere = students.filter((s) => s.cohort_id === target);
  const blocked = notAdmitted.length > 0 || (alreadyThere.length > 0 && alreadyThere.length === students.length);

  const run = async () => {
    if (!target) { toast.error("Choose the cohort to move them into"); return; }
    setMoving(true);
    try {
      if (students.length === 1) {
        const { data, error } = await supabase.rpc("move_student_to_cohort", {
          p_student_id: students[0].id,
          p_to_cohort: target,
          p_reason: reason || undefined,
        });
        if (error) throw error;
        const d = (data || {}) as Record<string, unknown>;
        setResults([{ student_id: students[0].id, moved: true, error: null, ...d } as MoveResult]);
      } else {
        const { data, error } = await supabase.rpc("move_students_to_cohort", {
          p_student_ids: students.map((s) => s.id),
          p_to_cohort: target,
          p_reason: reason || undefined,
        });
        if (error) throw error;
        setResults(
          (data || []).map((r) => ({
            student_id: r.student_id,
            moved: r.moved,
            error: r.error,
            ...((r.detail || {}) as Record<string, unknown>),
          })) as MoveResult[]
        );
      }
      onDone?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not move the student");
    } finally {
      setMoving(false);
    }
  };

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "Student";
  const movedCount = (results || []).filter((r) => r.moved).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!moving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {movedCount} of {results.length} moved to {targetName}
              </DialogTitle>
              <DialogDescription>
                Their previous session is written off and closed. The new session has been billed in full.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {results.map((r) => (
                <div key={r.student_id} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    {r.moved
                      ? <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                    <span className="truncate">{nameOf(r.student_id)}</span>
                  </div>
                  {r.moved ? (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {r.previous_student_code && r.previous_student_code !== r.student_code && (
                        <p className="font-mono">{r.previous_student_code} → {r.student_code}</p>
                      )}
                      <p>Written off: {naira(Number(r.fees_waived_amount || 0))} over {r.fees_waived_count || 0} fee(s)</p>
                      <p>Now billed: {naira(Number(r.fees_raised_amount || 0))} over {r.fees_raised_count || 0} fee(s)</p>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive">{r.error}</p>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {students.length === 1 ? `Move ${students[0].name} to another cohort` : `Move ${students.length} students to another cohort`}
              </DialogTitle>
              <DialogDescription>
                For students who did not graduate and are continuing in the next session. They keep their account,
                their records and their history — they do not register again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {students.length === 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{students[0].cohort_name || "No cohort"}</Badge>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <Badge>{targetName || "…"}</Badge>
                </div>
              )}

              <div>
                <Label className="text-xs">Move into</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="e.g. Did not complete 2025/2026 — continuing in the new session"
                />
              </div>

              <div className="rounded-md border border-border p-3 text-sm space-y-1.5">
                <p className="font-medium">What this will do</p>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li>
                    Write off {outstanding === null ? "…" : naira(willWaive)} still outstanding on their previous
                    session. Payments already recorded stay on file against that session and are not carried across.
                  </li>
                  <li>
                    Bill {target ? naira(willBill) : "the new session's fees"} for {targetName || "the new cohort"} in
                    full — including handouts they may already have. Waive individual fees afterwards if needed.
                  </li>
                  <li>Issue a new student code for the new cohort, keeping the old one on record.</li>
                  <li>Move their materials, calendar, coursemates and exams onto the new session.</li>
                </ul>
              </div>

              {notAdmitted.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Admit these students first
                  </p>
                  <p className="mt-1">
                    A student who is not admitted would be moved across without being billed for the new session:{" "}
                    {notAdmitted.map((s) => s.name).join(", ")}.
                  </p>
                </div>
              )}
              {alreadyThere.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {alreadyThere.length === students.length
                    ? "Already in this cohort — nothing to move."
                    : `${alreadyThere.length} of these are already in ${targetName} and will be reported as skipped.`}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>Cancel</Button>
              <Button onClick={run} disabled={moving || !target || blocked}>
                {moving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1.5" />}
                {students.length === 1 ? "Move student" : `Move ${students.length} students`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
