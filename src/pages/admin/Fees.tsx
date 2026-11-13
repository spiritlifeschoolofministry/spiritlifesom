import { useState, useEffect, useMemo } from 'react';
import FeeActionDialog, { type FeeAction, type FeeActionTarget } from "@/components/redesign/admin/fees/FeeActionDialog";
import { withRejectionReason } from "@/lib/rejection-note";
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Eye, Check, X, Download, Trash2, CheckCheck, Search, ArrowLeftRight, Pencil, HandCoins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { resolveReceiptUrl } from '@/lib/receipt-url';
import ReceiptViewer from '@/components/admin/ReceiptViewer';
import { downloadCSV } from '@/lib/csv-export';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Tables } from '@/integrations/supabase/types';
import { LearningModeSelect, LearningModeTags } from '@/components/admin/LearningModeSelect';
import { ManualPaymentPanel } from '@/components/admin/ManualPaymentPanel';
import { PageSkeleton } from '@/components/portal/PageSkeleton';
import { toModeArray } from '@/lib/learning-modes';
import { naira } from '@/lib/money';
import { AdminPageHeader, KpiTile, Panel, StatusPill, type Tone } from '@/components/redesign/admin/primitives';
import { APPROVE_BUTTON, QUIET_BUTTON, REJECT_BUTTON } from '@/components/redesign/admin/styles';
import {
  DetailField,
  ReceiptDetail,
  ReceiptQueueList,
} from '@/components/redesign/admin/fees/ReceiptQueue';
import { paymentTypeLabel, submittedLabel } from '@/components/redesign/admin/fees/receipt-labels';

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

/** A fee record with the student's name, for the Student fee records tab. */
type FeeRecord = Pick<
  StudentFee,
  'id' | 'student_id' | 'fee_type' | 'amount_due' | 'amount_paid' | 'payment_status' | 'cohort_id' | 'waived'
> & { student_name: string; student_email: string };

type FeesTab = 'approvals' | 'records' | 'manager' | 'all' | 'manual';

const feeStatusOf = (f: Pick<StudentFee, 'waived' | 'payment_status'>) => {
  if (f.waived) return 'Waived';
  const s = (f.payment_status || '').toLowerCase();
  if (s === 'paid') return 'Paid';
  if (s === 'partial') return 'Partial';
  return 'Unpaid';
};

const STATUS_TONE: Record<string, Tone> = { Paid: 'good', Partial: 'warn', Unpaid: 'bad', Waived: 'neutral' };

const outstandingOf = (f: Pick<StudentFee, 'amount_due' | 'amount_paid'>) =>
  Math.max(Number(f.amount_due || 0) - Number(f.amount_paid || 0), 0);

const TAB_TRIGGER =
  'h-11 shrink-0 rounded-none border-b-[3px] border-transparent bg-transparent px-4 text-[15px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

const AdminFees = () => {
  const [tab, setTab] = useState<FeesTab>('approvals');
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [feeStructures, setFeeStructures] = useState<Tables<'fee_structures'>[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentWithStudent[]>([]);
  const [approvedPayments, setApprovedPayments] = useState<PaymentWithStudent[]>([]);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [feeAction, setFeeAction] = useState<{ action: FeeAction; target: FeeActionTarget } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  // Kept alongside the URL because the file's type has to be read from the
  // stored path — a presigned URL's extension is hidden behind its query string.
  const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<PaymentWithStudent | null>(null);
  const [selectedReceiptLoading, setSelectedReceiptLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // The receipt open in the approvals detail panel. When it is decided and
  // leaves the queue, the one that took its place opens next.
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [selectedPendingIndex, setSelectedPendingIndex] = useState(0);
  const [rejectReason, setRejectReason] = useState('');
  const [inlineFeeId, setInlineFeeId] = useState('');

  const [structureFilter, setStructureFilter] = useState('all');

  // Approved-payments filters
  const [searchName, setSearchName] = useState('');
  const [filterCohort, setFilterCohort] = useState('all');
  const [filterFee, setFilterFee] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Student fee records filters
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsCohort, setRecordsCohort] = useState('all');
  const [recordsFee, setRecordsFee] = useState('all');

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

  /**
   * Every student's fee records, for the KPI row and the Student fee records
   * tab. Same query shapes as the fee report export.
   */
  const fetchFeeRecords = async () => {
    try {
      const { data: fees, error } = await supabase
        .from('fees')
        .select('id, student_id, fee_type, amount_due, amount_paid, payment_status, cohort_id, waived');
      if (error) throw error;
      const studentIds = [...new Set((fees || []).map((f) => f.student_id))];
      const { data: students } = studentIds.length
        ? await supabase.from('students').select('id, student_code, profile:profiles(first_name, last_name, email)').in('id', studentIds)
        : { data: [] };
      const map = new Map((students || []).map((s) => [s.id, s]));
      setFeeRecords(
        (fees || []).map((f) => {
          const s = map.get(f.student_id);
          return {
            ...f,
            student_name: s ? `${s.profile?.first_name || ''} ${s.profile?.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            student_email: s?.profile?.email || '',
          };
        }),
      );
    } catch (e) {
      console.error('Failed to load fee records', e);
    }
  };

  /** After anything that moves money: payments and balances both change. */
  const refreshMoney = async () => {
    await Promise.all([fetchPaymentsWithStudents(), fetchFeeRecords()]);
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
        await refreshMoney();
      } catch (e) {
        console.error(e);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
    // Mount-only load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openReceipt = async (p: PaymentWithStudent) => {
    setReceiptOpen(true);
    setSelectedReceipt(null);
    setSelectedReceiptPayment(p);
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
      await fetchFeeRecords();
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
      await refreshMoney();
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
  const feeOptionsFor = (target: PaymentWithStudent | null) => {
    if (!target) return [];
    const own = studentFees.filter((f) => f.student_id === target.student_id);
    const ownTypes = new Set(own.map((f) => f.fee_type));
    return [
      ...own.map((f) => ({
        value: `fee:${f.id}`,
        status: feeStatusOf(f),
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
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reassignOptions = useMemo(() => feeOptionsFor(reassignTarget), [reassignTarget, studentFees, feeStructures, cohorts]);

  /** Moves a receipt onto a fee, with the same two RPCs as always. */
  const assignFee = async (target: PaymentWithStudent, value: string) => {
    try {
      setIsProcessing(true);
      const [kind, id] = value.split(':');
      // A fee the student was never assigned has no fees row yet — the
      // by_structure RPC creates it before moving the receipt onto it.
      const { error } = kind === 'structure'
        ? await supabase.rpc('admin_set_payment_fee_by_structure', {
            p_payment_id: target.id,
            p_fee_structure_id: id,
          })
        : await supabase.rpc('admin_set_payment_fee', {
            p_payment_id: target.id,
            p_student_fee_id: id,
          });
      if (error) { toast.error('Failed to reassign: ' + error.message); return false; }
      toast.success('Receipt assigned to the selected fee');
      await refreshMoney();
      return true;
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmReassign = async () => {
    if (!reassignTarget || !reassignFeeId) return;
    const ok = await assignFee(reassignTarget, reassignFeeId);
    if (ok) {
      setReassignTarget(null);
      setReassignFeeId('');
    }
  };

  const rejectPayment = async (id: string, reason?: string) => {
    try {
      setIsProcessing(true);
      // A typed reason is kept on the payment, as the Payments page does.
      const note = reason?.trim();
      // Keep the student's own note; add the reason after it.
      let adminNotes: string | undefined;
      if (note) {
        const { data: current } = await supabase.from('payments').select('admin_notes').eq('id', id).maybeSingle();
        adminNotes = withRejectionReason(current?.admin_notes, note);
      }
      const { error } = await supabase
        .from('payments')
        .update(adminNotes ? { status: 'REJECTED', admin_notes: adminNotes } : { status: 'REJECTED' })
        .eq('id', id);
      if (error) { toast.error('Failed to reject'); return; }
      toast.success('Payment rejected');
      setRejectReason('');
      await refreshMoney();
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
      if (deleteTarget.is_manual_record) await fetchFeeRecords();
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
      await refreshMoney();
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

  // ===== Approvals queue selection =====
  const selectedPending = useMemo(() => {
    if (pendingPayments.length === 0) return null;
    return (
      pendingPayments.find((p) => p.id === selectedPendingId) ??
      pendingPayments[Math.min(selectedPendingIndex, pendingPayments.length - 1)]
    );
  }, [pendingPayments, selectedPendingId, selectedPendingIndex]);

  const selectPending = (id: string) => {
    setSelectedPendingId(id);
    setSelectedPendingIndex(Math.max(0, pendingPayments.findIndex((p) => p.id === id)));
  };

  // A new receipt starts with an empty reason and no fee picked.
  useEffect(() => {
    setRejectReason('');
    setInlineFeeId('');
  }, [selectedPending?.id]);

  const balanceAfter = (p: PaymentWithStudent) => {
    if (!p.student_fee_id) return 'Depends on the fee chosen';
    const fee = studentFees.find((f) => f.id === p.student_fee_id);
    if (!fee) return '—';
    const left = outstandingOf(fee) - Number(p.amount_paid || 0);
    return left <= 0 ? 'Fully paid' : `${naira(left)} left on ${fee.fee_type}`;
  };

  // ===== KPI row =====
  const kpis = useMemo(() => {
    const live = feeRecords.filter((f) => !f.waived);
    const collected = live.reduce((sum, f) => sum + Number(f.amount_paid || 0), 0);
    const expected = live.reduce((sum, f) => sum + Number(f.amount_due || 0), 0);
    const owing = live.filter((f) => outstandingOf(f) > 0);
    const owingStudents = new Set(owing.map((f) => f.student_id)).size;
    const outstanding = owing.reduce((sum, f) => sum + outstandingOf(f), 0);
    const waived = feeRecords.filter((f) => f.waived);
    const waivedAmount = waived.reduce((sum, f) => sum + outstandingOf(f), 0);
    const oldest = pendingPayments.reduce<number | null>((min, p) => {
      if (!p.created_at) return min;
      const t = new Date(p.created_at).getTime();
      return min === null || t < min ? t : min;
    }, null);
    const oldestDays = oldest === null ? null : Math.floor((Date.now() - oldest) / 86_400_000);
    return { collected, expected, owingStudents, outstanding, waivedAmount, waivedCount: waived.length, oldestDays };
  }, [feeRecords, pendingPayments]);

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

  // ===== Student fee records =====
  const recordFeeTypes = useMemo(
    () => Array.from(new Set(feeRecords.map((f) => f.fee_type).filter(Boolean))).sort(),
    [feeRecords],
  );

  const filteredRecords = useMemo(() => {
    const q = recordsSearch.trim().toLowerCase();
    return feeRecords
      .filter((f) => {
        if (q && !f.student_name.toLowerCase().includes(q) && !f.student_email.toLowerCase().includes(q)) return false;
        if (recordsCohort !== 'all' && f.cohort_id !== recordsCohort) return false;
        if (recordsFee !== 'all' && f.fee_type !== recordsFee) return false;
        return true;
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name) || a.fee_type.localeCompare(b.fee_type));
  }, [feeRecords, recordsSearch, recordsCohort, recordsFee]);

  const filteredStructures = useMemo(
    () => structureFilter === 'all' ? feeStructures : feeStructures.filter((f) => f.cohort_id === structureFilter),
    [feeStructures, structureFilter],
  );

  const cohortName = (id: string | null | undefined) => cohorts.find((c) => c.id === id)?.name || '—';

  if (loading) {
    return <PageSkeleton panels={2} />;
  }

  const inlineOptions = feeOptionsFor(selectedPending);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as FeesTab)} className="pb-6">
      <FeeActionDialog action={feeAction?.action ?? null} target={feeAction?.target ?? null} onClose={() => setFeeAction(null)} onDone={fetchFeeRecords} />
      <AdminPageHeader
        section="Money"
        title="Fees and payments"
        actions={
          <>
            <Button variant="outline" onClick={handleExportFees} className={`h-11 gap-2 rounded-[10px] font-semibold sm:h-10 ${QUIET_BUTTON}`}>
              <Download className="h-4 w-4" /> Export fees
            </Button>
            <Button variant="outline" onClick={() => setTab('manual')} className={`h-11 gap-2 rounded-[10px] font-semibold sm:h-10 ${QUIET_BUTTON}`}>
              <HandCoins className="h-4 w-4" /> Record payment
            </Button>
          </>
        }
        tabs={
          <TabsList aria-label="Fees sections" className="h-auto w-full gap-1 rounded-none bg-transparent p-0">
            <TabsTrigger value="approvals" className={TAB_TRIGGER}>
              Payment approvals
              {pendingPayments.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {pendingPayments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="records" className={TAB_TRIGGER}>Student fee records</TabsTrigger>
            <TabsTrigger value="manager" className={TAB_TRIGGER}>Fee manager</TabsTrigger>
            <TabsTrigger value="all" className={TAB_TRIGGER}>Verified payments</TabsTrigger>
            <TabsTrigger value="manual" className={TAB_TRIGGER}>Record payment</TabsTrigger>
          </TabsList>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Collected"
          value={naira(kpis.collected)}
          note={kpis.expected > 0 ? `${Math.round((kpis.collected / kpis.expected) * 100)}% of ${naira(kpis.expected)} expected` : 'Nothing billed yet'}
        />
        <KpiTile
          label="Receipts to verify"
          value={pendingPayments.length}
          tone={pendingPayments.length > 0 ? 'warn' : 'good'}
          note={
            kpis.oldestDays === null
              ? 'None waiting'
              : kpis.oldestDays === 0
                ? 'Oldest from today'
                : `Oldest ${kpis.oldestDays} day${kpis.oldestDays === 1 ? '' : 's'}`
          }
        />
        <KpiTile
          label="Students owing"
          value={kpis.owingStudents}
          tone={kpis.owingStudents > 0 ? 'bad' : 'good'}
          note={`${naira(kpis.outstanding)} outstanding`}
        />
        <KpiTile
          label="Waived"
          value={naira(kpis.waivedAmount)}
          note={`${kpis.waivedCount} fee${kpis.waivedCount === 1 ? '' : 's'}`}
        />
      </div>

      {/* ===== Payment approvals ===== */}
      <TabsContent value="approvals" className="mt-5">
        <div className="flex flex-wrap items-start gap-5">
          <ReceiptQueueList
            title={`Receipts to verify · ${pendingPayments.length}`}
            payments={pendingPayments}
            selectedId={selectedPending?.id ?? null}
            onSelect={selectPending}
            actions={
              pendingPayments.length > 0 && (
                <Button
                  onClick={verifyAllPending}
                  disabled={isProcessing}
                  className={`h-11 gap-2 rounded-[10px] font-bold sm:h-10 ${APPROVE_BUTTON}`}
                >
                  <CheckCheck className="h-4 w-4" /> Verify all ({pendingPayments.length})
                </Button>
              )
            }
          />
          {pendingPayments.length > 0 && (
            <ReceiptDetail payment={selectedPending}>
              {selectedPending && (
                <>
                  <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                    <DetailField label="Student says">{paymentTypeLabel(selectedPending.payment_type, true)}</DetailField>
                    <DetailField label="Submitted">{submittedLabel(selectedPending.created_at)}</DetailField>
                    <DetailField label="Fee">
                      {selectedPending.fee_name || 'Not set'}
                      {selectedPending.student_fee_id && (
                        <button
                          type="button"
                          onClick={() => openReassign(selectedPending)}
                          disabled={isProcessing}
                          className="ml-2 inline-flex min-h-[44px] items-center gap-1 rounded text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Change fee
                        </button>
                      )}
                    </DetailField>
                    <DetailField label="Balance after approval">{balanceAfter(selectedPending)}</DetailField>
                  </dl>
                  {selectedPending.admin_notes && (
                    <DetailField label="Notes">{selectedPending.admin_notes}</DetailField>
                  )}

                  {!selectedPending.student_fee_id && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="inline-fee" className="text-sm font-semibold">Assign this receipt to a fee first</Label>
                      {inlineOptions.length === 0 ? (
                        <p className="text-sm text-destructive">No fees exist yet. Create one under Fee manager first.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Select value={inlineFeeId} onValueChange={setInlineFeeId}>
                            <SelectTrigger id="inline-fee" className="h-11 min-w-0 flex-1 basis-60 rounded-[10px]">
                              <SelectValue placeholder="Select fee" />
                            </SelectTrigger>
                            <SelectContent>
                              {inlineOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label} ({o.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => assignFee(selectedPending, inlineFeeId)}
                            disabled={isProcessing || !inlineFeeId}
                            className="h-11 rounded-[10px] font-bold"
                          >
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save fee'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reject-reason" className="text-sm font-semibold">Reason (if rejecting)</Label>
                    <Textarea
                      id="reject-reason"
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Optional. Saved on the payment record."
                      className="rounded-[10px]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      onClick={() => approvePayment(selectedPending)}
                      disabled={isProcessing}
                      className={`h-[46px] gap-2 rounded-xl px-5 text-[15px] font-bold ${APPROVE_BUTTON}`}
                    >
                      <Check className="h-4 w-4" /> Approve payment
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => rejectPayment(selectedPending.id, rejectReason)}
                      disabled={isProcessing}
                      className={`h-[46px] gap-2 rounded-xl px-[18px] text-[15px] font-semibold ${REJECT_BUTTON}`}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteTarget(selectedPending)}
                      disabled={isProcessing}
                      className="h-[46px] gap-2 rounded-xl text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Delete record
                    </Button>
                  </div>
                </>
              )}
            </ReceiptDetail>
          )}
        </div>
      </TabsContent>

      {/* ===== Student fee records ===== */}
      <TabsContent value="records" className="mt-5">
        <Panel
          title={`Student fee records (${filteredRecords.length})`}
          actions={
            <>
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  aria-label="Search student"
                  placeholder="Search student name or email…"
                  value={recordsSearch}
                  onChange={(e) => setRecordsSearch(e.target.value)}
                  className="h-11 rounded-[10px] pl-9 sm:h-10"
                />
              </div>
              <Select value={recordsCohort} onValueChange={setRecordsCohort}>
                <SelectTrigger aria-label="Cohort" className="h-11 w-full rounded-[10px] sm:h-10 sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cohorts</SelectItem>
                  {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={recordsFee} onValueChange={setRecordsFee}>
                <SelectTrigger aria-label="Fee type" className="h-11 w-full rounded-[10px] sm:h-10 sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fee types</SelectItem>
                  {recordFeeTypes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          }
        >
          {filteredRecords.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {feeRecords.length === 0 ? 'No fee records yet.' : 'No fee records match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs uppercase tracking-[0.05em]">
                    <TableHead className="pl-5">Student</TableHead>
                    <TableHead className="hidden md:table-cell">Fee</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Due</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-5 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((f) => {
                    const status = feeStatusOf(f);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="pl-5 font-semibold">
                          {f.student_name}
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">
                            {f.fee_type}
                            <span className="sm:hidden"> · {naira(Number(f.amount_paid))} of {naira(Number(f.amount_due))}</span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{f.fee_type}</TableCell>
                        <TableCell className="hidden sm:table-cell text-right">{naira(Number(f.amount_due))}</TableCell>
                        <TableCell className="hidden sm:table-cell text-right">{naira(Number(f.amount_paid))}</TableCell>
                        <TableCell><StatusPill tone={STATUS_TONE[status]}>{status}</StatusPill></TableCell>
                        <TableCell className="pr-5 text-right">
                          <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-11 rounded-lg sm:h-[34px] ${QUIET_BUTTON}`}
                              onClick={() => { setSearchName(f.student_name); setTab('all'); }}
                              aria-label={`Receipts for ${f.student_name}`}
                            >
                              Receipts
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-11 rounded-lg sm:h-[34px] ${QUIET_BUTTON}`}
                              onClick={() => setFeeAction({ action: 'adjust', target: f })}
                              aria-label={`Adjust ${f.fee_type} for ${f.student_name}`}
                            >
                              Adjust
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-11 rounded-lg sm:h-[34px] ${QUIET_BUTTON}`}
                              onClick={() => setFeeAction({ action: f.waived ? 'unwaive' : 'waive', target: f })}
                              aria-label={`${f.waived ? 'Undo waiver of' : 'Waive'} ${f.fee_type} for ${f.student_name}`}
                            >
                              {f.waived ? 'Undo waiver' : 'Waive'}
                            </Button>
                            <Button asChild variant="outline" size="sm" className={`h-11 rounded-lg sm:h-[34px] ${QUIET_BUTTON}`}>
                              <Link to={`/admin/students/${f.student_id}`} aria-label={`Open ${f.student_name}`}>Open student</Link>
                            </Button>
                          </div>
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

      {/* ===== Fee manager ===== */}
      <TabsContent value="manager" className="mt-5">
        <div className="flex flex-wrap items-start gap-5">
          <Panel
            title={`Fee manager (${filteredStructures.length})`}
            className="flex-[2] basis-[520px]"
            actions={
              <Select value={structureFilter} onValueChange={setStructureFilter}>
                <SelectTrigger aria-label="Filter fees by cohort" className="h-11 w-full rounded-[10px] sm:h-10 sm:w-[200px]"><SelectValue placeholder="All Cohorts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cohorts</SelectItem>
                  {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            }
          >
            {filteredStructures.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">No fees defined yet.</p>
            ) : (
              <ul>
                {filteredStructures.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3.5 border-t border-border/60 px-5 py-3 first:border-t-0">
                    <span className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                      <strong className="text-sm text-foreground">{f.fee_name}</strong>
                      <span className="text-[13px] text-muted-foreground">{cohortName(f.cohort_id)}</span>
                    </span>
                    <span className="w-40"><LearningModeTags modes={f.learning_modes} /></span>
                    <strong className="w-24 text-sm text-foreground">{naira(Number(f.amount))}</strong>
                    <span className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditFee(f)}
                        disabled={isProcessing}
                        aria-label={`Edit ${f.fee_name}`}
                        className={`h-11 gap-1.5 rounded-lg sm:h-[34px] ${QUIET_BUTTON}`}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteFeeId(f.id)}
                        disabled={isProcessing}
                        aria-label={`Delete ${f.fee_name}`}
                        className={`h-11 w-11 rounded-lg p-0 sm:h-[34px] sm:w-[34px] ${QUIET_BUTTON}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-border/60 px-5 pb-4 pt-3 text-[13px] text-muted-foreground">
              You can edit the amount and learning modes; the cohort and name are fixed. A new price reaches only the
              records with nothing against them, and you are told how many kept the old price. Fees marked All apply to
              everyone; a specific mode applies only to students in that learning mode.
            </p>
          </Panel>

          <form
            onSubmit={handleSubmit(onAddFee)}
            aria-labelledby="create-fee-title"
            className="flex min-w-0 flex-1 basis-[320px] flex-col gap-3 rounded-[18px] border border-border bg-card px-5 py-[18px]"
          >
            <h2 id="create-fee-title" className="text-[17px] font-bold text-foreground">Create a fee</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-fee-cohort" className="font-semibold">Cohort</Label>
              <Select value={selectedCohort} onValueChange={(v) => setValue('cohort_id', v)}>
                <SelectTrigger id="new-fee-cohort" className="h-11 rounded-[10px]"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                <SelectContent>
                  {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-fee-name" className="font-semibold">Fee name</Label>
              <Input id="new-fee-name" className="h-11 rounded-[10px]" {...register('fee_name', { required: true })} placeholder="e.g. Tuition" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-fee-amount" className="font-semibold">Amount (₦)</Label>
              <Input id="new-fee-amount" className="h-11 rounded-[10px]" type="number" step="0.01" inputMode="decimal" {...register('amount', { required: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="font-semibold">Learning modes</Label>
              <LearningModeSelect
                value={selectedModes}
                onChange={(modes) => setValue('learning_modes', modes)}
              />
            </div>
            <Button type="submit" disabled={isProcessing} className="h-11 rounded-[10px] font-bold">
              {isProcessing ? 'Creating…' : 'Create fee'}
            </Button>
          </form>
        </div>
      </TabsContent>

      {/* ===== Verified payments ===== */}
      <TabsContent value="all" className="mt-5">
        <Panel
          title={`Verified payments (${filteredApproved.length}/${approvedPayments.length})`}
          description="Filter, view receipts, and manage verified payments. Manual entries (cash or bank) are marked and can be reversed."
        >
          <div className="space-y-3 px-5 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input aria-label="Search payments by student" className="h-11 rounded-[10px] pl-9 sm:h-10" placeholder="Search student name or email…" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
              </div>
              <Select value={filterCohort} onValueChange={setFilterCohort}>
                <SelectTrigger aria-label="Cohort" className="h-11 rounded-[10px] sm:h-10"><SelectValue placeholder="Cohort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cohorts</SelectItem>
                  {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFee} onValueChange={setFilterFee}>
                <SelectTrigger aria-label="Fee type" className="h-11 rounded-[10px] sm:h-10"><SelectValue placeholder="Fee type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fee Types</SelectItem>
                  {feeNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="date" aria-label="From date" className="h-11 rounded-[10px] sm:h-10" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="From" />
                <Input type="date" aria-label="To date" className="h-11 rounded-[10px] sm:h-10" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="To" />
              </div>
            </div>
            {(searchName || filterCohort !== 'all' || filterFee !== 'all' || filterFrom || filterTo) && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>

          {filteredApproved.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{approvedPayments.length === 0 ? 'No approved payments yet' : 'No payments match the current filters'}</p>
          ) : (
            <div className="mt-3 overflow-x-auto border-t border-border">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs uppercase tracking-[0.05em]">
                    <TableHead className="pl-5">Student</TableHead>
                    <TableHead className="hidden xl:table-cell">Cohort</TableHead>
                    <TableHead className="hidden md:table-cell">Fee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead className="pr-5 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApproved.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-5 font-semibold">
                        {p.student_name}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground xl:hidden">
                          <span className="md:hidden">
                            <button onClick={() => openReassign(p)} className="text-left hover:underline">
                              {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                            </button>
                            {' · '}
                          </span>
                          {cohortName(p.cohort_id)}
                          <span className="lg:hidden">{(p.payment_date || p.created_at) ? ` · ${new Date(p.payment_date || p.created_at!).toLocaleDateString()}` : ''}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-xs xl:table-cell">{cohortName(p.cohort_id)}</TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        <button onClick={() => openReassign(p)} className="hover:underline text-left">
                          {p.fee_name || <span className="text-destructive">Not assigned — set fee</span>}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{naira(Number(p.amount_paid))}</TableCell>
                      <TableCell className="hidden lg:table-cell">{(p.payment_date || p.created_at) ? new Date(p.payment_date || p.created_at!).toLocaleDateString() : ''}</TableCell>
                      <TableCell>
                        {(p.payment_proof_url || p.storage_path) ? (
                          <button onClick={() => openReceipt(p)} className="flex min-h-[44px] items-center gap-1 text-primary hover:underline sm:min-h-0">
                            <Eye className="h-4 w-4" /> View
                          </button>
                        ) : p.is_manual_record ? (
                          <Badge variant="outline" className="text-xs">Manual entry</Badge>
                        ) : <span className="text-muted-foreground text-sm">No receipt</span>}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-11 w-11 p-0 sm:h-9 sm:w-9" onClick={() => openReassign(p)} disabled={isProcessing} title="Change fee" aria-label={`Change fee for ${p.student_name}`}>
                            <ArrowLeftRight className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-11 w-11 p-0 sm:h-9 sm:w-9" onClick={() => setDeleteTarget(p)} disabled={isProcessing} aria-label={`Delete payment from ${p.student_name}`}>
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
        </Panel>
      </TabsContent>

      {/* ===== Record payment ===== */}
      <TabsContent value="manual" className="mt-5">
        <ManualPaymentPanel
          cohorts={cohorts}
          feeStructures={feeStructures}
          onRecorded={refreshMoney}
        />
      </TabsContent>

      {/* Receipt viewer (always mounted) */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-4">
            <ReceiptViewer
              payment={selectedReceiptPayment}
              url={selectedReceipt}
              loading={selectedReceiptLoading}
            />
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
                          <StatusPill tone={STATUS_TONE[o.status] === 'neutral' ? 'good' : STATUS_TONE[o.status]}>
                            {o.status}
                          </StatusPill>
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
              <Label htmlFor="edit-fee-amount">Amount (₦)</Label>
              <Input
                id="edit-fee-amount"
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
    </Tabs>
  );
};

export default AdminFees;
