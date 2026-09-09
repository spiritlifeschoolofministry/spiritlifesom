-- AI foundation: the provider chain, its keys, and the usage ledger that caps it.
--
-- Keys cannot live in `system_settings`. That table keeps a public read policy
-- on purpose — StudentAttendance reads `class_today` and MaintenanceGate reads
-- maintenance mode before anyone signs in (see
-- 20260819110000_restrict_open_all_policies.sql) — so a key placed there would
-- be a key on the public internet.
--
-- So `ai_providers` has RLS on and NO policies at all. Not an omission: an
-- admin's own session cannot select from it however many roles they hold. The
-- `ai-settings` edge function, holding the service role, is the only way in,
-- and it returns a masked preview rather than a usable key.

-- ---------------------------------------------------------------------------
-- Providers, in the order the chain tries them
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches an adapter in supabase/functions/_shared/ai-providers.ts.
  provider TEXT NOT NULL,
  -- Free-text, and empty until an admin picks from the live list. Every one of
  -- these gateways rotates its free model list, so a name shipped here would
  -- go stale; the console reads the provider's own /models endpoint instead.
  model TEXT NOT NULL DEFAULT '',
  api_key TEXT,
  -- Set only where an admin overrode the adapter's default address.
  base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_chain
  ON public.ai_providers(position) WHERE enabled = true;

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_providers IS
  'Model providers in fallback order, with their API keys. RLS is on with zero '
  'policies deliberately: no client session may read this table. Reachable only '
  'through the ai-settings edge function, which never returns api_key.';

CREATE OR REPLACE FUNCTION public.touch_ai_providers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ai_providers ON public.ai_providers;
CREATE TRIGGER trg_touch_ai_providers
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_providers_updated_at();

-- ---------------------------------------------------------------------------
-- The usage ledger
-- ---------------------------------------------------------------------------

-- One row per user, per feature, per day. This is what keeps a student portal
-- on a free tier: an admin drafting questions is a handful of calls, but a
-- study assistant open to every student is unbounded without a cap, and the
-- allowance is shared across the whole school.
--
-- A student may read their own row (so the UI can say "3 of 20 left today")
-- but only the service role writes, or the cap would be advisory.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  calls INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, feature, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON public.ai_usage(day);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_read_own"
ON public.ai_usage FOR SELECT TO authenticated
USING (user_id = auth.uid() OR get_my_role() = 'admin');

COMMENT ON TABLE public.ai_usage IS
  'Per-user per-day AI call counts, enforcing the free-tier caps. Written only '
  'by the service role; a client that could write it could lift its own cap.';

-- Counts a call and answers whether it was within the cap, in one statement.
--
-- Read-then-write in the edge function would let two concurrent requests both
-- see the same count and both pass. The increment happens first and the
-- returned value decides, so the row itself is the lock.
CREATE OR REPLACE FUNCTION public.ai_consume_quota(
  p_user_id UUID,
  p_feature TEXT,
  p_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, quota INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_used INTEGER;
BEGIN
  INSERT INTO public.ai_usage (user_id, feature, day, calls)
  VALUES (p_user_id, p_feature, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, feature, day)
  DO UPDATE SET calls = public.ai_usage.calls + 1
  RETURNING public.ai_usage.calls INTO v_used;

  RETURN QUERY SELECT v_used <= p_limit, v_used, p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_consume_quota(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_consume_quota(UUID, TEXT, INTEGER) FROM authenticated;

COMMENT ON FUNCTION public.ai_consume_quota IS
  'Increments a user''s daily count for a feature and reports whether it stayed '
  'within the cap. Increment-then-decide, so two concurrent calls cannot both '
  'pass on the same remaining allowance.';

-- ---------------------------------------------------------------------------
-- Feature switches
-- ---------------------------------------------------------------------------

-- These go in `system_settings` precisely because it is world-readable: a
-- boolean saying whether a feature exists is not a secret, and the student
-- portal needs to know before it renders a button. Defaults are deliberately
-- conservative — the student-facing features arrive switched off, so the
-- provider chain can be watched on admin traffic first.
-- `system_settings` is (key, value jsonb, updated_at) in this database — the
-- value_type and description columns in the original migration are long gone,
-- and `value` holds real JSON rather than text. So a boolean is written as
-- `to_jsonb(false)` and read back by the client as an actual boolean, which is
-- what `ai-flags.ts` and `ai-guard.ts` are written to expect.
INSERT INTO public.system_settings (key, value)
VALUES
  ('ai_enabled', to_jsonb(false)),
  ('ai_material_descriptions', to_jsonb(true)),
  ('ai_question_drafting', to_jsonb(true)),
  ('ai_message_drafting', to_jsonb(true)),
  ('ai_essay_marking', to_jsonb(true)),
  ('ai_practice_quizzes', to_jsonb(false)),
  ('ai_progress_summary', to_jsonb(false)),
  ('ai_result_guidance', to_jsonb(false)),
  ('ai_study_assistant', to_jsonb(false)),
  ('ai_daily_limit_admin', to_jsonb(200)),
  ('ai_daily_limit_student', to_jsonb(20))
ON CONFLICT (key) DO NOTHING;

-- What each key means, since the table has nowhere to record it any more:
--   ai_enabled                master switch; off disables every feature below
--   ai_material_descriptions  staff: describe and tag a material on upload
--   ai_question_drafting      staff: draft question bank entries for approval
--   ai_message_drafting       staff: draft announcements and student emails
--   ai_essay_marking          staff: suggest marks, never apply them
--   ai_practice_quizzes       students: ungraded self-testing
--   ai_progress_summary       students: a plain-English read of their record
--   ai_result_guidance        students: what to revise, after results
--   ai_study_assistant        students: questions answered from their materials
--   ai_daily_limit_admin      per-staff AI calls per day, per feature
--   ai_daily_limit_student    per-student AI calls per day, per feature
