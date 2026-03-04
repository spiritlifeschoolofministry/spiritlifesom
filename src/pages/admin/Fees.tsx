import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface AddFeeFormData {
  cohort_id: string;
  name: string;
  amount: string;
  description: string;
}

const AdminFees = () => {
  const [tab, setTab] = useState<'manager' | 'approvals'>('manager');
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [feeStructures, setFeeStructures] = useState<Tables<'fee_structures'>[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Tables<'payments'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const { register, handleSubmit, reset, watch } = useForm<AddFeeFormData>({ defaultValues: { cohort_id: '', name: '', amount: '', description: '' } });

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
        if (cohortsData) setCohorts(cohortsData);

        const { data: fees } = await supabase.from('fee_structures').select('*').order('created_at', { ascending: false });
        if (fees) setFeeStructures(fees);

        const { data: payments } = await supabase.from('payments').select('*').eq('status', 'pending').order('created_at', { ascending: false });
        if (payments) setPendingPayments(payments);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  const onAddFee = async (data: AddFeeFormData) => {
    if (!data.cohort_id) {
      toast.error('Choose a cohort');
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
        console.error(error);
        toast.error('Failed to add fee');
        return;
      }

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
      const { error } = await supabase.from('payments').update({ status: 'verified', verified_at: new Date().toISOString() }).eq('id', id);
      if (error) {
        console.error(error);
        toast.error('Failed to approve');
        return;
      }
      toast.success('Payment approved');
      const { data: payments } = await supabase.from('payments').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (payments) setPendingPayments(payments);
    } catch (e) {
      console.error(e);
      toast.error('Error approving payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectPayment = async (id: string, reason: string) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('payments').update({ status: 'rejected', verified_at: new Date().toISOString(), rejected_reason: reason }).eq('id', id);
      if (error) {
        console.error(error);
        toast.error('Failed to reject');
        return;
      }
      toast.success('Payment rejected');
      const { data: payments } = await supabase.from('payments').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (payments) setPendingPayments(payments);
    } catch (e) {
      console.error(e);
      toast.error('Error rejecting payment');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fee Management</h1>
            <p className="text-sm text-gray-600">Create fees and approve student payments</p>
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
                  <Select {...register('cohort_id') as any}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cohort" />
                    </SelectTrigger>
                    <SelectContent>
                      {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Name</Label>
                  <Input {...register('name', { required: true })} />
                </div>

                <div>
                  <Label>Amount (USD)</Label>
                  <Input type="number" step="0.01" {...register('amount', { required: true })} />
                </div>

                <div className="md:col-span-3">
                  <Label>Description</Label>
                  <Textarea {...register('description')} />
                </div>

                <div className="md:col-span-3">
                  <Button type="submit" disabled={isProcessing}>{isProcessing ? 'Adding...' : 'Add Fee'}</Button>
                </div>
              </form>

              <div className="mt-6">
                <h3 className="font-medium">Existing Fees</h3>
                {feeStructures.length === 0 ? (
                  <p className="text-gray-500">No fee structures yet.</p>
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
                            <TableCell className="font-medium">{f.name}</TableCell>
                            <TableCell>{f.cohort_id}</TableCell>
                            <TableCell className="text-right">${(f.amount as number).toFixed(2)}</TableCell>
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
          <Card>
            <CardHeader>
              <CardTitle>Payment Approvals</CardTitle>
              <CardDescription>Review and verify pending student payments</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length === 0 ? (
                <p className="text-gray-500">No pending payments</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Fee Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.student_id}</TableCell>
                          <TableCell>{p.fee_type}</TableCell>
                          <TableCell className="text-right">${(p.amount as number).toFixed(2)}</TableCell>
                          <TableCell>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button onClick={() => approvePayment(p.id)} disabled={isProcessing}>Approve</Button>
                              <Button variant="destructive" onClick={() => rejectPayment(p.id, 'Rejected by admin')} disabled={isProcessing}>Reject</Button>
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
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminFees;
