
-- 1) Override column
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS profile_complete_override boolean NOT NULL DEFAULT false;

-- 2) Helper: is a given user's student profile considered complete?
CREATE OR REPLACE FUNCTION public.is_profile_complete(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.students s ON s.profile_id = p.id
    WHERE p.id = _user_id
      AND (
        s.profile_complete_override = true
        OR (
          COALESCE(NULLIF(trim(p.phone), ''), NULL) IS NOT NULL
          AND COALESCE(NULLIF(trim(s.gender), ''), NULL) IS NOT NULL
          AND s.age IS NOT NULL AND s.age > 0
          AND COALESCE(NULLIF(trim(s.learning_mode), ''), NULL) IS NOT NULL
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_complete(uuid) TO anon, authenticated, service_role;

-- 3) Restrictive policies: students must be complete OR caller must be staff.
--    These AND on top of every existing permissive policy.
--    Admins/teachers always pass.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fees','payments','assignments','assignment_submissions',
    'course_materials','attendance','exams','exam_attempts',
    'announcements','school_events','notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS profile_complete_gate ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY profile_complete_gate ON public.%I
         AS RESTRICTIVE
         FOR SELECT
         TO authenticated
         USING (
           public.get_my_role() = ANY (ARRAY[''admin'',''teacher''])
           OR public.is_profile_complete(auth.uid())
         );', t);
  END LOOP;
END$$;
