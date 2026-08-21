import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Loader2, Search, Plus, HandCoins, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type StudentFee = Tables<'fees'>;
type Payment = Tables<'payments'>;

interface StudentRow {
  id: string;
  student_code: string | null;
  cohort_id: string | null;
  profile: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Online Payment', 'Other'] as const;

const naira = (n: number | null | undefined) => `₦${Number(n || 0).toLocaleString()}`;

const outstandingOf = (f: StudentFee) =>
  Math.max(Number(f.amount_due || 0) - Number(f.amount_paid || 0), 0);

const statusOf = (f: StudentFee) => {
  if (f.waived) return 'Waived';
  const s = (f.payment_status || '').toLowerCase();
  if (s === 'paid') return 'Paid';
  if (s === 'partial') return 'Partial';
  return 'Unpaid';
};

const statusClass = (status: string) =>
  status === 'Paid' || status === 'Waived'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : status === 'Partial'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-red-100 text-red-800 border-red-300';

/**
 * Recording a payment that has no receipt of its own.
 *
 * A student who clears three fees with one transfer only ever has one receipt.
 * That receipt gets assigned and verified against one fee in Payment
 * Approvals; the rest are settled here, tied back to the same receipt so the
 * paper trail still points somewhere.
 */
export const ManualPaymentPanel = ({
  cohorts,
  feeStructures,
  onRecorded,
}: {
  cohorts: Tables<'cohorts'>[];
  feeStructures: Tables<'fee_structures'>[];
  onRecorded: () => void;
}) => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [query, setQuery] = useState('');
  const [studentId, setStudentId] = useState('');

  const [fees, setFees] = useState<StudentFee[]>([]);
  const [receipts, setReceipts] = useState<Payment[]>([]);
  const [manualEntries, setManualEntries] = useState<Payment[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignStructureId, setAssignStructureId] = useState('');

  // Record dialog: either the checked fees, or one row's "Record" button
  const [dialogFees, setDialogFees] = useState<StudentFee[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [payDate, setPayDate] = useState('');
  const [note, setNote] = useState('');
  const [coveredBy, setCoveredBy] = useState('none');
  const [method, setMethod] = useState<string>('Bank Transfer');

  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, student_code, cohort_id, profile:profiles(first_name, last_name, email)')
          .eq('is_staff_preview', false)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setStudents((data || []) as StudentRow[]);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load students');
      } finally {
        setLoadingStudents(false);
      }
    })();
  }, []);

  const nameOf = (s: StudentRow | undefined) =>
    s ? `${s.profile?.first_name || ''} ${s.profile?.last_name || ''}`.trim() || 'Unnamed' : '';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? students.filter((s) =>
          [nameOf(s), s.profile?.email || '', s.student_code || ''].some((v) => v.toLowerCase().includes(q)),
        )
      : students;
    return list.slice(0, 20);
  }, [students, query]);

  const student = students.find((s) => s.id === studentId);

  const loadFees = async (id: string) => {
    try {
      setLoadingFees(true);
      const [{ data: feeRows, error: feeErr }, { data: paymentRows }] = await Promise.all([
        supabase.from('fees').select('*').eq('student_id', id).order('created_at', { ascending: true }),
        supabase.from('payments').select('*').eq('student_id', id).order('created_at', { ascending: false }),
      ]);
      if (feeErr) throw feeErr;
      setFees(feeRows || []);
      const payments = paymentRows || [];
      setReceipts(payments.filter((p) => !p.is_manual_record));
      setManualEntries(payments.filter((p) => p.is_manual_record));
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      toast.error('Failed to load this student’s fees');
    } finally {
      setLoadingFees(false);
    }
  };

  const pickStudent = (id: string) => {
    setStudentId(id);
    setAssignStructureId('');
    loadFees(id);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedFees = useMemo(() => fees.filter((f) => selected.has(f.id)), [fees, selected]);
  const selectedTotal = selectedFees.reduce((sum, f) => sum + outstandingOf(f), 0);

  // Fee definitions this student has no record of yet — assigning one creates
  // the fees row that a manual payment can then be recorded against.
  const assignable = useMemo(() => {
    const have = new Set(fees.map((f) => f.fee_type));
    return feeStructures.filter((fs) => !have.has(fs.fee_name));
  }, [fees, feeStructures]);

  const assignFee = async () => {
    if (!studentId || !assignStructureId) return;
    const fs = feeStructures.find((f) => f.id === assignStructureId);
    if (!fs) return;
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fees').insert({
        student_id: studentId,
        cohort_id: student?.cohort_id || fs.cohort_id,
        fee_type: fs.fee_name,
        amount_due: fs.amount,
        amount_paid: 0,
        payment_status: 'Unpaid',
      });
      if (error) { toast.error('Failed to assign fee: ' + error.message); return; }
      toast.success(`${fs.fee_name} assigned to ${nameOf(student)}`);
      setAssignStructureId('');
      await loadFees(studentId);
      onRecorded();
    } finally {
      setIsProcessing(false);
    }
  };

  const openDialog = (target: StudentFee[]) => {
    if (!target.length) return;
    setDialogFees(target);
    setAmounts(Object.fromEntries(target.map((f) => [f.id, String(outstandingOf(f) || '')])));
    setPayDate(new Date().toISOString().slice(0, 10));
    setNote(
      target.length > 1
        ? `One payment covering ${target.length} fees: ${target.map((f) => f.fee_type).join(', ')}`
        : '',
    );
    setCoveredBy('none');
    setMethod('Bank Transfer');
  };

  const closeDialog = () => {
    setDialogFees(null);
    setAmounts({});
    setNote('');
    setCoveredBy('none');
  };

  const dialogTotal = useMemo(
    () => Object.values(amounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0),
    [amounts],
  );

  const confirmRecord = async () => {
    if (!dialogFees) return;
    const rows = dialogFees
      .map((f) => ({ fee: f, amount: parseFloat(amounts[f.id] || '') }))
      .filter((r) => r.amount > 0);
    if (!rows.length) return toast.error('Enter an amount to record');

    try {
      setIsProcessing(true);
      let ok = 0;
      const failures: string[] = [];
      for (const r of rows) {
        const { error } = await supabase.rpc('admin_record_manual_payment', {
          p_student_fee_id: r.fee.id,
          p_amount: r.amount,
          p_payment_date: payDate || null,
          p_note: note.trim() || null,
          p_covered_by_payment_id: coveredBy === 'none' ? null : coveredBy,
          p_payment_method: method,
        });
        if (error) failures.push(`${r.fee.fee_type}: ${error.message}`);
        else ok++;
      }
      if (ok) toast.success(`Recorded ${ok} payment${ok === 1 ? '' : 's'}`);
      if (failures.length) toast.error(failures.join(' • '));
      closeDialog();
      await loadFees(studentId);
      onRecorded();
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmReverse = async () => {
    if (!reverseTarget) return;
    try {
      setIsProcessing(true);
      const { error } = await supabase.rpc('admin_delete_manual_payment', { p_payment_id: reverseTarget.id });
      if (error) { toast.error('Failed to reverse: ' + error.message); return; }
      toast.success('Manual payment reversed');
      await loadFees(studentId);
      onRecorded();
    } finally {
      setIsProcessing(false);
      setReverseTarget(null);
    }
  };

  const feeNameById = (id: string | null) => fees.find((f) => f.id === id)?.fee_type || '—';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Record a Payment Manually</CardTitle>
          <CardDescription>
            For a student who settled several fees in one transaction and only has one receipt: verify that receipt
            against one fee under Payment Approvals, then mark the rest paid here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Student</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name, email or student code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {loadingStudents ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students match that search.</p>
              ) : (
                matches.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={s.id === studentId ? 'default' : 'outline'}
                    onClick={() => pickStudent(s.id)}
                  >
                    {nameOf(s)}
                    {s.student_code ? <span className="ml-1 opacity-70 text-xs">{s.student_code}</span> : null}
                  </Button>
                ))
              )}
              {!query && students.length > matches.length && (
                <span className="self-center text-xs text-muted-foreground">
                  showing {matches.length} of {students.length} — search to narrow
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {studentId && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {nameOf(student)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {cohorts.find((c) => c.id === student?.cohort_id)?.name || 'no cohort'}
                </span>
              </CardTitle>
              <CardDescription>{student?.profile?.email}</CardDescription>
            </div>
            {selected.size > 0 && (
              <Button onClick={() => openDialog(selectedFees)} disabled={isProcessing} className="gap-2">
                <HandCoins className="h-4 w-4" />
                Mark {selected.size} fee{selected.size === 1 ? '' : 's'} paid ({naira(selectedTotal)})
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingFees ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <>
                {fees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This student has no fee records yet. Assign one below first.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Fee</TableHead>
                          <TableHead className="text-right">Due</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fees.map((f) => {
                          const status = statusOf(f);
                          const settled = status === 'Paid' || status === 'Waived';
                          return (
                            <TableRow key={f.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selected.has(f.id)}
                                  onCheckedChange={() => toggle(f.id)}
                                  disabled={settled}
                                  aria-label={`Select ${f.fee_type}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{f.fee_type}</TableCell>
                              <TableCell className="text-right">{naira(f.amount_due)}</TableCell>
                              <TableCell className="text-right">{naira(f.amount_paid)}</TableCell>
                              <TableCell className="text-right">{naira(outstandingOf(f))}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusClass(status)}>{status}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isProcessing || f.waived}
                                  onClick={() => openDialog([f])}
                                >
                                  {settled ? 'Record extra' : 'Mark paid'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <Label>Assign another fee to this student</Label>
                    <Select value={assignStructureId} onValueChange={setAssignStructureId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={assignable.length ? 'Select a fee' : 'No unassigned fees left'} />
                      </SelectTrigger>
                      <SelectContent>
                        {assignable.map((fs) => (
                          <SelectItem key={fs.id} value={fs.id}>
                            {fs.fee_name} — {naira(fs.amount)} ({cohorts.find((c) => c.id === fs.cohort_id)?.name || 'no cohort'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={assignFee} disabled={isProcessing || !assignStructureId} className="gap-2">
                    <Plus className="h-4 w-4" /> Assign fee
                  </Button>
                </div>

                {manualEntries.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Manual entries for this student</h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fee</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {manualEntries.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{feeNameById(p.student_fee_id)}</TableCell>
                              <TableCell className="text-right">{naira(p.amount_paid)}</TableCell>
                              <TableCell>
                                {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : ''}
                              </TableCell>
                              <TableCell className="text-xs max-w-[24rem] truncate" title={p.admin_notes || ''}>
                                {p.admin_notes}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setReverseTarget(p)}
                                  disabled={isProcessing}
                                  title="Reverse this manual entry"
                                >
                                  <Undo2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!dialogFees} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record payment without a receipt</DialogTitle>
            <DialogDescription>
              This counts towards {nameOf(student)}&rsquo;s balance exactly like a verified receipt would. Point it at
              the receipt it came from so the record is traceable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {(dialogFees || []).map((f) => (
              <div key={f.id} className="grid grid-cols-[1fr_9rem] items-end gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{f.fee_type}</Label>
                  <p className="text-xs text-muted-foreground">
                    {naira(outstandingOf(f))} outstanding of {naira(f.amount_due)}
                  </p>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amounts[f.id] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                />
              </div>
            ))}

            {(dialogFees?.length || 0) > 1 && (
              <p className="text-sm font-medium">Total: {naira(dialogTotal)}</p>
            )}

            <div>
              <Label>Payment date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label>How they paid</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Covered by receipt (optional)</Label>
              <Select value={coveredBy} onValueChange={setCoveredBy}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No receipt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No receipt on file</SelectItem>
                  {receipts.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {naira(r.amount_paid)} · {r.payment_date ? new Date(r.payment_date).toLocaleDateString() : 'no date'} · {r.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Note</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. one transfer covering tuition and handout"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isProcessing}>Cancel</Button>
            <Button onClick={confirmRecord} disabled={isProcessing || dialogTotal <= 0}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!reverseTarget}
        onOpenChange={(o) => !o && setReverseTarget(null)}
        title="Reverse this manual entry?"
        description={
          reverseTarget
            ? `${naira(reverseTarget.amount_paid)} will be taken back off ${feeNameById(reverseTarget.student_fee_id)} and the record removed.`
            : ''
        }
        confirmLabel="Reverse"
        variant="destructive"
        loading={isProcessing}
        onConfirm={confirmReverse}
      />
    </div>
  );
};
