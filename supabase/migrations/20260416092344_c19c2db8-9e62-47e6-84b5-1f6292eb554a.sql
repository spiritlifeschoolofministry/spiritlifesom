
-- =============================================
-- 1. FIX PROFILES: Remove all policies, recreate clean ones
-- =============================================
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read their own profile" ON profiles;
DROP POLICY IF EXISTS "Allow students to view classmate profiles" ON profiles;
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON profiles;
DROP POLICY IF EXISTS "Only admins can update roles" ON profiles;
DROP POLICY IF EXISTS "Public Directory Access" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users view own or admins view all" ON profiles;
DROP POLICY IF EXISTS "Admins change roles" ON profiles;

-- Authenticated users can read all profiles (needed for coursemates, directory)
CREATE POLICY "profiles_select_authenticated"
ON profiles FOR SELECT TO authenticated
USING (true);

-- Users can update their own profile (non-role fields handled by app)
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admins can update any profile (for role changes etc)
CREATE POLICY "profiles_update_admin"
ON profiles FOR UPDATE TO authenticated
USING (get_my_role() = 'admin');

-- Insert policy for trigger (service role) and authenticated
CREATE POLICY "profiles_insert"
ON profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- =============================================
-- 2. FIX STUDENTS: Remove dangerous blanket UPDATE policies
-- =============================================
DROP POLICY IF EXISTS "Allow approval updates via admin link" ON students;
DROP POLICY IF EXISTS "Allow authenticated updates" ON students;
DROP POLICY IF EXISTS "Allow public approval via link" ON students;
DROP POLICY IF EXISTS "Enable update for approval link" ON students;
DROP POLICY IF EXISTS "Public approval update" ON students;
DROP POLICY IF EXISTS "Allow students to see student-cohort mapping" ON students;
DROP POLICY IF EXISTS "Deny anonymous to students" ON students;
DROP POLICY IF EXISTS "Students see own sensitive data" ON students;
DROP POLICY IF EXISTS "Users can read own student record" ON students;
DROP POLICY IF EXISTS "View: own or staff" ON students;
DROP POLICY IF EXISTS "Update: admin any" ON students;
DROP POLICY IF EXISTS "Update: own record" ON students;
DROP POLICY IF EXISTS "Insert: registration" ON students;

-- SELECT: own record or staff
CREATE POLICY "students_select"
ON students FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR get_my_role() IN ('admin', 'teacher')
);

-- Allow unauthenticated SELECT for active-cohort students (needed for public directory view)
-- Actually keep it authenticated-only

-- INSERT: own record only
CREATE POLICY "students_insert_own"
ON students FOR INSERT TO authenticated
WITH CHECK (profile_id = auth.uid());

-- UPDATE: own record
CREATE POLICY "students_update_own"
ON students FOR UPDATE TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- UPDATE: admin can update any
CREATE POLICY "students_update_admin"
ON students FOR UPDATE TO authenticated
USING (get_my_role() = 'admin');

-- DELETE: admin only
CREATE POLICY "students_delete_admin"
ON students FOR DELETE TO authenticated
USING (get_my_role() = 'admin');

-- =============================================
-- 3. ENABLE RLS ON PAYMENTS
-- =============================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 4. FIX APP_SETTINGS: admin-only write
-- =============================================
CREATE POLICY "app_settings_select"
ON app_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "app_settings_manage_admin"
ON app_settings FOR ALL TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- =============================================
-- 5. FIX EMAIL_QUEUE: admin/service only
-- =============================================
CREATE POLICY "email_queue_admin"
ON email_queue FOR ALL TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- =============================================
-- 6. FIX FEE_STRUCTURES: replace blanket policy
-- =============================================
DROP POLICY IF EXISTS "Admins manage fees" ON fee_structures;

CREATE POLICY "fee_structures_manage_admin"
ON fee_structures FOR ALL TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- =============================================
-- 7. FIX ASSIGNMENTS: replace blanket ALL policy
-- =============================================
DROP POLICY IF EXISTS "Admins manage assignments" ON assignments;

-- Keep "Manage: staff" which is already properly scoped

-- =============================================
-- 8. FIX SCHOOL_EVENTS: replace blanket ALL
-- =============================================
DROP POLICY IF EXISTS "Admins manage events" ON school_events;

-- Keep "Admins can edit events" which checks profile role

-- =============================================
-- 9. FIX handle_new_user: hardcode student role
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, middle_name, phone, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'middle_name',
    new.raw_user_meta_data->>'phone',
    'student'  -- NEVER trust client-supplied role
  );
  RETURN new;
END;
$$;
