-- Activity events: the record behind daily views and downloads.
--
-- Analytics could already answer "how many students, how much money, what
-- attendance" because every one of those has a row somewhere. It could not
-- answer "is anyone actually opening this", because nothing in the database
-- recorded a page being looked at or a file being fetched. Enrolment counts
-- tell you who signed up; they say nothing about whether the portal is used.
--
-- Two deliberate limits on what this is:
--
--  * It is a counter, not a session recorder. One row per view or download,
--    holding what was looked at and by whom. No IP, no user agent, no referrer,
--    no fingerprint — none of it is needed to answer the questions the school
--    actually asks, and all of it would turn a usage counter into surveillance
--    of named students.
--
--  * It starts empty. Nothing can reconstruct views that were never recorded,
--    so the engagement figures begin from the day this ships and the UI says
--    so rather than drawing a flat line and letting it read as "nobody came".

CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Nullable: a view logged as a session expires still counts as a view, and
  -- losing it would undercount exactly when the portal is busiest.
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Snapshotted rather than joined, so a role change does not silently rewrite
  -- last month's "staff vs student" split.
  actor_role TEXT,
  -- 'view' | 'download' | 'ai' | 'exam_start' | 'login', enforced below.
  kind TEXT NOT NULL,
  -- The route for a view; for anything else, what was acted on.
  subject TEXT NOT NULL,
  -- The row behind it, where there is one: a material, an exam, a payment.
  subject_id UUID,
  -- Which portal the event came from, so a chart can separate staff traffic
  -- from student traffic without inferring it from the role.
  portal TEXT,
  cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL,
  -- Denormalised so a day's rollup is an index scan rather than a timezone
  -- expression over the whole table. UTC, matching `ai_usage.day`.
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_kind_check;
ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_kind_check
  CHECK (kind IN ('view', 'download', 'ai', 'exam_start', 'login'));

CREATE INDEX IF NOT EXISTS idx_activity_day_kind
  ON public.activity_events(day DESC, kind);
CREATE INDEX IF NOT EXISTS idx_activity_subject
  ON public.activity_events(kind, subject);
CREATE INDEX IF NOT EXISTS idx_activity_actor_day
  ON public.activity_events(actor_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_activity_cohort_day
  ON public.activity_events(cohort_id, day DESC) WHERE cohort_id IS NOT NULL;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.activity_events IS
  'One row per page view or file download, for the engagement figures in '
  'Analytics. Deliberately holds no IP, user agent or referrer: it answers '
  'how much the portal is used, not who did what from where.';

-- Anyone signed in may add their own event, and nothing else.
--
-- WITH CHECK ties actor_id to the caller so a client cannot log traffic as
-- somebody else — which would be the one way to make these figures lie. There
-- is no UPDATE or DELETE policy at all: an event, once counted, is not
-- rewritable by the person who caused it.
DROP POLICY IF EXISTS "activity_insert_self" ON public.activity_events;
CREATE POLICY "activity_insert_self"
ON public.activity_events FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());

-- Only staff read it. A student has no reason to see the school's traffic, and
-- per-row reads are how an engagement log becomes a way to watch a classmate.
DROP POLICY IF EXISTS "activity_read_staff" ON public.activity_events;
CREATE POLICY "activity_read_staff"
ON public.activity_events FOR SELECT TO authenticated
USING (get_my_role() IN ('admin', 'teacher'));

-- ---------------------------------------------------------------------------
-- Rollups
-- ---------------------------------------------------------------------------

-- Daily totals, aggregated in the database rather than in the browser.
--
-- The alternative — select every row for the window and group in JS — moves
-- tens of thousands of rows over the wire to produce ninety numbers, and gets
-- worse every week the school uses the portal. Aggregating here keeps the
-- payload the size of the chart.
--
-- generate_series fills the days nothing happened, so a quiet Sunday is a zero
-- on the line rather than a gap the chart interpolates straight through.
--
-- SECURITY INVOKER (the default) on purpose. These read `activity_events`,
-- whose SELECT policy is already staff-only, so the table's own RLS does the
-- gating: a student calling this gets zeros, not the school's traffic. Marking
-- it DEFINER would have quietly handed every signed-in student a full usage
-- report on the whole school.
CREATE OR REPLACE FUNCTION public.activity_daily(
  p_days INTEGER DEFAULT 30,
  p_cohort_id UUID DEFAULT NULL
)
RETURNS TABLE (
  day DATE,
  views BIGINT,
  downloads BIGINT,
  ai_calls BIGINT,
  active_users BIGINT
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH span AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'UTC')::date - (GREATEST(p_days, 1) - 1)),
      (now() AT TIME ZONE 'UTC')::date,
      INTERVAL '1 day'
    )::date AS day
  ),
  scoped AS (
    SELECT e.day, e.kind, e.actor_id
    FROM public.activity_events e
    WHERE e.day > (now() AT TIME ZONE 'UTC')::date - GREATEST(p_days, 1)
      AND (p_cohort_id IS NULL OR e.cohort_id = p_cohort_id)
  )
  SELECT
    span.day,
    COUNT(scoped.kind) FILTER (WHERE scoped.kind = 'view')::BIGINT,
    COUNT(scoped.kind) FILTER (WHERE scoped.kind = 'download')::BIGINT,
    COUNT(scoped.kind) FILTER (WHERE scoped.kind = 'ai')::BIGINT,
    COUNT(DISTINCT scoped.actor_id)::BIGINT
  FROM span
  LEFT JOIN scoped ON scoped.day = span.day
  GROUP BY span.day
  ORDER BY span.day;
$$;

GRANT EXECUTE ON FUNCTION public.activity_daily(INTEGER, UUID) TO authenticated;

-- The busiest subjects of one kind: top pages by view, top files by download.
CREATE OR REPLACE FUNCTION public.activity_top_subjects(
  p_kind TEXT,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 10,
  p_cohort_id UUID DEFAULT NULL
)
RETURNS TABLE (
  subject TEXT,
  subject_id UUID,
  events BIGINT,
  people BIGINT
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    e.subject,
    -- A page has no row behind it, and a material opened under two titles is
    -- still one material; this keeps one id per subject without inventing one.
    -- Cast through text because Postgres has no min() for uuid.
    MIN(e.subject_id::TEXT)::UUID AS subject_id,
    COUNT(*)::BIGINT AS events,
    COUNT(DISTINCT e.actor_id)::BIGINT AS people
  FROM public.activity_events e
  WHERE e.kind = p_kind
    AND e.day > (now() AT TIME ZONE 'UTC')::date - GREATEST(p_days, 1)
    AND (p_cohort_id IS NULL OR e.cohort_id = p_cohort_id)
  GROUP BY e.subject
  ORDER BY events DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION public.activity_top_subjects(TEXT, INTEGER, INTEGER, UUID) TO authenticated;

-- Headline counters for the dashboards: today, and the seven days behind it.
--
-- `first_event_day` is its own scalar rather than a MIN over the seven-day
-- join, because its whole job is to distinguish "nobody used the portal this
-- week" from "nothing has ever been recorded" — and a MIN inside the window
-- can only ever answer the first of those.
CREATE OR REPLACE FUNCTION public.activity_pulse()
RETURNS TABLE (
  views_today BIGINT,
  downloads_today BIGINT,
  active_today BIGINT,
  views_week BIGINT,
  downloads_week BIGINT,
  active_week BIGINT,
  first_event_day DATE
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'UTC')::date AS d),
  week AS (
    SELECT e.day, e.kind, e.actor_id
    FROM public.activity_events e, today
    WHERE e.day > today.d - 7
  )
  SELECT
    (SELECT COUNT(*) FROM week, today WHERE week.kind = 'view' AND week.day = today.d)::BIGINT,
    (SELECT COUNT(*) FROM week, today WHERE week.kind = 'download' AND week.day = today.d)::BIGINT,
    (SELECT COUNT(DISTINCT week.actor_id) FROM week, today WHERE week.day = today.d)::BIGINT,
    (SELECT COUNT(*) FROM week WHERE week.kind = 'view')::BIGINT,
    (SELECT COUNT(*) FROM week WHERE week.kind = 'download')::BIGINT,
    (SELECT COUNT(DISTINCT week.actor_id) FROM week)::BIGINT,
    (SELECT MIN(e.day) FROM public.activity_events e);
$$;

GRANT EXECUTE ON FUNCTION public.activity_pulse() TO authenticated;

-- AI calls per feature per day, from the ledger the quota already keeps.
--
-- `ai_usage` needs no new recording to answer this — but its RLS lets a student
-- read their own rows, so an INVOKER function would hand a student their own
-- private call counts under the name of a school-wide report, and would show a
-- teacher nothing at all. So this one is DEFINER, and states the staff check
-- itself rather than inheriting one.
CREATE OR REPLACE FUNCTION public.ai_usage_daily(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, feature TEXT, calls BIGINT, people BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only staff may read school-wide AI usage';
  END IF;

  RETURN QUERY
  SELECT u.day, u.feature, SUM(u.calls)::BIGINT, COUNT(DISTINCT u.user_id)::BIGINT
  FROM public.ai_usage u
  WHERE u.day > (now() AT TIME ZONE 'UTC')::date - GREATEST(p_days, 1)
  GROUP BY u.day, u.feature
  ORDER BY u.day, u.feature;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_daily(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_daily(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.activity_daily IS
  'Daily views, downloads, AI calls and distinct active users over a window, '
  'with empty days filled in as zeros. Gated by activity_events'' own RLS.';
