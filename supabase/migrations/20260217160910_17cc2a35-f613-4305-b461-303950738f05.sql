CREATE POLICY "Anyone can view active cohorts"
ON public.cohorts
FOR SELECT
USING (is_active = true);