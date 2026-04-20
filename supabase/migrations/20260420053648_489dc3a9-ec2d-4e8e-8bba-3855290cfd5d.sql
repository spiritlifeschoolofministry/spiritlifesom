DROP POLICY IF EXISTS "View active cohorts" ON public.cohorts;
CREATE POLICY "Public can view all cohorts for registration"
ON public.cohorts FOR SELECT
TO anon, authenticated
USING (true);