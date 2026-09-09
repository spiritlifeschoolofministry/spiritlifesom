-- The assistant as a chatbox, on both dashboards.
--
-- Nothing here is a table. That is the design decision worth recording, not an
-- omission:
--
--   A chat transcript is not stored. `ai_summaries` already caches
--   student-facing AI text, and its policy deliberately lets staff read any
--   student's, documented as "so a lecturer can see what a student was told".
--   That is right for a progress note the school generated about them. It is
--   the wrong policy for a log of what a student chose to type when they did
--   not understand something, and inheriting it by reflex — because the table
--   is already there and already has a policy — is exactly how a privacy
--   decision gets made by accident. So the conversation lives in the browser
--   for as long as the tab is open and nowhere else.
--
--   There is no cache either, because the answers that matter are not
--   cacheable: "what do I owe" must be right now, not right this morning. What
--   makes this cheap is that almost every answer reaches no model at all — see
--   `chat-intents.ts` and `portal-map.ts`.

-- ---------------------------------------------------------------------------
-- The switch and its budget
-- ---------------------------------------------------------------------------

-- Ships off, like every other student-facing feature, so the provider chain
-- can be watched on staff traffic first.
--
-- `ai_daily_limit_chat` exists because the guard picks a cap by role, not by
-- feature: a student's global `ai_daily_limit_student` is 20, which is a
-- sensible number of generated paragraphs and a poor number of chat messages.
-- Chat reads this key instead. It is generous precisely because it is rarely
-- spent — a recognised question is answered from the database and charged
-- nothing, so only genuinely novel questions draw on it.
INSERT INTO public.system_settings (key, value)
VALUES
  ('ai_chat', to_jsonb(false)),
  ('ai_daily_limit_chat', to_jsonb(40)),
  -- A ceiling on one conversation, separate from the daily one. Without it a
  -- single long thread is the cheapest way to spend a day's allowance without
  -- noticing, and a chatbox invites forty messages where a button invites one.
  ('ai_chat_turn_limit', to_jsonb(12))
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.system_settings IS
  'School-wide settings, world-readable on purpose: the portals need feature '
  'switches before anyone signs in. Never put a secret here — API keys live in '
  'ai_providers, which has RLS on and no policies at all.';
