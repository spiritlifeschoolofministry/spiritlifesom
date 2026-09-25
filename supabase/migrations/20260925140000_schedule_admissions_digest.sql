-- A daily digest of everything on the admissions screen waiting for a decision.
--
-- Three queues share that page -- a new application, a certificate name change
-- and a learning-mode change -- and all three are invisible until somebody
-- thinks to open it. An applicant who waits a week because nobody looked has
-- already formed a view of the school.
--
-- 06:00 UTC is 07:00 in Lagos: before the day starts, so the queue is read
-- while there is still a day left to act on it.
--
-- The function sends nothing when all three queues are empty. That silence is
-- deliberate -- a daily "nothing pending" trains its reader to skim past the
-- day it says something.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-admissions-digest');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-admissions-digest',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'admissions_digest')
  );
  $$
);
