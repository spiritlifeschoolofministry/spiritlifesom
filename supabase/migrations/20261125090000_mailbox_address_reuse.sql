-- Letting an address be issued again.
--
-- 20261123090000 made every address unique across *all* rows, deleted ones
-- included, on the reasoning that mail keeps arriving at an old address and a
-- graduate's inbox must not reopen under a new student. That reasoning is still
-- right for a different person. It was wrong as an absolute rule:
--
--   * Giving someone back their own address -- after a mistake, a rename, or a
--     student who left and returned -- is not a risk at all. It is their mail.
--   * Correcting a typo meant the misspelling was burned permanently, and the
--     admin had no way to undo it from the portal.
--
-- So the database now only guarantees that two *live* mailboxes cannot share an
-- address, which is the part that must never be violated. Whether a previously
-- used address may be handed to someone new is a judgement, and judgement moves
-- to the edge function, which can tell who held it before and ask the admin to
-- confirm. Deleted rows are still kept: they are the record of who held what.

DROP INDEX IF EXISTS public.mailboxes_address_unique;

CREATE UNIQUE INDEX IF NOT EXISTS mailboxes_address_active_unique
  ON public.mailboxes (local_part, domain) WHERE status = 'active';

-- Still indexed for the history lookup the edge function does before reusing
-- an address, which reads every row for that name, live or not.
CREATE INDEX IF NOT EXISTS mailboxes_address_history_idx
  ON public.mailboxes (local_part, domain);

COMMENT ON INDEX public.mailboxes_address_active_unique IS
  'Two live mailboxes can never share an address. Reissuing a deleted one is allowed, and gated in the mailbox-admin function rather than here.';
