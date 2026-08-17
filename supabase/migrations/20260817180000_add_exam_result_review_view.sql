-- Let a student read back their own released result.
--
-- The results breakdown embedded question_bank, which carries only the staff
-- policy, so every field came back null for an actual student — the same blind
-- spot as the exam paper itself, and again invisible to an admin previewing the
-- portal, whose role passes the staff policy.
--
-- Answer key handling is the point of the view. correct_answer and explanation
-- are nulled unless the exam is both released and set to show correct answers,
-- so an unreleased or answers-hidden exam cannot leak its key through here.
--
-- Owned by postgres and NOT security_invoker: the WHERE clause is the access
-- check, and it restricts rows to the caller's own attempts, or to staff.
CREATE OR REPLACE VIEW public.exam_result_answers AS
SELECT
  ea.id,
  ea.attempt_id,
  ea.question_id,
  ea.answer,
  ea.points_awarded,
  ea.is_correct,
  ea.manual_feedback,
  att.exam_id,
  q.question_text,
  q.question_type,
  q.options,
  q.points,
  CASE WHEN e.results_released AND e.show_correct_answers THEN q.correct_answer END AS correct_answer,
  CASE WHEN e.results_released AND e.show_correct_answers THEN q.explanation END AS explanation
FROM public.exam_answers ea
  JOIN public.exam_attempts att ON att.id = ea.attempt_id
  JOIN public.exams e ON e.id = att.exam_id
  JOIN public.question_bank q ON q.id = ea.question_id
WHERE
  public.get_my_role() = ANY (ARRAY['admin', 'teacher'])
  OR (
    att.student_id = public.get_my_student_id()
    AND e.results_released
  );

COMMENT ON VIEW public.exam_result_answers IS
  'A student''s own marked answers for an exam whose results have been released, with the question text alongside. correct_answer and explanation appear only when the exam is set to show them. Staff see every row.';

GRANT SELECT ON public.exam_result_answers TO authenticated;
