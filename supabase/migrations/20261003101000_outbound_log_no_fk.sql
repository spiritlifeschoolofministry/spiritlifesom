-- A log must never refuse to record.
--
-- student_id carried a foreign key, so a send naming a student id that does not
-- exist -- a stale id, a test, a bug in a caller -- had its log row rejected,
-- silently, because the write is fire-and-forget. The first row this table lost
-- was a refused send, which is precisely the kind of row it exists to keep.
--
-- The id stays, unconstrained. A log is a record of what was asked for, and an
-- id that points at nothing is itself worth seeing.
ALTER TABLE public.whatsapp_outbound_log
  DROP CONSTRAINT IF EXISTS whatsapp_outbound_log_student_id_fkey;
