-- Only record a LID when there is one person it could belong to.
--
-- Two profiles here share a phone number -- a student and an admin on one, and
-- two brothers on another -- and the first version of this wrote the LID to
-- every profile holding that number. That is how one person's address ends up
-- on somebody else's record, and from there how one person's fees end up on
-- somebody else's phone.
--
-- Where the number is shared, nothing is written. The lookup already refuses to
-- match an ambiguous number, so the result is that those people are answered as
-- members of the public rather than as the wrong student -- which is the right
-- failure to have.
CREATE OR REPLACE FUNCTION public.whatsapp_remember_lid(p_phone_jid text, p_lid text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_holders integer;
BEGIN
  SELECT count(*) INTO v_holders
  FROM public.profiles
  WHERE whatsapp_jid = p_phone_jid;

  IF v_holders <> 1 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET whatsapp_lid = p_lid
   WHERE whatsapp_jid = p_phone_jid
     AND whatsapp_lid IS DISTINCT FROM p_lid;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_remember_lid(text, text) FROM PUBLIC, anon, authenticated;

-- Clear the test mapping written while proving this out.
UPDATE public.profiles SET whatsapp_lid = NULL WHERE whatsapp_lid = '999888777666@lid';
