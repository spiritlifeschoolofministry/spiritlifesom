ALTER TABLE public.email_send_history
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_history_idempotency_key
  ON public.email_send_history (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON public.payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;