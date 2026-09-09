-- Admin control over how the chatbox answers.
--
-- The thing worth being careful about here: a freely editable system prompt is
-- also a way to delete the guards. Someone tidying the box, or pasting in a
-- persona they liked elsewhere, could remove "never state a figure you were
-- not given" without any idea that it was the only thing standing between a
-- student and a confidently wrong balance.
--
-- So the prompt is layered rather than editable:
--
--   * The safety rules stay in `ai-chat/index.ts` as FIXED_RULES. They cannot
--     be edited, reordered or switched off from any screen, and they are
--     restated after the school's own text so that nothing added later can
--     read as overriding them. The admin screen shows them, so it is clear
--     what is being relied on — but shows them read-only.
--
--   * What an admin genuinely wants — the voice, the school's own guidance,
--     who to send someone to instead, what not to discuss — is editable, and
--     lives in these keys.
--
-- These are guidance, not a security boundary. `system_settings` is
-- world-readable by design (both portals need feature switches before anyone
-- signs in), so a signed-in student could read the decline list. That costs
-- nothing: what actually stops the assistant misbehaving is structural — reads
-- go through the caller's own RLS, figures come from the database rather than
-- from prose, and the function has no write path at all. Prompt text has never
-- been what was holding the line, and nothing sensitive belongs in these boxes.

INSERT INTO public.system_settings (key, value)
VALUES
  -- How it should sound, plus any school-specific guidance. Empty means the
  -- fixed rules alone, which are already a complete, usable instruction.
  ('ai_chat_voice', to_jsonb(''::text)),

  -- Length ceiling. Also lowers `maxTokens` on the call, so a shorter answer
  -- is genuinely cheaper rather than merely being asked for politely.
  ('ai_chat_max_words', to_jsonb(70)),

  -- Subjects to decline, in the school's own words. Doctrinal rulings and
  -- anything about another student are the obvious candidates.
  ('ai_chat_decline', to_jsonb(''::text)),

  -- Who to send someone to when the assistant cannot help. A named office
  -- beats "contact the school", and only the school knows what to put here.
  ('ai_chat_escalation', to_jsonb(''::text)),

  -- The strongest guard on this screen, and the reason it is a switch rather
  -- than a sentence in a prompt: with this off, a question that matches no
  -- known intent is never sent to a model at all. The chatbox still answers
  -- everything it can answer from the records and from the portal map, and
  -- says plainly that it cannot help with the rest. No model, so no
  -- possibility of an invented answer, and no tokens.
  ('ai_chat_model_fallback', to_jsonb(true))
ON CONFLICT (key) DO NOTHING;
