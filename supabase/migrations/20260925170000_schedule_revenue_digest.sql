-- Where the money stands, once a week.
--
-- Weekly rather than daily: fees move slowly, and a figure repeated every
-- morning stops being read. Monday 07:00 UTC is 08:00 in Lagos, half an hour
-- after the grading backlog so the two do not arrive as one wall of text.
--
-- The digest counts only the active cohort, and only fees that were not
-- waived. Both exclusions matter: a closed session's balances are written off
-- on purpose, and counting them would report a debt the school has already
-- decided not to collect -- every week, for ever, with nothing to do about it.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-revenue-digest');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-revenue-digest',
  '0 7 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'revenue_digest')
  );
  $$
);
