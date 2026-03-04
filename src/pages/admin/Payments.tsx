import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface PaymentReview extends Tables<'payments'> {
  student_name?: string;
  student_email?: string;
}

interface AddFeeFormData {
  cohort_id: string;
  name: string;
  amount: string;
  description: string;
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<AddFeeFormData>({
    defaultValues: {
      cohort_id: '',
      name: '',
      amount: '',
      description: '',
    },
  });

  const selectedCohort = watch('cohort_id');

  // Fetch pending payments and cohorts
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch cohorts
        const { data: cohortsData, error: cohortsError } = await supabase
          .from('cohorts')
          .select('*')
          .order('name');

        if (cohortsError) {
          console.error('Error fetching cohorts:', cohortsError);
        } else if (cohortsData) {
          setCohorts(cohortsData);
        }

        // Fetch pending payments
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select(
            `
            *,
            student_id (
              profile_id (
                first_name,
                last_name,
                email
              )
            )
          `
          )
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (paymentsError) {
          console.error('Error fetching payments:', paymentsError);
        } else if (paymentsData) {
          const formatted = paymentsData.map((payment: any) => ({
            ...payment,
            student_name: payment.student_id?.profile_id
              ? `${payment.student_id.profile_id.first_name} ${payment.student_id.profile_id.last_name}`
              : 'Unknown Student',
            student_email: payment.student_id?.profile_id?.email || 'N/A',
          }));
          setSelectedPayment(null);
          setPendingPayments(formatted);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load payments');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle approve payment
  const approvePayment = async (payment: PaymentReview) => {
    if (!payment) return;

    try {
      setIsProcessing(true);

      const { error } = await supabase
        .from('payments')
        .update({
          status: 'verified',
          verified_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (error) {
        console.error('Error approving payment:', error);
        toast.error('Failed to approve payment');
        return;
      }

      toast.success('Payment approved successfully');
      setIsReviewModalOpen(false);
      setSelectedPayment(null);

      // Refresh payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (paymentsData) {
        setPendingPayments(paymentsData as PaymentReview[]);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while approving payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle reject payment
  const rejectPayment = async (payment: PaymentReview) => {
    if (!payment || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase
        .from('payments')
        .update({
          status: 'rejected',
          verified_at: new Date().toISOString(),
          rejected_reason: rejectionReason,
        })
        .eq('id', payment.id);

      if (error) {
        console.error('Error rejecting payment:', error);
        toast.error('Failed to reject payment');
        return;
      }

      toast.success('Payment rejected');
      setIsReviewModalOpen(false);
      setSelectedPayment(null);
      setRejectionReason('');

      // Refresh payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (paymentsData) {
        setPendingPayments(paymentsData as PaymentReview[]);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while rejecting payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle add fee
  const onAddFeeSubmit = async (data: AddFeeFormData) => {
    if (!data.cohort_id) {
      toast.error('Please select a cohort');
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase.from('fee_structures').insert({
        cohort_id: data.cohort_id,
        name: data.name,
        amount: parseFloat(data.amount),
        description: data.description || null,
      });

      if (error) {
        console.error('Error adding fee:', error);
        if (error.code === '23505') {
          toast.error('A fee with this name already exists in the selected cohort');
        } else {
          toast.error('Failed to add fee');
        }
        return;
      }

      toast.success('Fee added successfully');
      setIsAddFeeModalOpen(false);
      reset();
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while adding fee');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Payments & Fees</h1>
            <p className="text-gray-600">Verify student payments and manage fee structures</p>
          </div>
          <Dialog open={isAddFeeModalOpen} onOpenChange={setIsAddFeeModalOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New Fee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Fee</DialogTitle>
                <DialogDescription>Create a new fee structure for a cohort</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit(onAddFeeSubmit)} className="space-y-4">
                {/* Cohort */}
                <div className="space-y-2">
                  <Label htmlFor="cohort">Cohort</Label>
                  <Select value={selectedCohort} onValueChange={(value) => reset({ ...watch(), cohort_id: value })}>
                    <SelectTrigger id="cohort">
                      <SelectValue placeholder="Select cohort" />
                    </SelectTrigger>
                    <SelectContent>
                      {cohorts.map((cohort) => (
                        <SelectItem key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.cohort_id && <p className="text-sm text-red-500">{errors.cohort_id.message}</p>}
                </div>

                {/* Fee Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Fee Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Tuition, Graduation Fee"
                    {...register('name', { required: 'Fee name is required' })}
                  />
                  {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register('amount', {
                      required: 'Amount is required',
                      pattern: {
                        value: /^\d+(\.\d{1,2})?$/,
                        message: 'Please enter a valid amount',
                      },
                    })}
                  />
                  {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Add any additional details about this fee..."
                    {...register('description')}
                    className="min-h-[80px]"
                  />
                </div>

                <Button type="submit" disabled={isProcessing} className="w-full">
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Fee'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Verification Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Verification Queue</CardTitle>
            <CardDescription>
              {pendingPayments.length} pending payment{pendingPayments.length !== 1 ? 's' : ''} awaiting verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingPayments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No pending payments to verify</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Fee Type</TableHead>
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
                            <p className="text-xs text-gray-500">{payment.student_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{payment.fee_type}</TableCell>
                        <TableCell className="text-right">${(payment.amount as number).toFixed(2)}</TableCell>
                        <TableCell>{new Date(payment.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Dialog open={isReviewModalOpen && selectedPayment?.id === payment.id} onOpenChange={setIsReviewModalOpen}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedPayment(payment)}
                                className="flex items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                Review
                              </Button>
                            </DialogTrigger>
                            {selectedPayment && (
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Review Payment</DialogTitle>
                                  <DialogDescription>
                                    Student: {selectedPayment.student_name} ({selectedPayment.student_email})
                                  </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                  {/* Payment Details */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs text-gray-500">Fee Type</Label>
                                      <p className="font-medium">{selectedPayment.fee_type}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Amount</Label>
                                      <p className="font-medium">${(selectedPayment.amount as number).toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Submitted</Label>
                                      <p className="font-medium">{new Date(selectedPayment.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Status</Label>
                                      <Badge>{selectedPayment.status}</Badge>
                                    </div>
                                  </div>

                                  {selectedPayment.notes && (
                                    <div>
                                      <Label className="text-xs text-gray-500">Notes</Label>
                                      <p className="text-sm">{selectedPayment.notes}</p>
                                    </div>
                                  )}

                                  {/* Receipt Image */}
                                  {selectedPayment.receipt_url && (
                                    <div>
                                      <Label className="text-xs text-gray-500">Receipt Image</Label>
                                      <img
                                        src={selectedPayment.receipt_url}
                                        alt="Receipt"
                                        className="max-h-[400px] rounded-lg border mt-2"
                                      />
                                    </div>
                                  )}

                                  {/* Rejection Reason Input (if rejecting) */}
                                  {rejectionReason && (
                                    <div>
                                      <Label htmlFor="rejection-reason">Rejection Reason</Label>
                                      <Textarea
                                        id="rejection-reason"
                                        placeholder="Provide reason for rejection..."
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="min-h-[80px]"
                                      />
                                    </div>
                                  )}

                                  {/* Action Buttons */}
                                  <div className="flex gap-2">
                                    {!rejectionReason ? (
                                      <>
                                        <Button
                                          onClick={() => approvePayment(selectedPayment)}
                                          disabled={isProcessing}
                                          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                                        >
                                          {isProcessing ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <CheckCircle className="h-4 w-4" />
                                          )}
                                          Approve
                                        </Button>
                                        <Button
                                          onClick={() => setRejectionReason('Enter reason...')}
                                          disabled={isProcessing}
                                          variant="outline"
                                          className="flex-1 flex items-center justify-center gap-2"
                                        >
                                          <XCircle className="h-4 w-4" />
                                          Reject
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          onClick={() => rejectPayment(selectedPayment)}
                                          disabled={isProcessing || !rejectionReason.trim()}
                                          variant="destructive"
                                          className="flex-1 flex items-center justify-center gap-2"
                                        >
                                          {isProcessing ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <XCircle className="h-4 w-4" />
                                          )}
                                          Confirm Reject
                                        </Button>
                                        <Button
                                          onClick={() => setRejectionReason('')}
                                          disabled={isProcessing}
                                          variant="outline"
                                          className="flex-1"
                                        >
                                          Cancel
                                        </Button>
                                      </>
                                    )}
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
    </AdminLayout>
  );
};

export default AdminPayments;
