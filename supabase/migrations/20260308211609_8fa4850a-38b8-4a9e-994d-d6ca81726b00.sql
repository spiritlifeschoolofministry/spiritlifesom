-- Fix learning_mode constraint to match UI values
ALTER TABLE public.students DROP CONSTRAINT students_learning_mode_check;
ALTER TABLE public.students ADD CONSTRAINT students_learning_mode_check 
  CHECK (learning_mode = ANY (ARRAY['Physical'::text, 'On-site'::text, 'Online'::text, 'Hybrid'::text]));

-- Fix preferred_language constraint to match UI values
ALTER TABLE public.students DROP CONSTRAINT students_preferred_language_check;
ALTER TABLE public.students ADD CONSTRAINT students_preferred_language_check 
  CHECK (preferred_language = ANY (ARRAY['English'::text, 'French'::text, 'Yoruba'::text, 'Igbo'::text, 'Hausa'::text, 'Other'::text]));