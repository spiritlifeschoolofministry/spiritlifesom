-- Create course_cohorts join table to allow sharing courses between cohorts
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.course_cohorts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS course_cohorts_course_cohort_uniq ON public.course_cohorts (course_id, cohort_id);

-- Backfill existing course -> cohort assignments
INSERT INTO public.course_cohorts (course_id, cohort_id)
SELECT id, cohort_id
FROM public.courses
WHERE cohort_id IS NOT NULL
ON CONFLICT DO NOTHING;
