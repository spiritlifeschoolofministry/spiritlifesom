-- Push notifications for the bell.
--
-- Every notice a student or staff member gets already lands in
-- public.notifications (fees, admissions, grades, events, tasks). This sends
-- the same notice to the devices that person has switched push on for, so it
-- reaches them when the portal is closed.
--
-- One trigger on notifications, rather than one per kind of news: anything that
-- writes a notification later is pushed without further work.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The browser's push address. One row per browser, whoever is signed in.
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- A browser has one endpoint however many people sign in on it. Saving through
-- a function lets the newest sign-in take the endpoint over, which the row
-- policy alone would refuse (the old row belongs to somebody else). The last
-- person to turn push on in a browser is the one that browser notifies.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_user_agent TEXT DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' OR length(p_endpoint) > 2000 THEN
    RAISE EXCEPTION 'Invalid push endpoint';
  END IF;

  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        created_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Set by push-send when it takes a notification, so one notification is pushed
-- once however many times the function is called for it.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

-- Hands each new notification to push-send. Only the id travels: the function
-- reads the row itself, so a forged call cannot make up a message. A failure
-- here must never fail the write that caused the notification.
CREATE OR REPLACE FUNCTION public.push_new_notification()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.user_id) THEN
    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/push-send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('notification_id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_notification_push ON public.notifications;
CREATE TRIGGER on_notification_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.push_new_notification();
