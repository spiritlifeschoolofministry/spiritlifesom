-- Ping the WhatsApp gateway every five minutes.
--
-- This is both the keep-alive and the monitor, because they are the same
-- request. Render cycles a web service that goes quiet, and a cycled container
-- takes the Baileys socket with it -- so the traffic itself is load-bearing,
-- not just the answer it returns. Five minutes is chosen against Render's
-- ~15-minute idle window: frequent enough that the service never approaches it
-- even overnight, infrequent enough to be nothing at all in request terms.
--
-- The function decides what counts as healthy and whether to email; it also
-- rate-limits its own alerts, which is why this can safely run this often. See
-- supabase/functions/whatsapp-health.
--
-- No secret is passed here. Like the exam sweep, the check takes no instruction
-- from its caller -- it looks at the gateway and reports what it finds -- so
-- there is nothing for an unauthorised caller to make it do, and no key needs
-- to sit in a migration file. The gateway's own secret lives on the function.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-gateway-health');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-gateway-health',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-health',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('scheduled_at', now())::jsonb
  );
  $$
);
