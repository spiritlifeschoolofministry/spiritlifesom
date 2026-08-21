-- Two related pieces of housekeeping on the 2025/2026 cohort.
--
-- 1. Cohort names were written in two different shapes — "2025/26" alongside
--    "2026/2027" — so the same session read differently depending on which
--    screen you were on. Every cohort now uses the full YYYY/YYYY form.
-- 2. The 2025/2026 session is closed and its remaining balances are not being
--    collected. They are waived rather than deleted, so the fee, its original
--    amount and any payments already recorded all stay on file.

-- ---------------------------------------------------------------------------
-- 1. Normalise cohort names to YYYY/YYYY
-- ---------------------------------------------------------------------------
-- "2025/26" -> "2025/2026". The end year takes the start year's century unless
-- the two digits wrap backwards ("2099/00" -> "2099/2100").
UPDATE public.cohorts
SET name = substring(name, 1, 4) || '/' || lpad(
      (
        (CASE
           WHEN right(name, 2)::int >= substring(name, 3, 2)::int
             THEN substring(name, 1, 2)::int
           ELSE substring(name, 1, 2)::int + 1
         END) * 100 + right(name, 2)::int
      )::text, 4, '0')
WHERE name ~ '^\d{4}/\d{2}$';

-- ---------------------------------------------------------------------------
-- 2. Waive what is still outstanding on the 2025/2026 cohort
-- ---------------------------------------------------------------------------
-- Scoped by whose fee it is, matching how the Analytics and student screens
-- attribute a fee to a cohort. Students who were moved on into a later cohort
-- keep their balances — only fees belonging to students still sitting in
-- 2025/2026 are written off.
UPDATE public.fees f
SET waived = true
WHERE COALESCE(f.waived, false) = false
  AND COALESCE(f.amount_due, 0) > COALESCE(f.amount_paid, 0)
  AND f.student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.cohorts c ON c.id = s.cohort_id
    WHERE c.name = '2025/2026'
  );

-- ---------------------------------------------------------------------------
-- 3. Site copy that spelled the session the short way
-- ---------------------------------------------------------------------------
-- The trailing class keeps "2025/2026" from being rewritten to "2025/20266"
-- if this ever runs twice: only a "26" that is not followed by another digit
-- is a short-form session.
UPDATE public.site_content
SET content = regexp_replace(content, '2025/26([^0-9]|$)', '2025/2026\1', 'g')
WHERE content ~ '2025/26([^0-9]|$)';

-- Certificate wording is stored per cohort and prints the session on the
-- certificate itself, so it has to spell it the same way the cohort now does.
UPDATE public.cohorts
SET certificate_text_main = regexp_replace(certificate_text_main, '2025/26([^0-9]|$)', '2025/2026\1', 'g'),
    certificate_text_sub  = regexp_replace(certificate_text_sub, '2025/26([^0-9]|$)', '2025/2026\1', 'g')
WHERE certificate_text_main ~ '2025/26([^0-9]|$)'
   OR certificate_text_sub ~ '2025/26([^0-9]|$)';

UPDATE public.seo_files
SET content = regexp_replace(content, '2025/26([^0-9]|$)', '2025/2026\1', 'g')
WHERE content ~ '2025/26([^0-9]|$)';

-- ---------------------------------------------------------------------------
-- 4. Keep the format from drifting again
-- ---------------------------------------------------------------------------
-- Added last, and NOT VALID, so a legacy name that is not a session at all can
-- neither block this migration nor break the updates above. It still applies to
-- every insert and update from here on.
ALTER TABLE public.cohorts
  DROP CONSTRAINT IF EXISTS cohorts_name_session_format;
ALTER TABLE public.cohorts
  ADD CONSTRAINT cohorts_name_session_format
  CHECK (name ~ '^\d{4}/\d{4}$') NOT VALID;
