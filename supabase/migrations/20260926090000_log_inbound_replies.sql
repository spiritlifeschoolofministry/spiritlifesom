-- Keep what the bot said, not only what was said to it.
--
-- Part of a reply is now written by a model, and a model's output is the one
-- thing here nobody can reconstruct after the fact. If it tells an enquirer
-- something wrong about fees or entry requirements, the only evidence is the
-- enquirer's own screen -- and they are exactly the person least likely to
-- come back and say so.
ALTER TABLE public.whatsapp_inbound_log
  ADD COLUMN IF NOT EXISTS reply text,
  -- Whether a model wrote it, so the ones worth auditing can be found without
  -- reading every reply the number has ever sent.
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;
