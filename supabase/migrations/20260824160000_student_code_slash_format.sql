-- Student codes move to SLSM/BBM/<cohort start year>/<serial>
--
-- The old shape, SLSM-2526-0003, wrote both ends of the academic year in two
-- digits each and padded the serial to four. The school's own paperwork uses
-- SLSM/BBM/2025/003: the programme in the middle, the year the cohort started
-- in full, three digits of serial. This brings the database in line with it.
--
-- Nobody is renumbered. A code keeps its serial and its year; only the spelling
-- changes, so certificates already printed still match their holder's record
-- digit for digit. Staff preview codes (SLSM-STAFF-...) are not student codes
-- and are left exactly as they are.

-- 1. Issue codes in the new shape -------------------------------------------

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
  cohort_year text;
  next_number integer;
  -- A code of either generation, ending in the serial. Legacy codes are still
  -- matched so a cohort that has any left cannot be handed a serial twice.
  code_pattern constant text := '^(SLSM/[A-Z]+/[0-9]{4}/|SLSM-[0-9]{4}-)[0-9]+$';
BEGIN
  IF p_cohort_id IS NULL THEN RETURN NULL; END IF;

  SELECT start_date INTO c_start FROM cohorts WHERE id = p_cohort_id;
  IF c_start IS NULL THEN RETURN NULL; END IF;

  cohort_year := to_char(c_start, 'YYYY');

  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_number FROM (
    SELECT regexp_replace(student_code, '.*[-/]([0-9]+)$', '\1')::integer AS seq
      FROM students
     WHERE cohort_id = p_cohort_id
       AND student_code ~ code_pattern
       AND (p_exclude_student IS NULL OR id <> p_exclude_student)
    UNION ALL
    SELECT regexp_replace(to_student_code, '.*[-/]([0-9]+)$', '\1')::integer
      FROM student_cohort_moves
     WHERE to_cohort_id = p_cohort_id
       AND to_student_code ~ code_pattern
    UNION ALL
    SELECT regexp_replace(from_student_code, '.*[-/]([0-9]+)$', '\1')::integer
      FROM student_cohort_moves
     WHERE from_cohort_id = p_cohort_id
       AND from_student_code ~ code_pattern
  ) taken;

  RETURN 'SLSM/BBM/' || cohort_year || '/' || lpad(next_number::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.next_student_code(uuid, uuid) IS
  'The next unused student code for a cohort, as SLSM/BBM/<cohort start year>/<serial>. Counts codes on students rows and codes recorded on either side of a cohort move, in either the current or the legacy spelling, so a serial is never issued twice.';

-- 2. Rewrite the codes already issued ----------------------------------------
--
-- The year comes out of the code itself rather than the cohort, so this is a
-- pure re-spelling: a student whose code says 2526 becomes 2025 whatever has
-- since been done to their cohort's dates. The check below refuses to run if
-- that ever disagrees with the cohort a student actually sits in.

DO $$
DECLARE
  v_mismatch integer;
BEGIN
  SELECT count(*) INTO v_mismatch
    FROM students s
    JOIN cohorts c ON c.id = s.cohort_id
   WHERE s.student_code ~ '^SLSM-[0-9]{4}-[0-9]+$'
     AND ('20' || substr(s.student_code, 6, 2)) <> to_char(c.start_date, 'YYYY');

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION
      '% student code(s) carry a year that is not their cohort''s start year; reformatting would move them', v_mismatch;
  END IF;
END;
$$;

UPDATE public.students
   SET student_code = 'SLSM/BBM/20' || substr(student_code, 6, 2) || '/'
     || lpad(regexp_replace(student_code, '^SLSM-[0-9]{4}-([0-9]+)$', '\1')::integer::text, 3, '0')
 WHERE student_code ~ '^SLSM-[0-9]{4}-[0-9]+$';

UPDATE public.student_cohort_moves
   SET from_student_code = 'SLSM/BBM/20' || substr(from_student_code, 6, 2) || '/'
     || lpad(regexp_replace(from_student_code, '^SLSM-[0-9]{4}-([0-9]+)$', '\1')::integer::text, 3, '0')
 WHERE from_student_code ~ '^SLSM-[0-9]{4}-[0-9]+$';

UPDATE public.student_cohort_moves
   SET to_student_code = 'SLSM/BBM/20' || substr(to_student_code, 6, 2) || '/'
     || lpad(regexp_replace(to_student_code, '^SLSM-[0-9]{4}-([0-9]+)$', '\1')::integer::text, 3, '0')
 WHERE to_student_code ~ '^SLSM-[0-9]{4}-[0-9]+$';

-- The code printed on an issued certificate is a snapshot. It is respelled too,
-- so a certificate verified online reads the same as the holder's portal.
UPDATE public.certificates
   SET student_code_at_issue = 'SLSM/BBM/20' || substr(student_code_at_issue, 6, 2) || '/'
     || lpad(regexp_replace(student_code_at_issue, '^SLSM-[0-9]{4}-([0-9]+)$', '\1')::integer::text, 3, '0')
 WHERE student_code_at_issue ~ '^SLSM-[0-9]{4}-[0-9]+$';
