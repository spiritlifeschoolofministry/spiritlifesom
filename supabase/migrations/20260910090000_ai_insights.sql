-- Written summaries that belong to the school rather than to a student.
--
-- `ai_summaries` cannot hold these: its `student_id` is NOT NULL, because
-- everything in it is about one person. An analytics note is about the cohort,
-- and giving it a borrowed student id would put a school-wide paragraph inside
-- a student's own record, where the next person to read that table would
-- reasonably think it belonged to them.
--
-- Cached by scope and key for the same reason the progress summary is: a
-- dashboard is opened far more often than the figures behind it change, and a
-- paragraph rewritten on every view is a free tier spent on saying the same
-- thing again.

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  /** What this is a note about, e.g. 'analytics'. */
  scope TEXT NOT NULL,
  /** What distinguishes one note of that kind from another: usually a date, and a cohort where the view is filtered. */
  scope_key TEXT NOT NULL,
  body TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_key)
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- No policies: these are read and written by the function that makes them,
-- which is admin-gated and runs as the service role. A note summarising the
-- school's fee collection is not something a student session should reach.
COMMENT ON TABLE public.ai_insights IS
  'Cached written summaries about the school rather than about one student. '
  'Reached only through the AI functions, which are staff-gated.';
