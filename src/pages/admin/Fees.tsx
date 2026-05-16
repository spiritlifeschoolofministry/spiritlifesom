import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Eye, Check, X, Download, Filter, Trash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { downloadCSV } from '@/lib/csv-export';
import type { Tables } from '@/integrations/supabase/types';

interface AddFeeFormData {
  cohort_id: string;
  fee_name: string;
  amount: string;
  learning_mode: string;
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
  const [cohortFilter, setCohortFilter] = useState('all');

  const { register, handleSubmit, reset, setValue, watch } = useForm<AddFeeFormData>({
    defaultValues: { cohort_id: '', fee_name: '', amount: '', learning_mode: 'All' },
  });

  const selectedCohort = watch('cohort_id');
  const selectedMode = watch('learning_mode');

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
        learning_mode: data.learning_mode,
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

  const deleteFee = async (id: string) => {
    if (!window.confirm('Delete this fee? This action cannot be undone.')) return;
    try {
      setIsProcessing(true);
      const { error } = await supabase.from('fee_structures').delete().eq('id', id);
      if (error) {
        console.error('Delete fee error:', error);
        toast.error('Failed to delete fee: ' + (error.message || JSON.stringify(error)));
        return;
      }
      toast.success('Fee deleted');
      // Optimistically update UI
      setFeeStructures((prev) => prev.filter((f: any) => f.id !== id));
    } catch (err) {
      console.error('Delete fee exception:', err);
      toast.error('Failed to delete fee');
    } finally {
      setIsProcessing(false);
    }
  };

  const approvePayment = async (payment: PaymentWithStudent) => {
    try {
      setIsProcessing(true);
      
      if (payment.fee_id && payment.student_id) {
        // Look up the fee_type from fee_structures
        const { data: feeStructure } = await supabase.from('fee_structures').select('fee_name').eq('id', payment.fee_id).single();
        const feeType = feeStructure?.fee_name || '';
        
        const { error } = await supabase.rpc('approve_student_payment', {
          p_payment_id: payment.id,
          p_amount: payment.amount_paid,
          p_student_id: payment.student_id,
          p_fee_type: feeType,
        });
        if (error) { console.error(error); toast.error('Failed to approve'); return; }
      } else {
        // Fallback: just update payment status
        const { error } = await supabase.from('payments').update({ status: 'VERIFIED' }).eq('id', payment.id);
        if (error) { toast.error('Failed to approve'); return; }
      }
      
      toast.success('Payment approved & fee record updated');
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

  const handleExportFees = async () => {
    try {
      toast.info("Preparing fee report...");
      const query = supabase.from("fees").select("student_id, fee_type, amount_due, amount_paid, payment_status, cohort_id, waived, created_at");
      const { data: fees, error } = await query;

      // Log exact query error for debugging
      if (error) {
        console.error('Fees query error:', error);
        toast.error('Export failed: ' + (error.message || JSON.stringify(error)));
        return;
      }

      if (!fees?.length) {
        toast.error("No fee data to export");
        return;
      }

      // Enrich with student names
      const studentIds = [...new Set(fees.map(f => f.student_id))];
      const { data: students, error: studentsError } = await supabase.from("students").select("id, student_code, profile:profiles(first_name, last_name, email)").in("id", studentIds);
      if (studentsError) {
        console.error('Students query error during export:', studentsError);
        toast.error('Export failed: ' + (studentsError.message || JSON.stringify(studentsError)));
        return;
      }
      const studentMap = new Map((students || []).map(s => [s.id, s]));

      const rows = fees.map(f => {
        const s = studentMap.get(f.student_id) as any;
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
      });
      downloadCSV(rows, "fee_report");
    } catch (err: unknown) {
      console.error('Export failed error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Export failed: ' + msg);
    }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fee Management</h1>
          <p className="text-sm text-muted-foreground">Create fees and approve student payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportFees} className="gap-2">
            <Download className="h-4 w-4" /> Export Fees
          </Button>
          <Button variant={tab === 'manager' ? 'default' : 'ghost'} onClick={() => setTab('manager')}>Fee Manager</Button>
          <Button variant={tab === 'approvals' ? 'default' : 'ghost'} onClick={() => setTab('approvals')}>Payment Approvals</Button>
        </div>
      </div>

      {tab === 'manager' ? (
        <Card>
          <CardHeader>
            <CardTitle>Create New Fee</CardTitle>
            <CardDescription>
              Define a fee for a cohort. Fees marked as 'All' apply to everyone. Specific modes only apply to students in that learning mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onAddFee)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <Label>Learning Mode</Label>
                <p className="text-[10px] text-muted-foreground mb-1">Target students</p>
                <Select value={selectedMode} onValueChange={(val) => setValue('learning_mode', val)}>
                  <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Students</SelectItem>
                    <SelectItem value="Online">Online Only</SelectItem>
                    <SelectItem value="Physical">Physical Only</SelectItem>
                    <SelectItem value="Hybrid">Hybrid Students</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  Hybrid students are only charged fees marked 'All' or 'Hybrid'.
                </p>
              </div>
              <div>
                <Label>Fee Name</Label>
                <Input {...register('fee_name', { required: true })} placeholder="e.g. Tuition" />
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input type="number" step="0.01" {...register('amount', { required: true })} />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={isProcessing} className="w-full md:w-auto">{isProcessing ? 'Adding...' : 'Add Fee'}</Button>
              </div>
            </form>

            <div className="mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-lg">Existing Fees</h3>
                <div className="flex items-center gap-2">
                  <Label className="hidden sm:inline-block">Filter by Cohort:</Label>
                  <Select value={cohortFilter} onValueChange={setCohortFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Cohorts" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cohorts</SelectItem>
                      {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(() => {
                const filtered = cohortFilter === 'all' ? feeStructures : feeStructures.filter(f => f.cohort_id === cohortFilter);
                return filtered.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center border rounded-lg border-dashed">No fee structures found for the selected criteria.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Cohort</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium">{f.fee_name}</TableCell>
                            <TableCell>{cohorts.find(c => c.id === f.cohort_id)?.name || '—'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px] uppercase">
                                {(f as any).learning_mode || 'All'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">₦{Number(f.amount).toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{f.created_at ? new Date(f.created_at).toLocaleDateString() : ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
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
                <div className="overflow-x-auto rounded-md border">
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
                              <Button size="sm" onClick={() => approvePayment(p)} disabled={isProcessing}><Check className="h-4 w-4" /></Button>
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
            <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
              <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                <DialogTitle>Payment Receipt</DialogTitle>
              </DialogHeader>
              {selectedReceipt && (
                <div className="flex flex-col gap-4 pt-4">
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
