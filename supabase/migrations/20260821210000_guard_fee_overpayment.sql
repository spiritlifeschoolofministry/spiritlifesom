-- Nothing has ever stopped a fee being credited more than it is worth. Seven
-- fees carry 32,100 more than they are due, from two different routes:
--
--   * Six fees have two VERIFIED receipts each. Before part payment existed a
--     student settling a fee in instalments had to upload a receipt per
--     instalment, and each verification credited the full amount through
--     adjust_fee_amount_paid, which only ever adds. Gaps between the pairs run
--     from 46 seconds to two months.
--   * SLSM-2627-0070's School Fees went 0 -> 30,000 (2026-05-21) and then
--     30,000 -> 60,000 (2026-08-15) by direct UPDATE, with no receipt behind
--     either. The audit trail records both; nothing warned that the fee was
--     already settled.
--
-- That second route is why the guard is a trigger on fees rather than a check
-- inside adjust_fee_amount_paid: the RPCs are not the only writer. A constraint
-- on the table covers the RPCs, the admin screens, and the SQL editor alike.

-- 1. Refuse to credit a fee beyond what it is due ----------------------------
--
-- Only rising past amount_due is blocked. A correction downwards stays legal --
-- including on a row that is already over-credited, which is what the repair
-- in section 3 relies on -- and so does a waived fee, which is settled by a
-- different route entirely. amount_due of 0 is left alone: a fee worth nothing
-- has no balance to overshoot.

CREATE OR REPLACE FUNCTION public.enforce_fee_no_overpayment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.waived, false) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount_due, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount_paid, 0) > COALESCE(NEW.amount_due, 0)
     AND COALESCE(NEW.amount_paid, 0) > COALESCE(OLD.amount_paid, 0) THEN
    RAISE EXCEPTION
      '% is due ₦% and already has ₦% against it. Crediting ₦% would overpay it by ₦%. Correct the amount, or raise amount_due first if the fee really is larger.',
      COALESCE(NEW.fee_type, 'This fee'),
      COALESCE(NEW.amount_due, 0),
      COALESCE(OLD.amount_paid, 0),
      COALESCE(NEW.amount_paid, 0),
      COALESCE(NEW.amount_paid, 0) - COALESCE(NEW.amount_due, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_fee_no_overpayment() IS
  'Refuses an increase to fees.amount_paid that would take it past amount_due. Corrections downwards, waived fees and zero-due fees are unaffected.';

-- UPDATE only. An INSERT of a fee already carrying a balance is how historical
-- records get loaded, and section 3 has to be able to leave 0070 standing.
DROP TRIGGER IF EXISTS fees_no_overpayment ON public.fees;
CREATE TRIGGER fees_no_overpayment
  BEFORE UPDATE OF amount_paid ON public.fees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fee_no_overpayment();

-- 2. Same answer at the RPC layer, with a better message ---------------------
--
-- The trigger is the backstop, but a receipt being verified against a settled
-- fee should fail before a payments row is written, not after.

CREATE OR REPLACE FUNCTION public.adjust_fee_amount_paid(p_fee_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new numeric;
  v_due numeric;
  v_old numeric;
  v_waived boolean;
  v_type text;
BEGIN
  SELECT COALESCE(amount_paid, 0), COALESCE(amount_due, 0), COALESCE(waived, false), fee_type
    INTO v_old, v_due, v_waived, v_type
  FROM fees WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_new := GREATEST(v_old + p_delta, 0);

  IF NOT v_waived AND v_due > 0 AND v_new > v_due AND v_new > v_old THEN
    RAISE EXCEPTION
      '% is due ₦% with ₦% already paid, so ₦% is more than is outstanding. Record the balance that is actually left, or correct amount_due.',
      COALESCE(v_type, 'This fee'), v_due, v_old, p_delta
      USING ERRCODE = 'check_violation';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.adjust_fee_amount_paid(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_fee_amount_paid(uuid, numeric) FROM anon, authenticated;

-- 3. Repair the six double-credited fees -------------------------------------
--
-- One receipt per instalment was the only way to file these before part
-- payment, so the pair represents one settled fee, not two. The earliest
-- verification is kept as the record of it and the later one is deleted, then
-- the balance is put back to exactly what the fee is due.
--
-- The proof images behind the deleted rows stay in storage; only the payments
-- row goes. Nothing else points at them.

CREATE TEMP TABLE _dup_receipts ON COMMIT DROP AS
SELECT p.id AS payment_id, p.student_fee_id
FROM payments p
JOIN fees f ON f.id = p.student_fee_id
WHERE p.status = 'VERIFIED'
  AND COALESCE(f.amount_paid, 0) > COALESCE(f.amount_due, 0)
  AND COALESCE(f.amount_due, 0) > 0
  AND p.id <> (
    SELECT p2.id FROM payments p2
    WHERE p2.student_fee_id = p.student_fee_id AND p2.status = 'VERIFIED'
    ORDER BY p2.created_at, p2.id
    LIMIT 1
  );

DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT DISTINCT d.student_fee_id, f.fee_type, f.amount_due, f.amount_paid, f.student_id
    FROM _dup_receipts d JOIN fees f ON f.id = d.student_fee_id
  LOOP
    PERFORM audit_log_event(
      'fee.adjusted', 'fee', v_row.student_fee_id,
      'Duplicate receipt removed (' || v_row.fee_type || '): ₦' || v_row.amount_paid
        || ' → ₦' || v_row.amount_due,
      jsonb_build_object('amount_paid', v_row.amount_paid),
      jsonb_build_object('amount_paid', v_row.amount_due),
      jsonb_build_object(
        'student_id', v_row.student_id,
        'reason', 'One receipt per instalment predates part payment; the pair was one settled fee.'
      )
    );
  END LOOP;
END $$;

DELETE FROM payments WHERE id IN (SELECT payment_id FROM _dup_receipts);

UPDATE fees f
SET amount_paid = f.amount_due,
    payment_status = 'Paid'
WHERE f.id IN (SELECT DISTINCT student_fee_id FROM _dup_receipts);

-- SLSM-2627-0070's School Fees is deliberately untouched: it has no receipt to
-- delete and its 60,000 came from two hand adjustments, so whether 30,000 was
-- collected once or twice is a question for the person who entered it. The
-- guard above stops it growing further.
