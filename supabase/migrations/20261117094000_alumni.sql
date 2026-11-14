-- Alumni: where graduates are serving now, and their testimonies.
--
-- Both are written only by graduates. The serving details show in the
-- graduates directory straight away; a testimony shows on the wall once staff
-- approve it.

CREATE OR REPLACE FUNCTION public.is_my_graduate_record(p_student_id UUID)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = p_student_id
      AND s.profile_id = auth.uid()
      AND upper(COALESCE(s.admission_status, '')) = 'GRADUATE'
  );
$function$;

CREATE TABLE IF NOT EXISTS public.alumni_profiles (
  student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  serving_as TEXT CHECK (serving_as IS NULL OR length(serving_as) <= 120),
  serving_at TEXT CHECK (serving_at IS NULL OR length(serving_at) <= 160),
  location TEXT CHECK (location IS NULL OR length(location) <= 120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Graduates manage their alumni details"
  ON public.alumni_profiles FOR ALL TO authenticated
  USING (public.is_my_graduate_record(student_id))
  WITH CHECK (public.is_my_graduate_record(student_id));

CREATE POLICY "Staff manage alumni details"
  ON public.alumni_profiles FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumni_profiles TO authenticated;
GRANT ALL ON public.alumni_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.alumni_testimonies (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 20 AND 3000),
  -- hidden: taken off the wall by staff, or never put on it.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alumni_testimonies_status ON public.alumni_testimonies (status, created_at DESC);

ALTER TABLE public.alumni_testimonies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Graduates read their own testimonies"
  ON public.alumni_testimonies FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

CREATE POLICY "Graduates share testimonies"
  ON public.alumni_testimonies FOR INSERT TO authenticated
  WITH CHECK (
    public.is_my_graduate_record(student_id)
    AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL
  );

CREATE POLICY "Graduates delete their own testimonies"
  ON public.alumni_testimonies FOR DELETE TO authenticated
  USING (student_id = public.get_my_student_id());

CREATE POLICY "Staff manage testimonies"
  ON public.alumni_testimonies FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumni_testimonies TO authenticated;
GRANT ALL ON public.alumni_testimonies TO service_role;

-- The directory gains the serving details. New columns go on the end, which is
-- the only change CREATE OR REPLACE VIEW allows.
CREATE OR REPLACE VIEW public.graduate_directory AS
  SELECT s.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    s.cohort_id,
    c.name AS cohort_name,
    ap.serving_as,
    ap.serving_at,
    ap.location
  FROM students s
    JOIN profiles p ON p.id = s.profile_id
    LEFT JOIN cohorts c ON c.id = s.cohort_id
    LEFT JOIN alumni_profiles ap ON ap.student_id = s.id
  WHERE COALESCE(s.is_staff_preview, false) = false
    AND s.admission_status = 'Graduate';

-- Approved testimonies with the graduate's name, for every signed-in user.
CREATE OR REPLACE VIEW public.alumni_testimony_wall AS
  SELECT t.id,
    t.student_id,
    t.body,
    t.created_at,
    p.first_name,
    p.last_name,
    p.avatar_url,
    c.name AS cohort_name,
    ap.serving_as,
    ap.serving_at
  FROM alumni_testimonies t
    JOIN students s ON s.id = t.student_id
    JOIN profiles p ON p.id = s.profile_id
    LEFT JOIN cohorts c ON c.id = s.cohort_id
    LEFT JOIN alumni_profiles ap ON ap.student_id = s.id
  WHERE t.status = 'approved'
    AND auth.uid() IS NOT NULL;

REVOKE ALL ON public.alumni_testimony_wall FROM anon;
GRANT SELECT ON public.alumni_testimony_wall TO authenticated;

COMMENT ON VIEW public.alumni_testimony_wall IS
  'Approved alumni testimonies with names, for signed-in users. Owner privileges.';

-- Staff hear about a new testimony; the graduate hears when it goes up.
CREATE OR REPLACE FUNCTION public.notify_alumni_testimony()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id, 'New alumni testimony to review', left(NEW.body, 140), 'alumni', '/admin/alumni'
    FROM profiles p WHERE p.role IN ('admin', 'teacher');
  ELSIF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT profile_id INTO v_user FROM students WHERE id = NEW.student_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (v_user, 'Your testimony is on the wall', 'Thank you for sharing it with the school.', 'alumni', '/student/graduates');
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Testimony notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_alumni_testimony_change ON public.alumni_testimonies;
CREATE TRIGGER on_alumni_testimony_change
AFTER INSERT OR UPDATE OF status ON public.alumni_testimonies
FOR EACH ROW EXECUTE FUNCTION public.notify_alumni_testimony();
