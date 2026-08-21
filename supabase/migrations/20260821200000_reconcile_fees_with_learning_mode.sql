-- Fee assignment has only ever been a snapshot. Two triggers fire once each --
-- when a fee structure is inserted, and when a student crosses into ADMITTED --
-- and nothing reconciles afterwards. A student whose learning_mode is filled in
-- or changed later keeps whatever set of fees they had at that instant.
--
-- What that cost, as of 2026-08-21:
--
--   * 7 Online students in 2026/2027 had no School Fees row (30,000 each).
--     All 7 registered 2026-04-20..04-29. School Fees {Online} was created
--     2026-05-16, and requested_learning_mode only arrived 2026-05-15 -- so at
--     the moment the structure's trigger ran, their learning_mode was still
--     NULL. `NULL = ANY('{Online}')` is NULL, not true, so they were skipped.
--     Their mode was set afterwards via /complete-profile and nothing re-ran.
--   * 1 Physical student was missing SLM104 HANDOUT for the same reason.
--   * 5 Online students carried SLM104 HANDOUT {Physical} -- billed 350 for a
--     booklet they never receive. This is exactly the SLM101 bug fixed in
--     20260820120000, which corrected that one structure but left its siblings.
--
-- Fixed here in two parts: a reconcile function wired to the events that
-- actually change the answer, and a one-time repair of the rows above.

-- 1. Does a structure apply to a student's mode? -----------------------------
--
-- Matching stays literal, per 20260819140000: Hybrid does not implicitly match
-- Physical or Online. A NULL student mode matches only '{All}'.

CREATE OR REPLACE FUNCTION public.fee_structure_applies(p_modes text[], p_student_mode text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'All' = ANY (p_modes) OR p_student_mode = ANY (p_modes);
$$;

COMMENT ON FUNCTION public.fee_structure_applies(text[], text) IS
  'True when a fee structure targeting p_modes applies to a student whose learning mode is p_student_mode. Literal match; {All} matches everyone.';

-- 2. Reconcile one student against their cohort's structures -----------------
--
-- Additive half is safe: a fee they qualify for and do not have gets created.
--
-- Subtractive half is deliberately timid, because deleting a fees row is a
-- financial act and payments.student_fee_id is ON DELETE SET NULL -- deleting a
-- fee that a receipt points at does not remove the receipt, it orphans it, and
-- admin/Fees then refuses to verify it ("Assign this receipt to a fee first").
-- So a row is only removed when it is provably untouched: nothing paid, not
-- waived, and no payments row of any status attached.
--
-- Note this trusts fee_structures.learning_modes as the source of truth. A
-- structure that is mis-targeted (a handout the students in question actually
-- do receive) will now quietly un-bill them on their next profile edit. The
-- fix for that case is widening the structure, not loosening this guard.

CREATE OR REPLACE FUNCTION public.reconcile_student_fees(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student students%ROWTYPE;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND OR v_student.admission_status <> 'ADMITTED' OR v_student.cohort_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
  SELECT v_student.id, v_student.cohort_id, fs.fee_name, fs.amount, 0, 'Unpaid'
  FROM fee_structures fs
  WHERE fs.cohort_id = v_student.cohort_id
    AND fee_structure_applies(fs.learning_modes, v_student.learning_mode)
  ON CONFLICT (student_id, fee_type, cohort_id) DO NOTHING;

  DELETE FROM fees f
  WHERE f.student_id = v_student.id
    AND f.cohort_id = v_student.cohort_id
    AND COALESCE(f.amount_paid, 0) = 0
    AND COALESCE(f.waived, false) = false
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_fee_id = f.id)
    AND EXISTS (
      SELECT 1 FROM fee_structures fs
      WHERE fs.cohort_id = v_student.cohort_id
        AND fs.fee_name = f.fee_type
        AND NOT fee_structure_applies(fs.learning_modes, v_student.learning_mode)
    );
END;
$$;

COMMENT ON FUNCTION public.reconcile_student_fees(uuid) IS
  'Brings one admitted student''s fees rows in line with their cohort''s structures and their learning mode. Adds what applies; removes only untouched rows that no longer apply (nothing paid, not waived, no receipt attached).';

-- 3. Re-run it when the answer can change -----------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_fees_on_student_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM reconcile_student_fees(NEW.id);
  RETURN NEW;
END;
$$;

-- Replaces on_student_admitted_create_fees, which fired only on the crossing
-- into ADMITTED and so missed every later mode correction.
DROP TRIGGER IF EXISTS on_student_admitted_create_fees ON public.students;
DROP TRIGGER IF EXISTS on_student_fees_reconcile ON public.students;
CREATE TRIGGER on_student_fees_reconcile
  AFTER UPDATE OF admission_status, learning_mode, cohort_id ON public.students
  FOR EACH ROW
  WHEN (
    NEW.admission_status = 'ADMITTED'
    AND (
      OLD.admission_status IS DISTINCT FROM NEW.admission_status
      OR OLD.learning_mode IS DISTINCT FROM NEW.learning_mode
      OR OLD.cohort_id IS DISTINCT FROM NEW.cohort_id
    )
  )
  EXECUTE FUNCTION public.reconcile_fees_on_student_change();

-- A structure's own targeting can change too. 20260820120000 retargeted SLM101
-- by hand and had to clean up the stale rows by hand as well; this closes that
-- loop. Amount changes are deliberately NOT reconciled -- rewriting amount_due
-- under a student who has already part-paid is not something a trigger should
-- decide.
CREATE OR REPLACE FUNCTION public.reconcile_fees_on_structure_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  FOR v_student_id IN
    SELECT id FROM students
    WHERE cohort_id = NEW.cohort_id AND admission_status = 'ADMITTED'
  LOOP
    PERFORM reconcile_student_fees(v_student_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_fee_structure_created ON public.fee_structures;
DROP TRIGGER IF EXISTS on_fee_structure_reconcile ON public.fee_structures;
CREATE TRIGGER on_fee_structure_reconcile
  AFTER INSERT OR UPDATE OF learning_modes, cohort_id ON public.fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_fees_on_structure_change();

-- 4. One-time repair of the existing rows ------------------------------------

-- 4a. The 8 fees that were owed and never created.
INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
SELECT s.id, s.cohort_id, fs.fee_name, fs.amount, 0, 'Unpaid'
FROM students s
JOIN fee_structures fs ON fs.cohort_id = s.cohort_id
WHERE s.admission_status = 'ADMITTED'
  AND fee_structure_applies(fs.learning_modes, s.learning_mode)
ON CONFLICT (student_id, fee_type, cohort_id) DO NOTHING;

-- 4b. The phantom handout charges, under the guard from section 2.
--
-- Hybrid is excluded on purpose. The single admitted Hybrid student
-- (SLSM-2627-0073) holds all 5 Physical handouts, 1,500 unpaid, and a Hybrid
-- student plausibly does attend in person and receive the booklets. Whether
-- those structures should read {Physical,Hybrid} is a pricing decision, so
-- their rows are left standing for staff to rule on rather than deleted here.
DELETE FROM fees f
USING students s
WHERE s.id = f.student_id
  AND s.admission_status = 'ADMITTED'
  AND s.learning_mode <> 'Hybrid'
  AND COALESCE(f.amount_paid, 0) = 0
  AND COALESCE(f.waived, false) = false
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_fee_id = f.id)
  AND EXISTS (
    SELECT 1 FROM fee_structures fs
    WHERE fs.cohort_id = f.cohort_id
      AND fs.fee_name = f.fee_type
      AND NOT fee_structure_applies(fs.learning_modes, s.learning_mode)
  );

-- Rows knowingly left alone by 4b, all Online students holding a {Physical}
-- handout that has already been paid for: 2x SLM101 and 2x SLM104 HANDOUT.
-- Same call as 20260820120000 -- the payment stays on record.
