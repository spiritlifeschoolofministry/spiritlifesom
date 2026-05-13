ALTER TABLE public.assignment_submissions ADD COLUMN storage_provider TEXT DEFAULT 'supabase';
ALTER TABLE public.assignment_submissions ADD COLUMN storage_path TEXT;

COMMENT ON COLUMN public.assignment_submissions.storage_provider IS 'The storage provider used for this submission (supabase, r2, etc.)';
COMMENT ON COLUMN public.assignment_submissions.storage_path IS 'The internal path/key in the storage provider';