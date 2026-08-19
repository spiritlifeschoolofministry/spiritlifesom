-- Lateness was decided on the student's own device: StudentAttendance compared
-- now().getHours() against class_today.late_after and sent the result up as a
-- plain column. Two consequences:
--   1. a wrong device clock or timezone produced a wrong status, and
--   2. status was simply whatever the client posted, so a crafted insert could
--      claim Present at any hour.
--
-- Status is now computed here, from server time in Africa/Lagos.
--
-- Only genuine student self-check-ins are recomputed. Staff-entered records keep
-- the status the admin chose, and so do service-role/SQL inserts (auth.uid() is
-- null there), otherwise back-dated corrections would be rewritten on insert.

CREATE OR REPLACE FUNCTION public.set_attendance_status_from_class_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cohort_id  uuid;
  v_setting    jsonb;
  v_late_after text;
  v_now_lagos  timestamp;
BEGIN
  IF auth.uid() IS NULL OR get_my_role() = ANY (ARRAY['admin', 'teacher']) THEN
    RETURN NEW;
  END IF;

  v_now_lagos := now() AT TIME ZONE 'Africa/Lagos';

  SELECT cohort_id INTO v_cohort_id FROM students WHERE id = NEW.student_id;
  SELECT value INTO v_setting FROM system_settings WHERE key = 'class_today';

  -- No session configured for today: nothing to be late for.
  IF v_setting IS NULL
     OR (v_setting ->> 'date') IS DISTINCT FROM to_char(v_now_lagos, 'YYYY-MM-DD') THEN
    NEW.status := 'Present';
    RETURN NEW;
  END IF;

  v_late_after := NULLIF(v_setting -> 'cohorts' -> v_cohort_id::text ->> 'late_after', '');

  -- No threshold set for this session: nobody is late. Previously a stale
  -- default of 09:15 was inherited, which marked entire classes late on days
  -- the register opened later (27 Jun, 25 Jul and 15 Aug 2026: 119 records).
  IF v_late_after IS NULL THEN
    NEW.status := 'Present';
    RETURN NEW;
  END IF;

  NEW.status := CASE
    WHEN v_now_lagos::time > v_late_after::time THEN 'Late'
    ELSE 'Present'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_status_from_class_window ON public.attendance;

CREATE TRIGGER attendance_status_from_class_window
  BEFORE INSERT ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attendance_status_from_class_window();
