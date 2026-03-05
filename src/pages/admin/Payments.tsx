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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

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

  const approvePayment = async (payment: PaymentReview) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'verified' }).eq('id', payment.id);
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
      const { error } = await supabase.from('payments').update({ status: 'rejected', admin_notes: rejectionReason }).eq('id', payment.id);
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
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Payments & Fees</h1>
          <p className="text-muted-foreground">Verify student payments and manage fee structures</p>
        </div>
        <Dialog open={isAddFeeModalOpen} onOpenChange={setIsAddFeeModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add New Fee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Fee</DialogTitle>
              <DialogDescription>Create a new fee structure for a cohort</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onAddFeeSubmit)} className="space-y-4">
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
              <Button type="submit" disabled={isProcessing} className="w-full">
                {isProcessing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>) : 'Add Fee'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Verification Queue</CardTitle>
          <CardDescription>{pendingPayments.length} pending payment{pendingPayments.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingPayments.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No pending payments to verify</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payment.student_name}</p>
                          <p className="text-xs text-muted-foreground">{payment.student_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">₦{Number(payment.amount_paid).toLocaleString()}</TableCell>
                      <TableCell>{payment.created_at ? new Date(payment.created_at).toLocaleDateString() : ''}</TableCell>
                      <TableCell>
                        <Dialog open={isReviewModalOpen && selectedPayment?.id === payment.id} onOpenChange={setIsReviewModalOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setSelectedPayment(payment)} className="flex items-center gap-2">
                              <Eye className="h-4 w-4" /> Review
                            </Button>
                          </DialogTrigger>
                          {selectedPayment && (
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Review Payment</DialogTitle>
                                <DialogDescription>Student: {selectedPayment.student_name} ({selectedPayment.student_email})</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Amount</Label>
                                    <p className="font-medium">${Number(selectedPayment.amount_paid).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Submitted</Label>
                                    <p className="font-medium">{selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleDateString() : ''}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Status</Label>
                                    <Badge>{selectedPayment.status}</Badge>
                                  </div>
                                </div>

                                {selectedPayment.admin_notes && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Notes</Label>
                                    <p className="text-sm">{selectedPayment.admin_notes}</p>
                                  </div>
                                )}

                                {selectedPayment.payment_proof_url && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Receipt Image</Label>
                                    <img src={selectedPayment.payment_proof_url} alt="Receipt" className="max-h-[400px] rounded-lg border mt-2" />
                                  </div>
                                )}

                                <div>
                                  <Label>Rejection Reason (if rejecting)</Label>
                                  <Textarea placeholder="Provide reason for rejection..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="min-h-[80px]" />
                                </div>

                                <div className="flex gap-4">
                                  <Button onClick={() => approvePayment(selectedPayment)} disabled={isProcessing} className="flex-1">
                                    <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                  </Button>
                                  <Button variant="destructive" onClick={() => rejectPayment(selectedPayment)} disabled={isProcessing} className="flex-1">
                                    <XCircle className="mr-2 h-4 w-4" /> Reject
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          )}
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPayments;
