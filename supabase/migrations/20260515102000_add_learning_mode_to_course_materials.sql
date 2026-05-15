-- Add learning_mode support to course materials so cohort-specific uploads can target students by mode.
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS learning_mode TEXT DEFAULT 'All';

COMMENT ON COLUMN public.course_materials.learning_mode IS 'Target learning mode for this course material (All, Online, Physical, Hybrid, etc.)';

UPDATE public.course_materials
SET learning_mode = 'All'
WHERE learning_mode IS NULL;
