-- Put a human in the loop while an exam is still running.
--
-- Both of these are reversible only for as long as the paper is open. An
-- attempt stopped for a proctoring breach can be reset; a student locked out by
-- a device conflict can be let back in. Once the exam closes, neither can, and
-- the first anyone hears of it is a complaint days later that cannot be checked
-- against anything.
--
-- The triggers name a row. The message is composed by the function, and the
-- recipients come from its own configuration.

-- 1. A sitting the system stopped for a proctoring breach.
--
-- Only the two breach reasons. A timeout is the exam working as designed, and
-- a disconnect has nothing for a lecturer to decide -- both belong in the
-- after-the-fact digest instead of an interruption.
--
-- Fires on the transition, not the state: attempts are written to constantly
-- during a sitting (heartbeats, counters, answers), and without the IS DISTINCT
-- FROM guard this would alert on every one of those writes.
CREATE OR REPLACE FUNCTION public.whatsapp_alert_on_integrity_stop()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.submission_reason IS DISTINCT FROM OLD.submission_reason
     AND NEW.submission_reason IN ('tab_switches', 'fullscreen_exit')
  THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'exam_integrity_stop', 'attempt_id', NEW.id)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- An exam submission must never fail because an alert did. This runs on the
  -- path that files a student's paper.
  RAISE WARNING 'WhatsApp integrity alert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_exam_integrity_stop_whatsapp ON public.exam_attempts;
CREATE TRIGGER on_exam_integrity_stop_whatsapp
AFTER UPDATE ON public.exam_attempts
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_alert_on_integrity_stop();


-- 2. A second device refused a paper already in flight.
--
-- exam-start is the only thing that sees this, and it records it as a refusal.
-- The student is locked out at that moment and usually cannot say why.
--
-- Matched on the detail text that exam-start writes. Refusals have several
-- causes -- an exam with no questions, a closed window -- and only this one
-- needs somebody woken up.
CREATE OR REPLACE FUNCTION public.whatsapp_alert_on_device_conflict()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.event = 'refused'
     AND NEW.source = 'live'
     AND NEW.detail ILIKE '%another device%'
  THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'exam_device_conflict', 'event_id', NEW.id)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The log must keep recording even if nobody can be told. Its whole purpose
  -- is being the record that survives when the live path fails.
  RAISE WARNING 'WhatsApp device conflict alert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_device_conflict_whatsapp ON public.exam_access_events;
CREATE TRIGGER on_device_conflict_whatsapp
AFTER INSERT ON public.exam_access_events
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_alert_on_device_conflict();
