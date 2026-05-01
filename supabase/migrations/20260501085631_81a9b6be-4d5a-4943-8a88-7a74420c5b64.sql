ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS semester smallint NOT NULL DEFAULT 1;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_semester_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_semester_check CHECK (semester IN (1, 2));

CREATE INDEX IF NOT EXISTS idx_courses_cohort_semester
  ON public.courses (cohort_id, semester, start_date);