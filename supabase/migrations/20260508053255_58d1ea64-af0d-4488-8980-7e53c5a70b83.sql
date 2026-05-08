
CREATE OR REPLACE FUNCTION public.notify_admission_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_email TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_phone TEXT;
  v_email_type TEXT;
  v_status TEXT := 'sent';
  v_error TEXT := NULL;
BEGIN
  IF (OLD.admission_status IS DISTINCT FROM NEW.admission_status) THEN

    SELECT p.email, p.first_name, p.last_name, p.phone
    INTO   v_email, v_first_name, v_last_name, v_phone
    FROM profiles p WHERE p.id = NEW.profile_id;

    BEGIN
      PERFORM net.http_post(
        url := 'https://hook.eu1.make.com/vt5hav9vnwyghrfx9c4iern5mxj8fy1o',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'student_id', NEW.id,
          'profile_id', NEW.profile_id,
          'old_status', OLD.admission_status,
          'new_status', NEW.admission_status,
          'student_code', NEW.student_code,
          'email', v_email,
          'first_name', v_first_name,
          'last_name', v_last_name,
          'phone', v_phone,
          'changed_at', NOW()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_status := 'failed';
      v_error := SQLERRM;
    END;

    -- Map status to email_type for audit
    v_email_type := CASE
      WHEN UPPER(NEW.admission_status) IN ('ADMITTED','APPROVED') THEN 'admission_approved'
      WHEN UPPER(NEW.admission_status) = 'REJECTED' THEN 'admission_rejected'
      ELSE 'admission_status_change'
    END;

    BEGIN
      INSERT INTO public.email_send_history (
        recipient_email, email_type, trigger_source,
        student_id, status, error_message, metadata
      ) VALUES (
        COALESCE(v_email, 'unknown'),
        v_email_type,
        'automatic',
        NEW.id,
        v_status,
        v_error,
        jsonb_build_object(
          'channel', 'make_webhook',
          'old_status', OLD.admission_status,
          'new_status', NEW.admission_status,
          'webhook_url', 'hook.eu1.make.com/vt5hav9vnwyghrfx9c4iern5mxj8fy1o'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_send_history insert failed: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$function$;
