-- Accept the country code written in front of the local number.
--
-- +2340813773XXXX is 234 followed by the number as it would be dialled at home,
-- trunk zero and all. It is a natural thing to type -- you add the country code
-- to what you already know -- and it appears in the real data. The intended
-- number is unambiguous, so reading it is correction rather than guesswork.
--
-- Still nothing that requires a judgement call: a number with a digit missing,
-- or two numbers in one field, keeps returning NULL for a person to sort out.
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
    WHEN d ~ '^234[789][0-9]{9}$' THEN d
    WHEN d ~ '^0[789][0-9]{9}$' THEN '234' || substring(d from 2)
    WHEN d ~ '^[789][0-9]{9}$' THEN '234' || d
    WHEN d ~ '^00234[789][0-9]{9}$' THEN substring(d from 3)
    -- Country code followed by the local form, trunk zero included.
    WHEN d ~ '^2340[789][0-9]{9}$' THEN '234' || substring(d from 5)
    ELSE NULL
  END
  FROM digits;
$function$;
