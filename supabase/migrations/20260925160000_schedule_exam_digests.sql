-- Two sweeps over sittings: what ended badly, and what was never given back.
--
-- Both are digests rather than alerts, on purpose. Nothing here is fixable in
-- the moment -- a timeout has already happened, a backlog has already built --
-- and an interruption that cannot be acted on only teaches its reader to
-- ignore the interruptions that can.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 19:00 UTC is 20:00 in Lagos: after the teaching day, so a paper that closed
-- this afternoon is reported the same evening rather than the next morning.
-- Silent when no exam closed in the last 24 hours, which is most days.
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-exam-close-digest');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-exam-close-digest',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'exam_close_digest')
  );
  $$
);

-- Weekly, not daily. A backlog does not change much between one morning and
-- the next, and a number repeated every day stops being read long before it is
-- cleared. Monday 06:30 UTC is 07:30 in Lagos, at the start of the week that
-- could actually clear it.
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-grading-backlog');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-grading-backlog',
  '30 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'grading_backlog')
  );
  $$
);
