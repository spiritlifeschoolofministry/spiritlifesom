-- Onsite sittings that belong to a particular exam, and an exam you can retire
-- without erasing what students scored on it.
--
-- Three things, all the same problem: a mark's record has to outlive the
-- arrangements around it.

-- 1. Tie an offline record to the exam it was sat for.
--
-- Manual records already reach Grades, the transcript and analytics by the same
-- path as online work, so a student who sat on paper is not second-class on
-- their own portal. What could not be said was *which* paper — an onsite mark
-- was coursework in the Exam category, floating in the course, so no screen
-- could show one mark list for "SLM 101, everyone who sat it, however they sat
-- it". Staff had to read two lists and merge them by eye.
--
-- SET NULL rather than CASCADE: deleting an exam must never take a student's
-- recorded mark with it. The record survives, merely unlinked.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assignments.exam_id IS
  'The exam this offline record was sat for, when it was one. NULL for ordinary coursework. Lets an exam show every mark, online and onsite, in one list.';

CREATE INDEX IF NOT EXISTS idx_assignments_exam ON public.assignments(exam_id) WHERE exam_id IS NOT NULL;

-- 2. A student keeps sight of an exam they actually sat.
--
-- The visibility rule answers "is this exam for you?", which is the right
-- question before a sitting and the wrong one afterwards. An exam retired to
-- archived, or retargeted to a different group, stopped being readable — and
-- because the transcript reads the result through the exam row, the mark
-- silently dropped off the student's record. A sitting is a fact about the
-- student, not a setting on the exam.
DROP POLICY IF EXISTS exams_student_view ON public.exams;
CREATE POLICY exams_student_view ON public.exams
  FOR SELECT TO authenticated
  USING (
    (
      status = ANY (ARRAY['published', 'in_progress', 'closed'])
      AND public.exam_targets_student(id, public.get_my_student_id())
    )
    OR EXISTS (
      SELECT 1 FROM public.exam_attempts a
       WHERE a.exam_id = exams.id
         AND a.student_id = public.get_my_student_id()
    )
  );

-- 3. Stop a delete from taking the results with it.
--
-- exam_attempts cascaded from exams, so deleting a finished assessment erased
-- every score on it — the transcripts, the averages, the lot — and the only
-- warning was a line of dialog text. Retiring an old paper is an ordinary
-- administrative act; losing a cohort's marks to it is not, and it is not
-- recoverable.
--
-- RESTRICT makes the database refuse, so no screen, script or stray query can
-- do it by accident. Archiving is the way to retire an assessment, and the
-- staff list now offers it. Deliberately discarding results stays possible, but
-- it has to be a decision about the attempts themselves.
ALTER TABLE public.exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_exam_id_fkey;
ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_exam_id_fkey
  FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE RESTRICT;
