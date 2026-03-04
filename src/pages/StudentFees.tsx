import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import StudentLayout from '@/components/StudentLayout';
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
import { Loader2, Upload, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface Fee {
  id: string;
  student_id: string;
  fee_type: string;
  amount_due: number | null;
  amount_paid: number | null;
  payment_status: string | null;
  waived: boolean | null;
  waive_reason: string | null;
}

interface Payment {
  id: string;
  fee_type: string;
  amount: number;
  status: string;
  receipt_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejected_reason: string | null;
}

interface SubmitPaymentFormData {
  fee_type: string;
  amount: string;
  notes: string;
  receipt: FileList;
}

const StudentFees = () => {
  const { user, student } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<SubmitPaymentFormData>({
    defaultValues: {
      fee_type: '',
      amount: '',
      notes: '',
    },
  });

  const selectedFeeType = watch('fee_type');

  // Fetch fees and payment history
  useEffect(() => {
    const fetchData = async () => {
      if (!user || !student?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch fees for the student
        const { data: feesData, error: feesError } = await supabase
          .from('fees')
          .select('*')
          .eq('student_id', student.id);

        if (feesError) {
          console.error('Error fetching fees:', feesError);
        } else if (feesData) {
          setFees(feesData as Fee[]);
        }

        // Fetch payment history
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('*')
          .eq('student_id', student.id)
          .order('created_at', { ascending: false });

        if (paymentsError) {
          console.error('Error fetching payments:', paymentsError);
        } else if (paymentsData) {
          setPayments(paymentsData as Payment[]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load fees information');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, student?.id]);

  // Calculate balance summary
  const calculateSummary = () => {
    const totalOwed = fees.reduce((sum, fee) => sum + (fee.amount_due || 0), 0);
    const totalPaid = fees.reduce((sum, fee) => sum + (fee.amount_paid || 0), 0);
    const remainingBalance = totalOwed - totalPaid;

    return { totalOwed, totalPaid, remainingBalance };
  };

  // Handle payment submission
  const onSubmit = async (data: SubmitPaymentFormData) => {
    if (!user || !student?.id || !receiptFile) {
      toast.error('Please complete all fields and select a receipt file');
      return;
    }

    try {
      setIsSubmitting(true);

      // Upload receipt to storage
      const fileName = `${student.id}/${Date.now()}-${receiptFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(fileName, receiptFile);

      if (uploadError) {
        console.error('Error uploading receipt:', uploadError);
        toast.error('Failed to upload receipt');
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('course-materials')
        .getPublicUrl(uploadData.path);

      // Create payment record
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          student_id: student.id,
          fee_type: data.fee_type,
          amount: parseFloat(data.amount),
          receipt_url: urlData.publicUrl,
          notes: data.notes || null,
          status: 'pending',
        });

      if (paymentError) {
        console.error('Error creating payment:', paymentError);
        toast.error('Failed to submit payment');
        return;
      }

      toast.success('Payment submitted successfully. Awaiting admin verification.');
      setIsUploadModalOpen(false);
      setReceiptFile(null);
      reset();

      // Refresh payments list
      const { data: updatedPayments } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });

      if (updatedPayments) {
        setPayments(updatedPayments as Payment[]);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while submitting payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = calculateSummary();

  const getStatusBadge = (status: string) => {
    const statusMap = {
      pending: { label: 'Pending', variant: 'outline' as const },
      verified: { label: 'Verified', variant: 'default' as const },
      rejected: { label: 'Rejected', variant: 'destructive' as const },
    };
    const config = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Fees & Payments</h1>
          <p className="text-gray-600">Manage your course fees and payment history</p>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Owed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${summary.totalOwed.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${summary.totalPaid.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Remaining Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.remainingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ${summary.remainingBalance.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fees List */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Assigned Fees</CardTitle>
            <CardDescription>All fees for your cohort</CardDescription>
          </CardHeader>
          <CardContent>
            {fees.length === 0 ? (
              <p className="text-gray-500">No fees assigned yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Type</TableHead>
                      <TableHead className="text-right">Amount Due</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fees.map((fee) => {
                      const balance = (fee.amount_due || 0) - (fee.amount_paid || 0);
                      return (
                        <TableRow key={fee.id}>
                          <TableCell className="font-medium">{fee.fee_type}</TableCell>
                          <TableCell className="text-right">${(fee.amount_due || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600">${(fee.amount_paid || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${balance.toFixed(2)}</TableCell>
                          <TableCell>
                            {fee.waived ? (
                              <Badge variant="secondary">Waived</Badge>
                            ) : (
                              <Badge variant={balance === 0 ? 'default' : 'outline'}>
                                {balance === 0 ? 'Paid' : 'Outstanding'}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Your submitted payments and their verification status</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-gray-500">No payments submitted yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.fee_type}</TableCell>
                        <TableCell className="text-right">${payment.amount.toFixed(2)}</TableCell>
                        <TableCell>{new Date(payment.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(payment.status)}
                            {payment.status === 'rejected' && payment.rejected_reason && (
                              <p className="text-xs text-red-600 mt-1">{payment.rejected_reason}</p>
                            )}
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

        {/* Submit Payment Button */}
        <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Submit Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Payment</DialogTitle>
              <DialogDescription>
                Upload your bank transfer receipt to submit a payment. We will verify and update your balance once approved.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Fee Type */}
              <div className="space-y-2">
                <Label htmlFor="fee-type">Fee Type</Label>
                <Select value={selectedFeeType} onValueChange={(value) => reset({ ...watch(), fee_type: value })}>
                  <SelectTrigger id="fee-type">
                    <SelectValue placeholder="Select fee type" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(fees.map((f) => f.fee_type))].map((feeType) => (
                      <SelectItem key={feeType} value={feeType}>
                        {feeType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.fee_type && <p className="text-sm text-red-500">{errors.fee_type.message}</p>}
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

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information about this payment..."
                  {...register('notes')}
                  className="min-h-[80px]"
                />
              </div>

              {/* Receipt Upload */}
              <div className="space-y-2">
                <Label htmlFor="receipt">Bank Transfer Receipt</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50">
                  <input
                    id="receipt"
                    type="file"
                    accept="image/*"
                    {...register('receipt', { required: 'Receipt is required' })}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setReceiptFile(file);
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="receipt" className="cursor-pointer block">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm font-medium">Click to upload receipt image</p>
                    <p className="text-xs text-gray-500 mt-1">{receiptFile?.name || 'PNG, JPG, GIF up to 10MB'}</p>
                  </label>
                </div>
                {errors.receipt && <p className="text-sm text-red-500">{errors.receipt.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Submit Payment
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </StudentLayout>
  );
};

export default StudentFees;
