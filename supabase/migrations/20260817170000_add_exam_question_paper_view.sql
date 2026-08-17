-- Let students actually read the questions they have been served.
--
-- question_bank carries only qbank_staff_manage (admin/teacher), so the exam
-- runner's read of it returned zero rows for a real student — a blank paper.
-- An admin previewing the portal would never have seen this, because an admin
-- passes the staff policy.
--
-- A blanket student SELECT policy on question_bank is not the fix: the table
-- holds correct_answer and explanation, and the runner selects *. This view
-- exposes only the columns needed to sit the paper, so the answer key is not
-- reachable from the student session at all.
--
-- Owned by postgres and NOT security_invoker, so it bypasses RLS on the two
-- tables it reads; the WHERE clause is therefore the whole access check and
-- mirrors exams_student_view.
CREATE OR REPLACE VIEW public.exam_question_paper AS
SELECT
  eq.exam_id,
  eq.display_order,
  q.id,
  q.question_type,
  q.question_text,
  q.image_url,
  q.code_snippet,
  q.code_language,
  q.options,
  COALESCE(eq.points_override, q.points) AS points
FROM public.exam_questions eq
  JOIN public.question_bank q ON q.id = eq.question_id
WHERE
  public.get_my_role() = ANY (ARRAY['admin', 'teacher'])
  OR eq.exam_id IN (
    SELECT e.id
    FROM public.exams e
    WHERE e.status = ANY (ARRAY['published', 'in_progress', 'closed'])
      AND (
        e.cohort_id IN (
          SELECT s.cohort_id FROM public.students s WHERE s.profile_id = auth.uid()
        )
        OR public.get_my_student_id() = ANY (e.target_student_ids)
      )
  );

COMMENT ON VIEW public.exam_question_paper IS
  'Sittable copy of an exam paper: question_bank joined to exam_questions, with correct_answer and explanation deliberately omitted. Staff see every paper; students see only papers for published exams in their cohort or targeted at them.';

GRANT SELECT ON public.exam_question_paper TO authenticated;
