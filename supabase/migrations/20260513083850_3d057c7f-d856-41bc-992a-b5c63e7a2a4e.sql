CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_email_update();

-- Backfill any existing mismatches
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS DISTINCT FROM u.email;