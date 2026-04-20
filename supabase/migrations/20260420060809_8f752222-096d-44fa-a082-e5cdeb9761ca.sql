-- Audit log table for admin-sensitive actions
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,                    -- auth.uid() of admin/user performing action (nullable for system)
  actor_email text,                 -- snapshot for readability
  actor_role text,                  -- snapshot of role at time of action
  action text NOT NULL,             -- e.g. 'student.status_change', 'payment.verified', 'payment.rejected', 'student.deleted', 'student.cohort_change', 'student.code_change'
  entity_type text NOT NULL,        -- 'student' | 'payment' | 'profile' | etc.
  entity_id uuid,                   -- id of the affected record
  summary text,                     -- short human-readable description
  old_values jsonb,                 -- previous values (for changes)
  new_values jsonb,                 -- new values (for changes)
  metadata jsonb                    -- anything extra (ip, notes, etc.)
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.get_my_role() = 'admin');

-- Allow authenticated inserts (triggers run as SECURITY DEFINER, but client-side
-- writes from admin actions are also allowed). Restrict to admins for safety.
CREATE POLICY "audit_logs_insert_admin"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'admin');

-- No UPDATE or DELETE policies → audit log is append-only.

-- Helper: snapshot of actor info
CREATE OR REPLACE FUNCTION public.audit_log_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_old jsonb DEFAULT NULL,
  p_new jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email, role INTO v_email, v_role FROM profiles WHERE id = v_actor;
  END IF;

  INSERT INTO audit_logs (
    actor_id, actor_email, actor_role,
    action, entity_type, entity_id, summary,
    old_values, new_values, metadata
  ) VALUES (
    v_actor, v_email, v_role,
    p_action, p_entity_type, p_entity_id, p_summary,
    p_old, p_new, p_metadata
  );
END;
$$;

-- Trigger: log student admission_status / cohort / code changes
CREATE OR REPLACE FUNCTION public.trg_audit_student_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.admission_status IS DISTINCT FROM NEW.admission_status THEN
      v_summary := 'Admission status changed: ' || COALESCE(OLD.admission_status, 'NULL')
                || ' → ' || COALESCE(NEW.admission_status, 'NULL');
      PERFORM audit_log_event(
        'student.status_change', 'student', NEW.id, v_summary,
        jsonb_build_object('admission_status', OLD.admission_status),
        jsonb_build_object('admission_status', NEW.admission_status),
        jsonb_build_object('student_code', NEW.student_code)
      );
    END IF;

    IF OLD.cohort_id IS DISTINCT FROM NEW.cohort_id THEN
      PERFORM audit_log_event(
        'student.cohort_change', 'student', NEW.id,
        'Cohort reassigned',
        jsonb_build_object('cohort_id', OLD.cohort_id),
        jsonb_build_object('cohort_id', NEW.cohort_id),
        NULL
      );
    END IF;

    IF OLD.student_code IS DISTINCT FROM NEW.student_code THEN
      PERFORM audit_log_event(
        'student.code_change', 'student', NEW.id,
        'Student code changed: ' || COALESCE(OLD.student_code, 'NULL')
                                  || ' → ' || COALESCE(NEW.student_code, 'NULL'),
        jsonb_build_object('student_code', OLD.student_code),
        jsonb_build_object('student_code', NEW.student_code),
        NULL
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_log_event(
      'student.deleted', 'student', OLD.id,
      'Student record deleted (code: ' || COALESCE(OLD.student_code, 'N/A') || ')',
      to_jsonb(OLD), NULL,
      jsonb_build_object('cohort_id', OLD.cohort_id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_students_changes
AFTER UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_changes();

-- Trigger: log payment status changes (verified / rejected) and deletions
CREATE OR REPLACE FUNCTION public.trg_audit_payment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := CASE
        WHEN UPPER(NEW.status) = 'VERIFIED' THEN 'payment.verified'
        WHEN UPPER(NEW.status) = 'REJECTED' THEN 'payment.rejected'
        ELSE 'payment.status_change'
      END;
      PERFORM audit_log_event(
        v_action, 'payment', NEW.id,
        'Payment ' || NEW.status || ' (₦' || NEW.amount_paid || ')',
        jsonb_build_object('status', OLD.status, 'admin_notes', OLD.admin_notes),
        jsonb_build_object('status', NEW.status, 'admin_notes', NEW.admin_notes),
        jsonb_build_object('student_id', NEW.student_id, 'amount_paid', NEW.amount_paid)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_log_event(
      'payment.deleted', 'payment', OLD.id,
      'Payment record deleted (₦' || OLD.amount_paid || ')',
      to_jsonb(OLD), NULL,
      jsonb_build_object('student_id', OLD.student_id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_payments_changes
AFTER UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_payment_changes();

-- Trigger: log profile role promotions/demotions
CREATE OR REPLACE FUNCTION public.trg_audit_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM audit_log_event(
      'profile.role_change', 'profile', NEW.id,
      'Role changed: ' || COALESCE(OLD.role, 'NULL') || ' → ' || COALESCE(NEW.role, 'NULL'),
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      jsonb_build_object('email', NEW.email)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_profiles_role_change
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_profile_role_change();
