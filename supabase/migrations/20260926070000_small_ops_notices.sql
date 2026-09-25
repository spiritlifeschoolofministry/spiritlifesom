-- Three quieter jobs: an unfinished profile, a failed email, and an audit log
-- that will one day need attention.

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS notify_profile_incomplete boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_email_failures boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_audit_retention boolean NOT NULL DEFAULT true,
  -- How old an audit row must be before it is counted as worth dealing with.
  ADD COLUMN IF NOT EXISTS audit_retention_months integer NOT NULL DEFAULT 12
    CHECK (audit_retention_months BETWEEN 1 AND 120);

-- When this person was last asked to finish their profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_nudged_at timestamptz;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-profile-nudge');
  PERFORM cron.unschedule('whatsapp-email-failures');
  PERFORM cron.unschedule('whatsapp-audit-retention');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- #22. Students who never finished signing up.
--
-- An incomplete profile is a student who cannot be fully served and does not
-- know it -- and unlike most problems here it is entirely theirs to fix in
-- about a minute. Weekly, with a fortnight between asks per person.
SELECT cron.schedule('whatsapp-profile-nudge', '0 9 * * 2',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'profile_incomplete_sweep')
  );
  $$);

-- #36. Email that did not arrive.
--
-- Every admission decision, welcome and receipt goes out by email, and a
-- failure there is recorded in email_send_history and read by nobody. The
-- student simply never hears. Daily, silent unless something failed.
SELECT cron.schedule('whatsapp-email-failures', '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'email_failures')
  );
  $$);

-- #33. Audit rows past their retention age.
--
-- This reports; it does not delete. Audit logs are the record of who changed
-- what, they are the first thing wanted when something is disputed, and there
-- is currently no database backup anywhere -- so a scheduled job quietly
-- destroying them is the one automation this system should not have. When
-- there is a backup, or an export, deletion can be added deliberately.
--
-- Monthly, on the first, and silent until something actually ages out.
SELECT cron.schedule('whatsapp-audit-retention', '0 9 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'audit_retention')
  );
  $$);
