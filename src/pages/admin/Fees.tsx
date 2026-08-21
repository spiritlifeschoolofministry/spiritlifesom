import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Eye, Check, X, Download, Trash2, CheckCheck, Search, ArrowLeftRight, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { resolveReceiptUrl } from '@/lib/receipt-url';
import { downloadCSV } from '@/lib/csv-export';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Tables } from '@/integrations/supabase/types';
import { LearningModeSelect, LearningModeTags } from '@/components/admin/LearningModeSelect';
import { ManualPaymentPanel } from '@/components/admin/ManualPaymentPanel';
import { toModeArray } from '@/lib/learning-modes';

interface AddFeeFormData {
  cohort_id: string;
  fee_name: string;
  amount: string;
  learning_modes: string[];
}

type PaymentWithStudent = Tables<'payments'> & {
  student_name?: string;
  student_email?: string;
  cohort_id?: string | null;
  fee_name?: string | null;
};

type StudentFee = Tables<'fees'>;

const AdminFees = () => {
  const [tab, setTab] = useState<'manager' | 'approvals' | 'manual'>('manager');
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [feeStructures, setFeeStructures] = useState<Tables<'fee_structures'>[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentWithStudent[]>([]);
  const [approvedPayments, setApprovedPayments] = useState<PaymentWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [selectedReceiptLoading, setSelectedReceiptLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const [structureFilter, setStructureFilter] = useState('all');

  // Approved-payments filters
  const [searchName, setSearchName] = useState('');
  const [filterCohort, setFilterCohort] = useState('all');
  const [filterFee, setFilterFee] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<PaymentWithStudent | null>(null);
  const [deleteFeeId, setDeleteFeeId] = useState<string | null>(null);

  // Re-assign a receipt to the right fee
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [reassignTarget, setReassignTarget] = useState<PaymentWithStudent | null>(null);
  const [reassignFeeId, setReassignFeeId] = useState('');

  // Edit an existing fee definition (price and targeting only)
  const [editTarget, setEditTarget] = useState<Tables<'fee_structures'> | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editModes, setEditModes] = useState<string[]>(['All']);

  const { register, handleSubmit, reset, setValue, watch } = useForm<AddFeeFormData>({
    defaultValues: { cohort_id: '', fee_name: '', amount: '', learning_modes: ['All'] },
  });
  const selectedCohort = watch('cohort_id');
  const selectedModes = watch('learning_modes');

  const fetchPaymentsWithStudents = async () => {
    try {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .in('status', ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'])
        .order('created_at', { ascending: false });
      if (!payments) return;

      const studentIds = [...new Set(payments.map((p) => p.student_id).filter(Boolean))] as string[];
      const feeIds = [...new Set(payments.map((p) => p.fee_id).filter(Boolean))] as string[];

      const [{ data: studs }, { data: feeRows }, { data: assignedFees }] = await Promise.all([
        studentIds.length
          ? supabase
              .from('students')
              .select('id, cohort_id, profile:profiles(first_name, last_name, email)')
              .in('id', studentIds)
          : Promise.resolve({ data: [] }),
        feeIds.length
          ? supabase.from('fee_structures').select('id, fee_name').in('id', feeIds)
          : Promise.resolve({ data: [] }),
        studentIds.length
          ? supabase.from('fees').select('*').in('student_id', studentIds)
          : Promise.resolve({ data: [] as StudentFee[] }),
      ]);

      const studMap = new Map((studs || []).map((s) => [s.id, s]));
      const feeMap = new Map((feeRows || []).map((f) => [f.id, f.fee_name]));
      const assignedMap = new Map((assignedFees || []).map((f: StudentFee) => [f.id, f]));
      setStudentFees(assignedFees || []);

      const enriched: PaymentWithStudent[] = payments.map((p) => {
        const s = p.student_id ? studMap.get(p.student_id) : null;
        const name = s?.profile ? `${s.profile.first_name || ''} ${s.profile.last_name || ''}`.trim() : 'Unknown';
        // The student's own fee record is the real target; the fee_structures
        // link is only a fallback for receipts submitted before that existed.
        const assigned = p.student_fee_id ? assignedMap.get(p.student_fee_id) : null;
        return {
          ...p,
          student_name: name || 'Unknown',
          student_email: s?.profile?.email || '',
          cohort_id: s?.cohort_id || null,
          fee_name: assigned?.fee_type || (p.fee_id ? feeMap.get(p.fee_id) || null : null),
        };
      });

      setPendingPayments(
        enriched
          .filter((p) => (p.status || 'PENDING').toUpperCase() === 'PENDING')
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
      );
      setApprovedPayments(
        enriched
          .filter((p) => ['VERIFIED', 'APPROVED'].includes((p.status || '').toUpperCase()))
          .sort((a, b) => {
            const ad = new Date(a.payment_date || a.created_at || 0).getTime();
            const bd = new Date(b.payment_date || b.created_at || 0).getTime();
            return bd - ad;
          }),
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to load payments');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [{ data: cohortsData }, { data: fees }] = await Promise.all([
          supabase.from('cohorts').select('*').order('name'),
          supabase.from('fee_structures').select('*').order('created_at', { ascending: false }),
        ]);
        if (cohortsData) setCohorts(cohortsData);
        if (fees) setFeeStructures(fees);
        await fetchPaymentsWithStudents();
      } catch (e) {
        console.error(e);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openReceipt = async (p: PaymentWithStudent) => {
    setReceiptOpen(true);
    setSelectedReceipt(null);
    setSelectedReceiptLoading(true);
    try {
      const url = await resolveReceiptUrl(p);
      if (!url) {
        toast.error('Receipt file could not be located');
        setReceiptOpen(false);
        return;
      }
      setSelectedReceipt(url);
    } catch (err) {
      console.error('Failed to load receipt', err);
      toast.error('Failed to load receipt image');
      setReceiptOpen(false);
    } finally {
      setSelectedReceiptLoading(false);
    }
  };

  const onAddFee = async (data: AddFeeFormData) => {
    if (!data.cohort_id) return toast.error('Choose a cohort');
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fee_structures').insert({
        cohort_id: data.cohort_id,
        fee_name: data.fee_name,
        amount: parseFloat(data.amount),
        learning_modes: toModeArray(data.learning_modes),
      });
      if (error) { toast.error('Failed to add fee'); return; }
      toast.success('Fee added');
      reset();
      const { data: fees } = await supabase.from('fee_structures').select('*').order('created_at', { ascending: false });
      if (fees) setFeeStructures(fees);
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditFee = (f: Tables<'fee_structures'>) => {
    setEditTarget(f);
    setEditAmount(String(f.amount));
    setEditModes(toModeArray(f.learning_modes));
  };

  /**
   * Saving reports what actually moved rather than a bare "saved": re-targeting
   * bills or un-bills students, and a new price only reaches the records with
   * nothing against them — a student who has already paid keeps the amount they
   * were quoted. Staff need to see that split to trust the number.
   */
  const onSaveEditFee = async () => {
    if (!editTarget) return;
    const amount = parseFloat(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount above zero');
    try {
      setIsProcessing(true);
      const { data, error } = await supabase.rpc('admin_update_fee_structure', {
        p_id: editTarget.id,
        p_amount: amount,
        p_learning_modes: toModeArray(editModes),
      });
      if (error) { toast.error('Could not update the fee: ' + error.message); return; }

      const r = (data ?? {}) as {
        repriced?: number; kept_at_old_amount?: number;
        students_added?: number; students_removed?: number;
      };
      const notes: string[] = [];
      if (r.repriced) notes.push(`${r.repriced} record${r.repriced === 1 ? '' : 's'} re-priced`);
      if (r.kept_at_old_amount) notes.push(`${r.kept_at_old_amount} left at the old amount (already paid or has a receipt)`);
      if (r.students_added) notes.push(`${r.students_added} student${r.students_added === 1 ? '' : 's'} newly billed`);
      if (r.students_removed) notes.push(`${r.students_removed} no longer billed`);
      toast.success(notes.length > 0 ? `Fee updated — ${notes.join('; ')}` : 'Fee updated');

      const { data: fees } = await supabase.from('fee_structures').select('*').order('created_at', { ascending: false });
      if (fees) setFeeStructures(fees);
      setEditTarget(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDeleteFee = async () => {
    if (!deleteFeeId) return;
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fee_structures').delete().eq('id', deleteFeeId);
      if (error) { toast.error('Failed to delete fee: ' + error.message); return; }
      toast.success('Fee deleted');
      setFeeStructures((prev) => prev.filter((f) => f.id !== deleteFeeId));
    } finally {
      setIsProcessing(false);
      setDeleteFeeId(null);
    }
  };

  const approvePayment = async (payment: PaymentWithStudent) => {
    if (!payment.student_fee_id) {
      toast.error('Assign this receipt to a fee before verifying it');
      openReassign(payment);
      return;
    }
    try {
      setIsProcessing(true);
      const { error } = await supabase.rpc('admin_approve_payment', { p_payment_id: payment.id });
      if (error) { toast.error('Failed to approve: ' + error.message); return; }
      toast.success('Payment approved');
      await fetchPaymentsWithStudents();
    } finally {
      setIsProcessing(false);
    }
  };

  const openReassign = (p: PaymentWithStudent) => {
    setReassignTarget(p);
    setReassignFeeId(p.student_fee_id ? `fee:${p.student_fee_id}` : '');
  };

  // Every fee in the system, whatever the learning mode: the student's own fee
  // records first, then any fee definition they haven't been assigned yet.
  const reassignOptions = useMemo(() => {
    if (!reassignTarget) return [];
    const own = studentFees.filter((f) => f.student_id === reassignTarget.student_id);
    const ownTypes = new Set(own.map((f) => f.fee_type));
    const statusOf = (f: StudentFee) => {
      if (f.waived) return 'Waived';
      const s = (f.payment_status || '').toLowerCase();
      if (s === 'paid') return 'Paid';
      if (s === 'partial') return 'Partial';
      return 'Unpaid';
    };
    return [
      ...own.map((f) => ({
        value: `fee:${f.id}`,
        status: statusOf(f),
        label: `${f.fee_type} — ₦${Number(f.amount_paid || 0).toLocaleString()} of ₦${Number(f.amount_due || 0).toLocaleString()} paid`,
      })),
      ...feeStructures
        .filter((fs) => !ownTypes.has(fs.fee_name))
        .map((fs) => ({
          value: `structure:${fs.id}`,
          status: 'Unpaid',
          label: `${fs.fee_name} — ₦${Number(fs.amount).toLocaleString()} (${cohorts.find((c) => c.id === fs.cohort_id)?.name || 'no cohort'}, not yet assigned)`,
        })),
    ];
  }, [reassignTarget, studentFees, feeStructures, cohorts]);

  const confirmReassign = async () => {
    if (!reassignTarget || !reassignFeeId) return;
    try {
      setIsProcessing(true);
      const [kind, id] = reassignFeeId.split(':');
      // A fee the student was never assigned has no fees row yet — the
      // by_structure RPC creates it before moving the receipt onto it.
      const { error } = kind === 'structure'
        ? await supabase.rpc('admin_set_payment_fee_by_structure', {
            p_payment_id: reassignTarget.id,
            p_fee_structure_id: id,
          })
        : await supabase.rpc('admin_set_payment_fee', {
            p_payment_id: reassignTarget.id,
            p_student_fee_id: id,
          });
      if (error) { toast.error('Failed to reassign: ' + error.message); return; }
      toast.success('Receipt assigned to the selected fee');
      setReassignTarget(null);
      setReassignFeeId('');
      await fetchPaymentsWithStudents();
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectPayment = async (id: string) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'REJECTED' }).eq('id', id);
      if (error) { toast.error('Failed to reject'); return; }
      toast.success('Payment rejected');
      await fetchPaymentsWithStudents();
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDeletePayment = async () => {
    if (!deleteTarget) return;
    try {
      setIsProcessing(true);
      // A manual entry has no receipt behind it, so removing it has to take the
      // amount back off the fee it was credited to.
      const { error } = deleteTarget.is_manual_record
        ? await supabase.rpc('admin_delete_manual_payment', { p_payment_id: deleteTarget.id })
        : await supabase.from('payments').delete().eq('id', deleteTarget.id);
      if (error) { toast.error('Failed to delete: ' + error.message); return; }
      toast.success(deleteTarget.is_manual_record ? 'Manual payment reversed' : 'Payment record deleted');
      setPendingPayments((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setApprovedPayments((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } finally {
      setIsProcessing(false);
      setDeleteTarget(null);
    }
  };

  const verifyAllPending = async () => {
    if (!pendingPayments.length) return toast.info('No pending payments');
    if (!window.confirm(`Verify all ${pendingPayments.length} pending payment(s)?`)) return;
    try {
      setIsProcessing(true);
      let ok = 0, fail = 0, skipped = 0;
      for (const p of pendingPayments) {
        if (!p.student_fee_id) { skipped++; continue; }
        try {
          const { error } = await supabase.rpc('admin_approve_payment', { p_payment_id: p.id });
          if (error) throw error;
          ok++;
        } catch { fail++; }
      }
      toast.success(
        `Verified ${ok}${fail ? `, ${fail} failed` : ''}${skipped ? `, ${skipped} skipped (no fee assigned)` : ''}`,
      );
      await fetchPaymentsWithStudents();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportFees = async () => {
    try {
      toast.info('Preparing fee report…');
      const { data: fees, error } = await supabase.from('fees').select('student_id, fee_type, amount_due, amount_paid, payment_status, cohort_id, waived, created_at');
      if (error) { toast.error('Export failed: ' + error.message); return; }
      if (!fees?.length) { toast.error('No data to export'); return; }
      const studentIds = [...new Set(fees.map((f) => f.student_id))];
      const { data: students } = await supabase.from('students').select('id, student_code, profile:profiles(first_name, last_name, email)').in('id', studentIds);
      const map = new Map((students || []).map((s) => [s.id, s]));
      downloadCSV(fees.map((f) => {
        const s = map.get(f.student_id);
        return {
          Student: s ? `${s.profile?.first_name || ''} ${s.profile?.last_name || ''}`.trim() : 'Unknown',
          Email: s?.profile?.email || '',
          Student_Code: s?.student_code || '',
          Fee_Type: f.fee_type,
          Amount_Due: f.amount_due,
          Amount_Paid: f.amount_paid,
          Status: f.payment_status,
          Waived: f.waived ? 'Yes' : 'No',
          Date: f.created_at ? new Date(f.created_at).toLocaleDateString() : '',
        };
      }), 'fee_report');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  // ===== Filtering for approved payments =====
  const feeNames = useMemo(() => {
    const names = new Set<string>();
    approvedPayments.forEach((p) => { if (p.fee_name) names.add(p.fee_name); });
    return Array.from(names).sort();
  }, [approvedPayments]);

  const filteredApproved = useMemo(() => {
    return approvedPayments.filter((p) => {
      if (searchName && !p.student_name?.toLowerCase().includes(searchName.toLowerCase()) &&
          !p.student_email?.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCohort !== 'all' && p.cohort_id !== filterCohort) return false;
      if (filterFee !== 'all' && p.fee_name !== filterFee) return false;
      const d = new Date(p.payment_date || p.created_at || 0).getTime();
      if (filterFrom && d < new Date(filterFrom).getTime()) return false;
      if (filterTo && d > new Date(filterTo).getTime() + 86_400_000) return false;
      return true;
    });
  }, [approvedPayments, searchName, filterCohort, filterFee, filterFrom, filterTo]);

  const clearFilters = () => {
    setSearchName(''); setFilterCohort('all'); setFilterFee('all'); setFilterFrom(''); setFilterTo('');
  };

  const filteredStructures = useMemo(
    () => structureFilter === 'all' ? feeStructures : feeStructures.filter((f) => f.cohort_id === structureFilter),
    [feeStructures, structureFilter],
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fee Management</h1>
          <p className="text-sm text-muted-foreground">Create fees and approve student payments</p>
        </div>
        {/* Wraps rather than overflowing: four controls in one row is wider
            than a phone. */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportFees} className="gap-2">
            <Download className="h-4 w-4" /> Export Fees
          </Button>
          <Button variant={tab === 'manager' ? 'default' : 'ghost'} onClick={() => setTab('manager')}>Fee Manager</Button>
          <Button variant={tab === 'approvals' ? 'default' : 'ghost'} onClick={() => setTab('approvals')}>
            Payment Approvals
            {pendingPayments.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingPayments.length}</Badge>
            )}
          </Button>
          <Button variant={tab === 'manual' ? 'default' : 'ghost'} onClick={() => setTab('manual')}>
            Record Payment
          </Button>
        </div>
      </div>

      {tab === 'manager' && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Fee</CardTitle>
            <CardDescription>
              Define a fee for a cohort. Fees marked 'All' apply to everyone; specific modes only apply to students in that learning mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onAddFee)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Cohort</Label>
                <Select value={selectedCohort} onValueChange={(v) => setValue('cohort_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Learning Modes</Label>
                <LearningModeSelect
                  value={selectedModes}
                  onChange={(modes) => setValue('learning_modes', modes)}
                />
              </div>
              <div>
                <Label>Fee Name</Label>
                <Input {...register('fee_name', { required: true })} placeholder="e.g. Tuition" />
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input type="number" step="0.01" {...register('amount', { required: true })} />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={isProcessing}>{isProcessing ? 'Adding…' : 'Add Fee'}</Button>
              </div>
            </form>

            <div className="mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-lg">Existing Fees ({filteredStructures.length})</h3>
                <Select value={structureFilter} onValueChange={setStructureFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="All Cohorts" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cohorts</SelectItem>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {filteredStructures.length === 0 ? (
                <p className="text-muted-foreground text-sm">No fees defined yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee</TableHead>
                        <TableHead className="hidden md:table-cell">Cohort</TableHead>
                        <TableHead className="hidden lg:table-cell">Mode</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStructures.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">
                            {f.fee_name}
                            {/* Cohort and mode lose their columns on a narrow
                                screen, so they ride under the fee name. */}
                            <span className="mt-1 block text-xs font-normal text-muted-foreground md:hidden">
                              {cohorts.find((c) => c.id === f.cohort_id)?.name || '—'}
                            </span>
                            <span className="mt-1 block lg:hidden">
                              <LearningModeTags modes={f.learning_modes} />
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{cohorts.find((c) => c.id === f.cohort_id)?.name || '—'}</TableCell>
                          <TableCell className="hidden lg:table-cell"><LearningModeTags modes={f.learning_modes} /></TableCell>
                          <TableCell className="text-right">₦{Number(f.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEditFee(f)} disabled={isProcessing}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteFeeId(f.id)} disabled={isProcessing}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'approvals' && (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Pending Payments</CardTitle>
                <CardDescription>Review and verify pending student receipts</CardDescription>
              </div>
              {pendingPayments.length > 0 && (
                <Button size="sm" onClick={verifyAllPending} disabled={isProcessing} className="gap-2 self-start">
                  <CheckCheck className="h-4 w-4" /> Verify All ({pendingPayments.length})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {pendingPayments.length === 0 ? (
                <p className="text-muted-foreground">No pending payments</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="hidden md:table-cell">Fee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden lg:table-cell">Date</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.student_name}
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">
                              <button onClick={() => openReassign(p)} className="text-left hover:underline">
                                {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                              </button>
                              <span className="lg:hidden">{p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString()}` : ''}</span>
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-xs md:table-cell">
                            <button onClick={() => openReassign(p)} className="hover:underline text-left">
                              {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">₦{Number(p.amount_paid).toLocaleString()}</TableCell>
                          <TableCell className="hidden lg:table-cell">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</TableCell>
                          <TableCell>
                            {(p.payment_proof_url || p.storage_path) ? (
                              <button onClick={() => openReceipt(p)} className="text-primary hover:underline flex items-center gap-1">
                                <Eye className="h-4 w-4" /> View
                              </button>
                            ) : <span className="text-muted-foreground text-sm">No receipt</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => openReassign(p)} disabled={isProcessing} title="Change fee">
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                              <Button size="sm" onClick={() => approvePayment(p)} disabled={isProcessing}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="destructive" onClick={() => rejectPayment(p.id)} disabled={isProcessing}><X className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)} disabled={isProcessing}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approved Payments ({filteredApproved.length}/{approvedPayments.length})</CardTitle>
              <CardDescription>Filter, view receipts, and manage verified payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2 relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search student name or email…" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
                </div>
                <Select value={filterCohort} onValueChange={setFilterCohort}>
                  <SelectTrigger><SelectValue placeholder="Cohort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cohorts</SelectItem>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterFee} onValueChange={setFilterFee}>
                  <SelectTrigger><SelectValue placeholder="Fee type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fee Types</SelectItem>
                    {feeNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="From" />
                  <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="To" />
                </div>
              </div>
              {(searchName || filterCohort !== 'all' || filterFee !== 'all' || filterFrom || filterTo) && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
              )}

              {filteredApproved.length === 0 ? (
                <p className="text-muted-foreground">{approvedPayments.length === 0 ? 'No approved payments yet' : 'No payments match the current filters'}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="hidden xl:table-cell">Cohort</TableHead>
                        <TableHead className="hidden md:table-cell">Fee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden lg:table-cell">Date</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApproved.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.student_name}
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground xl:hidden">
                              <span className="md:hidden">
                                <button onClick={() => openReassign(p)} className="text-left hover:underline">
                                  {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                                </button>
                                {' · '}
                              </span>
                              {cohorts.find((c) => c.id === p.cohort_id)?.name || '—'}
                              <span className="lg:hidden">{(p.payment_date || p.created_at) ? ` · ${new Date(p.payment_date || p.created_at!).toLocaleDateString()}` : ''}</span>
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-xs xl:table-cell">{cohorts.find((c) => c.id === p.cohort_id)?.name || '—'}</TableCell>
                          <TableCell className="hidden text-xs md:table-cell">
                            <button onClick={() => openReassign(p)} className="hover:underline text-left">
                              {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">₦{Number(p.amount_paid).toLocaleString()}</TableCell>
                          <TableCell className="hidden lg:table-cell">{(p.payment_date || p.created_at) ? new Date(p.payment_date || p.created_at!).toLocaleDateString() : ''}</TableCell>
                          <TableCell>
                            {(p.payment_proof_url || p.storage_path) ? (
                              <button onClick={() => openReceipt(p)} className="text-primary hover:underline flex items-center gap-1">
                                <Eye className="h-4 w-4" /> View
                              </button>
                            ) : p.is_manual_record ? (
                              <Badge variant="outline" className="text-xs">Manual entry</Badge>
                            ) : <span className="text-muted-foreground text-sm">No receipt</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => openReassign(p)} disabled={isProcessing} title="Change fee">
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)} disabled={isProcessing}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'manual' && (
        <ManualPaymentPanel
          cohorts={cohorts}
          feeStructures={feeStructures}
          onRecorded={fetchPaymentsWithStudents}
        />
      )}

      {/* Receipt viewer (always mounted) */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-4">
            {selectedReceiptLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedReceipt ? (
              selectedReceipt.toLowerCase().endsWith('.pdf') ? (
                <iframe src={selectedReceipt} title="Receipt" className="w-full h-[70vh] rounded border" />
              ) : (
                <img src={selectedReceipt} alt="Receipt" className="w-full max-h-[70vh] object-contain rounded" />
              )
            ) : (
              <p className="text-sm text-destructive">Unable to load receipt.</p>
            )}
            {selectedReceipt && (
              <a href={selectedReceipt} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Open in new tab
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Re-assign a receipt to the correct fee */}
      <Dialog open={!!reassignTarget} onOpenChange={(o) => { if (!o) { setReassignTarget(null); setReassignFeeId(''); } }}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign receipt to a fee</DialogTitle>
            <DialogDescription>
              {reassignTarget
                ? `₦${Number(reassignTarget.amount_paid).toLocaleString()} from ${reassignTarget.student_name}. Picking a fee the student doesn't have yet will assign it to them.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {reassignOptions.length === 0 ? (
              <p className="text-sm text-destructive">
                No fees exist yet. Create one under Fee Manager first.
              </p>
            ) : (
              <>
                <Label>Fee</Label>
                <Select value={reassignFeeId} onValueChange={setReassignFeeId}>
                  <SelectTrigger><SelectValue placeholder="Select fee" /></SelectTrigger>
                  <SelectContent>
                    {reassignOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="inline-flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              o.status === 'Paid' || o.status === 'Waived'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : o.status === 'Partial'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-red-100 text-red-800 border-red-300'
                            }
                          >
                            {o.status}
                          </Badge>
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {['VERIFIED', 'APPROVED'].includes((reassignTarget?.status || '').toUpperCase()) && (
                  <p className="text-xs text-muted-foreground">
                    This payment is already verified — the amount will be moved off its current fee and onto the one you pick.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignTarget(null)} disabled={isProcessing}>Cancel</Button>
            <Button onClick={confirmReassign} disabled={isProcessing || !reassignFeeId || reassignFeeId === `fee:${reassignTarget?.student_fee_id}`}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.fee_name}</DialogTitle>
            <DialogDescription>
              {cohorts.find((c) => c.id === editTarget?.cohort_id)?.name || 'This cohort'} — the name and cohort
              are fixed, since student records are filed under the fee's name. Delete and re-add to change those.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Learning Modes</Label>
              <LearningModeSelect value={editModes} onChange={setEditModes} disabled={isProcessing} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Adding a mode bills the students it now covers. Removing one clears the fee from students it no
                longer applies to, unless they have already paid or have a receipt against it.
              </p>
            </div>
            <div>
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                disabled={isProcessing}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                A new price reaches records with nothing against them. Anyone who has already paid, part-paid or
                submitted a receipt keeps the amount they were quoted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={isProcessing}>Cancel</Button>
            <Button onClick={onSaveEditFee} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete payment record?"
        description={
          deleteTarget
            ? deleteTarget.is_manual_record
              ? `This manual entry of ₦${Number(deleteTarget.amount_paid).toLocaleString()} for ${deleteTarget.student_name} will be removed and the amount taken back off the fee.`
              : `This will permanently remove the ${deleteTarget.status} payment of ₦${Number(deleteTarget.amount_paid).toLocaleString()} from ${deleteTarget.student_name}. The student's fee balance is NOT auto-adjusted — verify the fee record afterward.`
            : ''
        }
        confirmLabel="Delete record"
        variant="destructive"
        onConfirm={confirmDeletePayment}
      />

      <ConfirmDialog
        open={!!deleteFeeId}
        onOpenChange={(o) => !o && setDeleteFeeId(null)}
        title="Delete fee definition?"
        description="This removes the fee structure. Existing student fee records are not affected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDeleteFee}
      />
    </div>
  );
};

export default AdminFees;
