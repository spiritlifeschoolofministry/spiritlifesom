-- Ministry service log (practicum).
--
-- A student records field ministry they have done; staff approve or reject
-- each entry; approved hours add up against the cohort's requirement.
--
-- The requirement is shown, not enforced: issuing a certificate does not check
-- it. That stays a decision for a person until the school says otherwise.

ALTER TABLE public.cohorts ADD COLUMN IF NOT EXISTS service_hours_required NUMERIC(6,1)
  CHECK (service_hours_required IS NULL OR service_hours_required >= 0);

CREATE TABLE IF NOT EXISTS public.service_logs (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  hours NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  category TEXT NOT NULL CHECK (category IN (
    'evangelism', 'teaching', 'prayer', 'church_service', 'pastoral_care', 'community', 'other'
  )),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
  location TEXT CHECK (location IS NULL OR length(location) <= 200),
  -- Who can confirm it happened. Staff may call before approving.
  supervisor_name TEXT CHECK (supervisor_name IS NULL OR length(supervisor_name) <= 120),
  supervisor_contact TEXT CHECK (supervisor_contact IS NULL OR length(supervisor_contact) <= 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 1000),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_logs_student ON public.service_logs (student_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_service_logs_status ON public.service_logs (status, created_at);

ALTER TABLE public.service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their own service log"
  ON public.service_logs FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

-- A student can only ever write a pending entry: the checks stop them
-- approving their own hours or logging a date that has not happened.
CREATE POLICY "Students add service entries"
  ON public.service_logs FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_my_student_id()
    AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL
    AND activity_date <= (now() AT TIME ZONE 'Africa/Lagos')::date
  );

CREATE POLICY "Students edit pending service entries"
  ON public.service_logs FOR UPDATE TO authenticated
  USING (student_id = public.get_my_student_id() AND status = 'pending')
  WITH CHECK (
    student_id = public.get_my_student_id()
    AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL
    AND activity_date <= (now() AT TIME ZONE 'Africa/Lagos')::date
  );

CREATE POLICY "Students delete pending service entries"
  ON public.service_logs FOR DELETE TO authenticated
  USING (student_id = public.get_my_student_id() AND status = 'pending');

CREATE POLICY "Staff manage service logs"
  ON public.service_logs FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_logs TO authenticated;
GRANT ALL ON public.service_logs TO service_role;

-- Tell the student when an entry is decided.
CREATE OR REPLACE FUNCTION public.notify_service_log_decision()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    SELECT profile_id INTO v_user FROM students WHERE id = NEW.student_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (
        v_user,
        CASE NEW.status WHEN 'approved' THEN 'Service hours approved' ELSE 'Service entry not approved' END,
        trim(to_char(NEW.hours, 'FM990.0')) || ' hours on ' || to_char(NEW.activity_date, 'FMDD Mon YYYY')
          || COALESCE('. ' || NULLIF(btrim(NEW.review_note), ''), ''),
        'service',
        '/student/service'
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Service log notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_service_log_decided ON public.service_logs;
CREATE TRIGGER on_service_log_decided
AFTER UPDATE OF status ON public.service_logs
FOR EACH ROW EXECUTE FUNCTION public.notify_service_log_decision();
