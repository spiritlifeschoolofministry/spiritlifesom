-- A student who registered, did not graduate, and is coming back for the next
-- session had to register again from scratch. Nothing here moved them.
--
-- Changing students.cohort_id by hand -- which the admin profile page has
-- always allowed -- gets some of the way: on_student_fees_reconcile fires on
-- cohort_id, so the new session's fees are raised, and the old session's fees
-- keep their own cohort_id so they are not disturbed. What it does not do is
-- leave any record that the student was ever in the previous cohort, write off
-- what they owed on a session nobody is collecting on, or issue them a code for
-- the session they are now in.
--
-- So the move becomes one deliberate operation instead of a dropdown:
--
--   * the previous session is sealed -- every outstanding fee on that cohort is
--     waived, with a reason. Payments already recorded stay exactly where they
--     are, on the old cohort's rows, and nothing crosses into the new session:
--     no carried balance, no credit. A clean state on both sides. Nothing is
--     deleted -- payments.student_fee_id is ON DELETE SET NULL, so dropping a
--     paid fee row would orphan the receipt rather than remove it.
--   * the new session bills in full, handouts and all. A returning student is
--     billed as a new registration; admin waives individual rows case by case.
--   * a new student code is issued for the new cohort and the old one is kept
--     on the move record, so the student shows both: their current code, and
--     the code they were admitted under.
--   * the move itself is recorded -- who moved them, when, from where, why, and
--     what it cost -- in student_cohort_moves, which also becomes the answer to
--     "which sessions has this student been in", for the past-session blocks on
--     the grades and transcript pages.

-- 1. The record of a move ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_cohort_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  to_cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  from_student_code text,
  to_student_code text,
  reason text,
  fees_waived_count integer NOT NULL DEFAULT 0,
  fees_waived_amount numeric NOT NULL DEFAULT 0,
  fees_raised_count integer NOT NULL DEFAULT 0,
  fees_raised_amount numeric NOT NULL DEFAULT 0,
  moved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_cohort_moves_student_idx
  ON public.student_cohort_moves (student_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS student_cohort_moves_from_cohort_idx
  ON public.student_cohort_moves (from_cohort_id);

ALTER TABLE public.student_cohort_moves ENABLE ROW LEVEL SECURITY;

-- Read-only to everyone: the rows are written by move_student_to_cohort, which
-- is SECURITY DEFINER and so bypasses these policies. Deliberately no INSERT,
-- UPDATE or DELETE policy -- there is no legitimate path to editing a move
-- after the fact.
DROP POLICY IF EXISTS "Staff read all moves" ON public.student_cohort_moves;
CREATE POLICY "Staff read all moves" ON public.student_cohort_moves
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

DROP POLICY IF EXISTS "Students read their own moves" ON public.student_cohort_moves;
CREATE POLICY "Students read their own moves" ON public.student_cohort_moves
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
  );

GRANT SELECT ON public.student_cohort_moves TO authenticated;

COMMENT ON TABLE public.student_cohort_moves IS
  'One row per cohort move: who was moved, by whom, the codes either side, and what the move waived and raised. Also the enrollment history -- a student''s previous sessions are the from_cohort_id values here.';

-- 2. Student codes, in one place ---------------------------------------------
--
-- The numbering lived inside the generate_student_code trigger, where only an
-- INSERT could reach it. Lifted out so a move can ask for the next code in the
-- cohort it is moving the student into.
--
-- Codes recorded in student_cohort_moves count towards the maximum as well as
-- the ones on students rows. A student who leaves a cohort takes their code off
-- that cohort's roll, and without this the next arrival would be handed a code
-- that has already been printed on somebody's certificate.

CREATE OR REPLACE FUNCTION public.next_student_code(
  p_cohort_id uuid,
  p_exclude_student uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_start date;
  c_end date;
  cohort_short text;
  next_number integer;
BEGIN
  IF p_cohort_id IS NULL THEN RETURN NULL; END IF;

  SELECT start_date, end_date INTO c_start, c_end FROM cohorts WHERE id = p_cohort_id;
  IF c_start IS NULL OR c_end IS NULL THEN RETURN NULL; END IF;

  -- Two-digit start year + two-digit end year (2025-2026 -> "2526"), as before.
  cohort_short := lpad((EXTRACT(YEAR FROM c_start)::int % 100)::text, 2, '0')
               || lpad((EXTRACT(YEAR FROM c_end)::int   % 100)::text, 2, '0');

  -- A hand-typed code that does not end in digits would break the cast, so the
  -- pattern is checked as well as the prefix.
  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_number FROM (
    SELECT regexp_replace(student_code, '.*-(\d+)$', '\1')::integer AS seq
      FROM students
     WHERE cohort_id = p_cohort_id
       AND student_code LIKE 'SLSM-' || cohort_short || '-%'
       AND student_code ~ '-\d+$'
       AND (p_exclude_student IS NULL OR id <> p_exclude_student)
    UNION ALL
    SELECT regexp_replace(to_student_code, '.*-(\d+)$', '\1')::integer
      FROM student_cohort_moves
     WHERE to_cohort_id = p_cohort_id
       AND to_student_code LIKE 'SLSM-' || cohort_short || '-%'
       AND to_student_code ~ '-\d+$'
    UNION ALL
    SELECT regexp_replace(from_student_code, '.*-(\d+)$', '\1')::integer
      FROM student_cohort_moves
     WHERE from_cohort_id = p_cohort_id
       AND from_student_code LIKE 'SLSM-' || cohort_short || '-%'
       AND from_student_code ~ '-\d+$'
  ) taken;

  RETURN 'SLSM-' || cohort_short || '-' || lpad(next_number::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.next_student_code(uuid, uuid) IS
  'The next unused student code for a cohort. Counts codes on students rows and codes recorded on either side of a cohort move, so a code is never issued twice.';

-- Same behaviour as before for new students: generate on first assignment to a
-- cohort, never overwrite an existing code. Moving a student is the one thing
-- that replaces a code, and it does that explicitly.
CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cohort_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.student_code IS NOT NULL AND NEW.student_code <> '' THEN
    RETURN NEW;
  END IF;

  NEW.student_code := COALESCE(next_student_code(NEW.cohort_id, NEW.id), NEW.student_code);
  RETURN NEW;
END;
$$;

-- 3. The move ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_student_to_cohort(
  p_student_id uuid,
  p_to_cohort uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student students%ROWTYPE;
  v_from_name text;
  v_to_name text;
  v_open_exams integer;
  v_waived_count integer := 0;
  v_waived_amount numeric := 0;
  v_before_ids uuid[];
  v_raised_count integer := 0;
  v_raised_amount numeric := 0;
  v_new_code text;
  v_move_id uuid;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can move a student to another cohort';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That student no longer exists';
  END IF;

  SELECT name INTO v_to_name FROM cohorts WHERE id = p_to_cohort;
  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'That cohort does not exist';
  END IF;

  IF v_student.cohort_id IS NOT DISTINCT FROM p_to_cohort THEN
    RAISE EXCEPTION 'This student is already in %', v_to_name;
  END IF;

  -- reconcile_student_fees returns early for anyone who is not ADMITTED, so a
  -- move made in another status would seal the old session and raise nothing
  -- for the new one, leaving the student enrolled and unbilled. Say so instead.
  IF COALESCE(v_student.admission_status, '') <> 'ADMITTED' THEN
    RAISE EXCEPTION 'Admit this student first — a student in status "%" would be moved across without being billed for the new session',
      COALESCE(v_student.admission_status, 'none');
  END IF;

  -- The move revokes their read access to the old cohort's exams. Doing that
  -- to somebody mid-paper loses the sitting.
  SELECT count(*) INTO v_open_exams
  FROM exam_attempts a
  JOIN exams e ON e.id = a.exam_id
  WHERE a.student_id = p_student_id
    AND a.status = 'in_progress'
    AND e.cohort_id = v_student.cohort_id;

  IF v_open_exams > 0 THEN
    RAISE EXCEPTION 'This student has an exam in progress. Wait for it to be submitted or closed before moving them';
  END IF;

  SELECT name INTO v_from_name FROM cohorts WHERE id = v_student.cohort_id;

  -- Seal the previous session. Scoped by the fee's own cohort_id, which is the
  -- session the fee was raised for and does not move when the student does.
  IF v_student.cohort_id IS NOT NULL THEN
    WITH done AS (
      UPDATE fees f
      SET waived = true,
          waive_reason = COALESCE(
            f.waive_reason,
            'Moved to ' || v_to_name || ' — ' || COALESCE(v_from_name, 'previous session') || ' written off'
          )
      WHERE f.student_id = p_student_id
        AND f.cohort_id = v_student.cohort_id
        AND COALESCE(f.waived, false) = false
        AND COALESCE(f.amount_due, 0) > COALESCE(f.amount_paid, 0)
      RETURNING COALESCE(f.amount_due, 0) - COALESCE(f.amount_paid, 0) AS balance
    )
    SELECT count(*), COALESCE(sum(balance), 0) INTO v_waived_count, v_waived_amount FROM done;
  END IF;

  -- A student who has been in this cohort before may already have rows on it,
  -- from a stint that was itself written off. reconcile_student_fees is
  -- ON CONFLICT DO NOTHING, so those are left as they are -- waived stays
  -- waived -- and only what is missing is raised. The rows that already exist
  -- are noted first so the figure reported is what this move actually billed
  -- and not what the student's record adds up to.
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_before_ids
  FROM fees WHERE student_id = p_student_id AND cohort_id = p_to_cohort;

  v_new_code := next_student_code(p_to_cohort, p_student_id);

  -- Fires on_student_fees_reconcile, which raises the new cohort's fees in
  -- full. student_code is set here rather than left to the trigger, which never
  -- overwrites a code that already exists.
  UPDATE students
  SET cohort_id = p_to_cohort,
      student_code = COALESCE(v_new_code, student_code)
  WHERE id = p_student_id;

  SELECT count(*), COALESCE(sum(COALESCE(amount_due, 0)), 0)
    INTO v_raised_count, v_raised_amount
  FROM fees
  WHERE student_id = p_student_id
    AND cohort_id = p_to_cohort
    AND NOT (id = ANY (v_before_ids));

  INSERT INTO student_cohort_moves (
    student_id, from_cohort_id, to_cohort_id, from_student_code, to_student_code,
    reason, fees_waived_count, fees_waived_amount, fees_raised_count,
    fees_raised_amount, moved_by
  ) VALUES (
    p_student_id, v_student.cohort_id, p_to_cohort, v_student.student_code,
    COALESCE(v_new_code, v_student.student_code), NULLIF(btrim(COALESCE(p_reason, '')), ''),
    v_waived_count, v_waived_amount, v_raised_count, v_raised_amount,
    auth.uid()
  )
  RETURNING id INTO v_move_id;

  PERFORM audit_log_event(
    'student.cohort_moved', 'student', p_student_id,
    'Moved from ' || COALESCE(v_from_name, 'no cohort') || ' to ' || v_to_name
      || CASE WHEN v_waived_count > 0
              THEN ', ₦' || v_waived_amount || ' written off' ELSE '' END,
    jsonb_build_object('cohort_id', v_student.cohort_id, 'student_code', v_student.student_code),
    jsonb_build_object('cohort_id', p_to_cohort, 'student_code', COALESCE(v_new_code, v_student.student_code)),
    jsonb_build_object(
      'move_id', v_move_id,
      'reason', p_reason,
      'fees_waived_count', v_waived_count,
      'fees_waived_amount', v_waived_amount,
      'fees_raised_count', v_raised_count,
      'fees_raised_amount', v_raised_amount
    )
  );

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'from_cohort', v_from_name,
    'to_cohort', v_to_name,
    'previous_student_code', v_student.student_code,
    'student_code', COALESCE(v_new_code, v_student.student_code),
    'fees_waived_count', v_waived_count,
    'fees_waived_amount', v_waived_amount,
    'fees_raised_count', v_raised_count,
    'fees_raised_amount', v_raised_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_student_to_cohort(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_student_to_cohort(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_student_to_cohort(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.move_student_to_cohort(uuid, uuid, text) IS
  'Moves one admitted student to another cohort: waives what they owed on the previous session, issues a code for the new one, lets reconcile_student_fees bill the new session in full, and records the move. Refuses if they are not ADMITTED or have an exam in progress.';

-- 4. The same thing for a whole group ----------------------------------------
--
-- At rollover this is a list, not one student. Each is moved in its own
-- subtransaction so that one refusal -- an unsubmitted exam, a pending
-- admission -- reports itself and the rest still go through.

CREATE OR REPLACE FUNCTION public.move_students_to_cohort(
  p_student_ids uuid[],
  p_to_cohort uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (student_id uuid, moved boolean, detail jsonb, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can move students to another cohort';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_student_ids, '{}'::uuid[]) LOOP
    BEGIN
      RETURN QUERY SELECT v_id, true, move_student_to_cohort(v_id, p_to_cohort, p_reason), NULL::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_id, false, NULL::jsonb, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_students_to_cohort(uuid[], uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_students_to_cohort(uuid[], uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_students_to_cohort(uuid[], uuid, text) TO authenticated;

COMMENT ON FUNCTION public.move_students_to_cohort(uuid[], uuid, text) IS
  'Moves a list of students to a cohort, one subtransaction each: a student who cannot be moved is reported in the result rather than failing the batch.';

-- 5. The moves that already happened -----------------------------------------
--
-- Students were being promoted by hand long before this existed, so their
-- history is blank. A fee row is per session, so a student holding fees on a
-- cohort they are not in is a student who was moved out of it -- enough to
-- reconstruct the "from" side. The codes are left null except where the code
-- they still carry belongs to the cohort they came from, which is the case for
-- everyone promoted before today, since nothing was reissuing codes.

INSERT INTO public.student_cohort_moves (
  student_id, from_cohort_id, to_cohort_id, from_student_code, to_student_code,
  reason, moved_at
)
SELECT s.id,
       old.id,
       s.cohort_id,
       CASE WHEN s.student_code LIKE 'SLSM-' || old.short || '-%' THEN s.student_code END,
       s.student_code,
       'Backfilled from fee history — moved before moves were recorded',
       COALESCE(old.end_date::timestamptz, now())
FROM students s
JOIN (
  SELECT c.id,
         c.end_date,
         lpad((EXTRACT(YEAR FROM c.start_date)::int % 100)::text, 2, '0')
           || lpad((EXTRACT(YEAR FROM c.end_date)::int % 100)::text, 2, '0') AS short
  FROM cohorts c
) old ON old.id <> s.cohort_id
WHERE s.cohort_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM fees f WHERE f.student_id = s.id AND f.cohort_id = old.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_cohort_moves m
    WHERE m.student_id = s.id AND m.from_cohort_id = old.id AND m.to_cohort_id = s.cohort_id
  );
