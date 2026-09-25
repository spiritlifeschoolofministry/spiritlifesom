-- Remind the group shortly before an exam starts.
--
-- A student who misses the start of a timed paper cannot be given the time
-- back, which is what makes this the most useful notice in the set -- and the
-- one most often written by hand, at whatever moment somebody remembers.
--
-- Every ten minutes, because the reminder window is a moving target and a
-- coarser sweep would fire well outside it. The work is a single indexed scan
-- that usually matches nothing.
--
-- The lead time is a setting, not a constant: exam_reminder_minutes on
-- whatsapp_settings, so the school can decide how much warning is useful.
-- whatsapp_reminded_at is what stops the same exam being announced on every
-- pass through its window.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.whatsapp_sweep_exam_reminders()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_lead integer;
  v_exam record;
BEGIN
  SELECT COALESCE(exam_reminder_minutes, 60) INTO v_lead
  FROM public.whatsapp_settings WHERE id = true;
  v_lead := COALESCE(v_lead, 60);

  FOR v_exam IN
    SELECT e.id
    FROM public.exams e
    WHERE e.whatsapp_reminded_at IS NULL
      AND e.start_at IS NOT NULL
      -- Ahead of us, and inside the lead time. Exams that started while nobody
      -- was looking are left alone: a reminder for a paper already running
      -- tells its readers only that they are late.
      AND e.start_at > now()
      AND e.start_at <= now() + make_interval(mins => v_lead)
      AND e.status IN ('published', 'in_progress')
  LOOP
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'exam_starting_soon', 'exam_id', v_exam.id)
    );
  END LOOP;
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-exam-reminder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'whatsapp-exam-reminder',
  '*/10 * * * *',
  $$ SELECT public.whatsapp_sweep_exam_reminders(); $$
);
