-- An exam, or a practice round, that spans every course.
--
-- Both tables recorded a single course because both were built for the same
-- shape: one paper, one subject. A general paper at the end of a session draws
-- from everything taught, and a student revising before it wants to practise
-- everything at once. Neither could be expressed, so the course column has to
-- stop being mandatory.
--
-- NULL means "no single course", not "unknown". Everything that reads these
-- columns treats it that way: the exam list and lobby say "All courses", and
-- the transcript, which groups exam results under the course they belong to,
-- leaves an all-courses paper out of that grouping rather than inventing a
-- course for it. The row is still on the student's grades either way.
--
-- Nothing in the database joins on exams.course_id but the foreign key and its
-- index, both of which are fine with NULL, so this is the whole change.

ALTER TABLE public.exams ALTER COLUMN course_id DROP NOT NULL;

COMMENT ON COLUMN public.exams.course_id IS
  'The course this paper belongs to, or NULL for a paper that spans every '
  'course. A NULL here is a deliberate "all courses", not missing data: the '
  'questions on it come from more than one course''s bank.';

ALTER TABLE public.practice_sessions ALTER COLUMN course_id DROP NOT NULL;

COMMENT ON COLUMN public.practice_sessions.course_id IS
  'The course practised, or NULL when the round drew from several courses at '
  'once. The questions actually served are in question_ids either way.';
