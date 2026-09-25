-- Tell the group when an exam opens, and again shortly before it starts.
--
-- Both notices are written by hand today, which means they are written when
-- somebody remembers. The reminder is the one that matters: a student who
-- misses the start of a timed paper cannot be given the time back.

-- When the group was told an exam is about to start. A reminder window is
-- checked repeatedly by a schedule, so without a marker the same exam would be
-- announced on every pass through that window.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS whatsapp_reminded_at timestamptz;

-- When the group was told the exam had opened. An exam can move back to draft
-- and be published again -- a corrected paper, a changed date -- and each of
-- those is a fresh publication worth announcing, so this is cleared rather than
-- being treated as permanent.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS whatsapp_published_at timestamptz;


-- 1. An exam has been published.
CREATE OR REPLACE FUNCTION public.whatsapp_notice_on_exam_published()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Fires on the move into 'published', not on the state. An exam is written to
  -- repeatedly while it is being built, and every one of those writes would
  -- otherwise announce it again.
  IF NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
  THEN
    -- Publishing again after a correction should announce again, so the marker
    -- from last time is cleared as it goes back out.
    NEW.whatsapp_published_at := NULL;

    PERFORM net.http_post(
      url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-group-post',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'exam_published', 'exam_id', NEW.id)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Publishing an exam must never fail because the group could not be told.
  RAISE WARNING 'WhatsApp exam notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_exam_published_whatsapp ON public.exams;
CREATE TRIGGER on_exam_published_whatsapp
BEFORE UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_notice_on_exam_published();
