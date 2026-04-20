-- Trigger: log fee adjustments and deletions
CREATE OR REPLACE FUNCTION public.trg_audit_fee_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.amount_due IS DISTINCT FROM NEW.amount_due
       OR OLD.amount_paid IS DISTINCT FROM NEW.amount_paid
       OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
       OR OLD.waived IS DISTINCT FROM NEW.waived
       OR OLD.waive_reason IS DISTINCT FROM NEW.waive_reason THEN
      v_changed := true;
    END IF;

    IF v_changed THEN
      PERFORM audit_log_event(
        'fee.adjusted', 'fee', NEW.id,
        'Fee adjusted (' || COALESCE(NEW.fee_type, 'fee') || '): ₦'
          || COALESCE(OLD.amount_paid, 0) || ' → ₦' || COALESCE(NEW.amount_paid, 0)
          || CASE WHEN NEW.waived THEN ' [WAIVED]' ELSE '' END,
        jsonb_build_object(
          'amount_due', OLD.amount_due,
          'amount_paid', OLD.amount_paid,
          'payment_status', OLD.payment_status,
          'waived', OLD.waived,
          'waive_reason', OLD.waive_reason
        ),
        jsonb_build_object(
          'amount_due', NEW.amount_due,
          'amount_paid', NEW.amount_paid,
          'payment_status', NEW.payment_status,
          'waived', NEW.waived,
          'waive_reason', NEW.waive_reason
        ),
        jsonb_build_object('student_id', NEW.student_id, 'fee_type', NEW.fee_type)
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_log_event(
      'fee.deleted', 'fee', OLD.id,
      'Fee deleted (' || COALESCE(OLD.fee_type, 'fee') || ', ₦' || COALESCE(OLD.amount_due, 0) || ')',
      to_jsonb(OLD), NULL,
      jsonb_build_object('student_id', OLD.student_id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_fees_changes
AFTER UPDATE OR DELETE ON public.fees
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_fee_changes();

-- Trigger: log announcement deletions
CREATE OR REPLACE FUNCTION public.trg_audit_announcement_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM audit_log_event(
    'announcement.deleted', 'announcement', OLD.id,
    'Announcement deleted: "' || COALESCE(OLD.title, 'Untitled') || '"',
    to_jsonb(OLD), NULL,
    jsonb_build_object(
      'category', OLD.category,
      'target_cohort_id', OLD.target_cohort_id
    )
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER audit_announcements_deleted
AFTER DELETE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_announcement_deleted();
