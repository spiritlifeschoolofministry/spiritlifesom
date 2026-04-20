DO $$
DECLARE
  v_api_key text;
  v_sent int := 0;
  r record;
BEGIN
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets WHERE name = 'RESEND_API_KEY' LIMIT 1;

  IF v_api_key IS NULL THEN RAISE EXCEPTION 'RESEND_API_KEY not found'; END IF;

  FOR r IN
    SELECT p.email, COALESCE(NULLIF(trim(p.first_name), ''), 'Beloved') AS first_name
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.email IN (
      'bunmiayo52@gmail.com',
      'michaelquadri123@gmail.com',
      'ssamdam35@gmail.com',
      'sundaychris4849@gmail.com'
    )
  LOOP
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || v_api_key
      ),
      body := jsonb_build_object(
        'from', 'Spirit Life SOM <noreply@spiritlifesom.org>',
        'to', r.email,
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
          r.first_name
        )
      )
    );
    v_sent := v_sent + 1;
    PERFORM pg_sleep(0.6);
  END LOOP;

  RAISE NOTICE 'Re-sent welcome to % students', v_sent;
END $$;