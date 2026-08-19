-- Two policies named for admins carried no admin check: FOR ALL, USING (true).
-- RLS permissive policies are OR'd, so each one overrode every careful policy
-- beside it. Any authenticated student could write both tables.
--
-- course_materials: "Admins full access materials" (USING true / CHECK true)
--   made the cohort, admission-status and staff checks beside it irrelevant, for
--   reads AND writes. A student could read every cohort's materials and could
--   UPDATE or DELETE them. Only profile_complete_gate (AS RESTRICTIVE, so it
--   ANDs) still applied - and it passes for any student with a complete profile.
--
-- system_settings: "Admins manage settings" (USING true, WITH CHECK null - for a
--   FOR ALL policy Postgres then reuses USING for the check). This table is not
--   covered by profile_complete_gate, so any authenticated user could write the
--   'class_today' row: the check-in toggle, the window, and late_after.

-- course_materials: reads fall through to "Students view cohort materials" and
-- "View: admitted or staff"; writes fall through to "Manage: staff".
-- Only AdminMaterials.tsx writes this table, as an admin.
DROP POLICY IF EXISTS "Admins full access materials" ON public.course_materials;

-- system_settings: replace the open policy with the admin check its name implied.
-- Writers are AdminAttendance.tsx (class_today) and MaintenanceModeCard.tsx, both admin.
DROP POLICY IF EXISTS "Admins manage settings" ON public.system_settings;

CREATE POLICY "system_settings_manage_admin"
ON public.system_settings FOR ALL TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- "Allow public read system_settings" stays: StudentAttendance reads class_today
-- and MaintenanceGate reads maintenance mode before sign-in.
COMMENT ON TABLE public.system_settings IS
  'Key/value app settings. Readable by anon - never store anything sensitive here. '
  'Writes are admin-only as of 2026-08-19.';
