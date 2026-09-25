-- Listening, not just talking.
--
-- Until now the number has been write-only: it sends, and anything a student
-- sends back is dropped without a trace. That is a poor thing to do to someone
-- who replies to a message you sent them, and it means the most obvious way to
-- say "stop" -- replying to say stop -- does nothing at all.

-- What was said to us, and what we made of it.
--
-- Kept because an inbound endpoint that misreads a message leaves no other
-- evidence: the student sees a wrong answer or silence, and there is nothing to
-- check afterwards. The body is stored because the whole question is what they
-- actually typed.
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  from_jid text NOT NULL,
  -- Null when the number matches nobody: a wrong number, a former student, or
  -- somebody who has never been here at all.
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  body text,
  -- Which command it was understood as, or null for "not understood".
  command text,
  replied boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_recent
  ON public.whatsapp_inbound_log (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_from
  ON public.whatsapp_inbound_log (from_jid, received_at DESC);

ALTER TABLE public.whatsapp_inbound_log ENABLE ROW LEVEL SECURITY;

-- Admins read it; nobody else does. It contains whatever students typed, which
-- may be anything at all.
DROP POLICY IF EXISTS whatsapp_inbound_admin_read ON public.whatsapp_inbound_log;
CREATE POLICY whatsapp_inbound_admin_read ON public.whatsapp_inbound_log
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

REVOKE ALL ON public.whatsapp_inbound_log FROM anon;


-- Where a conversation has got to, and how much of it there has been.
--
-- Two jobs in one row because both are per-number and both are short-lived.
--
-- `awaiting` is what makes stopping deliberate. "Stop" is a word people type in
-- ordinary conversation, and a single one of them silently ending a student's
-- results notifications is a failure nobody would ever notice -- least of all
-- the student, who simply stops hearing from the school. So the first one asks,
-- and only an explicit confirmation counts.
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  jid text PRIMARY KEY,
  awaiting text,
  awaiting_until timestamptz,
  -- A simple per-hour counter. An inbound endpoint is reachable by anyone who
  -- can text the number, so a bound is needed on how much one of them can make
  -- it do.
  window_started_at timestamptz NOT NULL DEFAULT now(),
  messages_in_window integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_conversations FROM anon, authenticated;

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS inbound_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbound_replies_per_hour integer NOT NULL DEFAULT 20
    CHECK (inbound_replies_per_hour BETWEEN 1 AND 200);

-- Who is this number, if anyone.
--
-- Matches on the stored address rather than re-parsing the raw phone, so an
-- inbound message resolves exactly the same way an outbound one is addressed.
-- A number belonging to two profiles returns nothing: answering the wrong one
-- would hand a student's details to somebody else, and there is no safe way to
-- guess between them.
CREATE OR REPLACE FUNCTION public.whatsapp_student_for_jid(p_jid text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.whatsapp_jid = p_jid
    AND s.is_staff_preview = false
  GROUP BY s.id
  HAVING count(*) = 1
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_student_for_jid(text) FROM PUBLIC, anon;
