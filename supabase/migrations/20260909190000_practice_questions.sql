-- A practice pool that is not the exam bank.
--
-- Practice used to draw from `question_bank`, which is where real exam and test
-- questions live, and it reveals the correct answer and the explanation after
-- every answer. A student practising a course could therefore have been shown
-- the questions from their own upcoming paper, with the answers, in advance.
--
-- Nothing leaked: every row in the bank is an essay, and practice excludes
-- essays because there is nothing to mark an answer against. But the barrier
-- was a filter, and a filter is one edit away from being wrong. So the pools
-- are separate tables. No query mistake can cross them, and a question written
-- for practice can never be picked into an exam by accident.
--
-- The columns mirror `question_bank`'s answerable subset deliberately, so
-- `autograde.ts` marks a practice answer with the same code that marks a real
-- one. A student practising against a different marker to the one that will
-- mark them is being taught the wrong lesson.

CREATE TABLE IF NOT EXISTS public.practice_questions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,

  question_text TEXT NOT NULL,
  -- No essay. Practice tells a student whether they were right, and an essay
  -- cannot be marked that way here — offering one would be offering a question
  -- this page cannot answer.
  question_type TEXT NOT NULL
    CHECK (question_type IN ('mcq_single', 'mcq_multi', 'true_false', 'short_answer')),
  options JSONB,
  correct_answer JSONB,
  explanation TEXT,
  points NUMERIC NOT NULL DEFAULT 1,

  source_material_id UUID REFERENCES public.course_materials(id) ON DELETE SET NULL,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  -- Drafts are invisible to students. Approving is a person saying they have
  -- read it, which is the whole safeguard around a drafted answer key.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What practice_start asks for: this course's approved, unarchived questions.
CREATE INDEX IF NOT EXISTS idx_practice_questions_pool
  ON public.practice_questions (course_id, status, archived);

ALTER TABLE public.practice_questions ENABLE ROW LEVEL SECURITY;

-- Staff only, and only staff. A student never reads this table directly — the
-- practice function serves questions with the answer key stripped, which is the
-- entire reason practice goes through a function. A student who can SELECT here
-- can read the answers to their own practice, and there is no version of that
-- which is fine.
CREATE POLICY "Staff manage practice questions"
  ON public.practice_questions FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_questions TO authenticated;
GRANT ALL ON public.practice_questions TO service_role;

COMMENT ON TABLE public.practice_questions IS
  'Questions students may practise against. Deliberately a different table from '
  'question_bank, which holds real exam and test questions: practice reveals the '
  'answer, so the two pools must never be one filter apart.';
