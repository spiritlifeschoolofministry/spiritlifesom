ALTER TABLE public.cohorts 
ADD COLUMN IF NOT EXISTS graduation_date DATE,
ADD COLUMN IF NOT EXISTS certificate_text_main TEXT DEFAULT 'has successfully completed a year of intensive training and teaching in the School of Ministry',
ADD COLUMN IF NOT EXISTS certificate_text_sub TEXT DEFAULT '';

-- Update existing cohorts with default graduation date if they don't have one
UPDATE public.cohorts SET graduation_date = '2025-04-20' WHERE graduation_date IS NULL;
