-- Let an admin point a receipt at any fee in the system, not only the ones
-- already attached to that student.
--
-- payments.student_fee_id has to reference a row in fees, which is per-student.
-- When the admin picks a fee definition the student was never assigned (a
-- different learning mode, a cohort with no structures), create that student's
-- fees row first, then hand off to admin_set_payment_fee for the balance move.

CREATE OR REPLACE FUNCTION public.admin_set_payment_fee_by_structure(
  p_payment_id uuid,
  p_fee_structure_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_structure fee_structures%ROWTYPE;
  v_cohort uuid;
  v_fee_id uuid;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can reassign a payment';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.student_id IS NULL THEN
    RAISE EXCEPTION 'This payment is not linked to a student';
  END IF;

  SELECT * INTO v_structure FROM fee_structures WHERE id = p_fee_structure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fee not found'; END IF;

  SELECT cohort_id INTO v_cohort FROM students WHERE id = v_payment.student_id;
  v_cohort := COALESCE(v_cohort, v_structure.cohort_id);

  -- Reuse a fee record of the same type if the student already has one
  SELECT id INTO v_fee_id
  FROM fees
  WHERE student_id = v_payment.student_id
    AND fee_type = v_structure.fee_name
  ORDER BY (cohort_id IS NOT DISTINCT FROM v_cohort) DESC
  LIMIT 1;

  IF v_fee_id IS NULL THEN
    INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status, recorded_by)
    VALUES (v_payment.student_id, v_cohort, v_structure.fee_name, v_structure.amount, 0, 'Unpaid', auth.uid())
    RETURNING id INTO v_fee_id;
  END IF;

  PERFORM admin_set_payment_fee(p_payment_id, v_fee_id);
  RETURN v_fee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_payment_fee_by_structure(uuid, uuid) TO authenticated;
