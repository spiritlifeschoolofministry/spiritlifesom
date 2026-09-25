-- The switches for the WhatsApp alerts, somewhere an admin can reach them.
--
-- Until now every one of these lived in an Edge Function environment variable,
-- which means changing who gets alerted, or silencing one that has become
-- noise, required a developer. That is the wrong shape for settings that
-- belong to whoever runs the school.
--
-- Not in system_settings, despite that being the obvious home: that table has a
-- `USING (true)` read policy, so every row in it is readable by anonymous
-- visitors. It holds school name and registration status, which is fine.
-- Admins' personal phone numbers are not.
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  -- One row, enforced by the key. These are settings, not a history.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),

  -- The master switch. Off means nothing is sent at all, whatever else is set
  -- below -- there needs to be one obvious way to stop everything during an
  -- incident without unpicking eleven toggles.
  enabled boolean NOT NULL DEFAULT true,

  -- Who receives the admin alerts. Empty means nobody, and the functions say so
  -- in their logs rather than failing silently.
  admin_jids text[] NOT NULL DEFAULT '{}',

  -- The official group. Personal data never goes here -- the gateway refuses
  -- any payload carrying a student_id addressed to a group.
  official_group_jid text,

  -- One switch per alert, so a single noisy one can be silenced without
  -- turning off the rest.
  alert_payment_receipt boolean NOT NULL DEFAULT true,
  alert_admissions_digest boolean NOT NULL DEFAULT true,
  alert_exam_integrity boolean NOT NULL DEFAULT true,
  alert_device_conflict boolean NOT NULL DEFAULT true,
  alert_exam_close_digest boolean NOT NULL DEFAULT true,
  alert_grading_backlog boolean NOT NULL DEFAULT true,
  alert_revenue_digest boolean NOT NULL DEFAULT true,
  alert_ops_check boolean NOT NULL DEFAULT true,

  -- Group posts.
  mirror_announcements boolean NOT NULL DEFAULT true,
  alert_exam_published boolean NOT NULL DEFAULT true,
  alert_exam_starting_soon boolean NOT NULL DEFAULT true,

  -- How long a paper may sit unreleased before it is reported. Configurable
  -- because the right number depends on how the school actually marks.
  grading_backlog_days integer NOT NULL DEFAULT 3
    CHECK (grading_backlog_days BETWEEN 1 AND 60),

  -- How full a quota gets before it is worth saying so.
  quota_warn_percent integer NOT NULL DEFAULT 70
    CHECK (quota_warn_percent BETWEEN 10 AND 99),

  -- How long before an exam the group is reminded.
  exam_reminder_minutes integer NOT NULL DEFAULT 60
    CHECK (exam_reminder_minutes BETWEEN 5 AND 1440),

  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- Admins only, both ways. These rows name the numbers that receive the
-- school's operational alerts; a student has no reason to read them and a
-- teacher has no reason to change them.
DROP POLICY IF EXISTS whatsapp_settings_admin_read ON public.whatsapp_settings;
CREATE POLICY whatsapp_settings_admin_read ON public.whatsapp_settings
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS whatsapp_settings_admin_write ON public.whatsapp_settings;
CREATE POLICY whatsapp_settings_admin_write ON public.whatsapp_settings
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

REVOKE ALL ON public.whatsapp_settings FROM anon;

CREATE OR REPLACE FUNCTION public.touch_whatsapp_settings()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS touch_whatsapp_settings ON public.whatsapp_settings;
CREATE TRIGGER touch_whatsapp_settings
BEFORE UPDATE ON public.whatsapp_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_settings();

-- Seed with what is already configured, so turning this on changes nothing.
INSERT INTO public.whatsapp_settings (id, admin_jids, official_group_jid)
VALUES (
  true,
  ARRAY['2349165822262@s.whatsapp.net', '2348066317437@s.whatsapp.net'],
  '120363426028703883@g.us'
)
ON CONFLICT (id) DO NOTHING;
