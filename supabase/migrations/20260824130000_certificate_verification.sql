-- A certificate could be downloaded but not checked. Nothing recorded that one
-- had been issued, when, or under what name, and an employer holding a printed
-- copy had no way to tell it from something made in a word processor.
--
-- Graduation is the issue event -- a certificate here belongs to a student who
-- already exists, so there is nothing to claim and no roster to match a typed
-- name against. Reaching GRADUATE issues one row, once, and that row carries the
-- serial printed on the sheet.
--
-- Verification goes through a function rather than a read policy on the table.
-- The serial is the only thing a stranger presents, so a policy would have to
-- let anon SELECT the table, and anon SELECT plus a guessable key is a roster of
-- every graduate. A SECURITY DEFINER function answers about exactly one serial
-- and exposes only what is already printed on the certificate.

-- 1. Serials -----------------------------------------------------------------
--
-- Deliberately not derived from student_code, which is sequential: SLSM-2526-0001
-- tells you SLSM-2526-0002 exists. A serial has to be unguessable or the verify
-- page enumerates the graduate roll.

-- gen_random_bytes below is pgcrypto. An early migration created the extension
-- unqualified, which lands it in public, but a Supabase project may already have
-- had it in extensions, in which case that CREATE was a no-op and it is still
-- there. Both schemas are on the search_path so the call resolves either way.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.next_certificate_serial()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  -- Crockford base32: no I, L, O or U, so a serial read off paper and typed back
  -- in cannot be confused with 1, 0 or an obscenity.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempt integer := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      -- gen_random_bytes, not random() -- random() is seeded per session and
      -- predictable, which for a public lookup key is the whole problem.
      candidate := candidate || substr(
        alphabet,
        1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)),
        1
      );
    END LOOP;

    candidate := 'SLSM-' || substr(candidate, 1, 4) || '-' || substr(candidate, 5, 4);

    EXIT WHEN NOT EXISTS (SELECT 1 FROM certificates WHERE serial = candidate);

    attempt := attempt + 1;
    IF attempt > 50 THEN
      RAISE EXCEPTION 'Could not find an unused certificate serial';
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

COMMENT ON FUNCTION public.next_certificate_serial() IS
  'An unused, unguessable certificate serial. Crockford base32 so it survives being read off paper.';

-- 2. The record --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One certificate per student. A student who is moved to another cohort and
  -- graduates from that one keeps the same certificate, re-pointed -- they
  -- completed the programme once.
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,

  serial text NOT NULL UNIQUE DEFAULT public.next_certificate_serial(),

  -- The code as printed at the time of issue. students.student_code is reissued
  -- by a cohort move, and a printed sheet does not change when it is.
  student_code_at_issue text,

  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  revoked_at timestamptz,
  revoke_reason text,

  CONSTRAINT revoke_reason_requires_revocation
    CHECK (revoked_at IS NOT NULL OR revoke_reason IS NULL)
);

CREATE INDEX IF NOT EXISTS certificates_cohort_idx ON public.certificates (cohort_id);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read all certificates" ON public.certificates;
CREATE POLICY "Staff read all certificates" ON public.certificates
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

DROP POLICY IF EXISTS "Students read their own certificate" ON public.certificates;
CREATE POLICY "Students read their own certificate" ON public.certificates
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
  );

-- No INSERT, UPDATE or DELETE policy, and nothing granted to anon. Rows are
-- written by the issue and revoke functions, which are SECURITY DEFINER; the
-- public reads them only through verify_certificate.
GRANT SELECT ON public.certificates TO authenticated;

COMMENT ON TABLE public.certificates IS
  'One row per graduate, created when they reach GRADUATE. The serial is printed on the sheet and is what verify_certificate answers about.';

-- 3. Issuing -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_certificate(p_student_id uuid)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student students%ROWTYPE;
  v_existing certificates%ROWTYPE;
  v_row certificates%ROWTYPE;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That student no longer exists';
  END IF;

  IF COALESCE(v_student.admission_status, '') <> 'GRADUATE' THEN
    RAISE EXCEPTION 'Only a graduate can be issued a certificate (this student is "%")',
      COALESCE(v_student.admission_status, 'none');
  END IF;

  -- Idempotent: asking twice returns the certificate they already hold rather
  -- than minting a second serial for the same person.
  SELECT * INTO v_existing FROM certificates WHERE student_id = p_student_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO certificates (student_id, cohort_id, student_code_at_issue, issued_by)
  VALUES (p_student_id, v_student.cohort_id, v_student.student_code, auth.uid())
  RETURNING * INTO v_row;

  PERFORM audit_log_event(
    'certificate.issued', 'student', p_student_id,
    'Certificate ' || v_row.serial || ' issued',
    NULL::jsonb,
    jsonb_build_object('serial', v_row.serial, 'cohort_id', v_row.cohort_id),
    jsonb_build_object('certificate_id', v_row.id)
  );

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_certificate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_certificate(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid) TO authenticated;

COMMENT ON FUNCTION public.issue_certificate(uuid) IS
  'Issues the certificate for one graduate, or returns the one they already hold. Refuses anyone who is not GRADUATE.';

-- Graduation is what issues it, so nobody has to remember to.
CREATE OR REPLACE FUNCTION public.issue_certificate_on_graduation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.admission_status, '') = 'GRADUATE' THEN
    INSERT INTO certificates (student_id, cohort_id, student_code_at_issue, issued_by)
    VALUES (NEW.id, NEW.cohort_id, NEW.student_code, auth.uid())
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_student_graduated_issue_certificate ON public.students;
CREATE TRIGGER on_student_graduated_issue_certificate
  AFTER INSERT OR UPDATE OF admission_status ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.issue_certificate_on_graduation();

-- 4. Revoking ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_certificate_revocation(
  p_serial text,
  p_revoked boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row certificates%ROWTYPE;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can revoke or reinstate a certificate';
  END IF;

  UPDATE certificates
  SET revoked_at = CASE WHEN p_revoked THEN COALESCE(revoked_at, now()) END,
      revoke_reason = CASE WHEN p_revoked THEN NULLIF(btrim(COALESCE(p_reason, '')), '') END
  WHERE serial = upper(btrim(p_serial))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No certificate with serial %', p_serial;
  END IF;

  PERFORM audit_log_event(
    CASE WHEN p_revoked THEN 'certificate.revoked' ELSE 'certificate.reinstated' END,
    'student', v_row.student_id,
    'Certificate ' || v_row.serial || CASE WHEN p_revoked THEN ' revoked' ELSE ' reinstated' END,
    NULL::jsonb,
    jsonb_build_object('revoked_at', v_row.revoked_at, 'reason', v_row.revoke_reason),
    jsonb_build_object('serial', v_row.serial)
  );

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_certificate_revocation(text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_certificate_revocation(text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_certificate_revocation(text, boolean, text) TO authenticated;

-- 5. Verifying ---------------------------------------------------------------

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
  -- approved name change updates both at once.
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
    'graduated_on', COALESCE(s.graduation_date, co.graduation_date),
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

-- The one thing the public may call. It reveals only what the certificate it is
-- being asked about already has printed on its face.
REVOKE EXECUTE ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

COMMENT ON FUNCTION public.verify_certificate(text) IS
  'Public certificate lookup by serial. Returns {found:false} for anything unknown or malformed, so it cannot be used to enumerate graduates.';

-- 6. The graduates who already graduated -------------------------------------

INSERT INTO public.certificates (student_id, cohort_id, student_code_at_issue, issued_at)
SELECT s.id,
       s.cohort_id,
       s.student_code,
       -- Their graduation is the honest issue date, not the date of this migration.
       COALESCE(s.graduation_date::timestamptz, c.graduation_date::timestamptz, now())
FROM public.students s
LEFT JOIN public.cohorts c ON c.id = s.cohort_id
WHERE COALESCE(s.admission_status, '') = 'GRADUATE'
ON CONFLICT (student_id) DO NOTHING;
