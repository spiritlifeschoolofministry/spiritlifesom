-- The type lives on the exam row, shared by everyone who sat it, and the label
-- on a student's record is read live. That makes a mislabelled assessment cheap
-- to correct — one field, and all forty records follow — but it also means an
-- edit months later silently rewrites transcripts already in students' hands.
--
-- So: freely editable until results are released, settled afterwards. Once a
-- mark is on somebody's transcript, what it was called is part of that record.
-- This mirrors how locked_at already stops a published exam being edited.

CREATE OR REPLACE FUNCTION public.enforce_assessment_type_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.results_released
     AND NEW.assessment_type IS DISTINCT FROM OLD.assessment_type THEN
    RAISE EXCEPTION
      'Results for "%" have been released, so it is recorded as a % on every student''s transcript. Its type can no longer be changed.',
      OLD.title, OLD.assessment_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exams_assessment_type_lock ON public.exams;
CREATE TRIGGER exams_assessment_type_lock
  BEFORE UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assessment_type_lock();

COMMENT ON FUNCTION public.enforce_assessment_type_lock() IS
  'Refuses a change to exams.assessment_type once results_released is true: the label is part of a transcript by then.';
