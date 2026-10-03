-- Recognise students who write from a LID.
--
-- WhatsApp has moved to addressing people by LID -- an anonymous identifier
-- with no relation to their phone number. Every one of this school's five
-- groups now uses it, and every real student who has written to the number did
-- so from an address like 239801513033925@lid.
--
-- Matching only on the phone-number address therefore recognised nobody. A
-- student asking about their fees was answered as a member of the public, and
-- a student replying STOP would have had nothing to opt out of. It is also how
-- a message saying "I won't be at the exam, I'm travelling" was answered with
-- "I'm not sure about the exam" and never reached a person.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_lid text;

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_lid
  ON public.profiles (whatsapp_lid)
  WHERE whatsapp_lid IS NOT NULL;

-- Either address identifies the same person.
--
-- The LID is learned rather than derived: there is no way to compute one from
-- a number, so it is recorded the first time somebody writes to us and used
-- for nothing until then.
CREATE OR REPLACE FUNCTION public.whatsapp_student_for_jid(p_jid text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE (p.whatsapp_jid = p_jid OR p.whatsapp_lid = p_jid)
    AND s.is_staff_preview = false
  GROUP BY s.id
  -- A match on two different people is no match at all: answering the wrong
  -- one hands a student's details to somebody else.
  HAVING count(*) = 1
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_student_for_jid(text) FROM PUBLIC, anon;

-- Remember a LID once it has been seen, so the next message from it is
-- recognised without another lookup.
CREATE OR REPLACE FUNCTION public.whatsapp_remember_lid(p_phone_jid text, p_lid text)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  UPDATE public.profiles
     SET whatsapp_lid = p_lid
   WHERE whatsapp_jid = p_phone_jid
     AND (whatsapp_lid IS DISTINCT FROM p_lid);
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_remember_lid(text, text) FROM PUBLIC, anon, authenticated;
