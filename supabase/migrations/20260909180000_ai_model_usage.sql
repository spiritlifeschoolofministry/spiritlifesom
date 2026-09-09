-- Per-model accounting for the provider chain.
--
-- `ai_usage` answers "how much is this person using the AI", which is what the
-- per-student daily caps enforce. It cannot answer "how much of this model's
-- free tier is left today", because nothing recorded which model served a call
-- — only that some provider in the chain did. The two questions have different
-- shapes: one is per person and per feature, this one is per row of the chain.
--
-- Why it matters here: the chain is nine models deep and most of them are free
-- tiers with daily ceilings. Without a count, the first sign of a spent tier is
-- a 429 in production, after a student has waited for it.

CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  -- UTC, matching `ai_usage.day`, so the two can be read side by side. Vendor
  -- ceilings reset on their own clocks (Google's on Pacific midnight); a cap
  -- set here is the school's own, and one clock for all of them is honest.
  day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_model_usage_day ON public.ai_model_usage(day);

-- No policies, like `ai_providers` itself: a row here names a provider id, and
-- the only screen that may read it reaches it through `ai-settings`, which is
-- admin-gated and runs as the service role.
ALTER TABLE public.ai_model_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_model_usage IS
  'Calls and failures per provider row per UTC day. Written by the chain, read '
  'only through the ai-settings function.';

-- The school's own ceiling for one model, or NULL for no ceiling.
--
-- Deliberately not defaulted to a number: a cap guessed on the school's behalf
-- would silently stop a model that was working, which is worse than the 429 it
-- was meant to prevent.
ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER;

COMMENT ON COLUMN public.ai_providers.daily_limit IS
  'Most calls this row may be given in a UTC day before the chain skips it. '
  'NULL means uncapped. Set below the vendor''s own free-tier ceiling so the '
  'chain moves on before the vendor refuses.';

-- Increment-then-report, in one statement, for the same reason
-- `ai_consume_quota` does it: two concurrent calls must not both read the same
-- remaining allowance and both pass.
CREATE OR REPLACE FUNCTION public.ai_record_model_call(
  p_provider_id UUID,
  p_ok BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_calls INTEGER;
BEGIN
  INSERT INTO public.ai_model_usage (provider_id, day, calls, failures)
  VALUES (
    p_provider_id,
    (now() AT TIME ZONE 'UTC')::date,
    1,
    CASE WHEN p_ok THEN 0 ELSE 1 END
  )
  ON CONFLICT (provider_id, day)
  DO UPDATE SET
    calls = public.ai_model_usage.calls + 1,
    failures = public.ai_model_usage.failures + CASE WHEN p_ok THEN 0 ELSE 1 END
  RETURNING public.ai_model_usage.calls INTO v_calls;

  RETURN v_calls;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_record_model_call(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_record_model_call(UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.ai_record_model_call(UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_record_model_call(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.ai_record_model_call IS
  'Records one attempt against a provider row for today and returns the day''s '
  'running total. Counts the attempt whether or not it answered, because a '
  'vendor''s free tier counts refused requests too.';
