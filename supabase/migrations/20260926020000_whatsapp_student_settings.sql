-- Switches for the messages that go to a student personally.
--
-- Separated from the admin and group switches because the risk is different in
-- kind. These arrive on someone's own phone, carry their own results and their
-- own money, and go to a hundred people rather than two.
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS notify_payment_verified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_payment_rejected boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_assignment_graded boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_results_released boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_admission_decision boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_certificate_issued boolean NOT NULL DEFAULT true;

-- A student may switch their own messages off, and an admin may do it for them
-- when they ask in person -- which, for this school, is how most people will
-- ask. Nobody else can read or change anyone's setting.
DROP POLICY IF EXISTS profiles_self_whatsapp_optout ON public.profiles;
