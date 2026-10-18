-- "Accepting New Applications" was only ever enforced by the Register page
-- hiding its form. Nothing on the server read it, and handle_new_user turns
-- every new auth user into a student, so any other way of creating an account
-- still produced one. On 17 Oct 2026, with applications closed since 30 Jun, a
-- stranger pressed "Continue with Google" on the Login page mid-class and got
-- a Pending student record. A stale Register tab or a direct call to the
-- public signup API would have done the same.
--
-- Refuse the auth user itself while applications are closed. Signing in with
-- Google to an existing account links an identity and inserts no user, so
-- current students are unaffected. Staff accounts start as signups too: to add
-- one while closed, open applications for the minute it takes.
--
-- A missing or unreadable setting counts as open, as it does on the Register
-- page, so a deleted row can never lock out every new account silently.

CREATE OR REPLACE FUNCTION public.refuse_signup_when_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value jsonb;
BEGIN
  SELECT value INTO v_value FROM system_settings WHERE key = 'accepting_applications';

  IF v_value = 'false'::jsonb OR v_value = '"false"'::jsonb THEN
    RAISE EXCEPTION 'Registrations are closed'
      USING ERRCODE = 'P0001', HINT = 'accepting_applications is false';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refuse_signup_when_closed ON auth.users;

CREATE TRIGGER refuse_signup_when_closed
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.refuse_signup_when_closed();
