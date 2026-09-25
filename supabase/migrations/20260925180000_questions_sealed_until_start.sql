-- A paper stays sealed until the exam opens.
--
-- Starting early was already impossible: the lobby disables the button before
-- start_at and exam-start refuses outright, which is the layer that counts.
-- But the questions themselves were never gated on the clock. The sittable view
-- asked only whether the exam was published and whether the student was in its
-- audience — so from the moment a paper was published, anyone it targeted could
-- read every question straight from the API, hours or days ahead, without
-- starting anything and without leaving a trace.
--
-- Publishing is how staff tell a cohort an exam is coming. It should not also
-- hand them the paper.
--
-- The exam row stays visible before it opens, deliberately — a student needs to
-- see that it exists and when it starts. Only the questions wait.
CREATE OR REPLACE VIEW public.exam_question_paper AS
  SELECT eq.exam_id,
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
   WHERE get_my_role() = ANY (ARRAY['admin', 'teacher'])
      OR EXISTS (
           SELECT 1
             FROM public.exams e
            WHERE e.id = eq.exam_id
              AND e.status = ANY (ARRAY['published', 'in_progress', 'closed'])
              -- The seal. An attempt cannot exist before start_at either, so a
              -- resumed sitting is covered by the same condition.
              AND now() >= e.start_at
              AND public.exam_targets_student(e.id, public.get_my_student_id())
         );
