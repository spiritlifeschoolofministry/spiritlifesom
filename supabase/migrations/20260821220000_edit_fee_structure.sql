-- A fee structure could only be created or deleted. Correcting a price, or
-- widening a fee to another learning mode, meant deleting the definition and
-- adding it again -- which drops every student's fee row with it, taking their
-- recorded payments' link along (payments.student_fee_id is ON DELETE SET NULL).
--
-- This makes the two editable fields editable. Cohort and fee name are not:
-- fees rows are tied to a definition by fee_type text, not by id, so renaming a
-- structure would leave every existing row pointing at a name that no longer
-- exists and reconcile_student_fees would then create a second row under the
-- new name. Renaming needs its own migration that moves the rows too.
--
-- Re-targeting is already handled: on_fee_structure_reconcile fires on
-- learning_modes and re-runs reconcile_student_fees for the cohort, so widening
-- a fee bills the students it now covers and narrowing one un-bills those it no
-- longer does, within the untouched-rows guard.
--
-- Re-pricing is handled here, because a trigger should not decide it. Only rows
-- with nothing against them are re-priced: no money paid, no receipt attached,
-- not waived. A student who has already part-paid keeps the amount they were
-- quoted, and the caller is told how many were left behind so the difference is
-- visible rather than silent.

CREATE OR REPLACE FUNCTION public.admin_update_fee_structure(
  p_id uuid,
  p_amount numeric,
  p_learning_modes text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old fee_structures%ROWTYPE;
  v_modes text[];
  v_amount numeric;
  v_rows_before integer;
  v_rows_after integer;
  v_repriced integer := 0;
  v_kept integer := 0;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can change a fee definition';
  END IF;

  SELECT * INTO v_old FROM fee_structures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That fee definition no longer exists'; END IF;

  v_amount := ROUND(COALESCE(p_amount, v_old.amount), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'A fee has to be worth more than nothing';
  END IF;

  -- Same normalisation the client applies: never an empty set, never 'All'
  -- alongside a specific mode.
  v_modes := COALESCE(NULLIF(p_learning_modes, '{}'), ARRAY['All']::text[]);
  IF 'All' = ANY (v_modes) THEN
    v_modes := ARRAY['All']::text[];
  END IF;

  SELECT count(*) INTO v_rows_before
  FROM fees f WHERE f.cohort_id = v_old.cohort_id AND f.fee_type = v_old.fee_name;

  -- Re-price first, while the rows still carry the old amount, so the "kept"
  -- count is measured against what the student was actually quoted.
  IF v_amount IS DISTINCT FROM v_old.amount THEN
    UPDATE fees f
    SET amount_due = v_amount,
        payment_status = CASE WHEN COALESCE(f.amount_paid, 0) >= v_amount THEN 'Paid' ELSE 'Unpaid' END
    WHERE f.cohort_id = v_old.cohort_id
      AND f.fee_type = v_old.fee_name
      AND COALESCE(f.amount_paid, 0) = 0
      AND COALESCE(f.waived, false) = false
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_fee_id = f.id);
    GET DIAGNOSTICS v_repriced = ROW_COUNT;
  END IF;

  -- Anything still on the old price after that is deliberately left alone.
  SELECT count(*) INTO v_kept
  FROM fees f
  WHERE f.cohort_id = v_old.cohort_id
    AND f.fee_type = v_old.fee_name
    AND f.amount_due IS DISTINCT FROM v_amount;

  -- Fires on_fee_structure_reconcile when learning_modes changes, which adds
  -- and removes student rows to match.
  UPDATE fee_structures
  SET amount = v_amount,
      learning_modes = v_modes
  WHERE id = p_id;

  SELECT count(*) INTO v_rows_after
  FROM fees f WHERE f.cohort_id = v_old.cohort_id AND f.fee_type = v_old.fee_name;

  PERFORM audit_log_event(
    'fee_structure.updated', 'fee_structure', p_id,
    'Fee definition updated (' || v_old.fee_name || '): ₦' || v_old.amount || ' → ₦' || v_amount
      || ', ' || array_to_string(v_old.learning_modes, '+') || ' → ' || array_to_string(v_modes, '+'),
    jsonb_build_object('amount', v_old.amount, 'learning_modes', v_old.learning_modes),
    jsonb_build_object('amount', v_amount, 'learning_modes', v_modes),
    jsonb_build_object(
      'cohort_id', v_old.cohort_id,
      'fee_name', v_old.fee_name,
      'student_rows_repriced', v_repriced,
      'student_rows_kept_at_old_amount', v_kept,
      'student_rows_before', v_rows_before,
      'student_rows_after', v_rows_after
    )
  );

  RETURN jsonb_build_object(
    'fee_name', v_old.fee_name,
    'amount_changed', v_amount IS DISTINCT FROM v_old.amount,
    'modes_changed', v_modes IS DISTINCT FROM v_old.learning_modes,
    'repriced', v_repriced,
    'kept_at_old_amount', v_kept,
    'students_added', GREATEST(v_rows_after - v_rows_before, 0),
    'students_removed', GREATEST(v_rows_before - v_rows_after, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_fee_structure(uuid, numeric, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_fee_structure(uuid, numeric, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_fee_structure(uuid, numeric, text[]) TO authenticated;

COMMENT ON FUNCTION public.admin_update_fee_structure(uuid, numeric, text[]) IS
  'Changes a fee structure''s amount and learning-mode targeting. Re-prices only student rows with nothing against them; re-targeting flows through reconcile_student_fees. Returns a summary of what moved.';
