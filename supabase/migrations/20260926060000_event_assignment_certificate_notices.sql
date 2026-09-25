-- Three more notices, and the one certificate event that left no trace.

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS alert_event_reminder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_assignment_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_exam_missed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_certificate_revoked boolean NOT NULL DEFAULT true;

-- Markers, so a repeating sweep announces a thing once.
ALTER TABLE public.school_events
  ADD COLUMN IF NOT EXISTS whatsapp_reminded_at timestamptz;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS whatsapp_missed_swept_at timestamptz;

-- Nothing that already exists is announced. Otherwise switching this on posts
-- the back catalogue to a group of seventy-seven people.
UPDATE public.assignments SET whatsapp_sent_at = now() WHERE whatsapp_sent_at IS NULL;
UPDATE public.school_events SET whatsapp_reminded_at = now()
 WHERE whatsapp_reminded_at IS NULL AND start_date < now();


-- #31. Remind the group the day before an event.
--
-- The day before rather than on the day: an event you are told about on the
-- morning it happens is one you have already made other plans for.
CREATE OR REPLACE FUNCTION public.whatsapp_sweep_event_reminders()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_event record;
BEGIN
  FOR v_event IN
    SELECT e.id
    FROM public.school_events e
    LEFT JOIN public.cohorts c ON c.id = e.target_cohort_id
    WHERE e.whatsapp_reminded_at IS NULL
      AND e.start_date IS NOT NULL
      AND e.start_date > now()
      AND e.start_date <= now() + interval '36 hours'
      -- Untargeted events are for everyone; a targeted one only goes to the
      -- group if that group's cohort is the one being targeted.
      AND (e.target_cohort_id IS NULL OR c.is_active)
  LOOP
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'event_reminder', 'event_id', v_event.id)
    );
  END LOOP;
END;
$function$;


-- #8. Tell the group an assignment has been set.
--
-- A sweep rather than a row trigger, for the reason the materials notice is
-- one: assignments are created in batches at the start of a module, and ten
-- separate messages would teach the group to mute the number.
CREATE OR REPLACE FUNCTION public.whatsapp_sweep_new_assignments()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pending integer;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.assignments a
  JOIN public.cohorts c ON c.id = a.cohort_id
  WHERE a.whatsapp_sent_at IS NULL
    AND c.is_active
    AND a.created_at < now() - interval '5 minutes'
    AND COALESCE(a.is_manual_record, false) = false;

  IF v_pending = 0 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'assignments_added')
  );
END;
$function$;


-- #14. Who did not sit a paper that has now closed.
--
-- A student with no attempt row left no trace at all: they are not late, not
-- failed, not flagged -- simply absent from the results. That is the same shape
-- whether they forgot, were locked out by a device conflict, or never got in.
-- Only a person can tell those apart, and only while it is recent enough to
-- fix.
CREATE OR REPLACE FUNCTION public.whatsapp_sweep_missed_exams()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_exam record;
BEGIN
  FOR v_exam IN
    SELECT e.id
    FROM public.exams e
    WHERE e.whatsapp_missed_swept_at IS NULL
      AND e.end_at IS NOT NULL
      AND e.end_at < now()
      -- A day's grace: attempts are still being closed by the abandoned-sitting
      -- sweep for a while after an exam ends, and somebody counted as missing
      -- before that has finished is not missing.
      AND e.end_at > now() - interval '24 hours'
      AND e.status IN ('published', 'in_progress', 'closed')
  LOOP
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'exam_missed', 'exam_id', v_exam.id)
    );
  END LOOP;
END;
$function$;


-- #24. A certificate was revoked.
--
-- Issuing is announced to the graduate; revoking is the opposite act and had no
-- trace anywhere. It is also the more serious of the two: it says a certificate
-- in circulation is no longer valid, and the school should be able to say when
-- that was decided and why.
--
-- To the admins only. A revocation is a conversation somebody needs to have,
-- not a message that should arrive on the graduate's phone unannounced.
CREATE OR REPLACE FUNCTION public.whatsapp_alert_on_certificate_revoked()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'certificate_revoked', 'certificate_id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp revocation alert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_certificate_revoked_whatsapp ON public.certificates;
CREATE TRIGGER on_certificate_revoked_whatsapp
AFTER UPDATE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_alert_on_certificate_revoked();


CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-event-reminder');
  PERFORM cron.unschedule('whatsapp-assignments-sweep');
  PERFORM cron.unschedule('whatsapp-missed-exams');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- 17:00 UTC is 18:00 in Lagos: the evening before, when there is still an
-- evening left to plan around it.
SELECT cron.schedule('whatsapp-event-reminder', '0 17 * * *',
  $$ SELECT public.whatsapp_sweep_event_reminders(); $$);

SELECT cron.schedule('whatsapp-assignments-sweep', '*/15 * * * *',
  $$ SELECT public.whatsapp_sweep_new_assignments(); $$);

-- Hourly, so an exam that closed this morning is reported while the lecturer
-- is still thinking about it.
SELECT cron.schedule('whatsapp-missed-exams', '20 * * * *',
  $$ SELECT public.whatsapp_sweep_missed_exams(); $$);
