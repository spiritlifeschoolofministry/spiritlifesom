
-- 1. Fix profiles_update_own: prevent role self-escalation
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- 2. Remove overly permissive submissions SELECT policy
DROP POLICY IF EXISTS "View submissions: authenticated" ON storage.objects;

-- 3. Fix assignments upload policy with ownership check
DROP POLICY IF EXISTS "Students can upload assignments" ON storage.objects;
CREATE POLICY "Students can upload assignments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
