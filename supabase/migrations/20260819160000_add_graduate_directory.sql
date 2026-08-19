-- The graduate wall has never worked. student/Graduates.tsx queries the
-- students table filtered to admission_status = 'Graduate', but students_select
-- is (profile_id = auth.uid()) OR staff - a student can only read their own row.
-- So the page returned 0 of 27 graduates for every student, showing the empty
-- "No graduates found" state.
--
-- Fixed the same way the coursemate list works: an owner-privileged view, so
-- one deliberate query is the access path rather than opening up the students
-- table. Exposes names, photos and cohort only - no email, phone or admission
-- detail.

CREATE OR REPLACE VIEW public.graduate_directory AS
  SELECT s.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    s.cohort_id,
    c.name AS cohort_name
  FROM students s
    JOIN profiles p ON p.id = s.profile_id
    LEFT JOIN cohorts c ON c.id = s.cohort_id
  WHERE COALESCE(s.is_staff_preview, false) = false
    AND s.admission_status = 'Graduate';

-- Signed-in users only: the alumni wall lives behind StudentLayout.
GRANT SELECT ON public.graduate_directory TO authenticated;

COMMENT ON VIEW public.graduate_directory IS
  'Alumni wall for signed-in users: name, photo and cohort of graduates. Runs with '
  'owner privileges because students_select restricts students to their own row.';
