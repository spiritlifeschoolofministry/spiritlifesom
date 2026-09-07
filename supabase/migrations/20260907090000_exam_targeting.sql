-- Who an assessment is for, in one rule that every layer asks.
--
-- exams already carried target_audience and target_student_ids, and neither
-- did anything. target_audience was read by nothing at all. target_student_ids
-- was wired into the visibility policy with OR, so naming students *widened*
-- the audience — an exam set to "specific" with three names was still visible
-- to the whole cohort, plus those three. exam-start, which is the only layer
-- that can actually stop a student sitting a paper, checked neither.
--
-- That is the same shape as the bug that let staff previews pass while every
-- student was refused: the layer people look at and the layer that enforces
-- disagreeing. So the rule lives in one function here, and the policy, the
-- question view and exam-start all call it rather than each restating it.
--
-- Semantics, in the words the builder uses:
--   "Everyone in the cohort", narrowed by study mode and language. Filters
--   narrow together — set both and a student must match both.
--   "Only these students" ignores the filters and uses the named list alone.
--
-- A blank attribute never matches a filter: s.learning_mode = ANY(...) is NULL
-- when the student has no mode recorded, which is not true, so they are
-- excluded. That is deliberate — targeting stays precise — and the builder
-- names those students before publishing so the exclusion is a decision rather
-- than a discovery on exam day.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS target_learning_modes TEXT[],
  ADD COLUMN IF NOT EXISTS target_languages TEXT[];

COMMENT ON COLUMN public.exams.target_learning_modes IS
  'Study modes this exam is limited to. NULL or empty means every mode. Ignored when target_audience is ''specific''.';
COMMENT ON COLUMN public.exams.target_languages IS
  'Preferred languages this exam is limited to. NULL or empty means every language. Ignored when target_audience is ''specific''.';
COMMENT ON COLUMN public.exams.target_audience IS
  '''cohort'' applies the cohort plus any mode/language filters; ''specific'' uses target_student_ids alone.';

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_target_audience_known;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_target_audience_known
  CHECK (target_audience IN ('cohort', 'specific'));

CREATE OR REPLACE FUNCTION public.exam_targets_student(p_exam_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.exams e, public.students s
     WHERE e.id = p_exam_id
       AND s.id = p_student_id
       AND CASE
             WHEN e.target_audience = 'specific'
               THEN s.id = ANY(COALESCE(e.target_student_ids, '{}'::UUID[]))
             ELSE
               s.cohort_id = e.cohort_id
               AND (COALESCE(CARDINALITY(e.target_learning_modes), 0) = 0
                    OR s.learning_mode = ANY(e.target_learning_modes))
               AND (COALESCE(CARDINALITY(e.target_languages), 0) = 0
                    OR s.preferred_language = ANY(e.target_languages))
           END
  );
$$;

COMMENT ON FUNCTION public.exam_targets_student(UUID, UUID) IS
  'The single answer to "is this exam for this student?". Called by the exams RLS policy, the exam_question_paper view and exam-start so the three cannot drift apart.';

REVOKE ALL ON FUNCTION public.exam_targets_student(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_targets_student(UUID, UUID) TO authenticated, service_role;

-- Visibility now asks the same question the runner will ask, instead of the
-- cohort-or-named-list test that could only ever widen.
DROP POLICY IF EXISTS exams_student_view ON public.exams;
CREATE POLICY exams_student_view ON public.exams
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['published', 'in_progress', 'closed'])
    AND public.exam_targets_student(id, public.get_my_student_id())
  );

-- Same rule for the sittable copy of the questions. Staff keep their own path.
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
              AND public.exam_targets_student(e.id, public.get_my_student_id())
         );
