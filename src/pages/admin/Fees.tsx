import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Eye, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface AddFeeFormData {
  cohort_id: string;
  fee_name: string;
  amount: string;
}

type PaymentWithStudent = Tables<'payments'> & {
  student_name?: string;
  student_email?: string;
};

const AdminFees = () => {
  const [tab, setTab] = useState<'manager' | 'approvals'>('manager');
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [feeStructures, setFeeStructures] = useState<Tables<'fee_structures'>[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch } = useForm<AddFeeFormData>({
    defaultValues: { cohort_id: '', fee_name: '', amount: '' },
  });

  const selectedCohort = watch('cohort_id');

  const fetchPaymentsWithStudents = async () => {
    try {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (payments) {
        // Enrich with student names
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
    } catch (e) {
      console.error(e);
      toast.error('Failed to load payments');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
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
    };
    fetchData();
  }, []);

  const onAddFee = async (data: AddFeeFormData) => {
    if (!data.cohort_id) { toast.error('Choose a cohort'); return; }
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fee_structures').insert({
        cohort_id: data.cohort_id,
        fee_name: data.fee_name,
        amount: parseFloat(data.amount),
      });
      if (error) { console.error(error); toast.error('Failed to add fee'); return; }
      toast.success('Fee added');
      reset();
      const { data: fees } = await supabase.from('fee_structures').select('*').order('created_at', { ascending: false });
      if (fees) setFeeStructures(fees);
    } catch (e) {
      console.error(e);
      toast.error('Error adding fee');
    } finally {
      setIsProcessing(false);
    }
  };

  const approvePayment = async (id: string) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'verified' }).eq('id', id);
      if (error) { toast.error('Failed to approve'); return; }
      toast.success('Payment approved');
      await fetchPaymentsWithStudents();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectPayment = async (id: string) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'rejected' }).eq('id', id);
      if (error) { toast.error('Failed to reject'); return; }
      toast.success('Payment rejected');
      await fetchPaymentsWithStudents();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fee Management</h1>
          <p className="text-sm text-muted-foreground">Create fees and approve student payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'manager' ? 'default' : 'ghost'} onClick={() => setTab('manager')}>Fee Manager</Button>
          <Button variant={tab === 'approvals' ? 'default' : 'ghost'} onClick={() => setTab('approvals')}>Payment Approvals</Button>
        </div>
      </div>

      {tab === 'manager' ? (
        <Card>
          <CardHeader>
            <CardTitle>Create New Fee</CardTitle>
            <CardDescription>Define a fee for a cohort</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onAddFee)} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Cohort</Label>
                <Select value={selectedCohort} onValueChange={(val) => setValue('cohort_id', val)}>
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fee Name</Label>
                <Input {...register('fee_name', { required: true })} placeholder="e.g. Tuition" />
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input type="number" step="0.01" {...register('amount', { required: true })} />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={isProcessing}>{isProcessing ? 'Adding...' : 'Add Fee'}</Button>
              </div>
            </form>

            <div className="mt-6">
              <h3 className="font-medium">Existing Fees</h3>
              {feeStructures.length === 0 ? (
                <p className="text-muted-foreground">No fee structures yet.</p>
              ) : (
                <div className="overflow-x-auto mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Cohort</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeStructures.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.fee_name}</TableCell>
                          <TableCell>{cohorts.find(c => c.id === f.cohort_id)?.name || f.cohort_id || '—'}</TableCell>
                          <TableCell className="text-right">₦{Number(f.amount).toLocaleString()}</TableCell>
                          <TableCell>{f.created_at ? new Date(f.created_at).toLocaleDateString() : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Payment Approvals</CardTitle>
              <CardDescription>Review and verify pending student payments</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length === 0 ? (
                <p className="text-muted-foreground">No pending payments</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.student_name}</TableCell>
                          <TableCell className="text-right">₦{Number(p.amount_paid).toLocaleString()}</TableCell>
                          <TableCell>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</TableCell>
                          <TableCell>
                            {p.payment_proof_url ? (
                              <button onClick={() => setSelectedReceipt(p.payment_proof_url)} className="text-primary hover:underline flex items-center gap-1">
                                <Eye className="h-4 w-4" /> View
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-sm">No receipt</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => approvePayment(p.id)} disabled={isProcessing}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="destructive" onClick={() => rejectPayment(p.id)} disabled={isProcessing}><X className="h-4 w-4" /></Button>
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

          <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
              {selectedReceipt && (
                <div className="flex flex-col gap-4">
                  <img src={selectedReceipt} alt="Receipt" className="w-full max-h-96 object-contain rounded" />
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default AdminFees;
