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
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, CreditCard, Wallet, TrendingDown, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Fee = Tables<'fees'>;
type Payment = Tables<'payments'>;

interface SubmitPaymentFormData {
  fee_id: string;
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

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<SubmitPaymentFormData>({
    defaultValues: { fee_id: '', amount: '', notes: '' },
  });
  const selectedFeeId = watch('fee_id');

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !student?.id) { setLoading(false); return; }
      try {
        setLoading(true);
        const [{ data: feesData }, { data: paymentsData }] = await Promise.all([
          supabase.from('fees').select('*').eq('student_id', student.id),
          supabase.from('payments').select('*').eq('student_id', student.id).order('created_at', { ascending: false }),
        ]);
        if (feesData) setFees(feesData);
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

  const totalOwed = fees.reduce((sum, fee) => sum + (fee.amount_due || 0), 0);
  const totalPaid = fees.reduce((sum, fee) => sum + (fee.amount_paid || 0), 0);
  const remainingBalance = totalOwed - totalPaid;
  const paidPercent = totalOwed > 0 ? Math.round((totalPaid / totalOwed) * 100) : 0;

  const paidFees = fees.filter(f => f.payment_status === 'Paid' || f.waived);
  const unpaidFees = fees.filter(f => f.payment_status !== 'Paid' && !f.waived);

  const isFullyPaid = remainingBalance <= 0 && fees.length > 0;
  const hasBalance = remainingBalance > 0;

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
        student_id: student.id, amount_paid: parseFloat(data.amount),
        fee_id: data.fee_id || null,
        payment_proof_url: urlData.publicUrl, admin_notes: data.notes || null, status: 'PENDING',
      });
      if (paymentError) { toast.error('Failed to submit payment'); return; }
      toast.success('Payment submitted. Awaiting admin verification.');
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

  const getPaymentStatusBadge = (status: string | null) => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'PENDING') return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    if (s === 'VERIFIED' || s === 'APPROVED') return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300"><CheckCircle className="w-3 h-3 mr-1" /> Verified</Badge>;
    if (s === 'REJECTED') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const getFeeStatusBadge = (fee: Fee) => {
    if (fee.waived) return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">Waived</Badge>;
    const s = (fee.payment_status || '').toLowerCase();
    if (s === 'paid') return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300"><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
    if (s === 'partial') return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300"><Clock className="w-3 h-3 mr-1" /> Partial</Badge>;
    return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300"><AlertCircle className="w-3 h-3 mr-1" /> Unpaid</Badge>;
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
      <div className="space-y-6 pb-20 md:pb-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Fees & Payments</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your fees and track payment progress</p>
          </div>
          <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-flame border-0 text-accent-foreground hover:opacity-90">
                <Upload className="h-4 w-4 mr-2" /> Submit Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Payment</DialogTitle>
                <DialogDescription>Upload your bank transfer receipt.</DialogDescription>
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
                  <Label>Amount (₦)</Label>
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

        {/* Payment Progress Overview */}
        <Card className={`border-l-4 ${isFullyPaid ? 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : hasBalance ? 'border-l-red-500 bg-red-50 dark:bg-red-950/20' : 'border-l-primary bg-primary/5'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Payment Progress</span>
              </div>
              <span className={`text-sm font-bold ${isFullyPaid ? 'text-emerald-700 dark:text-emerald-400' : hasBalance ? 'text-red-700 dark:text-red-400' : 'text-primary'}`}>
                {paidPercent}% Paid
              </span>
            </div>
            <Progress value={paidPercent} className="h-2.5 mb-3" />
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {paidFees.length} Paid</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> {unpaidFees.length} Outstanding</span>
              <span className="text-muted-foreground ml-auto">{fees.length} Total fees</span>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Owed</p>
                <p className="text-xl font-bold text-foreground">₦{totalOwed.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Paid</p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">₦{totalPaid.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${remainingBalance > 0 ? 'border-l-red-500 bg-red-50 dark:bg-red-950/20' : 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${remainingBalance > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                <TrendingDown className={`w-5 h-5 ${remainingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Balance</p>
                <p className={`text-xl font-bold ${remainingBalance > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  ₦{remainingBalance.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assigned Fees */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned Fees</CardTitle>
            <CardDescription>All fees for your cohort</CardDescription>
          </CardHeader>
          <CardContent>
            {fees.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No fees assigned yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Type</TableHead>
                      <TableHead className="text-right">Due</TableHead>
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
                          <TableCell className="text-right text-emerald-700 dark:text-emerald-400">₦{(fee.amount_paid || 0).toLocaleString()}</TableCell>
                          <TableCell className={`text-right font-medium ${balance > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                            ₦{balance.toLocaleString()}
                          </TableCell>
                          <TableCell>{getFeeStatusBadge(fee)}</TableCell>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
            <CardDescription>Your submitted payments and verification status</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No payments submitted yet</p>
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
                        <TableCell className="text-muted-foreground">{payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
};

export default StudentFees;
