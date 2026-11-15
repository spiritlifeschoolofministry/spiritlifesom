-- Which mailboxes administer the mail server.
--
-- Stalwart has two roles: User, an ordinary mailbox holding that person's own
-- mail, and Admin, which can read, alter and delete every account on the
-- server -- the school's own admin@ included, and every student's inbox.
--
-- The portal has always created User. This column records the exception, so a
-- screen can show who holds the server and an audit entry can say when it was
-- granted. It is deliberately NOT derived from profiles.role: administering
-- the school is a different thing from administering its mail, and conflating
-- them would hand the mail server to every future admin account by accident.
--
-- The database is not the authority here -- Stalwart is. This flag records
-- what the portal set, and the portal sets both together; a disagreement means
-- somebody changed the role in Stalwart's own console, which is theirs to do.

ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS is_server_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mailboxes.is_server_admin IS
  'True where this mailbox was given Stalwart''s Admin role: full control of every mailbox on the mail server. Set only by an explicit request, never inferred from the holder''s portal role.';

-- Rare by nature, and the question asked of it is always "who has this?", so a
-- partial index is both small and the right shape.
CREATE INDEX IF NOT EXISTS mailboxes_server_admin_idx
  ON public.mailboxes (is_server_admin) WHERE is_server_admin;
