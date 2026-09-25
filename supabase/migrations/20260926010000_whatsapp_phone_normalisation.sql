-- Turn the phone numbers people typed into numbers WhatsApp will accept.
--
-- Registration has always required a phone number but never checked its shape,
-- so the column holds every form a person might reasonably write:
--
--   08066317437        what most people type
--   +234 806 631 7437  with the country code and spaces
--   2348066317437      what WhatsApp actually needs
--
-- To WhatsApp those are three different things and only the last one works. A
-- message to an unnormalised number does not bounce -- it is simply delivered
-- nowhere, silently, which is the worst way for this to fail.
--
-- Nigerian mobile numbers are 234 followed by ten digits beginning 7, 8 or 9.
-- Anything that cannot be made to fit that returns NULL rather than a guess: a
-- wrong number is worse than a missing one, because a missing one can be seen
-- and fixed while a wrong one quietly delivers a student's fee balance to a
-- stranger.
CREATE OR REPLACE FUNCTION public.normalize_msisdn(raw text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'pg_catalog'
AS $function$
  WITH digits AS (
    SELECT regexp_replace(COALESCE(raw, ''), '[^0-9]', '', 'g') AS d
  )
  SELECT CASE
    -- Already international: 234 + 10 digits starting 7/8/9.
    WHEN d ~ '^234[789][0-9]{9}$' THEN d
    -- Local form with the trunk zero: 0 + 10 digits starting 7/8/9.
    WHEN d ~ '^0[789][0-9]{9}$' THEN '234' || substring(d from 2)
    -- Trunk zero omitted entirely, which is how a number dictated aloud often
    -- gets written down.
    WHEN d ~ '^[789][0-9]{9}$' THEN '234' || d
    -- Some forms carry the international prefix as 00234.
    WHEN d ~ '^00234[789][0-9]{9}$' THEN substring(d from 3)
    ELSE NULL
  END
  FROM digits;
$function$;

-- The address itself, kept in step with the phone column automatically. A
-- generated column rather than a trigger because there is then no way for the
-- two to disagree: correcting someone's phone number corrects where their
-- messages go, in the same statement.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_jid text
  GENERATED ALWAYS AS (
    CASE WHEN public.normalize_msisdn(phone) IS NULL
      THEN NULL
      ELSE public.normalize_msisdn(phone) || '@s.whatsapp.net'
    END
  ) STORED;

-- Consent.
--
-- These students gave the school their number on a registration form and are
-- already in its WhatsApp group, so the starting position is that the school
-- may write to them -- but it must be possible to say stop, and that must be
-- recorded where every send can see it.
--
-- Two columns rather than one flag, because when somebody asked matters later
-- as much as that they asked.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;

-- Set when a person explicitly agrees, which is not the same as never having
-- objected. Nothing requires it today; it is here so that if the school ever
-- needs to show positive consent, the record exists from now rather than from
-- the day someone thinks to ask.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_jid
  ON public.profiles (whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;

-- One place that answers "may we message this person, and where".
--
-- Every send goes through this rather than reading profiles directly, so the
-- opt-out cannot be forgotten by whatever is written next -- the same reason
-- the signature is applied in the gateway.
CREATE OR REPLACE FUNCTION public.whatsapp_target_for_student(p_student_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT p.whatsapp_jid
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = p_student_id
    AND p.whatsapp_opted_out_at IS NULL
    AND s.is_staff_preview = false
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_target_for_student(uuid) FROM PUBLIC, anon;
