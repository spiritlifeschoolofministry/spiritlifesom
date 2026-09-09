-- Move the chatbox's answer rules out of the world-readable settings table.
--
-- `system_settings` has a SELECT policy of `USING (true)` granted to `anon` as
-- well as `authenticated`. That is not an oversight — MaintenanceGate and
-- StudentAttendance read it before anyone has signed in, so it has to be
-- readable without a session — but it does mean every row is public to anyone
-- holding the project's publishable key, and that key ships inside the
-- frontend bundle because the browser needs it to talk to Supabase at all.
--
-- So the free text an admin types about how the assistant should behave —
-- where to send someone who needs help, what not to discuss, the school's own
-- guidance — was readable by anyone who opened devtools on the public site.
-- None of it is a credential, and none of it was holding the security line
-- (that is RLS on every read, figures coming from the database rather than
-- from prose, and the function having no write path). But it is the school's
-- internal wording, it can name an office and a phone number, and there is no
-- reason for it to be public.
--
-- This table follows `ai_providers` exactly: RLS on, and no policies at all.
-- Not an omission. An admin's own session cannot read it however many roles
-- they hold; the `ai-settings` edge function, holding the service role, is the
-- only way in, and it already gates on full admin.

CREATE TABLE IF NOT EXISTS public.ai_private_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_private_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_private_settings IS
  'Admin-editable AI settings that should not be public, unlike system_settings '
  'which is readable by anon on purpose. RLS is on with zero policies '
  'deliberately: reachable only through the ai-settings edge function, which '
  'requires a full admin.';

-- ---------------------------------------------------------------------------
-- Carry across whatever the school has already typed
-- ---------------------------------------------------------------------------

-- Copied before the originals are removed, so a school that has already
-- written its guidance does not silently lose it and revert to the defaults.
-- Every one of these keys moves: keeping "how it answers" in two tables, one
-- public and one not, would mean nobody could tell which box was which.
INSERT INTO public.ai_private_settings (key, value)
SELECT s.key, s.value
FROM public.system_settings s
WHERE s.key IN (
  'ai_chat_voice',
  'ai_chat_max_words',
  'ai_chat_decline',
  'ai_chat_escalation',
  'ai_chat_model_fallback'
)
ON CONFLICT (key) DO NOTHING;

-- Defaults for any key that was never written, so the function always finds a
-- row and the console never shows an empty box for a value it is about to
-- fall back on anyway.
INSERT INTO public.ai_private_settings (key, value)
VALUES
  ('ai_chat_voice', to_jsonb(''::text)),
  ('ai_chat_max_words', to_jsonb(70)),
  ('ai_chat_decline', to_jsonb(''::text)),
  ('ai_chat_escalation', to_jsonb(''::text)),
  ('ai_chat_model_fallback', to_jsonb(true))
ON CONFLICT (key) DO NOTHING;

-- Now remove the public copies. Left in place they would be a second,
-- world-readable source of the same text that nothing reads any more — which
-- is the worst of both, since it would still leak while looking migrated.
DELETE FROM public.system_settings
WHERE key IN (
  'ai_chat_voice',
  'ai_chat_max_words',
  'ai_chat_decline',
  'ai_chat_escalation',
  'ai_chat_model_fallback'
);

-- What deliberately stays in `system_settings`:
--   ai_chat              the feature switch. Both portals must know whether to
--                        render the chatbox at all, and a boolean saying a
--                        feature exists is not a secret.
--   ai_chat_turn_limit   a per-conversation courtesy limit applied in the
--                        browser, so the browser has to be able to read it.
--   ai_daily_limit_chat  shown beside the other daily caps, none of which is
--                        sensitive.

CREATE OR REPLACE FUNCTION public.touch_ai_private_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ai_private_settings ON public.ai_private_settings;
CREATE TRIGGER trg_touch_ai_private_settings
  BEFORE UPDATE ON public.ai_private_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_private_settings_updated_at();
