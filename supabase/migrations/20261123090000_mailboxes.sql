-- Official @spiritlifesom.org mailboxes, issued from the admin portal.
--
-- The mail itself lives on a Stalwart server the school runs (mail.spiritlifesom.org);
-- nothing about messages, folders or storage is mirrored here. This table is the
-- school's own record of *who has been given a mailbox*, so the portal can show a
-- student's address, refuse a name that is already taken, and tell an admin which
-- Stalwart account to reset or remove.
--
-- Two deliberate absences:
--
--   1. **No password column, of any kind.** The initial password is generated in
--      the edge function, handed to Stalwart, shown to the admin once, and then
--      forgotten. A school that stores its students' mail passwords has built a
--      way to read their mail, and there is no feature here worth that.
--   2. **No writes from the browser.** Every row is written by the mailbox-admin
--      edge function under the service role, because a row here is only true if
--      the matching Stalwart account exists. A client that could insert directly
--      could claim an address the mail server has never heard of.
--
-- Removal keeps the row (status 'removed') rather than deleting it. An address
-- that once belonged to a student should not be silently reissued to someone
-- else a year later -- mail still arrives at old addresses -- so a removed
-- local_part stays visible to the clash check below.

CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The person the mailbox belongs to. Students and staff alike have a profile,
  -- so this is the one link that covers both.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  local_part text NOT NULL,
  domain text NOT NULL DEFAULT 'spiritlifesom.org',
  -- Stored rather than computed on read: it is what every screen shows, what
  -- the clash check reads, and it must not drift from its two parts.
  address text GENERATED ALWAYS AS (local_part || '@' || domain) STORED,

  -- Stalwart's own id for the account. The handle for a reset or a removal;
  -- null only in the window between a failed create and the next sync.
  stalwart_account_id text,

  -- The per-mailbox quota actually set on the server, so the portal reports
  -- what is true rather than what the default was when the code was written.
  quota_bytes bigint,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- When the Stalwart account was deleted, for the "removed" rows kept above.
  removed_at timestamptz,

  -- When an admin last generated a new password for it. Not the password:
  -- just enough for a screen to say "reset 3 days ago" when a student says
  -- they cannot get in.
  password_reset_at timestamptz,

  CONSTRAINT mailboxes_local_part_shape
    CHECK (local_part ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(local_part) BETWEEN 2 AND 64)
);

COMMENT ON TABLE public.mailboxes IS
  'School-issued @spiritlifesom.org mailboxes. One row per Stalwart account; never holds a password.';
COMMENT ON COLUMN public.mailboxes.stalwart_account_id IS
  'Stalwart''s account id -- the handle used to reset the password or delete the account.';
COMMENT ON COLUMN public.mailboxes.status IS
  'active, or removed once the Stalwart account is deleted. Removed rows stay so the address is never reissued.';
COMMENT ON COLUMN public.mailboxes.password_reset_at IS
  'When an admin last issued a new password. The password itself is never stored.';

-- One live mailbox per person. A second one is a decision somebody should make
-- deliberately, not something two admins do by both clicking Create.
CREATE UNIQUE INDEX IF NOT EXISTS mailboxes_one_active_per_profile
  ON public.mailboxes (profile_id) WHERE status = 'active';

-- An address is claimed for good, including by a removed mailbox: mail sent to
-- a graduate's old address must not land in a current student's inbox.
CREATE UNIQUE INDEX IF NOT EXISTS mailboxes_address_unique
  ON public.mailboxes (local_part, domain);

CREATE INDEX IF NOT EXISTS mailboxes_profile_idx ON public.mailboxes (profile_id);
CREATE INDEX IF NOT EXISTS mailboxes_status_idx ON public.mailboxes (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.mailboxes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.local_part := lower(trim(NEW.local_part));
  NEW.domain := lower(trim(NEW.domain));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mailboxes_before_write ON public.mailboxes;
CREATE TRIGGER mailboxes_before_write
  BEFORE INSERT OR UPDATE ON public.mailboxes
  FOR EACH ROW
  EXECUTE FUNCTION public.mailboxes_before_write();

-- RLS ------------------------------------------------------------------------
--
-- Read: strict admins see every mailbox (they issue them), and a person sees
-- their own so the portal can show them their address and the mail settings.
-- Teachers are deliberately not included: a lecturer has no reason to hold the
-- list of every student's mail account.
--
-- Write: no policy at all. INSERT, UPDATE and DELETE are reachable only by the
-- service role, which bypasses RLS -- that is, only by the mailbox-admin edge
-- function, which writes a row after the mail server has confirmed the change.

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mailboxes_select_admin" ON public.mailboxes;
CREATE POLICY "mailboxes_select_admin"
ON public.mailboxes
FOR SELECT
TO authenticated
USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "mailboxes_select_own" ON public.mailboxes;
CREATE POLICY "mailboxes_select_own"
ON public.mailboxes
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());
