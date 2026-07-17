import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { r2Storage } from '@/lib/r2-storage';
import { resolveReceiptUrl } from '@/lib/receipt-url';
import { Loader2, CheckCircle, XCircle, Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';

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
  const [selectedPayment, setSelectedPayment] = useState<PaymentReview | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isAddFeeModalOpen, setIsAddFeeModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<null | "approve" | "reject">(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

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

  useEffect(() => {
    if (!selectedPayment) { setReceiptUrl(null); return; }
    const resolve = async () => {
      try {
        setReceiptLoading(true);
        const url = await resolveReceiptUrl(selectedPayment);
        setReceiptUrl(url);
      } catch (err) {
        console.error('Failed to resolve receipt URL', err);
        setReceiptUrl(null);
      } finally {
        setReceiptLoading(false);
      }
    };
    resolve();
  }, [selectedPayment]);

  const approvePayment = async (payment: PaymentReview) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'VERIFIED' }).eq('id', payment.id);
      if (error) { toast.error('Failed to approve payment'); return; }
      toast.success('Payment approved');
      setIsReviewModalOpen(false);
      setSelectedPayment(null);
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
      const { error } = await supabase.from('payments').update({ status: 'REJECTED', admin_notes: rejectionReason }).eq('id', payment.id);
      if (error) { toast.error('Failed to reject payment'); return; }
      toast.success('Payment rejected');
      setIsReviewModalOpen(false);
      setSelectedPayment(null);
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Payments & Fees"
        subtitle="Verify student payments and manage fee structures"
        actions={
          <Dialog open={isAddFeeModalOpen} onOpenChange={setIsAddFeeModalOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add New Fee</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
              <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                <DialogTitle>Add New Fee</DialogTitle>
                <DialogDescription>Create a new fee structure for a cohort</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onAddFeeSubmit)} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Cohort</Label>
                  <Select value={selectedCohort} onValueChange={(value) => setValue('cohort_id', value)}>
                    <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                    <SelectContent>
                      {cohorts.map((cohort) => (<SelectItem key={cohort.id} value={cohort.id}>{cohort.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fee Name</Label>
                  <Input placeholder="e.g., Tuition, Graduation Fee" {...register('fee_name', { required: 'Fee name is required' })} />
                  {errors.fee_name && <p className="text-sm text-destructive">{errors.fee_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Amount (₦)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Amount is required' })} />
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
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment Approvals</CardTitle>
          <CardDescription>Review submitted payments and verify receipts · {pendingPayments.length} pending</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingPayments.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No pending payments to verify</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingPayments.map((payment) => {
                const initials = (payment.student_name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={payment.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-base font-semibold text-[#F9CB28]">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground">{payment.student_name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{payment.student_email}</div>
                    </div>
                    <div className="text-center sm:px-2">
                      <div className="font-serif text-2xl font-bold text-foreground">₦{Number(payment.amount_paid).toLocaleString()}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Submitted {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => { setSelectedPayment(payment); setIsReviewModalOpen(true); }}
                    >
                      <Eye className="h-4 w-4" /> View Receipt
                    </Button>
                    <div className="flex gap-2 sm:w-[150px] sm:flex-col">
                      <Button
                        size="sm"
                        className="flex-1 bg-success text-white hover:bg-success/90"
                        onClick={() => { setSelectedPayment(payment); setPendingConfirm("approve"); }}
                      >
                        <CheckCircle className="mr-1.5 h-4 w-4" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => { setSelectedPayment(payment); setIsReviewModalOpen(true); }}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review payment dialog (receipt + rejection reason) */}
      <Dialog open={isReviewModalOpen} onOpenChange={(open) => { setIsReviewModalOpen(open); if (!open) { setSelectedPayment(null); setRejectionReason(''); } }}>
        {selectedPayment && (
          <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
            <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
              <DialogTitle>Review Payment</DialogTitle>
              <DialogDescription>Student: {selectedPayment.student_name} ({selectedPayment.student_email})</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <p className="font-medium">₦{Number(selectedPayment.amount_paid).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Submitted</Label>
                  <p className="font-medium">{selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleDateString() : ''}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Badge variant="warning">{selectedPayment.status}</Badge>
                </div>
              </div>

              {selectedPayment.admin_notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <p className="text-sm">{selectedPayment.admin_notes}</p>
                </div>
              )}

              {(receiptUrl || selectedPayment?.payment_proof_url) && (
                <div>
                  <Label className="text-xs text-muted-foreground">Receipt Image</Label>
                  {receiptLoading ? (
                    <p className="text-sm text-muted-foreground mt-2">Loading receipt...</p>
                  ) : receiptUrl ? (
                    <img src={receiptUrl} alt="Receipt" className="max-h-[400px] rounded-lg border mt-2" />
                  ) : selectedPayment?.payment_proof_url ? (
                    <img src={selectedPayment.payment_proof_url} alt="Receipt" className="max-h-[400px] rounded-lg border mt-2" />
                  ) : (
                    <p className="text-sm text-destructive mt-2">Unable to load receipt image</p>
                  )}
                </div>
              )}

              <div>
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea placeholder="Provide reason for rejection..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="min-h-[80px]" />
              </div>

              <div className="sticky bottom-0 bg-background pt-4 border-t">
                <div className="flex gap-4">
                  <Button onClick={() => setPendingConfirm("approve")} disabled={isProcessing} className="flex-1 bg-success text-white hover:bg-success/90">
                    <CheckCircle className="mr-2 h-4 w-4" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setPendingConfirm("reject")} disabled={isProcessing} className="flex-1">
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

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
