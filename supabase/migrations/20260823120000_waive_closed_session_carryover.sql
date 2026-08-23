-- A closed session's unpaid fees were still being counted as money owed in the
-- new one.
--
-- 20260821160000 waived what was outstanding on 2025/2026, but scoped the
-- write-off by whose fee it is -- students still sitting in that cohort -- and
-- said so deliberately: "students who were moved on into a later cohort keep
-- their balances". That is the carry. A student promoted into 2026/2027 keeps
-- their 2025/2026 fees rows (reconcile_student_fees only ever deletes rows for
-- the cohort it is reconciling), and every screen that attributes a fee by the
-- student's *current* cohort then reads those old balances as 2026/2027 debt.
--
-- The session is closed and nobody is collecting on it, so the balance is
-- waived wherever it sits. Scoped by the fee's own cohort_id this time, which
-- is the session the fee was raised for and does not move when the student
-- does. Waived, not deleted: the fee, its original amount and any payment
-- already recorded all stay on file, and the fees audit trigger records the
-- change.

DO $$
DECLARE
  v_active uuid;
  v_waived int;
  v_orphans int;
  v_amount numeric;
BEGIN
  -- The live session, by the flag first and the calendar second. Never waive
  -- anything belonging to it.
  SELECT id INTO v_active
  FROM public.cohorts
  ORDER BY COALESCE(is_active, false) DESC, start_date DESC
  LIMIT 1;

  WITH closed AS (
    SELECT id FROM public.cohorts
    WHERE id IS DISTINCT FROM v_active
      AND COALESCE(is_active, false) = false
      AND end_date < CURRENT_DATE
  ), done AS (
    UPDATE public.fees f
    SET waived = true,
        waive_reason = COALESCE(f.waive_reason, 'Session closed — balance written off')
    WHERE COALESCE(f.waived, false) = false
      AND COALESCE(f.amount_due, 0) > COALESCE(f.amount_paid, 0)
      AND f.cohort_id IN (SELECT id FROM closed)
    RETURNING COALESCE(f.amount_due, 0) - COALESCE(f.amount_paid, 0) AS balance
  )
  SELECT count(*), COALESCE(sum(balance), 0) INTO v_waived, v_amount FROM done;

  RAISE NOTICE 'Waived % fee row(s) from closed sessions, totalling %', v_waived, v_amount;

  -- Fees with no cohort_id at all cannot be attributed to a session, so they
  -- are left alone rather than guessed at from their created_at. If any are
  -- outstanding they will still show against whichever cohort their student is
  -- in now, so say how much is in that state instead of writing it off quietly.
  SELECT count(*), COALESCE(sum(COALESCE(amount_due, 0) - COALESCE(amount_paid, 0)), 0)
    INTO v_orphans, v_amount
  FROM public.fees
  WHERE cohort_id IS NULL
    AND COALESCE(waived, false) = false
    AND COALESCE(amount_due, 0) > COALESCE(amount_paid, 0);

  IF v_orphans > 0 THEN
    RAISE NOTICE 'Left alone: % outstanding fee row(s) with no cohort_id, totalling % — these still count against the student''s current session', v_orphans, v_amount;
  END IF;
END $$;
