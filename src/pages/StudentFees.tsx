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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Fee = Tables<'fees'>;
type Payment = Tables<'payments'>;

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

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<SubmitPaymentFormData>({
    defaultValues: { fee_type: '', amount: '', notes: '' },
  });

  const selectedFeeType = watch('fee_type');

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !student?.id) { setLoading(false); return; }
      try {
        setLoading(true);
        const { data: feesData } = await supabase.from('fees').select('*').eq('student_id', student.id);
        if (feesData) setFees(feesData);

        const { data: paymentsData } = await supabase.from('payments').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
        if (paymentsData) setPayments(paymentsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load fees information');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, student?.id]);

  const calculateSummary = () => {
    const totalOwed = fees.reduce((sum, fee) => sum + (fee.amount_due || 0), 0);
    const totalPaid = fees.reduce((sum, fee) => sum + (fee.amount_paid || 0), 0);
    return { totalOwed, totalPaid, remainingBalance: totalOwed - totalPaid };
  };

  const onSubmit = async (data: SubmitPaymentFormData) => {
    if (!user || !student?.id || !receiptFile) {
      toast.error('Please complete all fields and select a receipt file');
      return;
    }
    try {
      setIsSubmitting(true);
      const fileName = `${student.id}/${Date.now()}-${receiptFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('course-materials').upload(fileName, receiptFile);
      if (uploadError) { toast.error('Failed to upload receipt'); return; }

      const { data: urlData } = supabase.storage.from('course-materials').getPublicUrl(uploadData.path);

      const { error: paymentError } = await supabase.from('payments').insert({
        student_id: student.id,
        amount_paid: parseFloat(data.amount),
        payment_proof_url: urlData.publicUrl,
        admin_notes: data.notes || null,
        status: 'PENDING',
      });
      if (paymentError) { toast.error('Failed to submit payment'); return; }

      toast.success('Payment submitted successfully. Awaiting admin verification.');
      setIsUploadModalOpen(false);
      setReceiptFile(null);
      reset();

      const { data: updatedPayments } = await supabase.from('payments').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
      if (updatedPayments) setPayments(updatedPayments);
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while submitting payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = calculateSummary();

  const getStatusBadge = (status: string | null) => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'PENDING') return <Badge variant="outline">Pending</Badge>;
    if (s === 'VERIFIED' || s === 'APPROVED') return <Badge variant="default">Verified</Badge>;
    if (s === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="outline">{status}</Badge>;
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Fees & Payments</h1>
          <p className="text-muted-foreground">Manage your course fees and payment history</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Total Owed</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">₦{summary.totalOwed.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">₦{summary.totalPaid.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Remaining Balance</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.remainingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ₦{summary.remainingBalance.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Assigned Fees</CardTitle>
            <CardDescription>All fees for your cohort</CardDescription>
          </CardHeader>
          <CardContent>
            {fees.length === 0 ? (
              <p className="text-muted-foreground">No fees assigned yet</p>
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
                          <TableCell className="text-right">₦{(fee.amount_due || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">₦{(fee.amount_paid || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">₦{balance.toLocaleString()}</TableCell>
                          <TableCell>
                            {fee.waived ? (
                              <Badge variant="secondary">Waived</Badge>
                            ) : (
                              <Badge variant={balance === 0 ? 'default' : 'outline'}>
                                {fee.payment_status || (balance === 0 ? 'Paid' : 'Outstanding')}
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

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Your submitted payments and their verification status</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground">No payments submitted yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">₦{(payment.amount_paid || 0).toLocaleString()}</TableCell>
                        <TableCell>{payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Submit Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Payment</DialogTitle>
              <DialogDescription>Upload your bank transfer receipt to submit a payment.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Fee Type</Label>
                <Select value={selectedFeeType} onValueChange={(value) => reset({ ...watch(), fee_type: value })}>
                  <SelectTrigger><SelectValue placeholder="Select fee type" /></SelectTrigger>
                  <SelectContent>
                    {[...new Set(fees.map((f) => f.fee_type))].map((feeType) => (
                      <SelectItem key={feeType} value={feeType}>{feeType}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <Input type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Amount is required' })} />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea placeholder="Any additional information..." {...register('notes')} className="min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label>Bank Transfer Receipt</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50">
                  <input id="receipt" type="file" accept="image/*" {...register('receipt', { required: 'Receipt is required' })} onChange={(e) => { const file = e.target.files?.[0]; if (file) setReceiptFile(file); }} className="hidden" />
                  <label htmlFor="receipt" className="cursor-pointer block">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Click to upload receipt image</p>
                    <p className="text-xs text-muted-foreground mt-1">{receiptFile?.name || 'PNG, JPG, GIF up to 10MB'}</p>
                  </label>
                </div>
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>) : (<><CreditCard className="mr-2 h-4 w-4" />Submit Payment</>)}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </StudentLayout>
  );
};

export default StudentFees;
