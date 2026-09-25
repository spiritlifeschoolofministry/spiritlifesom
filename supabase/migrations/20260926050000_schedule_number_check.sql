-- Chase unusable numbers, weekly.
--
-- A student whose number cannot be read is told nothing and does not know it:
-- from where they sit the school has simply gone quiet. Nothing errors, and the
-- gap surfaces months later as a complaint about a result that never arrived.
--
-- Weekly and with a fourteen-day cooling-off per person, because this is a
-- nudge about admin rather than news -- and a nudge that arrives too often is
-- one people learn to ignore, which defeats the only thing it is for.
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS notify_number_fix boolean NOT NULL DEFAULT true;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-number-check');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-number-check',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-number-check',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);
