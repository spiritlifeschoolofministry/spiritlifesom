GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_cohorts TO authenticated;
GRANT ALL ON public.course_cohorts TO service_role;
GRANT SELECT ON public.course_cohorts TO anon;

CREATE POLICY "Anyone can view course_cohorts"
  ON public.course_cohorts FOR SELECT
  USING (true);

CREATE POLICY "Admins manage course_cohorts"
  ON public.course_cohorts FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');