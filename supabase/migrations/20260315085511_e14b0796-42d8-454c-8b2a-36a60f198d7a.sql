-- Fix: Allow students to view schedule entries with NULL course_id (generic class sessions)
DROP POLICY IF EXISTS "View: own cohort or staff" ON public.schedule;

CREATE POLICY "View: own cohort or staff" ON public.schedule
FOR SELECT TO public
USING (
  (auth.uid() IS NOT NULL) AND (
    (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]))
    OR (course_id IS NULL)
    OR (EXISTS (
      SELECT 1
      FROM students s
      JOIN courses c ON (schedule.course_id = c.id)
      WHERE s.profile_id = auth.uid() AND s.cohort_id = c.cohort_id
    ))
  )
);