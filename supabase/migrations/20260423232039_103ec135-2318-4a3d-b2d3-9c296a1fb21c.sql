-- Email send history table
CREATE TABLE public.email_send_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  email_type text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'manual', -- 'manual' | 'automatic'
  triggered_by uuid NULL, -- profile id of admin if manual
  triggered_by_email text NULL,
  student_id uuid NULL,
  status text NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'retrying'
  attempts integer NOT NULL DEFAULT 1,
  error_message text NULL,
  resend_message_id text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_history_created_at ON public.email_send_history (created_at DESC);
CREATE INDEX idx_email_send_history_recipient ON public.email_send_history (recipient_email);
CREATE INDEX idx_email_send_history_student ON public.email_send_history (student_id);
CREATE INDEX idx_email_send_history_type ON public.email_send_history (email_type);

ALTER TABLE public.email_send_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_history_admin_select"
  ON public.email_send_history FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'admin');

CREATE POLICY "email_history_admin_insert"
  ON public.email_send_history FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "email_history_admin_update"
  ON public.email_send_history FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_email_history_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_touch_email_history_updated_at
BEFORE UPDATE ON public.email_send_history
FOR EACH ROW EXECUTE FUNCTION public.touch_email_history_updated_at();

-- Patch handle_new_user to also log the welcome email send to history
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
  v_student_id uuid;
  v_email_status text := 'failed';
  v_email_error text := NULL;
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
  ON CONFLICT (profile_id) DO NOTHING
  RETURNING id INTO v_student_id;

  IF v_student_id IS NULL THEN
    SELECT id INTO v_student_id FROM public.students WHERE profile_id = new.id;
  END IF;

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
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Spirit Life School of Ministry</h1>
    <p style="color: #e9d5ff; margin: 8px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Equipping The Saints</p>
  </div>
  <div style="padding: 32px 28px;">
    <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 22px; font-weight: 600;">Congratulations, %s!</h2>
    <p style="font-size: 15px; line-height: 1.65; color: #374151; margin: 0 0 16px;">Your registration was successful. Thank you for showing interest in joining us at <strong>Spirit Life School of Ministry</strong>.</p>
    <p style="font-size: 15px; line-height: 1.65; color: #374151; margin: 0 0 16px;">Your application is now under review and you will receive an update soon.</p>
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="https://spiritlifesom.org/student/dashboard" style="background: linear-gradient(135deg, #5B2D8E 0%%, #7c3aed 100%%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px;">Access Your Portal</a>
    </div>
    <p style="font-size: 15px; font-weight: 600; color: #5B2D8E; margin: 0;">Spirit Life School of Ministry</p>
  </div>
</div>
            $html$,
            COALESCE(NULLIF(v_first, ''), 'Beloved')
          )
        )
      );
      v_email_status := 'sent';
    ELSE
      v_email_error := 'RESEND_API_KEY not configured';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_email_error := SQLERRM;
    RAISE WARNING 'welcome email (signup) failed: %', SQLERRM;
  END;

  -- Log to email_send_history (always, regardless of success)
  BEGIN
    INSERT INTO public.email_send_history (
      recipient_email, email_type, trigger_source,
      student_id, status, error_message, metadata
    ) VALUES (
      new.email, 'welcome', 'automatic',
      v_student_id, v_email_status, v_email_error,
      jsonb_build_object('source', 'handle_new_user_trigger')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email_send_history insert failed: %', SQLERRM;
  END;

  RETURN new;
END;
$function$;