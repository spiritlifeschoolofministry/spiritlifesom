-- A record of who tried to reach an exam, not only who succeeded.
--
-- A student said he could not see his test. Everything the database could
-- answer said otherwise — enrolled, approved, targeted by all six papers — and
-- yet there was no way to tell whether he had ever opened the page, because
-- nothing is written until an attempt is created. A student blocked before that
-- point leaves no trace at all, which is exactly the student most likely to be
-- complaining. Portal activity logging began four days after the sitting, and
-- edge logs are long expired, so the morning cannot be reconstructed.
--
-- The gap matters most in the case it was built to answer: on 5 September every
-- student was refused with "Exam has no questions" for the first fifty minutes,
-- and not one of those refusals was recorded anywhere. Twenty online students
-- sat nothing and we still cannot say which of them tried.
--
-- So: one row per approach to an exam, whether it opened or not.

CREATE TABLE IF NOT EXISTS public.exam_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  -- What the student did, in the words of the thing they were trying to do.
  --   listed    saw the exams page
  --   opened    opened one exam's front page
  --   refused   asked to start and was turned away — `detail` says why
  --   started   an attempt was created
  --   resumed   came back to an attempt already in flight
  event TEXT NOT NULL CHECK (event IN ('listed', 'opened', 'refused', 'started', 'resumed')),
  detail TEXT,
  user_agent TEXT,
  -- 'live' was written as it happened. 'salvaged' was reconstructed afterwards
  -- from whatever survived, and is evidence of a weaker kind — it must never be
  -- read as though someone observed it at the time.
  source TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'salvaged'))
);

CREATE INDEX IF NOT EXISTS idx_exam_access_exam ON public.exam_access_events(exam_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_access_student ON public.exam_access_events(student_id, occurred_at DESC);

ALTER TABLE public.exam_access_events ENABLE ROW LEVEL SECURITY;

-- Staff read everything; this is the record they will be asked to arbitrate on.
DROP POLICY IF EXISTS exam_access_staff_read ON public.exam_access_events;
CREATE POLICY exam_access_staff_read ON public.exam_access_events
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'teacher']));

-- A student may record their own approaches and read them back, and nothing
-- else. They cannot see another student's, and they cannot alter what is
-- written — a log a student can edit answers no question worth asking.
DROP POLICY IF EXISTS exam_access_student_write ON public.exam_access_events;
CREATE POLICY exam_access_student_write ON public.exam_access_events
  FOR INSERT TO authenticated
  WITH CHECK (student_id = public.get_my_student_id() AND source = 'live');

DROP POLICY IF EXISTS exam_access_student_read ON public.exam_access_events;
CREATE POLICY exam_access_student_read ON public.exam_access_events
  FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

/**
 * Record one approach to an exam.
 *
 * A function rather than a bare insert so the student's identity comes from
 * their token instead of from the page, and so a logging failure can never
 * take the exam down with it: a student who cannot be logged must still be
 * able to sit.
 */
CREATE OR REPLACE FUNCTION public.log_exam_access(
  p_event TEXT,
  p_exam_id UUID DEFAULT NULL,
  p_detail TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID := public.get_my_student_id();
BEGIN
  IF v_student IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.exam_access_events (student_id, exam_id, event, detail, user_agent, source)
  VALUES (v_student, p_exam_id, p_event, p_detail, left(coalesce(p_user_agent, ''), 400), 'live');
EXCEPTION WHEN OTHERS THEN
  -- Never let the record-keeping break the sitting.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.log_exam_access(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_exam_access(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Salvage from 5 September 2026.
--
-- auth.users keeps only the *last* sign-in, so this survives for a student who
-- has not logged in since and is overwritten for everyone else. It is therefore
-- a floor, never a roll: absence here proves nothing. Captured now because the
-- next login destroys it.
--
-- Recorded as 'listed' with the qualification in `detail`, because signing in
-- on the day is the closest thing we have to evidence that someone came looking
-- — and for the two students below who sat nothing, it is the only trace left
-- that they were there at all.
INSERT INTO public.exam_access_events (occurred_at, student_id, exam_id, event, detail, source)
SELECT u.last_sign_in_at,
       s.id,
       NULL,
       'listed',
       'Signed in on exam day; reconstructed from the last-sign-in stamp, not observed at the time',
       'salvaged'
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  JOIN auth.users u ON u.id = p.id
 WHERE s.is_staff_preview = false
   AND u.last_sign_in_at >= TIMESTAMPTZ '2026-09-05 00:00+01'
   AND u.last_sign_in_at <  TIMESTAMPTZ '2026-09-06 00:00+01'
   AND NOT EXISTS (
     SELECT 1 FROM public.exam_access_events e
      WHERE e.student_id = s.id AND e.source = 'salvaged'
   );
