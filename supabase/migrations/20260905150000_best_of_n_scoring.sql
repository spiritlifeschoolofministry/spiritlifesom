-- Papers that ask for a choice of questions, and a denominator that survives it.
--
-- SLM 106 went out reading "Answer TWO (2) out of the three" with three essays
-- of 15 points linked to it. Nothing in the schema could express that, so the
-- exam was worth 45, the essay a student was invited to skip was auto-scored
-- zero, and two flawless answers came out at 30/45 — 67%, against a 50% pass
-- mark that had quietly become 75%.
--
-- Two columns, because the bug has two halves.
--
-- count_best_n says how many of the served questions count. Null means all of
-- them, which is every exam that exists today.
--
-- max_points is the half that was missing entirely. Every screen divided by
-- exams.total_points — the sum of every question linked to the exam — which is
-- only correct when a student is served all of them and all of them count. It
-- was already wrong for questions_per_attempt, which has shipped since the
-- beginning and serves a random subset: set it and a student sees a fraction of
-- the paper and is marked against the whole of it. Nobody had used it, so the
-- bug sat dormant rather than being found.
--
-- Recording the denominator on the attempt fixes both, and it is the attempt
-- that should own it: what a paper was worth to a student is a fact about the
-- sitting they were given, not about the exam as it stands today. An exam
-- edited after the fact — a question added, a point value corrected — must not
-- silently restate what an earlier student was marked out of.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS count_best_n INTEGER;

COMMENT ON COLUMN public.exams.count_best_n IS
  'How many of the served questions count towards the score, best first. NULL means all of them. Use for "answer any 2 of 3" papers.';

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS max_points NUMERIC;

COMMENT ON COLUMN public.exam_attempts.max_points IS
  'What this sitting was actually marked out of. Written when the attempt is created, from the questions served and the best-n rule in force at the time. Never read exams.total_points for a score: it is the whole paper, not this attempt.';

-- A best-n of zero or less would score every paper zero, and one larger than the
-- question count is just "all of them" written confusingly.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_count_best_n_positive;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_count_best_n_positive
  CHECK (count_best_n IS NULL OR count_best_n > 0);

-- Backfill every attempt already on record.
--
-- These all pre-date best-n, so their denominator is simply the questions they
-- were served — which is what total_points said for all but the
-- questions_per_attempt case that nobody used. Computed from question_order
-- rather than copied from the exam, so an attempt that was served a subset gets
-- the subset's value and the two cases stop being indistinguishable.
UPDATE public.exam_attempts a
   SET max_points = COALESCE((
         SELECT SUM(COALESCE(eq.points_override, q.points))
           FROM jsonb_array_elements_text(
                  CASE jsonb_typeof(a.question_order)
                    WHEN 'array' THEN a.question_order
                    ELSE '[]'::jsonb
                  END
                ) AS served(qid)
           JOIN public.question_bank q ON q.id = served.qid::uuid
           LEFT JOIN public.exam_questions eq
                  ON eq.exam_id = a.exam_id AND eq.question_id = q.id
       ), 0)
 WHERE a.max_points IS NULL;
