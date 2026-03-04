-- Add bio and show_email columns to students table
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS show_email boolean DEFAULT false;

-- Create classmate_directory view
CREATE OR REPLACE VIEW public.classmate_directory AS
SELECT
  s.id,
  s.profile_id,
  s.cohort_id,
  p.first_name || ' ' || p.last_name AS display_name,
  p.avatar_url AS profile_image_url,
  p.email,
  s.bio,
  s.show_email
FROM public.students s
JOIN public.profiles p ON s.profile_id = p.id;

-- Grant access to the view
GRANT SELECT ON public.classmate_directory TO authenticated;
