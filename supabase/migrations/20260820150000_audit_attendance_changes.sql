-- Attendance was the one consequential table with no audit trail. fees,
-- payments, students and announcements have carried one since April; the
-- register never did, so nothing recorded who changed a mark or what it was
-- before. That gap surfaced when a student asked for two Late marks to be
-- restored after a bulk correction and the previous values had to be inferred
-- from check-in times instead of read back.
--
-- Note this was never about how the change reached the database:
-- audit_log_event() inserts unconditionally and simply leaves actor_id null
-- when auth.uid() is null, so service-role and SQL edits were always
-- recorded for the tables that had a trigger.

CREATE OR REPLACE FUNCTION public.trg_audit_attendance_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date text;
BEGIN
  SELECT to_char(date, 'YYYY-MM-DD') INTO v_date
  FROM schedule WHERE id = COALESCE(NEW.schedule_id, OLD.schedule_id);

  IF TG_OP = 'INSERT' THEN
    PERFORM audit_log_event(
      'attendance.created', 'attendance', NEW.id,
      'Attendance recorded (' || COALESCE(v_date, 'unknown session') || '): '
        || COALESCE(NEW.status, 'no status'),
      NULL, to_jsonb(NEW),
      jsonb_build_object('student_id', NEW.student_id, 'session_date', v_date)
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only a real change to what the record asserts is worth a log line.
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.is_verified IS DISTINCT FROM NEW.is_verified
       OR OLD.check_in_time IS DISTINCT FROM NEW.check_in_time THEN
      PERFORM audit_log_event(
        'attendance.changed', 'attendance', NEW.id,
        'Attendance changed (' || COALESCE(v_date, 'unknown session') || '): '
          || COALESCE(OLD.status, 'none') || ' → ' || COALESCE(NEW.status, 'none'),
        jsonb_build_object(
          'status', OLD.status,
          'is_verified', OLD.is_verified,
          'check_in_time', OLD.check_in_time
        ),
        jsonb_build_object(
          'status', NEW.status,
          'is_verified', NEW.is_verified,
          'check_in_time', NEW.check_in_time
        ),
        jsonb_build_object('student_id', NEW.student_id, 'session_date', v_date)
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_log_event(
      'attendance.deleted', 'attendance', OLD.id,
      'Attendance deleted (' || COALESCE(v_date, 'unknown session') || ', was '
        || COALESCE(OLD.status, 'no status') || ')',
      to_jsonb(OLD), NULL,
      jsonb_build_object('student_id', OLD.student_id, 'session_date', v_date)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_attendance_changes ON public.attendance;

CREATE TRIGGER audit_attendance_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_attendance_changes();
