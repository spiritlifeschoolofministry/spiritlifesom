ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS graduation_date DATE,
ADD COLUMN IF NOT EXISTS name_on_certificate TEXT,
ADD COLUMN IF NOT EXISTS pending_name_change TEXT;

-- Create a table for certificate settings if needed, or use system_settings
-- Using system_settings for global certificate info
INSERT INTO public.system_settings (key, value)
VALUES ('global_graduation_date', '"20th April, 2025"')
ON CONFLICT (key) DO NOTHING;
