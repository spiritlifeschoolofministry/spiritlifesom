import { useState, useEffect, useMemo } from 'react';
import { withRejectionReason } from "@/lib/rejection-note";
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Plus, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageSkeleton } from '@/components/portal/PageSkeleton';
import { AdminPageHeader, StatusPill } from '@/components/redesign/admin/primitives';
import { APPROVE_BUTTON, QUIET_BUTTON, REJECT_BUTTON } from '@/components/redesign/admin/styles';
import {
  DetailField,
  ReceiptDetail,
  ReceiptQueueList,
} from '@/components/redesign/admin/fees/ReceiptQueue';
import { paymentTypeLabel, submittedLabel } from '@/components/redesign/admin/fees/receipt-labels';

type PaymentReview = Tables<'payments'> & {
  student_name?: string;
  student_email?: string;
};

interface AddFeeFormData {
  cohort_id: string;
  fee_name: string;
  amount: string;
}

const AdminPayments = () => {
  const [pendingPayments, setPendingPayments] = useState<PaymentReview[]>([]);
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [loading, setLoading] = useState(true);
  // The receipt open in the detail panel. When it is decided and leaves the
  // queue, the one that took its place opens next.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAddFeeModalOpen, setIsAddFeeModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<null | "approve" | "reject">(null);

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<AddFeeFormData>({
    defaultValues: { cohort_id: '', fee_name: '', amount: '' },
  });

  const selectedCohort = watch('cohort_id');

  const fetchPayments = async () => {
    try {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (payments) {
        const enriched = await Promise.all(
          payments.map(async (p) => {
            let student_name = 'Unknown';
            let student_email = '';
            if (p.student_id) {
              const { data: studentData } = await supabase.from('students').select('profile_id').eq('id', p.student_id).single();
              if (studentData?.profile_id) {
                const { data: profileData } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', studentData.profile_id).single();
                if (profileData) {
                  student_name = `${profileData.first_name} ${profileData.last_name}`.trim();
                  student_email = profileData.email;
                }
              }
            }
            return { ...p, student_name, student_email };
          })
        );
        setPendingPayments(enriched);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load payments');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
        if (cohortsData) setCohorts(cohortsData);
        await fetchPayments();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectedPayment = useMemo(() => {
    if (pendingPayments.length === 0) return null;
    return (
      pendingPayments.find((p) => p.id === selectedId) ??
      pendingPayments[Math.min(selectedIndex, pendingPayments.length - 1)]
    );
  }, [pendingPayments, selectedId, selectedIndex]);

  const selectPayment = (id: string) => {
    setSelectedId(id);
    setSelectedIndex(Math.max(0, pendingPayments.findIndex((p) => p.id === id)));
  };

  // A new receipt starts with an empty reason.
  useEffect(() => {
    setRejectionReason('');
  }, [selectedPayment?.id]);

  const approvePayment = async (payment: PaymentReview) => {
    try {
      setIsProcessing(true);
      if (!payment.student_fee_id) {
        toast.error('Assign this receipt to a fee in Fee Management before verifying it');
        return;
      }
      const { error } = await supabase.rpc('admin_approve_payment', { p_payment_id: payment.id });
      if (error) { toast.error('Failed to approve payment: ' + error.message); return; }
      toast.success('Payment approved');
      setSelectedId(null);
      await fetchPayments();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectPayment = async (payment: PaymentReview) => {
    if (!rejectionReason.trim()) { toast.error('Please provide a rejection reason'); return; }
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'REJECTED', admin_notes: withRejectionReason(payment.admin_notes, rejectionReason) }).eq('id', payment.id);
      if (error) { toast.error('Failed to reject payment'); return; }
      toast.success('Payment rejected');
      setSelectedId(null);
      setRejectionReason('');
      await fetchPayments();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const onAddFeeSubmit = async (data: AddFeeFormData) => {
    if (!data.cohort_id) { toast.error('Please select a cohort'); return; }
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fee_structures').insert({
        cohort_id: data.cohort_id,
        fee_name: data.fee_name,
        amount: parseFloat(data.amount),
      });
      if (error) { toast.error('Failed to add fee'); return; }
      toast.success('Fee added successfully');
      setIsAddFeeModalOpen(false);
      reset();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <PageSkeleton panels={2} />;
  }

  return (
    <div className="space-y-5 pb-6">
      <AdminPageHeader
        section="Money"
        title="Payments"
        description={`${pendingPayments.length} pending payment${pendingPayments.length !== 1 ? 's' : ''} to verify`}
        actions={
          <>
            <Button asChild variant="outline" className={`h-11 gap-2 rounded-[10px] font-semibold sm:h-10 ${QUIET_BUTTON}`}>
              <Link to="/admin/fees">
                Open Fees and payments <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Dialog open={isAddFeeModalOpen} onOpenChange={setIsAddFeeModalOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 gap-2 rounded-[10px] font-bold sm:h-10"><Plus className="h-4 w-4" /> Add new fee</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
                <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                  <DialogTitle>Add New Fee</DialogTitle>
                  <DialogDescription>Create a new fee structure for a cohort</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onAddFeeSubmit)} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="pay-fee-cohort">Cohort</Label>
                    <Select value={selectedCohort} onValueChange={(value) => setValue('cohort_id', value)}>
                      <SelectTrigger id="pay-fee-cohort"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                      <SelectContent>
                        {cohorts.map((cohort) => (<SelectItem key={cohort.id} value={cohort.id}>{cohort.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-fee-name">Fee Name</Label>
                    <Input id="pay-fee-name" placeholder="e.g., Tuition, Graduation Fee" {...register('fee_name', { required: 'Fee name is required' })} />
                    {errors.fee_name && <p className="text-sm text-destructive">{errors.fee_name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-fee-amount">Amount (₦)</Label>
                    <Input id="pay-fee-amount" type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Amount is required' })} />
                    {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
                  </div>
                  <div className="sticky bottom-0 bg-background pt-4 border-t">
                    <Button type="submit" disabled={isProcessing} className="w-full">
                      {isProcessing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>) : 'Add Fee'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <ReceiptQueueList
          title={`Receipts to verify · ${pendingPayments.length}`}
          payments={pendingPayments}
          selectedId={selectedPayment?.id ?? null}
          onSelect={selectPayment}
          showFee={false}
        />
        {selectedPayment && (
          <ReceiptDetail payment={selectedPayment}>
            <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              <DetailField label="Student says">{paymentTypeLabel(selectedPayment.payment_type, true)}</DetailField>
              <DetailField label="Submitted">{submittedLabel(selectedPayment.created_at)}</DetailField>
              <DetailField label="Status">
                <StatusPill tone="warn">{selectedPayment.status || 'PENDING'}</StatusPill>
              </DetailField>
              <DetailField label="Fee">
                {selectedPayment.student_fee_id ? (
                  'Assigned'
                ) : (
                  <Link to="/admin/fees" className="font-semibold text-primary underline-offset-4 hover:underline">
                    Not set. Assign it in Fees and payments
                  </Link>
                )}
              </DetailField>
            </dl>

            {selectedPayment.admin_notes && (
              <DetailField label="Notes">{selectedPayment.admin_notes}</DetailField>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payments-reject-reason" className="text-sm font-semibold">Rejection reason (if rejecting)</Label>
              <Textarea
                id="payments-reject-reason"
                placeholder="Provide reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[80px] rounded-[10px]"
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button
                onClick={() => setPendingConfirm("approve")}
                disabled={isProcessing}
                className={`h-[46px] gap-2 rounded-xl px-5 text-[15px] font-bold ${APPROVE_BUTTON}`}
              >
                <CheckCircle className="h-4 w-4" /> Approve payment
              </Button>
              <Button
                variant="outline"
                onClick={() => setPendingConfirm("reject")}
                disabled={isProcessing}
                className={`h-[46px] gap-2 rounded-xl px-[18px] text-[15px] font-semibold ${REJECT_BUTTON}`}
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
          </ReceiptDetail>
        )}
      </div>

      {/* Confirmation dialog for verify / reject */}
      <ConfirmDialog
        open={!!pendingConfirm}
        onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}
        loading={isProcessing}
        title={pendingConfirm === "approve" ? "Verify this payment?" : "Reject this payment?"}
        description={
          pendingConfirm === "approve"
            ? `Mark ${selectedPayment?.student_name || "this student"}'s payment of ₦${selectedPayment?.amount_paid?.toLocaleString() || 0} as VERIFIED. Their fee balance will be updated.`
            : `Reject ${selectedPayment?.student_name || "this student"}'s payment. Make sure you've entered a clear rejection reason.`
        }
        confirmLabel={pendingConfirm === "approve" ? "Verify Payment" : "Reject Payment"}
        variant={pendingConfirm === "reject" ? "destructive" : "default"}
        onConfirm={async () => {
          if (!selectedPayment) return;
          if (pendingConfirm === "approve") await approvePayment(selectedPayment);
          else if (pendingConfirm === "reject") await rejectPayment(selectedPayment);
          setPendingConfirm(null);
        }}
      />
    </div>
  );
};

export default AdminPayments;
