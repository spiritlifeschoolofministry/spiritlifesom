-- Course sharing between cohorts was only half wired. course_cohorts
-- (20260516103000) records which cohorts a course appears in, and admin/Courses
-- has had Share/Unshare buttons all along -- but every student-facing query
-- still read courses by their home cohort_id alone, so a course shared into a
-- student's cohort never appeared on their screens. Admin/Materials was the one
-- surface that honoured the join table.
--
-- Fixed in four parts:
--
--   1. course_cohorts becomes a proper offerings table. The same course run in
--      two cohorts rarely has the same lecturer, semester slot or timetable, so
--      each share can carry its own lecturer, semester, start_date and
--      is_completed. NULL means "as the course says".
--   2. A view, course_offerings, is the one answer to "which courses does this
--      cohort see", home and shared alike, overrides applied. The app's
--      student pages read this instead of courses.cohort_id.
--   3. Unsharing is guarded. A bare DELETE on course_cohorts could pull a
--      course out from under a cohort that already has materials, exams,
--      scheduled classes or assignments pointing at it there. The delete now
--      refuses while any of those exist, and refuses to remove a course's home
--      cohort row outright.
--   4. RLS is tightened: course shares are readable by signed-in users, not by
--      the anonymous role, which never needed them.

-- 1. Per-offering overrides ---------------------------------------------------

ALTER TABLE public.course_cohorts
  ADD COLUMN IF NOT EXISTS lecturer text,
  ADD COLUMN IF NOT EXISTS semester integer,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS is_completed boolean;

ALTER TABLE public.course_cohorts
  DROP CONSTRAINT IF EXISTS course_cohorts_semester_check;
ALTER TABLE public.course_cohorts
  ADD CONSTRAINT course_cohorts_semester_check
  CHECK (semester IS NULL OR semester IN (1, 2));

COMMENT ON COLUMN public.course_cohorts.lecturer IS
  'Lecturer for this course in this cohort. NULL inherits courses.lecturer.';
COMMENT ON COLUMN public.course_cohorts.semester IS
  'Semester this course runs in for this cohort. NULL inherits courses.semester.';
COMMENT ON COLUMN public.course_cohorts.start_date IS
  'Start date for this course in this cohort. NULL inherits courses.start_date.';
COMMENT ON COLUMN public.course_cohorts.is_completed IS
  'Whether this course is finished for this cohort. NULL inherits courses.is_completed.';

-- Every course with a home cohort must have its row here. 20260516103000
-- backfilled the courses that existed then; courses created since only have
-- the column. Re-run, and keep it true from now on with a trigger.

INSERT INTO public.course_cohorts (course_id, cohort_id)
SELECT id, cohort_id FROM public.courses
WHERE cohort_id IS NOT NULL
ON CONFLICT (course_id, cohort_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_home_course_cohort()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cohort_id IS NOT NULL THEN
    INSERT INTO course_cohorts (course_id, cohort_id)
    VALUES (NEW.id, NEW.cohort_id)
    ON CONFLICT (course_id, cohort_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_course_home_cohort ON public.courses;
CREATE TRIGGER on_course_home_cohort
  AFTER INSERT OR UPDATE OF cohort_id ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_home_course_cohort();

COMMENT ON FUNCTION public.ensure_home_course_cohort() IS
  'Keeps a course_cohorts row for every course''s home cohort, so course_offerings is complete without special-casing courses.cohort_id.';

-- 2. The one answer to "which courses does this cohort see" -------------------
--
-- security_invoker: the view carries the caller''s own rights to courses and
-- course_cohorts rather than the view owner''s.

CREATE OR REPLACE VIEW public.course_offerings
WITH (security_invoker = true) AS
SELECT
  c.id,
  cc.cohort_id,
  c.code,
  c.title,
  c.description,
  c.feedback_open,
  COALESCE(cc.lecturer, c.lecturer)         AS lecturer,
  COALESCE(cc.semester, c.semester)         AS semester,
  COALESCE(cc.start_date, c.start_date)     AS start_date,
  COALESCE(cc.is_completed, c.is_completed) AS is_completed,
  c.cohort_id                               AS home_cohort_id,
  (cc.cohort_id IS DISTINCT FROM c.cohort_id) AS is_shared
FROM public.course_cohorts cc
JOIN public.courses c ON c.id = cc.course_id;

GRANT SELECT ON public.course_offerings TO authenticated;

COMMENT ON VIEW public.course_offerings IS
  'Every course a cohort sees: its own courses plus the ones shared into it, with per-offering lecturer/semester/start_date/is_completed overrides applied. is_shared marks courses whose home is another cohort.';

-- 3. Unshare only what nothing depends on -------------------------------------
--
-- Same principle as reconcile_student_fees: a row is only removed when it is
-- provably untouched. Materials, exams, scheduled classes and assignments all
-- carry (course_id, cohort_id) pairs; while any of them tie this course to
-- this cohort, pulling the share would strand them pointing at a course the
-- cohort can no longer see.
--
-- The guard steps aside during cascades (course or cohort deleted: the parent
-- row is already gone when the cascade reaches us, and the dependents are
-- going with it) so it only ever blocks a hand-made unshare.

CREATE OR REPLACE FUNCTION public.guard_course_unshare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_blockers text[] := '{}';
  v_n integer;
BEGIN
  -- Cascade from a deleted course or cohort: let it through.
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = OLD.course_id)
     OR NOT EXISTS (SELECT 1 FROM cohorts WHERE id = OLD.cohort_id) THEN
    RETURN OLD;
  END IF;

  -- A course's home cohort row is not a share and cannot be removed; move the
  -- course to another cohort instead.
  IF EXISTS (SELECT 1 FROM courses WHERE id = OLD.course_id AND cohort_id = OLD.cohort_id) THEN
    RAISE EXCEPTION 'This is the course''s own cohort, not a share. Edit the course and change its cohort instead.';
  END IF;

  SELECT count(*) INTO v_n FROM course_materials
   WHERE course_id = OLD.course_id AND cohort_id = OLD.cohort_id;
  IF v_n > 0 THEN v_blockers := v_blockers || (v_n || ' material(s)'); END IF;

  SELECT count(*) INTO v_n FROM exams
   WHERE course_id = OLD.course_id AND cohort_id = OLD.cohort_id;
  IF v_n > 0 THEN v_blockers := v_blockers || (v_n || ' exam(s)'); END IF;

  SELECT count(*) INTO v_n FROM schedule
   WHERE course_id = OLD.course_id AND cohort_id = OLD.cohort_id;
  IF v_n > 0 THEN v_blockers := v_blockers || (v_n || ' scheduled class(es)'); END IF;

  SELECT count(*) INTO v_n FROM assignments
   WHERE course_id = OLD.course_id AND cohort_id = OLD.cohort_id;
  IF v_n > 0 THEN v_blockers := v_blockers || (v_n || ' assignment(s)'); END IF;

  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION 'This cohort still has % for this course. Move or delete those first, then unshare.',
      array_to_string(v_blockers, ', ');
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_course_unshare_guard ON public.course_cohorts;
CREATE TRIGGER on_course_unshare_guard
  BEFORE DELETE ON public.course_cohorts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_course_unshare();

COMMENT ON FUNCTION public.guard_course_unshare() IS
  'Refuses to unshare a course from a cohort that still has materials, exams, scheduled classes or assignments for it there, and refuses to delete a course''s home cohort row. Steps aside during course/cohort cascades.';

-- 4. Shares are for signed-in users, not the anonymous role --------------------

REVOKE SELECT ON public.course_cohorts FROM anon;
DROP POLICY IF EXISTS "Anyone can view course_cohorts" ON public.course_cohorts;
DROP POLICY IF EXISTS "Signed-in users read course shares" ON public.course_cohorts;
CREATE POLICY "Signed-in users read course shares"
  ON public.course_cohorts FOR SELECT
  TO authenticated
  USING (true);
