
-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "View own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update (mark read) their own notifications  
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins can insert notifications for any user
CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- System insert (for triggers - security definer functions)
-- Index for performance
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON public.notifications (created_at DESC);

-- Auto-create notification when announcement is published
CREATE OR REPLACE FUNCTION public.notify_on_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_published = true AND (OLD.is_published IS NULL OR OLD.is_published = false) THEN
    -- Notify all students (or cohort-specific)
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT 
      s.profile_id,
      'New Announcement: ' || NEW.title,
      LEFT(NEW.body, 200),
      'announcement',
      '/student/announcements'
    FROM students s
    WHERE s.admission_status IN ('ADMITTED', 'Graduate')
      AND (NEW.target_cohort_id IS NULL OR s.cohort_id = NEW.target_cohort_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_announcement_published_notify
  AFTER UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_announcement();

-- Auto-create notification when assignment grade is submitted
CREATE OR REPLACE FUNCTION public.notify_on_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.grade IS NOT NULL AND (OLD.grade IS NULL OR OLD.grade != NEW.grade) THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT 
      s.profile_id,
      'Grade Posted',
      'You received a score of ' || NEW.grade || ' on a task.',
      'grade',
      '/student/grades'
    FROM students s
    WHERE s.id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_grade_posted_notify
  AFTER UPDATE ON assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_grade();
