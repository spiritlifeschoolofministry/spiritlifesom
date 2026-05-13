ALTER TABLE public.exam_snapshots ADD COLUMN storage_provider TEXT DEFAULT 'supabase';

COMMENT ON COLUMN public.exam_snapshots.storage_provider IS 'The storage provider used for this snapshot (supabase, r2, etc.)';