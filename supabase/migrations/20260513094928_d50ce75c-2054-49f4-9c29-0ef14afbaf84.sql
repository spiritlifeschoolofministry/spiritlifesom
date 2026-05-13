-- Function to notify students
CREATE OR REPLACE FUNCTION public.create_student_notification()
RETURNS TRIGGER AS $$
DECLARE
    target_user_ids UUID[];
BEGIN
    -- Determine target users based on the table
    IF TG_TABLE_NAME = 'announcements' THEN
        IF NEW.target_cohort_id IS NULL THEN
            SELECT ARRAY_AGG(profile_id) INTO target_user_ids FROM public.students;
        ELSE
            SELECT ARRAY_AGG(profile_id) INTO target_user_ids FROM public.students WHERE cohort_id = NEW.target_cohort_id;
        END IF;
        
        IF target_user_ids IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, body, type, link)
            SELECT unnest(target_user_ids), NEW.title, left(NEW.body, 100), 'announcement', '/student/announcements';
        END IF;

    ELSIF TG_TABLE_NAME = 'assignments' THEN
        SELECT ARRAY_AGG(profile_id) INTO target_user_ids FROM public.students WHERE cohort_id = NEW.cohort_id;
        
        IF target_user_ids IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, body, type, link)
            SELECT unnest(target_user_ids), 'New Assignment: ' || NEW.title, 'A new task has been assigned to your cohort.', 'assignment', '/student/assignments';
        END IF;

    ELSIF TG_TABLE_NAME = 'school_events' THEN
        IF NEW.target_cohort_id IS NULL THEN
            SELECT ARRAY_AGG(profile_id) INTO target_user_ids FROM public.students;
        ELSE
            SELECT ARRAY_AGG(profile_id) INTO target_user_ids FROM public.students WHERE cohort_id = NEW.target_cohort_id;
        END IF;
        
        IF target_user_ids IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, body, type, link)
            SELECT unnest(target_user_ids), 'New Event: ' || NEW.title, NEW.description, 'event', '/student/calendar';
        END IF;

    ELSIF TG_TABLE_NAME = 'fees' THEN
        -- Only notify if it's a new fee entry for a specific student
        IF NEW.student_id IS NOT NULL THEN
            SELECT profile_id INTO target_user_ids[1] FROM public.students WHERE id = NEW.student_id;
            
            IF target_user_ids[1] IS NOT NULL THEN
                INSERT INTO public.notifications (user_id, title, body, type, link)
                VALUES (target_user_ids[1], 'New Fee Assigned', 'A new ' || NEW.fee_type || ' of ₦' || NEW.amount_due || ' has been assigned to you.', 'fee', '/student/fees');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
DROP TRIGGER IF EXISTS on_announcement_created ON public.announcements;
CREATE TRIGGER on_announcement_created
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.create_student_notification();

DROP TRIGGER IF EXISTS on_assignment_created ON public.assignments;
CREATE TRIGGER on_assignment_created
AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.create_student_notification();

DROP TRIGGER IF EXISTS on_event_created ON public.school_events;
CREATE TRIGGER on_event_created
AFTER INSERT ON public.school_events
FOR EACH ROW EXECUTE FUNCTION public.create_student_notification();

DROP TRIGGER IF EXISTS on_fee_created ON public.fees;
CREATE TRIGGER on_fee_created
AFTER INSERT ON public.fees
FOR EACH ROW EXECUTE FUNCTION public.create_student_notification();
