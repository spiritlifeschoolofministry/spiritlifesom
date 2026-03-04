-- Create system_settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  value_type TEXT DEFAULT 'text',
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  description TEXT
);

-- Insert default system settings
INSERT INTO public.system_settings (key, value, value_type, description)
VALUES
  ('accepting_applications', 'true', 'boolean', 'Whether new student registrations are accepted'),
  ('school_name', 'Spirit Life School of Ministry', 'text', 'Official school name displayed in UI'),
  ('school_logo_url', '', 'text', 'URL to school logo image');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read and update system_settings
CREATE POLICY "Admins can manage system settings"
  ON public.system_settings
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- RLS Policy: Everyone can view certain public settings
CREATE POLICY "Everyone can view public settings"
  ON public.system_settings
  FOR SELECT
  USING (key IN ('accepting_applications', 'school_name', 'school_logo_url'));
