-- Staff preview students
--
-- Admins need a student's-eye view of the live cohort to verify changes, but
-- students.profile_id is UNIQUE and students.cohort_id is a single FK, so a
-- staff account can only ever sit in one cohort. The workable shape is a real
-- student row per admin, parked in the active cohort and flagged so it stays
-- out of rosters, directories and headcounts.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_staff_preview boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.is_staff_preview IS
  'True for staff-owned rows that exist only so an admin can view the student portal. Exclude from student lists, rosters, directories and counts.';

-- Partial index: every list query filters on `is_staff_preview = false`, and
-- the flagged rows are a handful, so index the exceptions rather than the table.
CREATE INDEX IF NOT EXISTS students_staff_preview_idx
  ON public.students (id) WHERE is_staff_preview;

-- The coursemates page reads classmate_directory, not students, so the flag has
-- to be applied inside the view or preview rows still show up in the directory.
-- Column list is unchanged (CREATE OR REPLACE requires that); only the filter
-- is new. LEFT JOIN + COALESCE keeps profiles that have no student row at all,
-- exactly as before.
CREATE OR REPLACE VIEW public.classmate_directory AS
SELECT
  p.id AS profile_id,
  p.first_name,
  p.last_name,
  (p.first_name || ' '::text) || p.last_name AS display_name,
  p.avatar_url,
  p.role,
  s.cohort_id,
  c.name AS cohort_name
FROM public.profiles p
  LEFT JOIN public.students s ON s.profile_id = p.id
  LEFT JOIN public.cohorts c ON s.cohort_id = c.id
WHERE COALESCE(s.is_staff_preview, false) = false;

GRANT SELECT ON public.classmate_directory TO authenticated;

-- Give an admin profile a preview student row in the active cohort.
--
-- student_code is derived from the profile id rather than left to
-- generate_student_code(): that function returns early when a code is present,
-- so a preview row never consumes a real SLSM-<cohort>-00NN sequence number.
-- The code is unique (students_student_code_unique) and stable per profile.
--
-- profile_complete_override skips the profile-completion dialog the student
-- dashboard shows for missing gender/age/learning_mode. learning_mode defaults
-- to Online because course materials are filtered by it — a NULL would make the
-- materials page look empty for reasons that have nothing to do with the data.
CREATE OR REPLACE FUNCTION public.ensure_staff_preview_student(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cohort uuid;
BEGIN
  SELECT id INTO v_cohort
  FROM cohorts WHERE is_active ORDER BY start_date DESC LIMIT 1;

  -- No active cohort yet — nothing sensible to preview.
  IF v_cohort IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO students (
    profile_id, cohort_id, admission_status, is_approved,
    is_staff_preview, student_code, profile_complete_override, learning_mode
  )
  VALUES (
    p_profile_id, v_cohort, 'ADMITTED', true,
    true,
    'SLSM-STAFF-' || upper(substr(replace(p_profile_id::text, '-', ''), 1, 8)),
    true, 'Online'
  )
  -- Never touch a row that already exists. A student later promoted to admin
  -- keeps their real cohort, code and history; their own row doubles as their
  -- preview. Only rows this function creates are flagged.
  ON CONFLICT (profile_id) DO NOTHING;
END;
$function$;

-- Keep it automatic: any account that becomes an admin gets a preview row.
CREATE OR REPLACE FUNCTION public.on_profile_admin_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin') THEN
    PERFORM public.ensure_staff_preview_student(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_profile_admin_preview ON public.profiles;
CREATE TRIGGER on_profile_admin_preview
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.on_profile_admin_preview();

-- Backfill. Both admins as of 2026-08-17 already hold student rows, parked in
-- the retired 2025/26 cohort and marked Graduate — they are the school's own
-- test accounts (they hold that cohort's first two student codes and have no
-- payments or exam attempts). Flag them and move them to the active cohort.
--
-- Listed by email rather than `WHERE role = 'admin'` on purpose: this statement
-- rewrites cohort_id and student_code, which would destroy real enrolment
-- history if a genuine student were ever promoted to admin and this migration
-- re-ran. Admins created after this point are handled by the trigger above,
-- which only ever inserts.
UPDATE public.students s
SET
  is_staff_preview          = true,
  cohort_id                 = (SELECT id FROM public.cohorts WHERE is_active ORDER BY start_date DESC LIMIT 1),
  admission_status          = 'ADMITTED',
  is_approved               = true,
  graduation_date           = NULL,
  profile_complete_override = true,
  learning_mode             = COALESCE(s.learning_mode, 'Online'),
  student_code              = 'SLSM-STAFF-' || upper(substr(replace(s.profile_id::text, '-', ''), 1, 8))
FROM public.profiles p
WHERE s.profile_id = p.id
  AND p.role = 'admin'
  AND lower(p.email) IN (
    'spiritlifeschoolofministry@gmail.com',
    'olaopa.olajide@gmail.com'
  )
  AND EXISTS (SELECT 1 FROM public.cohorts WHERE is_active);

-- And create rows for any admin that has none.
SELECT public.ensure_staff_preview_student(p.id)
FROM public.profiles p
WHERE p.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = p.id);
