-- Mailboxes for people who have no portal account.
--
-- The table assumed every mailbox belonged to a profile, which covered students
-- and staff and nobody else. A school also needs addresses for people who will
-- never sign in to the portal at all: a visiting lecturer, a board member, a
-- bursar who only ever uses email, a role address somebody answers.
--
-- Rather than create empty portal accounts for them -- which would put people
-- who cannot log in into every student list, count, and mail-merge in the app --
-- a mailbox may now name its holder directly.
--
-- Exactly one of the two must be set. A row that named both would leave two
-- answers to "whose address is this", and the one the code happened to read
-- first would win.

ALTER TABLE public.mailboxes
  ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_email text,
  ADD COLUMN IF NOT EXISTS holder_phone text;

-- Kept in step with the phone by the database, exactly as profiles.whatsapp_jid
-- is, so correcting a number corrects where the credentials go in the same
-- statement. A number that is not a valid Nigerian mobile yields NULL, and the
-- WhatsApp half of the delivery is simply skipped.
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS holder_whatsapp_jid text
  GENERATED ALWAYS AS (
    CASE WHEN public.normalize_msisdn(holder_phone) IS NULL
      THEN NULL
      ELSE public.normalize_msisdn(holder_phone) || '@s.whatsapp.net'
    END
  ) STORED;

ALTER TABLE public.mailboxes
  DROP CONSTRAINT IF EXISTS mailboxes_holder_or_profile;
ALTER TABLE public.mailboxes
  ADD CONSTRAINT mailboxes_holder_or_profile CHECK (
    (profile_id IS NOT NULL AND holder_name IS NULL)
    OR
    (profile_id IS NULL AND holder_name IS NOT NULL AND length(btrim(holder_name)) > 0)
  );

COMMENT ON COLUMN public.mailboxes.holder_name IS
  'Who the mailbox belongs to, when they have no portal account. NULL when profile_id is set; exactly one of the two applies.';
COMMENT ON COLUMN public.mailboxes.holder_email IS
  'Personal address the credentials are sent to, for a holder with no portal account. Optional: without it the admin passes the password on themselves.';
COMMENT ON COLUMN public.mailboxes.holder_phone IS
  'Optional phone for the WhatsApp half of the credentials delivery.';

-- `mailboxes_one_active_per_profile` stays as it is. A unique index treats each
-- NULL as distinct, so it keeps holding one live mailbox per profile while
-- placing no limit on off-portal holders -- which is correct: there is no
-- person record to be "one per".

CREATE INDEX IF NOT EXISTS mailboxes_holder_idx
  ON public.mailboxes (holder_name) WHERE holder_name IS NOT NULL;

-- RLS is unchanged and needs no change. `mailboxes_select_own` compares
-- profile_id to auth.uid(); for an off-portal row that is NULL = uuid, which is
-- NULL rather than true, so these rows are visible to admins only. That is the
-- right answer: their holder has no account to read them with.
