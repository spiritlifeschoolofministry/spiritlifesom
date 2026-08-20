-- Students often pay a fee in two instalments, but a receipt carried no hint of
-- which it was: staff reviewing the queue saw a part payment and a full payment
-- as the same "amount + image", and had to open the fee record to work out
-- whether more was still coming.
--
-- payment_type records what the student says the receipt is. It is their
-- declaration, not a computed fact — the balance still comes from
-- fees.amount_paid, which only an approval moves. Historical rows stay NULL.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('FULL', 'PART'));

COMMENT ON COLUMN public.payments.payment_type IS
  'Student''s declaration for this receipt: FULL settles the fee balance, PART is an instalment. NULL for receipts submitted before this was asked.';
