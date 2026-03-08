ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Assignment';