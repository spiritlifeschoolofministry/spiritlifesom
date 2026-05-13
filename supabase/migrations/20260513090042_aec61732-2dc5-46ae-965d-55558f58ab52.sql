-- Add learning_mode to fee_structures
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS learning_mode TEXT DEFAULT 'All';

-- Ensure the sync trigger is robust (already added in previous step but checking)
-- If it doesn't exist, we should re-apply it just in case.
-- The previous message said it was created as 20260513083850_3d057c7f-d856-41bc-992a-b5c63e7a2a4e.sql
