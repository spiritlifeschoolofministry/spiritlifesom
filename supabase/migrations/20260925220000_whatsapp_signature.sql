-- Sign every message the system sends.
--
-- A WhatsApp message from the school's own number is indistinguishable from one
-- a person typed. That matters in both directions: a student should know that
-- nobody is watching the reply they are about to send, and the school should
-- not appear to have personally written a fee reminder at 07:00 on a Monday.
--
-- Appended by the gateway rather than by each function, so it is applied to
-- everything that goes out and cannot be forgotten by whatever is written next.
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS message_signature text
    NOT NULL DEFAULT E'\n\n_Automated message from Spirit Life SOM. Replies are not monitored._';
