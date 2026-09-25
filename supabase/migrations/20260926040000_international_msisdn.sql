-- Accept students who are not in Nigeria.
--
-- The first version of this only understood Nigerian numbers, so a real
-- Liberian number (+231 777 560 103) was rejected as unreadable. The school
-- has international students and expects more, so a number that is simply not
-- Nigerian must not be treated as broken.
--
-- The rule that keeps this safe is the country code. Nigerian numbers are a
-- known shape, so anything beginning 234 must match it exactly -- which is what
-- still rejects +23490398954, a Nigerian number a digit short, rather than
-- waving it through as "some international number". Everything else is accepted
-- on E.164 length alone, and confirmed against WhatsApp separately.
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
    -- Nigerian, in each of the forms people actually write.
    WHEN d ~ '^234[789][0-9]{9}$'    THEN d
    WHEN d ~ '^0[789][0-9]{9}$'      THEN '234' || substring(d from 2)
    WHEN d ~ '^[789][0-9]{9}$'       THEN '234' || d
    WHEN d ~ '^00234[789][0-9]{9}$'  THEN substring(d from 3)
    WHEN d ~ '^2340[789][0-9]{9}$'   THEN '234' || substring(d from 5)

    -- Anything else beginning 234 is a malformed Nigerian number, not a
    -- foreign one. Rejecting it is the point: the shape is known, so a near
    -- miss is a typo and a typo delivered is somebody else's phone.
    WHEN d ~ '^234' THEN NULL

    -- A leading zero is a national trunk code, not a country code, and without
    -- knowing the country there is nothing to replace it with.
    WHEN d ~ '^0' THEN NULL

    -- International, on E.164 length alone: a country code plus a subscriber
    -- number is between 8 and 15 digits. Whether the number is real is settled
    -- by asking WhatsApp, not by guessing here.
    WHEN d ~ '^[1-9][0-9]{7,14}$' THEN d

    ELSE NULL
  END
  FROM digits;
$function$;

-- Every number that can be read out of one field.
--
-- "07068873610 / 09157708989" is one student with two phones in one box, which
-- is a perfectly reasonable thing to write on a form and impossible for a
-- machine to choose between. Pulling both out is what makes it possible to ask
-- the person which they want, rather than filing them under broken.
CREATE OR REPLACE FUNCTION public.whatsapp_msisdn_candidates(raw text)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    array_agg(DISTINCT n ORDER BY n),
    '{}'::text[]
  )
  FROM (
    SELECT public.normalize_msisdn(part) AS n
    FROM regexp_split_to_table(COALESCE(raw, ''), '[^0-9+]+') AS part
    WHERE regexp_replace(part, '[^0-9]', '', 'g') <> ''
  ) parts
  WHERE n IS NOT NULL;
$function$;

-- What is wrong with this person's number, if anything.
--
--   NULL        usable
--   ambiguous   more than one number in the field; the person must choose
--   unusable    nothing readable at all
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number_issue text
  GENERATED ALWAYS AS (
    CASE
      WHEN public.normalize_msisdn(phone) IS NOT NULL THEN NULL
      WHEN array_length(public.whatsapp_msisdn_candidates(phone), 1) >= 2 THEN 'ambiguous'
      ELSE 'unusable'
    END
  ) STORED;

-- When the school last asked this person to fix their number, so a weekly
-- nudge does not become a daily one.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number_asked_at timestamptz;
