-- app_settings held a live service-role JWT alongside a harmless URL, and
-- "app_settings_select" granted every authenticated user unconditional read.
-- Any of the 104 student accounts could read the key and bypass RLS entirely.
--
-- The key itself must be rotated in the dashboard; deleting the row does not
-- invalidate a copy someone already took.
--
-- Nothing in the app reads either row: app_settings appears only in the
-- generated types and as a URL-rewrite target in the migrate-storage function.

DELETE FROM public.app_settings WHERE key = 'service_role_key';

-- Reads now fall through to "app_settings_manage_admin" (FOR ALL, admin-only).
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;

COMMENT ON TABLE public.app_settings IS
  'Admin-only key/value settings. Never store credentials here - a service-role key '
  'stored in this table was readable by every student until 2026-08-19. Secrets belong '
  'in edge-function secrets (supabase secrets set).';
