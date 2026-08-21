-- The exam engine is about to carry tests, quizzes and assignments, not only
-- exams. Nothing on the row said which it was, so the student's grades and
-- transcript stamped "Exam" on everything that came through it — a weekly
-- ten-mark test printed on a transcript as an exam.
--
-- Defaults to 'Exam' so every exam already run keeps the label it has.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'Exam';

-- A fixed list, so the same kind of assessment cannot end up written three
-- ways ('Test', 'test', 'Tests') across students' records — which is exactly
-- how the cohort names drifted apart.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_assessment_type_check;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_assessment_type_check
  CHECK (assessment_type IN ('Exam', 'Test', 'Quiz', 'Assignment'));

COMMENT ON COLUMN public.exams.assessment_type IS
  'What this assessment is called on a student''s record: Exam, Test, Quiz or Assignment. The delivery mechanics are identical; only the label and the grouping differ.';
