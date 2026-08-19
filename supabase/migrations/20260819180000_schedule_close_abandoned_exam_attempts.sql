-- Close abandoned sittings on a schedule.
--
-- An exam is only finished when its attempt row says so, and the student's own
-- browser is the only thing that says so today. That is the one moment it is
-- least able to: a paper being auto-submitted for cheating, a lid closing, a
-- network dropping. Anything it fails to close stays "in progress" for ever —
-- no score, skipped when results are released, and resumable.
--
-- The monitor page sweeps the exam a lecturer is looking at, which covers most
-- of it. This covers the rest, for exams nobody opens. Every 15 minutes it
-- finishes off attempts whose clock has run out or whose proctoring counters
-- were already over a limit; a student still inside their time is left alone so
-- a crashed browser can resume, which is the point of resuming.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('close-abandoned-exam-attempts');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'close-abandoned-exam-attempts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/exam-close-attempts',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    -- No exam or attempt named: the sweep decides for itself which attempts are
    -- past saving, so it needs no privileges of its own and no key is stored
    -- here. See the function for the authorisation it does apply.
    body := jsonb_build_object('scheduled_at', now())::jsonb
  );
  $$
);
