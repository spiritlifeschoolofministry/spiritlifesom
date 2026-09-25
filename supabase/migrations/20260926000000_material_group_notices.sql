-- Tell the group when new course material appears -- in one message, not ten.
--
-- A per-row trigger would be the obvious build and the wrong one: material is
-- uploaded in batches, a lecturer posting a week's handouts in one sitting, and
-- that would be ten notifications to seventy-seven people in ninety seconds.
-- The group would mute the number by the second week, and every later alert --
-- including the exam reminders -- would go unread with it.
--
-- So a sweep instead, gathering whatever has appeared since it last looked and
-- saying it once.
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

-- Everything that already exists is treated as announced. Without this the
-- first sweep would post the entire back catalogue.
UPDATE public.course_materials
   SET whatsapp_sent_at = now()
 WHERE whatsapp_sent_at IS NULL;

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS alert_material_uploaded boolean NOT NULL DEFAULT true;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.whatsapp_sweep_new_materials()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pending integer;
BEGIN
  -- Only material for the cohort whose group this is, and only once it has
  -- settled. The five-minute delay is what turns a batch upload into one
  -- message: anything still arriving is picked up by the next pass.
  SELECT count(*) INTO v_pending
  FROM public.course_materials m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.whatsapp_sent_at IS NULL
    AND c.is_active
    AND m.created_at < now() - interval '5 minutes';

  IF v_pending = 0 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'materials_added')
  );
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-materials-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-materials-sweep',
  '*/15 * * * *',
  $$ SELECT public.whatsapp_sweep_new_materials(); $$
);
