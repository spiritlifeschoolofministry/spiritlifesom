-- Update or insert the new Resend API key into Supabase Vault so the
-- notify_student_on_approval trigger can authenticate with Resend.
DO $$
DECLARE
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'RESEND_API_KEY' LIMIT 1;
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret('re_VEKmVo1T_B1FWuW7tsrvKxMubYsg8Tqvd', 'RESEND_API_KEY', 'Resend API key for transactional emails');
  ELSE
    PERFORM vault.update_secret(v_existing_id, 're_VEKmVo1T_B1FWuW7tsrvKxMubYsg8Tqvd', 'RESEND_API_KEY', 'Resend API key for transactional emails');
  END IF;
END $$;

-- Re-trigger Seraph Media's welcome email
UPDATE public.students SET is_approved = FALSE WHERE id = 'ef8f15bf-c605-4c47-ad80-314d7c04bbd1';
UPDATE public.students SET is_approved = TRUE  WHERE id = 'ef8f15bf-c605-4c47-ad80-314d7c04bbd1';