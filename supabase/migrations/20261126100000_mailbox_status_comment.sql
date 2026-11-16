-- Correcting a column comment that no longer describes the behaviour.
--
-- 20261123090000 said removed rows exist "so the address is never reissued".
-- 20261125090000 changed that: the unique index now covers live mailboxes
-- only, and reuse is a judgement made in the mailbox-admin function, which can
-- see who held the address before. The comment was left describing the old
-- rule, which is worse than no comment -- it is the first thing anyone reading
-- the schema will believe.

COMMENT ON COLUMN public.mailboxes.status IS
  'active, or removed once the Stalwart account is deleted. Removed rows are kept as the record of who held an address; the address itself may be issued again, which mailbox-admin gates on whether the new holder is the same person.';
