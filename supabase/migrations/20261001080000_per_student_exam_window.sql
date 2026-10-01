-- A window that belongs to a student, not only to the paper.
--
-- start_at and end_at live on the exam, so every concession is all-or-nothing:
-- a student who was ill, or whose network died, or who was never told the exam
-- existed, could only be helped by reopening the paper for the entire cohort —
-- handing everyone who already sat it another look at the questions — or by
-- building them a duplicate exam of their own. Both were used in September, and
-- both are worse than saying the true thing: this student has until Friday.
--
-- An override replaces one or both ends of the window for one student. Null
-- means "keep the exam's own", so extending a deadline does not require
-- restating when the paper opened.
CREATE TABLE IF NOT EXISTS public.exam_window_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  reason TEXT,
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id),
  -- A window that ends before it opens would lock the student out of a
  -- concession granted to help them.
  CONSTRAINT exam_window_override_ordered CHECK (start_at IS NULL OR end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_window_override_lookup
  ON public.exam_window_overrides(exam_id, student_id);

ALTER TABLE public.exam_window_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS window_override_staff ON public.exam_window_overrides;
CREATE POLICY window_override_staff ON public.exam_window_overrides
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin', 'teacher']));

-- A student may see their own concession. They are going to be told about it
-- anyway, and a deadline you cannot see is not a deadline you can work to.
DROP POLICY IF EXISTS window_override_own ON public.exam_window_overrides;
CREATE POLICY window_override_own ON public.exam_window_overrides
  FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

/**
 * The window this student is actually working to.
 *
 * One answer, asked by exam-start before it will create an attempt and by the
 * page that tells the student when their paper opens and closes. Anything that
 * decides whether a student may sit has to agree with what the student was
 * told, which is why neither re-derives it.
 */
CREATE OR REPLACE FUNCTION public.exam_window_for(p_exam_id UUID, p_student_id UUID)
RETURNS TABLE (start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, overridden BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(o.start_at, e.start_at),
         COALESCE(o.end_at,   e.end_at),
         o.id IS NOT NULL
    FROM public.exams e
    LEFT JOIN public.exam_window_overrides o
           ON o.exam_id = e.id AND o.student_id = p_student_id
   WHERE e.id = p_exam_id;
$$;

REVOKE ALL ON FUNCTION public.exam_window_for(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_window_for(UUID, UUID) TO authenticated, service_role;

-- The paper unseals on the student's own opening time, not the exam's. A
-- student given an earlier start would otherwise face a blank paper, and one
-- given a later finish keeps reading as before, since the exam's start is
-- already behind them.
CREATE OR REPLACE VIEW public.exam_question_paper AS
  SELECT eq.exam_id, eq.display_order, q.id, q.question_type, q.question_text,
         q.image_url, q.code_snippet, q.code_language, q.options,
         COALESCE(eq.points_override, q.points) AS points
    FROM public.exam_questions eq
    JOIN public.question_bank q ON q.id = eq.question_id
   WHERE get_my_role() = ANY (ARRAY['admin', 'teacher'])
      OR EXISTS (
           SELECT 1
             FROM public.exams e
             CROSS JOIN LATERAL public.exam_window_for(e.id, public.get_my_student_id()) w
            WHERE e.id = eq.exam_id
              AND e.status = ANY (ARRAY['published', 'in_progress', 'closed'])
              AND now() >= w.start_at
              AND public.exam_targets_student(e.id, public.get_my_student_id())
         );

-- Asking on your own behalf should be the easy case, and asking on someone
-- else's should not be possible from a student's session. The id is optional;
-- a student's is forced to their own however they call it, so the page need
-- not know it and cannot lie about it.
-- Replaced in place: the view depends on this function, and a default is not
-- part of the signature, so it can be added without dropping anything.
CREATE OR REPLACE FUNCTION public.exam_window_for(p_exam_id UUID, p_student_id UUID DEFAULT NULL)
RETURNS TABLE (start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, overridden BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH who AS (
    SELECT CASE
             WHEN get_my_role() = ANY (ARRAY['admin', 'teacher'])
               THEN COALESCE(p_student_id, get_my_student_id())
             ELSE get_my_student_id()
           END AS student_id
  )
  SELECT COALESCE(o.start_at, e.start_at),
         COALESCE(o.end_at,   e.end_at),
         o.id IS NOT NULL
    FROM public.exams e
    CROSS JOIN who
    LEFT JOIN public.exam_window_overrides o
           ON o.exam_id = e.id AND o.student_id = who.student_id
   WHERE e.id = p_exam_id;
$$;

REVOKE ALL ON FUNCTION public.exam_window_for(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_window_for(UUID, UUID) TO authenticated, service_role;
