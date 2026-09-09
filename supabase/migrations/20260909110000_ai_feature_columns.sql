-- What the eight AI features need on the tables they already work with.
--
-- Nothing here changes existing behaviour. Every column is nullable or carries
-- a default matching how the app behaves today, and the one new constraint
-- (`question_bank.status`) backfills to 'approved' so every question written
-- before this migration stays exactly as visible as it was.

-- ---------------------------------------------------------------------------
-- Course materials: tags, and the excerpt the models are given
-- ---------------------------------------------------------------------------

ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- The opening of the document, read once with pdf.js in the browser and kept.
--
-- Kept rather than re-read because four features want it — describing the
-- material, tagging it, drafting questions from it, answering a student's
-- question about it — and a PDF is only readable in the browser that holds it.
-- Re-extracting for each would mean the uploader is the only place any of them
-- could ever run.
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS ai_excerpt TEXT;

ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS ai_description_written_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_materials_tags
  ON public.course_materials USING GIN(tags);

COMMENT ON COLUMN public.course_materials.ai_excerpt IS
  'Opening text extracted from the file in the browser at upload time. The only '
  'copy of a PDF''s words the server ever sees, and what every AI feature reads.';

-- ---------------------------------------------------------------------------
-- Question bank: drafts, provenance, and a rubric for essays
-- ---------------------------------------------------------------------------

-- A drafted question is not a question yet. The bank is read directly by the
-- exam builder, so without this a draft would be pickable into a live exam the
-- moment it was written.
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

UPDATE public.question_bank SET status = 'approved' WHERE status IS NULL;

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_status_check;
ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_status_check CHECK (status IN ('draft', 'approved'));

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS source_material_id UUID
    REFERENCES public.course_materials(id) ON DELETE SET NULL;

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

-- What a good answer contains, for the essay questions a model cannot mark
-- from the question alone. Written by the lecturer, never by a model: it is the
-- standard the suggestion is judged against, so a generated rubric would just
-- be the model marking its own work.
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS rubric TEXT;

CREATE INDEX IF NOT EXISTS idx_qbank_drafts
  ON public.question_bank(course_id, created_at DESC) WHERE status = 'draft';

COMMENT ON COLUMN public.question_bank.status IS
  'draft questions are invisible to students and to the exam builder until '
  'approved. Backfilled to approved, so nothing written before this changed.';

-- ---------------------------------------------------------------------------
-- Exam answers: the AI's proposal, kept clear of the real mark
-- ---------------------------------------------------------------------------

-- Three separate columns rather than writing into `points_awarded`. A mark is
-- the most consequential number in the app: a suggestion sitting beside it can
-- be ignored, audited or reviewed later, whereas a suggestion written into it
-- is indistinguishable from a lecturer's judgement the moment it lands.
ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS ai_suggested_points NUMERIC;
ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS ai_suggested_feedback TEXT;
ALTER TABLE public.exam_answers
  ADD COLUMN IF NOT EXISTS ai_marked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.exam_answers.ai_suggested_points IS
  'A proposed mark, never an applied one. points_awarded is only ever written '
  'by a person accepting this, one answer at a time.';

-- ---------------------------------------------------------------------------
-- Cached student-facing answers
-- ---------------------------------------------------------------------------

-- The progress summary and the post-result guidance are both expensive to
-- generate and almost never different between two reads. Without a cache, a
-- student refreshing their dashboard four times costs four calls out of a
-- shared free tier for four identical paragraphs.
--
-- `scope` is what makes one row replaceable: 'progress' is keyed by the day, so
-- a new one is written daily; 'result' is keyed by the attempt, so it is
-- written once and never again.
CREATE TABLE IF NOT EXISTS public.ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('progress', 'result')),
  /** The day for a progress summary, the attempt id for result guidance. */
  scope_key TEXT NOT NULL,
  body TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, scope, scope_key)
);

ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;

-- A student may read their own; staff may read any, so a lecturer can see what
-- a student was told. Writes are the service role's alone — a client that could
-- write here could put words in the school's mouth.
CREATE POLICY "ai_summaries_read_own"
ON public.ai_summaries FOR SELECT TO authenticated
USING (
  get_my_role() IN ('admin', 'teacher')
  OR student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
);

COMMENT ON TABLE public.ai_summaries IS
  'Cached student-facing AI text. One row per student per day for progress, one '
  'per attempt for result guidance, so repeated reads cost nothing.';

-- ---------------------------------------------------------------------------
-- Practice sessions
-- ---------------------------------------------------------------------------

-- Deliberately not an `exam_attempt`. Practice must never appear in a grade, a
-- transcript or a monitor screen, and the surest way to guarantee that is for
-- it to live in a table nothing marking-related reads.
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  /** question_bank ids, in the order served. */
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  /** { question_id: { answer, correct } }, so a session can be resumed. */
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_student
  ON public.practice_sessions(student_id, created_at DESC);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- Practice is the student's own, and unlike an exam there is nothing to protect
-- against them editing: the answers carry no consequence, so they may write
-- their own rows.
CREATE POLICY "practice_own"
ON public.practice_sessions FOR ALL TO authenticated
USING (student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid()))
WITH CHECK (student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid()));

CREATE POLICY "practice_read_staff"
ON public.practice_sessions FOR SELECT TO authenticated
USING (get_my_role() IN ('admin', 'teacher'));

COMMENT ON TABLE public.practice_sessions IS
  'Ungraded self-testing. Separate from exam_attempts on purpose: nothing that '
  'computes a grade or a transcript reads this table.';
