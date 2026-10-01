-- Let a lecturer do the thing the app already tells students to ask for.
--
-- Three different screens tell a blocked student to "ask your lecturer to reset
-- your attempt" — the device-conflict message, the rule-breach message, the
-- already-submitted message. No such button exists. Staff could only ask
-- someone with database access to delete a row, which is how the September
-- restarts were actually done: by hand, in bulk, with no record of who decided
-- what or why.
--
-- A reset destroys a sitting. It has to leave a trace that outlives it, which
-- is why this is a function and not a delete from the page: the audit entry is
-- written from inside the same transaction, while the attempt is still there to
-- be described. A client-side delete can only report what it meant to remove.
CREATE OR REPLACE FUNCTION public.reset_exam_attempt(p_attempt_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt  RECORD;
  v_answers  INT;
  v_written  INT;
  v_student  TEXT;
  v_exam     TEXT;
  v_left     INT;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'admin' AND get_my_role() IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'Only staff can reset an exam attempt';
  END IF;

  SELECT a.*, e.title AS exam_title INTO v_attempt
    FROM public.exam_attempts a JOIN public.exams e ON e.id = a.exam_id
   WHERE a.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That attempt no longer exists';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE answer IS NOT NULL)
    INTO v_answers, v_written
    FROM public.exam_answers WHERE attempt_id = p_attempt_id;

  SELECT s.student_code INTO v_student FROM public.students s WHERE s.id = v_attempt.student_id;
  v_exam := v_attempt.exam_title;

  -- Written before the delete, so it can say what was actually lost rather than
  -- what was intended. Marks included: a reset after marking throws away a
  -- lecturer's judgement as well as a student's work.
  PERFORM audit_log_event(
    'exam.attempt_reset',
    'exam_attempt',
    p_attempt_id,
    'Reset ' || COALESCE(v_student, 'unknown') || '''s attempt at ' || v_exam ||
      ' — ' || v_written || ' answer(s) written, score ' ||
      COALESCE(v_attempt.score::TEXT, 'unmarked') ||
      CASE WHEN p_reason IS NULL OR btrim(p_reason) = '' THEN '' ELSE '. Reason: ' || btrim(p_reason) END,
    to_jsonb(v_attempt) - 'exam_title',
    NULL,
    jsonb_build_object('reason', NULLIF(btrim(COALESCE(p_reason, '')), ''),
                       'answers_written', v_written,
                       'answer_rows', v_answers)
  );

  -- Answers, events, snapshots and audio clips cascade from the attempt.
  DELETE FROM public.exam_attempts WHERE id = p_attempt_id;

  -- An exam locks on its first attempt so staff cannot edit a paper underneath
  -- a student. With every attempt gone that lock guards nothing, and leaving it
  -- set silently blocks the builder with no visible cause — which cost an hour
  -- when a test attempt did exactly this in September.
  SELECT count(*) INTO v_left FROM public.exam_attempts WHERE exam_id = v_attempt.exam_id;
  IF v_left = 0 THEN
    UPDATE public.exams SET locked_at = NULL WHERE id = v_attempt.exam_id;
  END IF;

  RETURN jsonb_build_object(
    'student', v_student, 'exam', v_exam,
    'answers_discarded', v_written, 'attempts_left_on_exam', v_left
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_exam_attempt(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_exam_attempt(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reset_exam_attempt(UUID, TEXT) IS
  'Discard one student''s sitting so they can start again. Staff only. Writes an audit entry describing what was destroyed, then deletes the attempt; clears the exam lock if nothing is left on it.';
