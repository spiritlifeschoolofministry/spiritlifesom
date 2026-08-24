-- Every cohort carried graduation_date = 2025-04-20, which was the old
-- system_settings default ('20th April, 2025') copied across rather than a date
-- anyone chose. It was wrong for two of the three: 2026/2027 does not even start
-- until 2026-05-16, so it was recorded as graduating a month before it began.
--
-- Each session graduates in the April at its end:
--
--   2024/2025  2024-04-01 .. 2025-04-30  ->  2025-04-20
--   2025/2026  2025-05-31 .. 2026-05-31  ->  2026-04-20
--   2026/2027  2026-05-16 .. 2027-04-25  ->  2027-04-20  (current session)
--
-- Set by cohort name rather than by id so this reads as the decision it is.

UPDATE public.cohorts SET graduation_date = DATE '2025-04-20' WHERE name = '2024/2025';
UPDATE public.cohorts SET graduation_date = DATE '2026-04-20' WHERE name = '2025/2026';
UPDATE public.cohorts SET graduation_date = DATE '2027-04-20' WHERE name = '2026/2027';

-- The certificates backfilled for 2025/2026 were dated from the cohort's old,
-- wrong graduation date. They follow the correction.
UPDATE public.certificates c
SET issued_at = co.graduation_date::timestamptz
FROM public.cohorts co
WHERE co.id = c.cohort_id
  AND co.graduation_date IS NOT NULL
  AND c.issued_at::date <> co.graduation_date;

-- Graduation is a property of the session, not of the student: everyone in a
-- cohort graduates on the same day. students.graduation_date allowed a per-student
-- override that the certificate preferred over the cohort's, so one student could
-- silently carry a different date from the people they graduated beside.
--
-- Nothing reads it now. The column stays rather than being dropped, because
-- reset_staff_preview_student sets it and a historical value is not worth
-- destroying, but it is no longer part of how a date reaches a certificate.
COMMENT ON COLUMN public.students.graduation_date IS
  'Superseded by cohorts.graduation_date -- a cohort graduates on one day and the certificate reads it from there. Not written or read by the app.';

COMMENT ON COLUMN public.cohorts.graduation_date IS
  'The one date every graduate of this cohort is certified on. Printed on the certificate and reported by verify_certificate. Editable per cohort in admin certificate settings.';

-- verify_certificate reported COALESCE(student, cohort), which would have
-- disagreed with the certificate now that the sheet reads the cohort's date.
CREATE OR REPLACE FUNCTION public.verify_certificate(p_serial text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_serial text := upper(btrim(COALESCE(p_serial, '')));
  v_result jsonb;
BEGIN
  -- Nothing to look up, and no reason to touch the table.
  IF v_serial !~ '^SLSM-[0-9A-Z]{4}-[0-9A-Z]{4}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- The name comes from the student's live record rather than a snapshot, so a
  -- verified name always matches the name currently printed on the sheet -- an
  -- approved name change updates both at once. The date comes from the cohort,
  -- for the same reason: it is what the sheet prints.
  SELECT jsonb_build_object(
    'found', true,
    'status', CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked' ELSE 'valid' END,
    'serial', c.serial,
    'recipient_name', COALESCE(
      NULLIF(btrim(s.name_on_certificate), ''),
      btrim(concat_ws(' ', p.first_name, p.middle_name, p.last_name))
    ),
    'student_code', COALESCE(c.student_code_at_issue, s.student_code),
    'cohort', co.name,
    'issued_on', c.issued_at::date,
    'graduated_on', co.graduation_date,
    'revoked_on', c.revoked_at::date,
    'revoke_reason', c.revoke_reason
  )
  INTO v_result
  FROM certificates c
  JOIN students s ON s.id = c.student_id
  JOIN profiles p ON p.id = s.profile_id
  LEFT JOIN cohorts co ON co.id = c.cohort_id
  WHERE c.serial = v_serial;

  RETURN COALESCE(v_result, jsonb_build_object('found', false));
END;
$$;
