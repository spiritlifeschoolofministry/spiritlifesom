
-- Fix: Change attendance INSERT policies from RESTRICTIVE to PERMISSIVE
-- so that EITHER student self-check-in OR staff mark will allow the insert

DROP POLICY IF EXISTS "Insert: own check-in" ON attendance;
DROP POLICY IF EXISTS "Mark: staff" ON attendance;

CREATE POLICY "Insert: own check-in" ON attendance
FOR INSERT TO authenticated
WITH CHECK (student_id = get_my_student_id());

CREATE POLICY "Mark: staff" ON attendance
FOR INSERT TO authenticated
WITH CHECK (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

-- Also fix UPDATE policy to be permissive so admin updates work
DROP POLICY IF EXISTS "Update: staff" ON attendance;

CREATE POLICY "Update: staff" ON attendance
FOR UPDATE TO authenticated
USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

-- Fix DELETE policy to be permissive
DROP POLICY IF EXISTS "Delete: staff" ON attendance;

CREATE POLICY "Delete: staff" ON attendance
FOR DELETE TO authenticated
USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));
