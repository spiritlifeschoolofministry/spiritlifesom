-- Course feedback.
--
-- Staff open feedback on a course; each student on that course's cohort answers
-- once: four ratings and two optional comments.
--
-- Staff read answers through course_feedback_responses, which leaves the
-- student out. The table keeps student_id only to hold "one answer each" and to
-- show a student what they have already sent.

-- Opened by a person, not by is_completed: every existing course is already
-- marked completed, and tying the two together would have opened feedback on
-- all of them, for last session's cohort too, the moment this ran.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS feedback_open BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.course_feedback (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  rating_overall SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_content SMALLINT NOT NULL CHECK (rating_content BETWEEN 1 AND 5),
  rating_teaching SMALLINT NOT NULL CHECK (rating_teaching BETWEEN 1 AND 5),
  rating_materials SMALLINT NOT NULL CHECK (rating_materials BETWEEN 1 AND 5),
  liked TEXT CHECK (liked IS NULL OR length(liked) <= 2000),
  improve TEXT CHECK (improve IS NULL OR length(improve) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

ALTER TABLE public.course_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their own feedback"
  ON public.course_feedback FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

-- Only while the course is open for feedback, and only for a course on the
-- student's own cohort. No update or delete policy: an answer is sent once.
CREATE POLICY "Students send feedback on open courses"
  ON public.course_feedback FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_my_student_id()
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      JOIN public.students s ON s.cohort_id = c.cohort_id
      WHERE c.id = course_feedback.course_id
        AND s.id = course_feedback.student_id
        AND c.feedback_open
    )
  );

GRANT SELECT, INSERT ON public.course_feedback TO authenticated;
GRANT ALL ON public.course_feedback TO service_role;

-- What staff read. No student id, and the day rather than the minute, so an
-- answer cannot be matched to who was online when it arrived.
CREATE OR REPLACE VIEW public.course_feedback_responses AS
  SELECT f.id,
    f.course_id,
    f.rating_overall,
    f.rating_content,
    f.rating_teaching,
    f.rating_materials,
    f.liked,
    f.improve,
    f.created_at::date AS sent_on
  FROM public.course_feedback f
    JOIN public.students s ON s.id = f.student_id
  WHERE public.get_my_role() IN ('admin', 'teacher')
    AND COALESCE(s.is_staff_preview, false) = false;

REVOKE ALL ON public.course_feedback_responses FROM anon;
GRANT SELECT ON public.course_feedback_responses TO authenticated;

COMMENT ON VIEW public.course_feedback_responses IS
  'Course feedback for staff, without the student. Runs with owner privileges; '
  'the WHERE clause is the access rule.';

-- Tell the cohort when a course opens for feedback.
CREATE OR REPLACE FUNCTION public.notify_feedback_opened()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.feedback_open AND NOT COALESCE(OLD.feedback_open, false) AND NEW.cohort_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT s.profile_id,
      'Feedback open: ' || NEW.code,
      'Tell the school how ' || NEW.title || ' went. It takes about two minutes.',
      'feedback',
      '/student/feedback'
    FROM students s
    WHERE s.cohort_id = NEW.cohort_id
      AND COALESCE(s.is_staff_preview, false) = false
      AND upper(COALESCE(s.admission_status, '')) <> 'PENDING';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Feedback notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_course_feedback_opened ON public.courses;
CREATE TRIGGER on_course_feedback_opened
AFTER UPDATE OF feedback_open ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.notify_feedback_opened();
