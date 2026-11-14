-- The 30-day purge now removes a project's files as well as its rows.
--
-- The first version of the purge was a SQL DELETE, which removed the project
-- and left every draft it had in storage with nothing pointing at it. Deleting
-- from R2 needs a signed request, which SQL cannot make, so the nightly job now
-- calls the project-purge edge function instead. That function deletes the
-- files first and the project only once they are gone, then sweeps the
-- projects/ folder for anything else no record points at.

DO $$
BEGIN
  PERFORM cron.unschedule('project-purge-deleted');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled on this database
END $$;

DROP FUNCTION IF EXISTS public.project_purge_deleted();

SELECT cron.schedule(
  'project-purge',
  '20 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/project-purge',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
