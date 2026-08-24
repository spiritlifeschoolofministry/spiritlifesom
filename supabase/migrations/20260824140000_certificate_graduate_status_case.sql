-- The certificate migration compared admission_status to 'GRADUATE' exactly,
-- but the app writes 'Graduate' -- see AdminStudents.tsx, which sets that on
-- both the single and the bulk graduate actions. Statuses in this column are not
-- consistently cased: 'ADMITTED' and 'REJECTED' are written upper, 'Graduate'
-- and 'Pending' are not. Every reader in the app already copes by upper-casing
-- before it compares, and the certificate SQL was the one place that did not.
--
-- The effect was silent: the backfill matched nobody, so the 27 graduates of
-- 2025/2026 got no certificate record, and the trigger would not have fired for
-- anyone graduating later either. issue_certificate would have refused a real
-- graduate outright.
--
-- Fixed by comparing the way the rest of the codebase does, rather than by
-- rewriting the stored values -- other comparisons in the app test for the
-- current mixed-case strings, and normalising the column would break them.

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

  IF upper(COALESCE(v_student.admission_status, '')) <> 'GRADUATE' THEN
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

CREATE OR REPLACE FUNCTION public.issue_certificate_on_graduation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF upper(COALESCE(NEW.admission_status, '')) = 'GRADUATE' THEN
    INSERT INTO certificates (student_id, cohort_id, student_code_at_issue, issued_by)
    VALUES (NEW.id, NEW.cohort_id, NEW.student_code, auth.uid())
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- The graduates the first backfill walked straight past.
--
-- issued_at is their cohort's graduation date rather than now(), so the date on
-- the verification page agrees with the date printed on the certificate, which
-- resolves the same way: the student's own graduation_date, then their cohort's.
INSERT INTO public.certificates (student_id, cohort_id, student_code_at_issue, issued_at)
SELECT s.id,
       s.cohort_id,
       s.student_code,
       COALESCE(s.graduation_date::timestamptz, c.graduation_date::timestamptz, now())
FROM public.students s
LEFT JOIN public.cohorts c ON c.id = s.cohort_id
WHERE upper(COALESCE(s.admission_status, '')) = 'GRADUATE'
  AND s.is_staff_preview = false
ON CONFLICT (student_id) DO NOTHING;
