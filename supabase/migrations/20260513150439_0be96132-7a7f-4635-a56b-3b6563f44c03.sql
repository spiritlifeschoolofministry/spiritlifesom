ALTER TABLE public.course_materials ADD COLUMN storage_provider TEXT DEFAULT 'supabase';
ALTER TABLE public.course_materials ADD COLUMN storage_path TEXT;

COMMENT ON COLUMN public.course_materials.storage_provider IS 'The storage provider used for this material (supabase, r2, etc.)';
COMMENT ON COLUMN public.course_materials.storage_path IS 'The internal path/key in the storage provider';