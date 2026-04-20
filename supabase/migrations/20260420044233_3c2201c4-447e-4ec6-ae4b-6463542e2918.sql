-- Update handle_new_user to also notify all admins of the new registration
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
BEGIN
  v_first := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last  := COALESCE(new.raw_user_meta_data->>'last_name', '');

  -- Insert profile
  INSERT INTO public.profiles (id, email, first_name, last_name, middle_name, phone, role)
  VALUES (
    new.id,
    new.email,
    v_first,
    v_last,
    new.raw_user_meta_data->>'middle_name',
    new.raw_user_meta_data->>'phone',
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Use cohort from signup metadata if provided, otherwise active cohort
  BEGIN
    v_active_cohort_id := NULLIF(new.raw_user_meta_data->>'cohort_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_active_cohort_id := NULL;
  END;

  IF v_active_cohort_id IS NULL THEN
    SELECT id INTO v_active_cohort_id
    FROM public.cohorts
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.students (
    profile_id, cohort_id, admission_status, is_approved, gender, age
  )
  VALUES (
    new.id,
    v_active_cohort_id,
    'Pending',
    false,
    NULLIF(new.raw_user_meta_data->>'gender', ''),
    NULLIF(new.raw_user_meta_data->>'age', '')::int
  )
  ON CONFLICT (profile_id) DO NOTHING;

  -- Notify all admins
  INSERT INTO public.notifications (user_id, title, body, type, link)
  SELECT
    p.id,
    'New Student Registration',
    COALESCE(NULLIF(trim(v_first || ' ' || v_last), ''), new.email) || ' just registered and is awaiting admission approval.',
    'admission',
    '/admin/admissions'
  FROM public.profiles p
  WHERE p.role = 'admin';

  RETURN new;
END;
$function$;