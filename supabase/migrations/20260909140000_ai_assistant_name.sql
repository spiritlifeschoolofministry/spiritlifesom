-- The assistant's name.
--
-- Students and staff should call it something rather than "the AI", and they
-- have no reason to know which of nine models answered them — that is the
-- chain's business, not theirs.
--
-- A setting rather than a constant because a name is the kind of thing a
-- school changes its mind about, and it appears on every AI surface in both
-- portals. `system_settings` is world-readable, which is right here: the
-- sign-in page and the student portal both need it before any session exists,
-- and a name is not a secret.
--
-- Barnabas — Acts 4:36, "son of encouragement" — came alongside Paul and John
-- Mark as a mentor. Deliberately a fellow worker: naming a study tool after
-- the Holy Spirit (Paraclete, Ruach, Comforter, Helper) would invite students
-- to read authority into a thing that drafts questions for staff to approve.
INSERT INTO public.system_settings (key, value)
VALUES ('ai_assistant_name', to_jsonb('Barnabas'::text))
ON CONFLICT (key) DO NOTHING;
