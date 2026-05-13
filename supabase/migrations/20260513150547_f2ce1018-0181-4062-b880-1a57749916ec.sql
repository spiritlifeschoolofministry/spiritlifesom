ALTER TABLE public.payments ADD COLUMN storage_provider TEXT DEFAULT 'supabase';
ALTER TABLE public.payments ADD COLUMN storage_path TEXT;

COMMENT ON COLUMN public.payments.storage_provider IS 'The storage provider used for this payment proof (supabase, r2, etc.)';
COMMENT ON COLUMN public.payments.storage_path IS 'The internal path/key in the storage provider';