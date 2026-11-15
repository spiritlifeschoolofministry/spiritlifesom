-- Handing new mailbox credentials to the person they belong to.
--
-- Reading a 16-character password down the phone to a hundred students was
-- never going to happen, so the portal delivers them: by email to the personal
-- address already on file, and over WhatsApp, which most of the school already
-- uses for everything else.
--
-- What this does NOT change: the password is still generated per action, still
-- shown on screen once, and still stored nowhere. These columns record *that* a
-- delivery happened and when -- never what was delivered. `email_send_history`
-- has no body column, which is why a credentials email can be logged there at
-- all; nothing in this schema may be allowed to become the place the school
-- keeps its students' mail passwords.

ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS credentials_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS credentials_whatsapp_at timestamptz;

COMMENT ON COLUMN public.mailboxes.credentials_emailed_at IS
  'When the address and a freshly generated password were last emailed to the owner''s personal address. Never records the password itself.';
COMMENT ON COLUMN public.mailboxes.credentials_whatsapp_at IS
  'When the same details were last sent over WhatsApp. Never records the password itself.';

-- Where a person's WhatsApp messages may be sent, or nothing.
--
-- The profile-level twin of whatsapp_target_for_student, and it exists for the
-- same stated reason that one does: every send goes through a function so the
-- opt-out cannot be forgotten by whatever gets written next.
--
-- Needed separately because a mailbox belongs to a *profile*. Staff have no
-- student row at all, so the student-keyed function returns nothing for them --
-- which would have silently skipped WhatsApp for exactly the people who
-- administer the school.
CREATE OR REPLACE FUNCTION public.whatsapp_target_for_profile(p_profile_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT p.whatsapp_jid
  FROM public.profiles p
  WHERE p.id = p_profile_id
    AND p.whatsapp_opted_out_at IS NULL
    AND p.whatsapp_jid IS NOT NULL
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_target_for_profile(uuid) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.whatsapp_target_for_profile(uuid) IS
  'The WhatsApp JID for a profile, honouring the opt-out. Returns nothing for anyone who has opted out or has no number. Works for staff, who have no student record.';
