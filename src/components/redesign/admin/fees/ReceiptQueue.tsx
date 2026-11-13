import { useEffect, useState, type ReactNode } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import ReceiptViewer from '@/components/admin/ReceiptViewer';
import { resolveReceiptUrl } from '@/lib/receipt-url';
import { naira } from '@/lib/money';
import { Panel, StatusPill } from '@/components/redesign/admin/primitives';
import { queueRowClass } from '@/components/redesign/admin/styles';
import { paymentTypeLabel, submittedLabel } from './receipt-labels';

/**
 * The receipts-to-verify queue from board AdminFees: a list of receipts on the
 * left and the selected one in full on the right. Used by Fees (Payment
 * approvals tab) and the standalone Payments page, which each keep their own
 * approve / reject logic and pass the actions in.
 */

export type QueuePayment = Tables<'payments'> & {
  student_name?: string;
  student_email?: string;
  fee_name?: string | null;
};

export function ReceiptQueueList({
  payments,
  selectedId,
  onSelect,
  title,
  actions,
  showFee = true,
}: {
  payments: QueuePayment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  title: ReactNode;
  actions?: ReactNode;
  /** The Payments page has no fee names loaded, so it can hide the name. */
  showFee?: boolean;
}) {
  return (
    <Panel title={title} titleId="receipt-queue-title" actions={actions} className="flex-1 basis-[420px]">
      {payments.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No receipts waiting. Everything is verified.</p>
      ) : (
        <ul aria-labelledby="receipt-queue-title">
          {payments.map((p) => {
            const selected = p.id === selectedId;
            return (
              <li key={p.id} className={queueRowClass(selected)}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  aria-current={selected ? 'true' : undefined}
                  className="flex min-h-[60px] w-full items-center gap-3 px-[18px] py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="truncate text-sm text-foreground">{p.student_name || 'Unknown'}</strong>
                    <span className="truncate text-xs text-muted-foreground">
                      {showFee && <>{p.fee_name || 'No fee set'} · </>}
                      {paymentTypeLabel(p.payment_type)} · {submittedLabel(p.created_at)}
                    </span>
                  </span>
                  <strong className="shrink-0 text-sm text-foreground">{naira(Number(p.amount_paid))}</strong>
                  {!p.student_fee_id && (
                    <StatusPill tone="warn" className="shrink-0 text-[11px]">
                      No fee set
                    </StatusPill>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** One field in the detail panel's definition list. */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-foreground">{children}</dd>
    </div>
  );
}

export function ReceiptDetail({ payment, children }: { payment: QueuePayment | null; children?: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasFile = Boolean(payment && (payment.storage_path || payment.payment_proof_url));

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!payment || !(payment.storage_path || payment.payment_proof_url)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    resolveReceiptUrl(payment)
      .then((resolved) => {
        if (live) setUrl(resolved);
      })
      .catch((err) => {
        console.error('Failed to resolve receipt URL', err);
        if (live) setUrl(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // Only re-resolve when a different receipt is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id]);

  if (!payment) {
    return (
      <section className="flex flex-[1.2] basis-[460px] items-center justify-center rounded-[18px] border border-border bg-card p-8 text-sm text-muted-foreground">
        Select a receipt to review it.
      </section>
    );
  }

  return (
    <section
      aria-label={`Receipt from ${payment.student_name || 'student'}`}
      className="flex min-w-0 flex-[1.2] basis-[460px] flex-col gap-3.5 rounded-[18px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">{payment.student_name || 'Unknown'}</h2>
        <strong className="text-xl text-foreground">{naira(Number(payment.amount_paid))}</strong>
      </div>
      {payment.student_email && <p className="-mt-2 break-all text-sm text-muted-foreground">{payment.student_email}</p>}
      <div className="rounded-[14px] bg-muted/60 p-3">
        {hasFile ? (
          <ReceiptViewer payment={payment} url={url || payment.payment_proof_url || null} loading={loading} />
        ) : (
          <p className="py-10 text-center text-sm font-semibold text-muted-foreground">No receipt file uploaded</p>
        )}
      </div>
      {children}
    </section>
  );
}
