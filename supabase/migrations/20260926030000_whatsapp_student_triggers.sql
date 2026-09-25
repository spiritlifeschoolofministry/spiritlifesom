-- The five moments a student should hear something directly.
--
-- Every one of them fires on a transition rather than a state, because the rows
-- behind them are written to for many reasons and only one of those reasons is
-- news. And every one swallows its own failure: a student's paper, payment or
-- admission must never fail because a message could not be sent about it.

-- 1 & 2. A payment was verified or rejected.
--
-- The rejection is the valuable one. Its reason sits in admin_notes, on a
-- screen students do not check, so the money stops moving and nobody knows why.
CREATE OR REPLACE FUNCTION public.whatsapp_notify_payment_decision()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_kind text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_kind := CASE NEW.status
    WHEN 'VERIFIED' THEN 'payment_verified'
    WHEN 'REJECTED' THEN 'payment_rejected'
    ELSE NULL
  END;

  IF v_kind IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('kind', v_kind, 'id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp payment notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_payment_decision_whatsapp ON public.payments;
CREATE TRIGGER on_payment_decision_whatsapp
AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notify_payment_decision();


-- 3. An assignment was graded.
--
-- reviewed_at moving is the signal, not the grade alone: a regrade sets a new
-- review time and is genuinely new news, while a lecturer editing their own
-- feedback wording is not.
CREATE OR REPLACE FUNCTION public.whatsapp_notify_assignment_graded()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.grade IS NOT NULL
     AND NEW.reviewed_at IS NOT NULL
     AND NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
  THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'assignment_graded', 'id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp grade notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_assignment_graded_whatsapp ON public.assignment_submissions;
CREATE TRIGGER on_assignment_graded_whatsapp
AFTER UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notify_assignment_graded();


-- 4. An exam result was released.
--
-- 'released' rather than 'graded' on purpose: scoring happens by itself,
-- releasing is a decision a person makes, and only the second means the student
-- may see it. That distinction is what left 123 papers scored and invisible.
CREATE OR REPLACE FUNCTION public.whatsapp_notify_results_released()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.status = 'released' AND OLD.status IS DISTINCT FROM 'released' THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'results_released', 'id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp result notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_results_released_whatsapp ON public.exam_attempts;
CREATE TRIGGER on_results_released_whatsapp
AFTER UPDATE ON public.exam_attempts
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notify_results_released();


-- 5. An admission was decided.
CREATE OR REPLACE FUNCTION public.whatsapp_notify_admission_decision()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.is_staff_preview THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(NEW.admission_status, '')) IN ('ADMITTED', 'REJECTED')
     AND NEW.admission_status IS DISTINCT FROM OLD.admission_status
  THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'admission_decision', 'id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp admission notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_admission_decision_whatsapp ON public.students;
CREATE TRIGGER on_admission_decision_whatsapp
AFTER UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notify_admission_decision();


-- 6. A certificate was issued.
CREATE OR REPLACE FUNCTION public.whatsapp_notify_certificate_issued()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.revoked_at IS NULL THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-student-notify',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'certificate_issued', 'id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'WhatsApp certificate notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_certificate_issued_whatsapp ON public.certificates;
CREATE TRIGGER on_certificate_issued_whatsapp
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notify_certificate_issued();
