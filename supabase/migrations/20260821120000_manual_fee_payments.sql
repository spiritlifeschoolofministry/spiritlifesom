-- A student who settles three fees with one bank transfer has one receipt. The
-- receipt gets assigned to one of those fees and verified; the other two stay
-- Unpaid with nothing to attach, because a payments row has always needed a
-- student-submitted proof behind it.
--
-- These RPCs let an admin record that payment themselves: a payments row with
-- no receipt, flagged is_manual_record, tied to the fee it settles and pointing back
-- at the receipt it was covered by. The balance still moves through
-- adjust_fee_amount_paid, so a manual entry and a verified receipt are the same
-- thing to every report — the flag only says where the record came from.

-- 1. Mark the origin of a payment row ---------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS is_manual_record boolean NOT NULL DEFAULT false;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS covered_by_payment_id uuid
  REFERENCES public.payments(id) ON DELETE SET NULL;

-- Manual entries are the minority of payments, so index the exceptions.
CREATE INDEX IF NOT EXISTS payments_manual_record_idx
  ON public.payments (student_id) WHERE is_manual_record;
CREATE INDEX IF NOT EXISTS payments_covered_by_idx
  ON public.payments (covered_by_payment_id) WHERE covered_by_payment_id IS NOT NULL;

COMMENT ON COLUMN public.payments.is_manual_record IS
  'True when an admin recorded this payment instead of a student uploading a receipt — typically one transfer covering several fees.';
COMMENT ON COLUMN public.payments.covered_by_payment_id IS
  'The student-submitted receipt this manual entry was taken from, when there is one.';

-- 2. Admin: record a payment with no receipt of its own ----------------------

CREATE OR REPLACE FUNCTION public.admin_record_manual_payment(
  p_student_fee_id uuid,
  p_amount numeric DEFAULT NULL,
  p_payment_date date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_covered_by_payment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee fees%ROWTYPE;
  v_source payments%ROWTYPE;
  v_outstanding numeric;
  v_amount numeric;
  v_date date;
  v_structure_id uuid;
  v_payment_id uuid;
  v_note text;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can record a payment manually';
  END IF;

  SELECT * INTO v_fee FROM fees WHERE id = p_student_fee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fee record not found'; END IF;
  IF v_fee.waived THEN RAISE EXCEPTION 'That fee is waived — nothing to pay'; END IF;

  v_outstanding := GREATEST(COALESCE(v_fee.amount_due, 0) - COALESCE(v_fee.amount_paid, 0), 0);
  -- No amount given means "settle what is left".
  v_amount := ROUND(COALESCE(p_amount, v_outstanding), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Nothing outstanding on this fee — enter an amount to record anyway';
  END IF;

  v_date := COALESCE(p_payment_date, CURRENT_DATE);

  IF p_covered_by_payment_id IS NOT NULL THEN
    SELECT * INTO v_source FROM payments WHERE id = p_covered_by_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The receipt this covers no longer exists'; END IF;
    IF v_source.student_id IS DISTINCT FROM v_fee.student_id THEN
      RAISE EXCEPTION 'That receipt belongs to a different student';
    END IF;
  END IF;

  -- Keep the legacy fee_structures link in sync where a definition matches,
  -- the same way admin_set_payment_fee does.
  SELECT fs.id INTO v_structure_id
  FROM fee_structures fs
  JOIN students s ON s.id = v_fee.student_id
  WHERE fs.fee_name = v_fee.fee_type
    AND (fs.cohort_id = s.cohort_id OR fs.cohort_id IS NULL)
  ORDER BY (fs.cohort_id IS NOT NULL) DESC
  LIMIT 1;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  INSERT INTO payments (
    student_id, student_fee_id, fee_id, amount_paid, status,
    payment_date, payment_type, is_manual_record, covered_by_payment_id, admin_notes
  ) VALUES (
    v_fee.student_id, p_student_fee_id, v_structure_id, v_amount, 'VERIFIED',
    v_date,
    CASE WHEN v_amount >= v_outstanding THEN 'FULL' ELSE 'PART' END,
    true, p_covered_by_payment_id,
    COALESCE(v_note, 'Recorded manually by an admin — no separate receipt')
  )
  RETURNING id INTO v_payment_id;

  PERFORM adjust_fee_amount_paid(p_student_fee_id, v_amount);

  UPDATE fees
  SET payment_date = v_date,
      payment_method = COALESCE(payment_method, 'Manual entry'),
      adjusted_by = auth.uid(),
      notes = CASE
        WHEN v_note IS NULL THEN notes
        WHEN COALESCE(btrim(notes), '') = '' THEN v_note
        ELSE notes || E'\n' || v_note
      END
  WHERE id = p_student_fee_id;

  PERFORM audit_log_event(
    'payment.manual_record', 'payment', v_payment_id,
    'Manual payment of ' || v_amount || ' recorded for ' || v_fee.fee_type,
    NULL,
    jsonb_build_object('amount_paid', v_amount, 'student_fee_id', p_student_fee_id, 'payment_date', v_date),
    jsonb_build_object('student_id', v_fee.student_id, 'covered_by_payment_id', p_covered_by_payment_id, 'note', v_note)
  );

  RETURN v_payment_id;
END;
$$;

-- 3. Admin: undo a manual entry ----------------------------------------------
--
-- Deleting a payments row directly leaves the balance it moved behind. This
-- takes the amount back off the fee first, and only touches manual entries —
-- a student's receipt still goes through the normal reject/delete path.

CREATE OR REPLACE FUNCTION public.admin_delete_manual_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can remove a payment';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF NOT v_payment.is_manual_record THEN
    RAISE EXCEPTION 'That payment came from a student receipt, not a manual entry';
  END IF;

  IF upper(COALESCE(v_payment.status, '')) IN ('VERIFIED', 'APPROVED')
     AND v_payment.student_fee_id IS NOT NULL THEN
    PERFORM adjust_fee_amount_paid(v_payment.student_fee_id, -v_payment.amount_paid);
  END IF;

  DELETE FROM payments WHERE id = p_payment_id;

  PERFORM audit_log_event(
    'payment.manual_delete', 'payment', p_payment_id,
    'Manual payment of ' || v_payment.amount_paid || ' reversed',
    jsonb_build_object('amount_paid', v_payment.amount_paid, 'student_fee_id', v_payment.student_fee_id),
    NULL,
    jsonb_build_object('student_id', v_payment.student_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_manual_payment(uuid, numeric, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_manual_payment(uuid) TO authenticated;
