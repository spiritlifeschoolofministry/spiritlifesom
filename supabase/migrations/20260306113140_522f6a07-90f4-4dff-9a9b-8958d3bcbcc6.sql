
-- Allow admin/teacher to DELETE attendance records
CREATE POLICY "Delete: staff"
ON public.attendance
FOR DELETE
TO authenticated
USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

-- Allow students to INSERT their own attendance (self-check-in)
CREATE POLICY "Insert: own check-in"
ON public.attendance
FOR INSERT
TO authenticated
WITH CHECK (student_id = get_my_student_id());
