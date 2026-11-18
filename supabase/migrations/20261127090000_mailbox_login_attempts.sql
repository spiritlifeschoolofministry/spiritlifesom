-- Signing in to the portal with a school address (name@spiritlifesom.org).
--
-- The mailbox-login edge function looks the address up and signs in to the
-- portal account it belongs to. Because that sign-in happens from the edge
-- function, every attempt reaches Supabase Auth from the same few server
-- addresses, and Auth's own per-visitor rate limit no longer tells one visitor
-- from another. This table is the replacement: every attempt through the
-- alias is recorded, and the function refuses once an address or a visitor
-- has failed too often recently.
--
-- No passwords, codes or personal emails are stored -- only which school
-- address was tried, from where, and whether it worked.

CREATE TABLE IF NOT EXISTS public.mailbox_login_attempts (
  id bigserial PRIMARY KEY,
  address text NOT NULL,
  ip text,
  kind text NOT NULL CHECK (kind IN ('password', 'otp_request', 'otp_verify')),
  succeeded boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mailbox_login_attempts IS
  'Sign-in attempts made with a school address through the mailbox-login function, for its rate limit. Never holds a password, code or personal email.';

CREATE INDEX IF NOT EXISTS mailbox_login_attempts_address_idx
  ON public.mailbox_login_attempts (address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS mailbox_login_attempts_ip_idx
  ON public.mailbox_login_attempts (ip, attempted_at DESC);

-- Only the edge function (service role) reads or writes this. RLS on with no
-- policies means nobody else can, admins included.
ALTER TABLE public.mailbox_login_attempts ENABLE ROW LEVEL SECURITY;
