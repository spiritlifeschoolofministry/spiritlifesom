-- The quota and failure check, daily.
--
-- A free-tier project that reaches its limit does not slow down -- it starts
-- refusing writes, and on this system that means a student cannot submit a
-- paper. So the warning fires well below the limit, while there is still room
-- to delete something or change plan.
--
-- 05:00 UTC is 06:00 in Lagos, before the admissions digest, so a morning that
-- has something wrong with it leads with that rather than with the queue.
--
-- Silent unless something crosses a threshold, which should be almost always.
-- A daily "all good" teaches its reader to stop reading.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-ops-check');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-ops-check',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'ops_check')
  );
  $$
);
