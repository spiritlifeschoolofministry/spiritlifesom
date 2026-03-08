
ALTER TABLE public.courses 
  ADD COLUMN IF NOT EXISTS lecturer text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_date date DEFAULT NULL;
