
-- 1. Replace the function: use vault secret instead of hardcoded key, fix URL
CREATE OR REPLACE FUNCTION public.notify_student_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_email TEXT;
  v_first_name TEXT;
  v_api_key TEXT;
BEGIN
  -- Only fire if approval status changed from false to true
  IF (OLD.is_approved IS DISTINCT FROM TRUE AND NEW.is_approved = TRUE) THEN
    
    -- Get the Resend API key from Supabase secrets
    SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
    WHERE name = 'RESEND_API_KEY'
    LIMIT 1;

    IF v_api_key IS NULL THEN
      RAISE WARNING 'RESEND_API_KEY not found in vault';
      RETURN NEW;
    END IF;

    -- Get email and name from profiles table using profile_id
    SELECT email, first_name 
    INTO v_email, v_first_name
    FROM profiles 
    WHERE id = NEW.profile_id;
    
    RAISE NOTICE 'Sending welcome email to: % (profile_id: %)', v_email, NEW.profile_id;
    
    -- Send welcome email via Resend
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_api_key
      ),
      body := jsonb_build_object(
        'from', 'Spirit Life SOM <onboarding@resend.dev>',
        'to', v_email,
        'subject', 'Welcome to Spirit Life School of Ministry!',
        'html', format(
          '<div style="font-family: sans-serif; padding: 20px;">' ||
          '<h2>Congratulations, %s!</h2>' ||
          '<p>Your registration has been <strong>approved</strong>. We are excited to have you join us at Spirit Life School of Ministry.</p>' ||
          '<p><a href="https://spiritlifesom.lovable.app/student/dashboard" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Access Your Dashboard</a></p>' ||
          '<p>God bless you,<br><strong>Spirit Life School of Ministry</strong></p>' ||
          '</div>',
          COALESCE(v_first_name, 'Student')
        )
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Welcome email failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 2. Re-attach the trigger on the students table
DROP TRIGGER IF EXISTS trigger_notify_student_on_approval ON public.students;

CREATE TRIGGER trigger_notify_student_on_approval
  AFTER UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_student_on_approval();
