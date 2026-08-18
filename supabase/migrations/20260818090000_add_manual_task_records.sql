-- Manual (offline) task records
--
-- The school teaches onsite students as well as online ones, and onsite work —
-- a class exercise, a practical, a group activity marked on paper — never
-- passes through the LMS. Those marks still belong on the student's Grades page
-- and transcript, so an admin needs a way to enter them directly.
--
-- Rather than a parallel table, an offline record is an ordinary `assignments`
-- row carrying the marks in `assignment_submissions`, exactly like LMS work.
-- Everything downstream (Grades, Transcript, Analytics, the grade notification)
-- reads those two tables, so an offline mark counts everywhere without any of
-- them learning a second shape. The flag below is what separates the two: an
-- offline record is a record of work already done, never something a student is
-- asked to submit, so the student-facing task list and the "pending tasks"
-- count must leave it out.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS is_manual_record boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assignments.is_manual_record IS
  'True for offline/onsite work entered by an admin after the fact. Students cannot submit to it: exclude from task lists and pending-task counts, and show it only to students who actually have a mark on it.';

-- Only the student-facing reads filter on this, and the flagged rows are the
-- minority, so index the exceptions rather than the whole table.
CREATE INDEX IF NOT EXISTS assignments_manual_record_idx
  ON public.assignments (cohort_id) WHERE is_manual_record;

-- Grade notifications on insert as well as update.
--
-- notify_on_grade only ever fired AFTER UPDATE, which was fine while every
-- grade landed on a submission row the student had already created. Marks
-- entered by an admin — bulk CSV import, and now offline records — arrive as
-- INSERTs with the grade already set, so the student was never told. Guard the
-- OLD reference on TG_OP: OLD is not populated during an INSERT.
CREATE OR REPLACE FUNCTION public.notify_on_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.grade IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.grade IS NULL OR OLD.grade != NEW.grade) THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT
      s.profile_id,
      'Grade Posted',
      'You received a score of ' || NEW.grade || ' on a task.',
      'grade',
      '/student/grades'
    FROM students s
    WHERE s.id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_grade_posted_notify ON public.assignment_submissions;
CREATE TRIGGER on_grade_posted_notify
  AFTER INSERT OR UPDATE ON public.assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_grade();
