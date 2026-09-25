-- Let an announcement go to the WhatsApp group as well as the portal.
--
-- Students read WhatsApp. The portal announcement is the record; the group
-- message is what actually reaches anyone on the day. Mirroring the two by hand
-- means retyping, and retyped notices drift from the thing they were copied
-- from until nobody is sure which one is right.
--
-- Opt-in per announcement rather than automatic. Not every notice belongs in a
-- group of seventy-seven people, and the decision belongs to whoever wrote it.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS send_to_whatsapp boolean NOT NULL DEFAULT false;

-- When it went, so an edit does not send it again. Announcements get corrected
-- -- a wrong date, a typo -- and each correction is an UPDATE that would
-- otherwise re-post the whole notice to the group.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.whatsapp_mirror_announcement()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Three conditions, all required: asked for, actually published, and not
  -- already sent. The last is what makes this safe to run on UPDATE, which is
  -- how a correction arrives.
  IF NOT NEW.send_to_whatsapp
     OR NOT COALESCE(NEW.is_published, false)
     OR NEW.whatsapp_sent_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('announcement_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Posting a notice must not fail because the group could not be reached.
  -- The portal copy is the record and it is already written by this point.
  RAISE WARNING 'WhatsApp announcement mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_announcement_whatsapp ON public.announcements;
CREATE TRIGGER on_announcement_whatsapp
AFTER INSERT OR UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_mirror_announcement();
