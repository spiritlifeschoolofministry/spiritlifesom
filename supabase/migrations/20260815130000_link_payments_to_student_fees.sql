-- Receipts must be tied to a fee that actually exists for the student.
--
-- Before this, payments.fee_id pointed at fee_structures (a per-cohort fee
-- definition). Students whose cohort had no fee_structure row — or who never
-- picked a fee at all, since the picker was optional — ended up with payments
-- carrying fee_id = NULL. Those receipts could never be applied to a balance.
--
-- payments.student_fee_id points at the student's own fees row instead, which
-- is what a receipt is really paying off, and RLS now requires it on insert.

-- 1. Link payments to the student's assigned fee record ----------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS student_fee_id uuid REFERENCES public.fees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_student_fee ON public.payments(student_fee_id);

-- Backfill from the fee_structure the payment already pointed at
UPDATE public.payments p
SET student_fee_id = f.id
FROM public.fee_structures fs, public.fees f
WHERE p.student_fee_id IS NULL
  AND p.fee_id = fs.id
  AND f.student_id = p.student_id
  AND f.fee_type = fs.fee_name;

-- 2. Fee balance helper ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_fee_amount_paid(p_fee_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new numeric;
  v_due numeric;
BEGIN
  SELECT GREATEST(COALESCE(amount_paid, 0) + p_delta, 0), COALESCE(amount_due, 0)
    INTO v_new, v_due
  FROM fees WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE fees
  SET amount_paid = v_new,
      payment_status = CASE
        WHEN v_due > 0 AND v_new >= v_due THEN 'Paid'
        WHEN v_new > 0 THEN 'Partial'
        ELSE 'Unpaid'
      END
  WHERE id = p_fee_id;
END;
$$;

-- Internal helper only: reachable through the admin RPCs below, not directly.
REVOKE EXECUTE ON FUNCTION public.adjust_fee_amount_paid(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_fee_amount_paid(uuid, numeric) FROM anon, authenticated;

-- 3. Admin: move a receipt to the correct fee --------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_payment_fee(p_payment_id uuid, p_student_fee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_new_fee fees%ROWTYPE;
  v_structure_id uuid;
  v_verified boolean;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can reassign a payment';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

  SELECT * INTO v_new_fee FROM fees WHERE id = p_student_fee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fee record not found'; END IF;
  IF v_new_fee.student_id IS DISTINCT FROM v_payment.student_id THEN
    RAISE EXCEPTION 'That fee belongs to a different student';
  END IF;

  IF v_payment.student_fee_id IS NOT DISTINCT FROM p_student_fee_id THEN
    RETURN;
  END IF;

  v_verified := upper(COALESCE(v_payment.status, '')) IN ('VERIFIED', 'APPROVED');

  -- A verified receipt has already been counted against a balance: move it.
  IF v_verified THEN
    IF v_payment.student_fee_id IS NOT NULL THEN
      PERFORM adjust_fee_amount_paid(v_payment.student_fee_id, -v_payment.amount_paid);
    END IF;
    PERFORM adjust_fee_amount_paid(p_student_fee_id, v_payment.amount_paid);
  END IF;

  -- Keep the legacy fee_structures link in sync where a matching definition exists
  SELECT fs.id INTO v_structure_id
  FROM fee_structures fs
  JOIN students s ON s.id = v_payment.student_id
  WHERE fs.fee_name = v_new_fee.fee_type
    AND (fs.cohort_id = s.cohort_id OR fs.cohort_id IS NULL)
  ORDER BY (fs.cohort_id IS NOT NULL) DESC
  LIMIT 1;

  UPDATE payments
  SET student_fee_id = p_student_fee_id,
      fee_id = v_structure_id
  WHERE id = p_payment_id;
END;
$$;

-- 4. Admin: verify a receipt against its fee ---------------------------------

CREATE OR REPLACE FUNCTION public.admin_approve_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can verify a payment';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

  -- Already counted; verifying twice would double the balance.
  IF upper(COALESCE(v_payment.status, '')) IN ('VERIFIED', 'APPROVED') THEN
    RETURN;
  END IF;

  IF v_payment.student_fee_id IS NULL THEN
    RAISE EXCEPTION 'Assign this receipt to a fee before verifying it';
  END IF;

  UPDATE payments
  SET status = 'VERIFIED',
      payment_date = COALESCE(payment_date, CURRENT_DATE)
  WHERE id = p_payment_id;

  PERFORM adjust_fee_amount_paid(v_payment.student_fee_id, v_payment.amount_paid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_payment_fee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment(uuid) TO authenticated;

-- 5. RLS: a student may only submit against one of their own fees ------------

DROP POLICY IF EXISTS "Students can submit payments" ON public.payments;
CREATE POLICY "Students can submit payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
    AND student_fee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fees f
      WHERE f.id = payments.student_fee_id
        AND f.student_id = payments.student_id
    )
  );

-- "Admins manage payments" was USING (true) for every authenticated user, so
-- the insert rule above was bypassable and any student could read or edit
-- another student's payments. Scope it to actual admins.
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
