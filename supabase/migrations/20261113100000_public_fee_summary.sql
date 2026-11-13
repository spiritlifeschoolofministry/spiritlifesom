-- Fees on the public home page.
--
-- Visitors want to know what the programme costs before they apply, but
-- fee_structures is closed to anon (students read their own cohort's rows,
-- admins read all of them) and should stay that way. This function hands out
-- only the price list of the cohort currently taking applications: fee name,
-- amount and which learning modes it applies to. Nothing about any student.
--
-- "Currently taking applications" is the same cohort Register picks: the active
-- one, newest start date first if more than one is flagged active.
--
-- Admins can override what the home page says with the site_content row seeded
-- below (home / fees_note). Left empty, the page shows these live amounts.

CREATE OR REPLACE FUNCTION public.public_fee_summary()
RETURNS TABLE (fee_name text, amount numeric, learning_modes text[], cohort_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current_cohort AS (
    SELECT c.id, c.name
    FROM cohorts c
    WHERE c.is_active IS TRUE
    ORDER BY c.start_date DESC NULLS LAST
    LIMIT 1
  )
  SELECT fs.fee_name, fs.amount, fs.learning_modes, cc.name
  FROM fee_structures fs
  JOIN current_cohort cc ON cc.id = fs.cohort_id
  ORDER BY fs.amount DESC, fs.fee_name;
$$;

COMMENT ON FUNCTION public.public_fee_summary() IS
  'Public price list for the active cohort (fee name, amount, learning modes, cohort name). Safe for anon: exposes no student data.';

REVOKE ALL ON FUNCTION public.public_fee_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_fee_summary() TO anon, authenticated;

-- Admin-editable override, shown in Settings › Site content › home.
INSERT INTO public.site_content (page, section_key, label, content)
SELECT 'home', 'fees_note', 'Fees line on the home page (leave empty to show live fees)', ''
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_content WHERE page = 'home' AND section_key = 'fees_note'
);
