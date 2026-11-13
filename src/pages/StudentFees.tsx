import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, ExternalLink, FileCheck2 } from 'lucide-react';
import { Bar, ListCard, Panel, Pill, ScreenHeader, SectionTitle, type Tone } from '@/components/redesign/student-pages/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { r2Storage } from '@/lib/r2-storage';
import { resolveReceiptUrl } from '@/lib/receipt-url';
import { splitFeesBySession } from '@/lib/fee-sessions';

type Fee = Tables<'fees'>;
type Payment = Tables<'payments'>;

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

interface SubmitPaymentFormData {
  fee_id: string;
  payment_type: 'FULL' | 'PART' | '';
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
  const location = useLocation();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<SubmitPaymentFormData>({
    defaultValues: { fee_id: '', payment_type: '', amount: '', notes: '' },
  });
  const selectedFeeId = watch('fee_id');
  const selectedPaymentType = watch('payment_type');

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

  // Other screens link straight to the form ("Upload payment proof").
  useEffect(() => {
    if (loading || location.hash !== '#submit-payment') return;
    document.getElementById('submit-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash]);

  // See src/lib/fee-sessions.ts: a fee belongs to the session it was raised for,
  // and this page reads every row the student has.
  const { current: currentFees, past: pastFees } = splitFeesBySession(fees, student?.cohort_id);

  const totalOwed = currentFees.reduce((sum, fee) => sum + (fee.amount_due || 0), 0);
  const totalPaid = currentFees.reduce((sum, fee) => sum + (fee.amount_paid || 0), 0);
  const remainingBalance = totalOwed - totalPaid;
  const paidPercent = totalOwed > 0 ? Math.round((totalPaid / totalOwed) * 100) : 0;

  const paidFees = currentFees.filter(f => f.payment_status === 'Paid' || f.waived);
  const unpaidFees = currentFees.filter(f => f.payment_status !== 'Paid' && !f.waived);

  const isFullyPaid = remainingBalance <= 0 && currentFees.length > 0;
  const hasBalance = remainingBalance > 0;

  const feeNameFor = (payment: { student_fee_id?: string | null }) =>
    fees.find((f) => f.id === payment.student_fee_id)?.fee_type || '—';

  const handleDownload = async (payment: Payment) => {
    try {
      const url = await resolveReceiptUrl(payment);
      if (!url) {
        toast.error('This receipt has no file attached');
        return;
      }
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get download link');
    }
  };

  const balanceOf = (fee: Fee) => (fee.amount_due || 0) - (fee.amount_paid || 0);

  const onSubmit = async (data: SubmitPaymentFormData) => {
    if (!user || !student?.id || !receiptFile) {
      toast.error('Please complete all fields and select a receipt file');
      return;
    }
    // A receipt must pay off a fee that has actually been assigned to this student.
    const selectedFee = unpaidFees.find((f) => f.id === data.fee_id);
    if (!selectedFee) {
      toast.error('Select the fee this receipt is for');
      return;
    }
    // "Full payment" is a claim staff will check against the receipt, so it has
    // to at least cover what is outstanding — otherwise it is an instalment.
    const amount = parseFloat(data.amount);
    if (data.payment_type === 'FULL' && amount < balanceOf(selectedFee)) {
      toast.error(`A full payment must cover the \u20a6${balanceOf(selectedFee).toLocaleString()} balance. Choose "Part payment" instead.`);
      return;
    }
    try {
      setIsSubmitting(true);
      const fileName = `receipts/${user.id}/${Date.now()}-${receiptFile.name}`;

      await r2Storage.uploadFile(receiptFile, fileName);
      const storageProvider = 'r2';
      const filePath = fileName;
      const fileUrl = fileName;

      // Optional legacy link: not every cohort has a matching fee_structure row
      let feeStructureId: string | null = null;
      if (selectedFee.cohort_id) {
        const { data: fs } = await supabase
          .from('fee_structures')
          .select('id')
          .eq('fee_name', selectedFee.fee_type)
          .eq('cohort_id', selectedFee.cohort_id)
          .maybeSingle();
        feeStructureId = fs?.id || null;
      }

      const { error: paymentError } = await supabase.from('payments').insert({
        student_id: student.id,
        amount_paid: amount,
        payment_type: data.payment_type || null,
        student_fee_id: selectedFee.id,
        fee_id: feeStructureId,
        payment_proof_url: fileUrl, 
        storage_path: filePath,
        storage_provider: storageProvider,
        admin_notes: data.notes || null, 
        status: 'PENDING',
      });
      if (paymentError) { toast.error('Failed to submit payment'); return; }
      toast.success('Payment submitted. Awaiting admin verification.');
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

  const naira = (n: number | null | undefined) => `₦${(n || 0).toLocaleString()}`;

  const feeStatus = (fee: Fee): { label: string; tone: Tone } => {
    if (fee.waived) return { label: 'Waived', tone: 'neutral' };
    const s = (fee.payment_status || '').toLowerCase();
    if (s === 'paid') return { label: 'Paid', tone: 'success' };
    if (s === 'partial') return { label: 'Partial', tone: 'warning' };
    return { label: 'Unpaid', tone: 'danger' };
  };

  const paymentStatus = (status: string | null): { label: string; tone: Tone } => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'PENDING') return { label: 'Pending', tone: 'info' };
    if (s === 'VERIFIED' || s === 'APPROVED') return { label: 'Verified', tone: 'success' };
    if (s === 'REJECTED') return { label: 'Rejected', tone: 'danger' };
    return { label: status || '—', tone: 'neutral' };
  };

  const paymentTypeLabel = (type: string | null) =>
    type === 'FULL' ? 'Full payment' : type === 'PART' ? 'Part payment' : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading fees" />
      </div>
    );
  }

  const inputClass = 'h-11 rounded-xl text-base';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader
        title="Fees and payments"
        aside={
          unpaidFees.length > 0 ? (
            <a
              href="#submit-payment"
              className="hidden min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
            >
              Submit payment
            </a>
          ) : undefined
        }
      />

      {/* Summary: this session only */}
      <Panel className="space-y-3" aria-label="This session's fees">
        <dl className="grid grid-cols-3 gap-2">
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Total owed</dt>
            <dd className="text-lg font-extrabold tracking-tight">{naira(totalOwed)}</dd>
          </div>
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd className="text-lg font-extrabold tracking-tight text-[#11603F] dark:text-emerald-300">{naira(totalPaid)}</dd>
          </div>
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className={cn('text-lg font-extrabold tracking-tight', remainingBalance > 0 ? 'text-[#8A3F05] dark:text-amber-300' : 'text-[#11603F] dark:text-emerald-300')}>
              {naira(remainingBalance)}
            </dd>
          </div>
        </dl>
        <Bar value={paidPercent} tone="success" label={`${paidPercent}% of this session's fees paid`} />
        <p className="text-xs text-muted-foreground">
          {paidFees.length} paid · {unpaidFees.length} outstanding · {paidPercent}% paid · this session only
          {isFullyPaid && ' · all settled'}
        </p>
      </Panel>

      {/* Fees */}
      <section aria-labelledby="fees-current" className="space-y-2.5">
        <SectionTitle id="fees-current">This session</SectionTitle>
        {currentFees.length === 0 ? (
          <Panel className="py-8 text-center text-sm text-muted-foreground">No fees assigned yet</Panel>
        ) : (
          <ListCard>
            {currentFees.map((fee) => {
              const st = feeStatus(fee);
              return (
                <li key={fee.id} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="text-sm">{fee.fee_type}</strong>
                    <span className="text-xs text-muted-foreground">
                      {naira(fee.amount_due)} due · {naira(fee.amount_paid)} paid · {naira(balanceOf(fee))} balance
                    </span>
                  </span>
                  <Pill tone={st.tone} className="text-[11px]">{st.label}</Pill>
                </li>
              );
            })}
          </ListCard>
        )}

        {pastFees.length > 0 && (
          <>
            <h2 className="pt-2 text-[13px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Previous session · closed
            </h2>
            <ListCard>
              {pastFees.map((fee) => (
                <li key={fee.id} className="flex min-h-[56px] items-center gap-3 px-3.5 py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="truncate text-sm">{fee.fee_type}</strong>
                    <span className="text-xs text-muted-foreground">
                      {naira(fee.amount_paid)} of {naira(fee.amount_due)} paid
                    </span>
                  </span>
                  <Pill
                    tone={fee.waived ? 'neutral' : (fee.payment_status || '').toLowerCase() === 'paid' ? 'success' : 'neutral'}
                    className="text-[11px]"
                  >
                    {fee.waived ? 'Written off' : fee.payment_status || 'Unpaid'}
                  </Pill>
                </li>
              ))}
            </ListCard>
            <p className="text-xs text-muted-foreground">
              Kept for your records. Nothing here is owed — it does not count towards this session's fees.
            </p>
          </>
        )}
      </section>

      {/* Submit a payment */}
      <section
        id="submit-payment"
        aria-labelledby="fees-submit"
        className="scroll-mt-4 space-y-3 rounded-[20px] border-2 border-primary bg-card p-4 sm:p-5"
      >
        <h2 id="fees-submit" className="text-base font-bold">Submit a payment</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Upload your bank transfer receipt. An administrator checks it and updates your balance.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="pay-fee" className="text-sm font-semibold">Fee</Label>
            <input type="hidden" {...register('fee_id', { required: 'Select the fee this receipt is for' })} />
            <Select value={selectedFeeId} onValueChange={(value) => {
              setValue('fee_id', value, { shouldValidate: true });
              const fee = unpaidFees.find(f => f.id === value);
              if (fee && selectedPaymentType !== 'PART') {
                setValue('amount', balanceOf(fee).toString());
              }
            }}>
              <SelectTrigger id="pay-fee" disabled={unpaidFees.length === 0} className="h-11 rounded-xl">
                <SelectValue placeholder={unpaidFees.length === 0 ? 'No outstanding fees' : 'Select fee to pay'} />
              </SelectTrigger>
              <SelectContent>
                {unpaidFees.map((fee) => (
                  <SelectItem key={fee.id} value={fee.id}>
                    {fee.fee_type} ({naira(balanceOf(fee))} left)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.fee_id && <p className="text-sm text-destructive">{errors.fee_id.message}</p>}
            {unpaidFees.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {fees.length === 0
                  ? 'No fees have been assigned to you yet. Receipts can only be submitted once the school creates your fee.'
                  : 'All your assigned fees are settled — there is nothing to pay right now.'}
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Is this the full payment or a part payment?</legend>
            <input type="hidden" {...register('payment_type', { required: 'Tell us whether this is a full or part payment' })} />
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'FULL' as const, title: 'Full', hint: 'Settles this fee' },
                { value: 'PART' as const, title: 'Part', hint: 'An instalment' },
              ]).map((option) => {
                const on = selectedPaymentType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setValue('payment_type', option.value, { shouldValidate: true });
                      const fee = unpaidFees.find((f) => f.id === selectedFeeId);
                      // Full prefills the outstanding balance; part clears it
                      // so the student types what they actually transferred.
                      if (option.value === 'FULL' && fee) setValue('amount', balanceOf(fee).toString());
                      if (option.value === 'PART') setValue('amount', '');
                    }}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-2 border-primary bg-[#F6F2FD] dark:bg-primary/15' : 'border border-input hover:bg-muted/50',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-muted-foreground')}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{option.title}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.payment_type && <p className="text-sm text-destructive">{errors.payment_type.message}</p>}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-sm font-semibold">Amount (₦)</Label>
            <Input id="pay-amount" type="number" inputMode="decimal" step="0.01" placeholder="0.00" className={inputClass} {...register('amount', { required: 'Amount is required' })} />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes" className="text-sm font-semibold">Notes (optional)</Label>
            <Textarea id="pay-notes" placeholder="Any additional information…" {...register('notes')} className="min-h-[72px] rounded-xl text-base" />
          </div>

          <div className="space-y-1.5">
            {/* The input itself covers the whole box: a hidden (display:none)
                input driven by a label is ignored by some mobile browsers and
                in-app webviews, and taps on the padding hit nothing. */}
            <div className="relative rounded-[14px] border border-dashed border-[#BDB6CF] p-4 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50 dark:border-border">
              <input
                id="receipt"
                type="file"
                accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png"
                aria-label="Bank transfer receipt"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > MAX_RECEIPT_BYTES) {
                      toast.error('That file is larger than 10MB. Please upload a smaller image.');
                    } else {
                      setReceiptFile(file);
                    }
                  }
                  // Allow re-picking the same file after an error or a change of mind
                  e.target.value = '';
                }}
              />
              <div className="pointer-events-none flex flex-col items-center gap-1">
                {receiptFile
                  ? <FileCheck2 className="h-6 w-6 text-[#157F5B] dark:text-emerald-400" aria-hidden="true" />
                  : <Upload className="h-6 w-6 text-primary" aria-hidden="true" />}
                <p className="text-sm font-semibold text-primary">
                  {receiptFile ? 'Change receipt' : 'Upload bank transfer receipt'}
                </p>
                <p className="text-xs text-muted-foreground">{receiptFile?.name || 'Photo or PDF, up to 10MB'}</p>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting || unpaidFees.length === 0} className="h-[50px] w-full rounded-[14px] text-base font-bold">
            {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Submitting…</>) : 'Submit payment'}
          </Button>
        </form>
      </section>

      {/* Payment history */}
      <section aria-labelledby="fees-history" className="space-y-2.5">
        <SectionTitle id="fees-history">Payment history</SectionTitle>
        {payments.length === 0 ? (
          <Panel className="py-8 text-center text-sm text-muted-foreground">No payments submitted yet</Panel>
        ) : (
          <ul className="space-y-2.5">
            {payments.map((payment) => {
              const st = paymentStatus(payment.status);
              const rejected = (payment.status || '').toUpperCase() === 'REJECTED';
              const meta = [
                paymentTypeLabel(payment.payment_type),
                payment.created_at ? `submitted ${new Date(payment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <li key={payment.id} className="space-y-1.5 rounded-2xl border border-border bg-card px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="min-w-0 text-[15px]">
                      {naira(payment.amount_paid)} · {feeNameFor(payment)}
                    </strong>
                    <Pill tone={st.tone} className="text-[11px]">{st.label}</Pill>
                  </div>
                  {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
                  {/* A rejection's reason is written into the payment's notes by
                      the administrator who rejected it. */}
                  {rejected && payment.admin_notes && (
                    <p className="text-[13px] text-[#8E2A0A] dark:text-red-300">Reason: {payment.admin_notes}</p>
                  )}
                  {payment.payment_proof_url && (
                    <button
                      type="button"
                      onClick={() => handleDownload(payment)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      View receipt <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default StudentFees;
