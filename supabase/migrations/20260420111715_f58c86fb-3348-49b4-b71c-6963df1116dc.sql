-- Enable required extensions for scheduled jobs (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any existing schedule with the same name (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('purge-proctor-snapshots-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- Schedule the purge function to run every day at 03:15 UTC
SELECT cron.schedule(
  'purge-proctor-snapshots-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/purge-old-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaXJwenVmbGNpbWtobnp2YXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjg1MzIsImV4cCI6MjA4NjkwNDUzMn0.R9BqwPqsfw-PzGlOoPnxVsS1PS3Tp4HNdRAB1mRB_I0'
    ),
    body := jsonb_build_object('time', now())::jsonb
  );
  $$
);

-- Seed default maintenance_mode setting (off by default)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('maintenance_mode', 'false'::jsonb, now()),
       ('maintenance_message', '"We''ll be back shortly. Thank you for your patience."'::jsonb, now())
ON CONFLICT (key) DO NOTHING;