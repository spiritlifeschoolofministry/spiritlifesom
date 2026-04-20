-- 1) Remove the welcome email logic from the approval trigger.
--    Approval trigger now does NOTHING (placeholder). The Make.com webhook
--    on admission_status change is unaffected (separate trigger).
CREATE OR REPLACE FUNCTION public.notify_student_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Welcome email moved to handle_new_user (fires on signup, not approval).
  -- This function is intentionally a no-op. Kept so existing trigger remains valid.
  RETURN NEW;
END;
$function$;

-- 2) Update handle_new_user to send the welcome email via Resend on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_cohort_id uuid;
  v_first text;
  v_last text;
  v_api_key text;
BEGIN
  v_first := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last  := COALESCE(new.raw_user_meta_data->>'last_name', '');

  INSERT INTO public.profiles (id, email, first_name, last_name, middle_name, phone, role)
  VALUES (
    new.id, new.email, v_first, v_last,
    new.raw_user_meta_data->>'middle_name',
    new.raw_user_meta_data->>'phone',
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    v_active_cohort_id := NULLIF(new.raw_user_meta_data->>'cohort_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_active_cohort_id := NULL;
  END;

  IF v_active_cohort_id IS NULL THEN
    SELECT id INTO v_active_cohort_id
    FROM public.cohorts WHERE is_active = true
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.students (profile_id, cohort_id, admission_status, is_approved, gender, age)
  VALUES (
    new.id, v_active_cohort_id, 'Pending', false,
    NULLIF(new.raw_user_meta_data->>'gender', ''),
    NULLIF(new.raw_user_meta_data->>'age', '')::int
  )
  ON CONFLICT (profile_id) DO NOTHING;

  -- In-app notifications for all admins
  INSERT INTO public.notifications (user_id, title, body, type, link)
  SELECT p.id,
    'New Student Registration',
    COALESCE(NULLIF(trim(v_first || ' ' || v_last), ''), new.email) || ' just registered and is awaiting admission approval.',
    'admission', '/admin/admissions'
  FROM public.profiles p WHERE p.role = 'admin';

  -- Welcome email via Resend (fire-and-forget; never block signup on failure)
  BEGIN
    SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
    WHERE name = 'RESEND_API_KEY' LIMIT 1;

    IF v_api_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || v_api_key
        ),
        body := jsonb_build_object(
          'from', 'Spirit Life SOM <noreply@spiritlifesom.org>',
          'to', new.email,
          'subject', 'Welcome to Spirit Life School of Ministry',
          'html', format(
            $html$
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1f2937;">
  <div style="background: linear-gradient(135deg, #5B2D8E 0%%, #7c3aed 100%%); padding: 32px 24px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.3px;">Spirit Life School of Ministry</h1>
    <p style="color: #e9d5ff; margin: 8px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Equipping The Saints</p>
  </div>

  <div style="padding: 32px 28px;">
    <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 22px; font-weight: 600;">Congratulations, %s!</h2>

    <p style="font-size: 15px; line-height: 1.65; color: #374151; margin: 0 0 16px;">
      Your registration was successful. Thank you for showing interest in joining us at <strong>Spirit Life School of Ministry</strong>.
    </p>

    <p style="font-size: 15px; line-height: 1.65; color: #374151; margin: 0 0 16px;">
      Your application is now under review and you will receive an update soon. In the meantime, you have <strong>partial access</strong> to your portal — full access will be granted once your admission is approved.
    </p>

    <div style="background: #f9fafb; border-left: 3px solid #5B2D8E; padding: 16px 18px; margin: 24px 0; border-radius: 4px;">
      <p style="font-size: 14px; font-weight: 600; color: #1f2937; margin: 0 0 10px;">Need help with your admission?</p>
      <p style="font-size: 13px; line-height: 1.7; color: #4b5563; margin: 0;">
        <strong>Prophet Kayode Olagunju</strong> — 0806 497 7070<br>
        <strong>Saint Williams Folorunsho</strong> — 0706 504 1295<br>
        <strong>Olaopa Olajide Michael</strong> — 0806 631 7437
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="https://spiritlifesom.org/student/dashboard"
         style="background: linear-gradient(135deg, #5B2D8E 0%%, #7c3aed 100%%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(91, 45, 142, 0.25);">
        Access Your Portal
      </a>
    </div>

    <p style="font-size: 15px; line-height: 1.65; color: #374151; margin: 24px 0 4px;">God bless you,</p>
    <p style="font-size: 15px; font-weight: 600; color: #5B2D8E; margin: 0;">Spirit Life School of Ministry</p>
  </div>

  <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">© Spirit Life School of Ministry · spiritlifesom.org</p>
  </div>
</div>
            $html$,
            COALESCE(NULLIF(v_first, ''), 'Beloved')
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'welcome email (signup) failed: %', SQLERRM;
  END;

  -- Keep the legacy edge-function call too (safe; ignored if function not present)
  BEGIN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/send-registration-email',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'student_email', new.email,
        'student_name', COALESCE(NULLIF(trim(v_first || ' ' || v_last), ''), new.email),
        'phone', new.raw_user_meta_data->>'phone'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'send-registration-email failed: %', SQLERRM;
  END;

  RETURN new;
END;
$function$;