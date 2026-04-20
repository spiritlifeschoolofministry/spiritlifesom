-- 1. Fix handle_new_user to also create student row with active cohort
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_cohort_id uuid;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, first_name, last_name, middle_name, phone, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'middle_name',
    new.raw_user_meta_data->>'phone',
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Find active cohort
  SELECT id INTO v_active_cohort_id
  FROM public.cohorts
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- Insert student row with Pending status + active cohort
  INSERT INTO public.students (
    profile_id, cohort_id, admission_status, is_approved,
    gender, age
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

  RETURN new;
END;
$function$;

-- Ensure profile_id is unique for ON CONFLICT to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_profile_id_key' AND conrelid = 'public.students'::regclass
  ) THEN
    -- check if a unique index already exists on profile_id
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname='public' AND tablename='students' 
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%profile_id%'
    ) THEN
      ALTER TABLE public.students ADD CONSTRAINT students_profile_id_key UNIQUE (profile_id);
    END IF;
  END IF;
END $$;

-- 2. Backfill missing student rows for orphaned profiles
INSERT INTO public.students (profile_id, cohort_id, admission_status, is_approved)
SELECT 
  p.id,
  (SELECT id FROM public.cohorts WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
  'Pending',
  false
FROM public.profiles p
WHERE p.role = 'student'
  AND p.email <> 'seraphmedia2019@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = p.id)
ON CONFLICT (profile_id) DO NOTHING;

-- 3. Backfill cohort for existing students with NULL cohort
UPDATE public.students
SET cohort_id = (SELECT id FROM public.cohorts WHERE is_active = true ORDER BY created_at DESC LIMIT 1)
WHERE cohort_id IS NULL;

-- 4. Delete seraphmedia2019@gmail.com (cascade via auth)
DELETE FROM public.students WHERE profile_id IN (SELECT id FROM public.profiles WHERE email='seraphmedia2019@gmail.com');
DELETE FROM public.profiles WHERE email='seraphmedia2019@gmail.com';
DELETE FROM auth.users WHERE email='seraphmedia2019@gmail.com';

-- 5. Faculty CMS
CREATE TABLE IF NOT EXISTS public.faculty_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faculty_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faculty_public_read" ON public.faculty_members;
CREATE POLICY "faculty_public_read" ON public.faculty_members
  FOR SELECT TO public
  USING (is_active = true OR get_my_role() = 'admin');

DROP POLICY IF EXISTS "faculty_admin_manage" ON public.faculty_members;
CREATE POLICY "faculty_admin_manage" ON public.faculty_members
  FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.touch_faculty_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS faculty_updated_at ON public.faculty_members;
CREATE TRIGGER faculty_updated_at BEFORE UPDATE ON public.faculty_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_faculty_updated_at();

-- Seed initial faculty
INSERT INTO public.faculty_members (name, title, bio, photo_url, display_order)
VALUES
  ('Prophet Cherub Obadare','Director, School of Ministry','A seasoned minister of the Gospel and leader of Spirit Life C&S Church, Prophet Obadare brings deep biblical insight and spiritual authority to guide students in their ministerial journey.','/images/PRO-CHERUB-IMG1.jpg',1),
  ('Pastor Folakemi Obadare','Co-director','Pastor Folakemi Obadare serves alongside Prophet Cherub Obadare as Co-director of Spirit Life School of Ministry, offering nurturing leadership, spiritual care, and a heart for empowering students.','/images/PFO-IMG-2.png',2),
  ('Prophet Kayode Olagunju','School Coordinator','Prophet Olagunju oversees the academic and operational structure of the school, ensuring every student receives the support they need to thrive spiritually and academically.','/images/PRO-KAY-IMG1.jpg',3)
ON CONFLICT DO NOTHING;