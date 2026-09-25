-- Getting a person involved, and getting the bot out of the way.
--
-- Some things should never be answered by a machine: a complaint, a
-- bereavement, a fee dispute, anything where the person is upset. And some
-- things simply cannot be -- the assistant only knows what is on the website,
-- and a question outside that gets a polite "I'm not sure" however many times
-- it is asked.
--
-- The important half of this is not the alert. It is that the bot stops
-- talking. Two voices answering the same person from the same number, one of
-- them a machine, is worse than either alone: the human's reply arrives beside
-- an automated one and the person cannot tell which is the school.
ALTER TABLE public.whatsapp_conversations
  -- When a person took this conversation over. While set, the number is
  -- listened to and logged but never auto-answered.
  ADD COLUMN IF NOT EXISTS handover_at timestamptz,
  ADD COLUMN IF NOT EXISTS handover_reason text,
  -- Who closed it, so an admin screen can show it is dealt with rather than
  -- merely old.
  ADD COLUMN IF NOT EXISTS handover_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS handover_closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Consecutive messages the assistant could not answer. Asking the same
  -- unanswerable question three times is a person who needs somebody, not a
  -- person who needs the fallback message again.
  ADD COLUMN IF NOT EXISTS unanswered_streak integer NOT NULL DEFAULT 0;

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS handover_enabled boolean NOT NULL DEFAULT true,
  -- How long a human keeps the conversation before the bot resumes. Long
  -- enough to cover a night, because a message at 10pm is answered in the
  -- morning and the bot must not chime in first.
  ADD COLUMN IF NOT EXISTS handover_hours integer NOT NULL DEFAULT 24
    CHECK (handover_hours BETWEEN 1 AND 168),
  ADD COLUMN IF NOT EXISTS handover_streak_trigger integer NOT NULL DEFAULT 3
    CHECK (handover_streak_trigger BETWEEN 2 AND 10);

-- Admins need to see and close these; nobody else goes near them.
DROP POLICY IF EXISTS whatsapp_conversations_admin_read ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_admin_read ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS whatsapp_conversations_admin_write ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_admin_write ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

GRANT SELECT, UPDATE ON public.whatsapp_conversations TO authenticated;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_open_handover
  ON public.whatsapp_conversations (handover_at DESC)
  WHERE handover_at IS NOT NULL AND handover_closed_at IS NULL;
