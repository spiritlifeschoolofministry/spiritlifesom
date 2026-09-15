-- A marking guide: what a full-marks answer to this question contains.
-- ---------------------------------------------------------------------------
--
-- 20260909110000_ai_feature_columns.sql added `rubric` and said it was to be
-- written by the lecturer and never by a model, because the rubric is the
-- standard a suggested mark is judged against — a model writing its own
-- standard and then marking against it is marking its own work.
--
-- That reasoning still holds, and this does not overturn it. What it changes is
-- where a draft may come from, on three conditions that together make the
-- circle impossible to close:
--
--   1. A drafted guide is grounded in the course material, not in the model's
--      own theology. Same rule as question drafting: what the material does not
--      establish may not be required of a student.
--   2. A draft lands in `rubric_draft`, which nothing marks against. `ai-mark`
--      reads `rubric` and only `rubric`, so an unapproved guide is inert.
--   3. A person moves it across, having read it. `rubric_approved_by` records
--      who, because the standard a cohort was marked against is exactly the
--      thing somebody will ask about a year later.
--
-- So the model proposes and a lecturer adopts. What is marked against is still
-- something a person put their name to.

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS rubric_draft TEXT;

-- 'lecturer' for one written by hand, 'ai' for a drafted one somebody adopted.
-- Null where a rubric predates this column or there is no rubric at all.
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS rubric_source TEXT;

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_rubric_source_check;
ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_rubric_source_check
    CHECK (rubric_source IS NULL OR rubric_source IN ('lecturer', 'ai'));

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS rubric_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS rubric_approved_at TIMESTAMPTZ;

-- Provenance for what is already there. A question the bank records as
-- AI-generated had its rubric drafted by the model too — the drafting prompt
-- has always asked for one — and a person approved that question before it
-- could be used, so 'ai' is the honest label rather than 'lecturer'.
UPDATE public.question_bank
   SET rubric_source = CASE WHEN ai_generated THEN 'ai' ELSE 'lecturer' END
 WHERE rubric IS NOT NULL
   AND btrim(rubric) <> ''
   AND rubric_source IS NULL;

COMMENT ON COLUMN public.question_bank.rubric IS
  'The standard a mark is judged against. Whatever wrote the first draft, a '
  'person adopted this one — see rubric_approved_by.';

COMMENT ON COLUMN public.question_bank.rubric_draft IS
  'A proposed marking guide awaiting a lecturer. Nothing marks against this '
  'column; ai-mark reads rubric alone.';

COMMENT ON COLUMN public.question_bank.rubric_source IS
  'lecturer | ai — who wrote the wording now in rubric, not who approved it.';

-- Its own switch rather than riding on ai_essay_marking. Suggesting a mark and
-- proposing the standard that mark is judged by are different powers, and a
-- school that wants the first without the second should not have to take both.
INSERT INTO public.system_settings (key, value)
VALUES ('ai_marking_guide', to_jsonb(true))
ON CONFLICT (key) DO NOTHING;
