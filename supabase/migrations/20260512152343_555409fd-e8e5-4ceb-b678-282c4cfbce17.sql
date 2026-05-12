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
  v_request_id BIGINT := NULL;
  v_payload JSONB;
BEGIN
  IF (OLD.admission_status IS DISTINCT FROM NEW.admission_status) THEN

    SELECT p.email, p.first_name, p.last_name, p.phone
    INTO   v_email, v_first_name, v_last_name, v_phone
    FROM profiles p WHERE p.id = NEW.profile_id;

    v_payload := jsonb_build_object(
      'student_id', NEW.id,
      'profile_id', NEW.profile_id,
      'old_status', OLD.admission_status,
      'new_status', NEW.admission_status,
      'student_code', NEW.student_code,
      'cohort_id', NEW.cohort_id,
      'email', v_email,
      'first_name', v_first_name,
      'last_name', v_last_name,
      'phone', v_phone,
      'whatsapp_link', 'https://chat.whatsapp.com/F2uoXQS5UFs3tfuQslVL5b',
      'changed_at', NOW()
    );

    BEGIN
      SELECT net.http_post(
        url := 'https://hook.eu1.make.com/vt5hav9vnwyghrfx9c4iern5mxj8fy1o',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_payload
      ) INTO v_request_id;
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
          'webhook_url', 'hook.eu1.make.com/vt5hav9vnwyghrfx9c4iern5mxj8fy1o',
          'request_id', v_request_id,
          'request_payload', v_payload,
          'old_status', OLD.admission_status,
          'new_status', NEW.admission_status
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_send_history insert failed: %', SQLERRM;
    END;

    -- Audit log entry for the email trigger (only for approval/rejection emails)
    IF v_email_type IN ('admission_approved', 'admission_rejected') THEN
      BEGIN
        PERFORM public.audit_log_event(
          'email.' || v_email_type || '.triggered',
          'student',
          NEW.id,
          'Automatic ' || v_email_type || ' email triggered to ' || COALESCE(v_email, 'unknown'),
          NULL,
          NULL,
          jsonb_build_object(
            'recipient_email', v_email,
            'channel', 'make_webhook',
            'request_id', v_request_id,
            'trigger_source', 'automatic',
            'webhook_dispatch_status', v_status
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_log_event failed: %', SQLERRM;
      END;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;