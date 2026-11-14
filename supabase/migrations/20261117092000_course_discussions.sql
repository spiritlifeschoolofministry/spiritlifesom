-- Course discussions: students ask a question under a course, coursemates and
-- staff answer.
--
-- A student sees the questions for courses on their own cohort; staff see all.
-- Names come through the two *_feed views because profiles are not readable by
-- other students.

CREATE OR REPLACE FUNCTION public.can_access_course_discussion(p_course_id UUID)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(get_my_role() IN ('admin', 'teacher'), false)
    OR EXISTS (
      SELECT 1
      FROM courses c
      JOIN students s ON s.cohort_id = c.cohort_id
      WHERE c.id = p_course_id
        AND s.profile_id = auth.uid()
        AND upper(COALESCE(s.admission_status, '')) <> 'PENDING'
    );
$function$;

CREATE TABLE IF NOT EXISTS public.course_questions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 200),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_answers (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.course_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_questions_course ON public.course_questions (course_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_answers_question ON public.course_answers (question_id, created_at);

ALTER TABLE public.course_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read questions on your courses"
  ON public.course_questions FOR SELECT TO authenticated
  USING (public.can_access_course_discussion(course_id));

CREATE POLICY "Ask on your courses"
  ON public.course_questions FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_course_discussion(course_id));

-- The asker marks their question resolved or rewords it; staff can do either.
CREATE POLICY "Author or staff update questions"
  ON public.course_questions FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (
    (author_id = auth.uid() OR public.get_my_role() IN ('admin', 'teacher'))
    AND public.can_access_course_discussion(course_id)
  );

CREATE POLICY "Author or staff delete questions"
  ON public.course_questions FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Read answers on your courses"
  ON public.course_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_questions q
    WHERE q.id = course_answers.question_id
      AND public.can_access_course_discussion(q.course_id)
  ));

CREATE POLICY "Answer on your courses"
  ON public.course_answers FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.course_questions q
      WHERE q.id = course_answers.question_id
        AND public.can_access_course_discussion(q.course_id)
    )
  );

CREATE POLICY "Author or staff delete answers"
  ON public.course_answers FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_questions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.course_answers TO authenticated;
GRANT ALL ON public.course_questions, public.course_answers TO service_role;

-- Questions with the asker's name and the answer counts the list needs.
CREATE OR REPLACE VIEW public.course_question_feed AS
  SELECT q.id,
    q.course_id,
    c.code AS course_code,
    c.title AS course_title,
    c.cohort_id,
    q.author_id,
    p.first_name AS author_first_name,
    p.last_name AS author_last_name,
    p.avatar_url AS author_avatar_url,
    (p.role IN ('admin', 'teacher')) AS author_is_staff,
    q.title,
    q.body,
    q.is_resolved,
    q.created_at,
    q.last_activity_at,
    (SELECT count(*) FROM public.course_answers a WHERE a.question_id = q.id)::int AS answer_count,
    EXISTS (
      SELECT 1 FROM public.course_answers a
      JOIN public.profiles ap ON ap.id = a.author_id
      WHERE a.question_id = q.id AND ap.role IN ('admin', 'teacher')
    ) AS has_staff_answer
  FROM public.course_questions q
    JOIN public.courses c ON c.id = q.course_id
    JOIN public.profiles p ON p.id = q.author_id
  WHERE public.can_access_course_discussion(q.course_id);

CREATE OR REPLACE VIEW public.course_answer_feed AS
  SELECT a.id,
    a.question_id,
    a.author_id,
    p.first_name AS author_first_name,
    p.last_name AS author_last_name,
    p.avatar_url AS author_avatar_url,
    (p.role IN ('admin', 'teacher')) AS author_is_staff,
    a.body,
    a.created_at
  FROM public.course_answers a
    JOIN public.course_questions q ON q.id = a.question_id
    JOIN public.profiles p ON p.id = a.author_id
  WHERE public.can_access_course_discussion(q.course_id);

REVOKE ALL ON public.course_question_feed, public.course_answer_feed FROM anon;
GRANT SELECT ON public.course_question_feed, public.course_answer_feed TO authenticated;

COMMENT ON VIEW public.course_question_feed IS
  'Discussion questions with author names. Owner privileges; access is the '
  'can_access_course_discussion() filter.';
COMMENT ON VIEW public.course_answer_feed IS
  'Discussion answers with author names. Owner privileges; access is the '
  'can_access_course_discussion() filter.';

-- A new question goes to staff, so it does not wait for somebody to look.
CREATE OR REPLACE FUNCTION public.notify_course_question()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM courses WHERE id = NEW.course_id;
  INSERT INTO notifications (user_id, title, body, type, link)
  SELECT p.id,
    'New question on ' || COALESCE(v_code, 'a course'),
    left(NEW.title, 200),
    'discussion',
    '/admin/discussions?q=' || NEW.id
  FROM profiles p
  WHERE p.role IN ('admin', 'teacher') AND p.id <> NEW.author_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Question notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_course_question_created ON public.course_questions;
CREATE TRIGGER on_course_question_created
AFTER INSERT ON public.course_questions
FOR EACH ROW EXECUTE FUNCTION public.notify_course_question();

-- An answer bumps the question up the list and tells the asker.
CREATE OR REPLACE FUNCTION public.notify_course_answer()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_question course_questions%ROWTYPE;
  v_asker_role text;
BEGIN
  UPDATE course_questions SET last_activity_at = now()
  WHERE id = NEW.question_id
  RETURNING * INTO v_question;

  IF v_question.author_id IS NOT NULL AND v_question.author_id <> NEW.author_id THEN
    SELECT role INTO v_asker_role FROM profiles WHERE id = v_question.author_id;
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      v_question.author_id,
      'New answer to your question',
      left(v_question.title, 200),
      'discussion',
      CASE WHEN v_asker_role IN ('admin', 'teacher') THEN '/admin/discussions?q=' ELSE '/student/discussions?q=' END
        || v_question.id
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Answer notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_course_answer_created ON public.course_answers;
CREATE TRIGGER on_course_answer_created
AFTER INSERT ON public.course_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_course_answer();
