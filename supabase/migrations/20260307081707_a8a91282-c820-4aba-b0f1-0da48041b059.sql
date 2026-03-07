
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_age integer;
BEGIN
  v_age := NULL;
  BEGIN
    v_age := (new.raw_user_meta_data->>'age')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_age := NULL;
  END;

  INSERT INTO public.profiles (id, email, role, first_name, last_name, middle_name, phone)
  VALUES (
    new.id, 
    new.email, 
    'student',
    COALESCE(new.raw_user_meta_data->>'first_name', 
             split_part(COALESCE(new.raw_user_meta_data->>'full_name', 'New'), ' ', 1)),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'middle_name', ''),
    COALESCE(new.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET 
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    middle_name = EXCLUDED.middle_name,
    phone = EXCLUDED.phone;

  INSERT INTO public.students (
    profile_id, 
    admission_status, 
    gender,
    age
  )
  VALUES (
    new.id, 
    'Pending',
    new.raw_user_meta_data->>'gender',
    v_age
  )
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN new;
END;
$function$;
