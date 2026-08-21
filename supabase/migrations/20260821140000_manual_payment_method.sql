-- fees.payment_method is constrained to Bank Transfer / Cash / Online Payment /
-- Other, and admin_record_manual_payment was writing 'Manual entry' into it —
-- every manual record failed on the check constraint.
--
-- The admin knows how the student actually paid, so ask instead of inventing a
-- value: p_payment_method is validated against the same list and falls back to
-- 'Other'. As before it only fills a method in where the fee had none, so a
-- second instalment can't rewrite the first one's method.

DROP FUNCTION IF EXISTS public.admin_record_manual_payment(uuid, numeric, date, text, uuid);

CREATE OR REPLACE FUNCTION public.admin_record_manual_payment(
  p_student_fee_id uuid,
  p_amount numeric DEFAULT NULL,
  p_payment_date date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_covered_by_payment_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL
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
  v_method text;
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

  v_method := NULLIF(btrim(COALESCE(p_payment_method, '')), '');
  IF v_method IS NOT NULL AND v_method NOT IN ('Bank Transfer', 'Cash', 'Online Payment', 'Other') THEN
    RAISE EXCEPTION 'Unknown payment method: %', v_method;
  END IF;
  v_method := COALESCE(v_method, 'Other');

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
      payment_method = COALESCE(payment_method, v_method),
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
    jsonb_build_object(
      'student_id', v_fee.student_id,
      'covered_by_payment_id', p_covered_by_payment_id,
      'payment_method', v_method,
      'note', v_note
    )
  );

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_manual_payment(uuid, numeric, date, text, uuid, text) TO authenticated;
