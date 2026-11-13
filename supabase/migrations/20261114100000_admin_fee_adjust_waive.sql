-- Adjust and waive a student's fee from Admin › Money › Fees and payments.
--
-- Until now a fee row's amount due could only change through the fee
-- structure (which re-prices untouched rows only), and nothing in the app could
-- waive a single student's fee, although fees.waived and waive_reason exist and
-- every report already excludes waived fees. These two functions are the only
-- way the app changes either, so the rules live in one place:
--
--   * admins only (teachers can see fees but do not change money);
--   * the payment status is recomputed from what has been paid;
--   * an amount due can never be set below what has already been paid, so a
--     fee cannot end up overpaid;
--   * a waiver needs a reason; undoing it clears the reason.
--
-- The existing audit trigger on fees records every change (old values included),
-- so no separate logging is needed here.

CREATE OR REPLACE FUNCTION public.admin_set_fee_due(p_fee_id uuid, p_amount_due numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee fees%ROWTYPE;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can adjust fees' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_due IS NULL OR p_amount_due < 0 THEN
    RAISE EXCEPTION 'The amount due must be zero or more' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_fee FROM fees WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That fee no longer exists';
  END IF;
  IF COALESCE(v_fee.amount_paid, 0) > p_amount_due THEN
    RAISE EXCEPTION '% already has ₦% paid against it; the amount due cannot be less than that.',
      COALESCE(v_fee.fee_type, 'This fee'), COALESCE(v_fee.amount_paid, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE fees
  SET amount_due = p_amount_due,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) >= p_amount_due THEN 'Paid'
        WHEN COALESCE(amount_paid, 0) > 0 THEN 'Partial'
        ELSE 'Unpaid'
      END,
      adjusted_by = auth.uid()
  WHERE id = p_fee_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_fee_due(uuid, numeric) IS
  'Admins only. Sets one student fee''s amount due (never below what has been paid) and recomputes its payment status.';

CREATE OR REPLACE FUNCTION public.admin_set_fee_waived(p_fee_id uuid, p_waived boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can waive fees' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_waived AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason for waiving this fee' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE fees
  SET waived = p_waived,
      waive_reason = CASE WHEN p_waived THEN v_reason ELSE NULL END,
      adjusted_by = auth.uid()
  WHERE id = p_fee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That fee no longer exists';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_fee_waived(uuid, boolean, text) IS
  'Admins only. Waives one student fee with a reason, or undoes the waiver.';

REVOKE ALL ON FUNCTION public.admin_set_fee_due(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_fee_waived(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_fee_due(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_fee_waived(uuid, boolean, text) TO authenticated;
