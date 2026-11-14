-- Staff can form project groups before there is a topic.
--
-- Until now a project could only exist with a topic: a student proposed one or
-- staff gave one. A school that puts students into groups first had no way to
-- record that. Now staff can create a project that is waiting for its topic
-- ('awaiting_topic', empty title). The group's lead then proposes the topic in
-- the usual way, or a supervisor gives one.
--
-- members_locked marks a membership the school decided. A student sending a
-- topic for such a project cannot change who is in it; only staff can.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS members_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('awaiting_topic', 'proposed', 'changes_requested', 'approved', 'rejected'));

-- A title is required as soon as there is a topic, and only then.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_title_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_title_check
  CHECK (
    (status = 'awaiting_topic' AND length(title) <= 300)
    OR length(btrim(title)) BETWEEN 5 AND 300
  );

CREATE OR REPLACE FUNCTION public.submit_project_topic(
  p_title TEXT, p_abstract TEXT, p_partner_profile_ids UUID[] DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student students%ROWTYPE;
  v_project projects%ROWTYPE;
  v_partner_ids uuid[] := '{}';
  v_wanted int;
  v_taken text;
  v_is_group boolean;
  v_locked boolean;
BEGIN
  SELECT * INTO v_student FROM students WHERE profile_id = auth.uid();
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Only students can propose a project topic';
  END IF;
  IF upper(COALESCE(v_student.admission_status, '')) = 'PENDING' THEN
    RAISE EXCEPTION 'You can propose a topic once your admission is approved';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) < 5 THEN
    RAISE EXCEPTION 'Write the title of your project';
  END IF;

  SELECT p.* INTO v_project
  FROM projects p JOIN project_members m ON m.project_id = p.id
  WHERE m.student_id = v_student.id;

  IF v_project.id IS NOT NULL AND v_project.student_id <> v_student.id THEN
    RAISE EXCEPTION 'You are already in a group project. Its topic is sent by the group''s lead';
  END IF;
  IF v_project.status = 'approved' THEN
    RAISE EXCEPTION 'Your topic is already approved. Ask your supervisor if it needs to change';
  END IF;

  v_locked := COALESCE(v_project.members_locked, false);

  IF v_locked THEN
    -- The school set who is in this project; the student only supplies the topic.
    UPDATE projects
    SET title = btrim(p_title),
        abstract = COALESCE(btrim(p_abstract), ''),
        topic_source = 'student',
        status = 'proposed'
    WHERE id = v_project.id;
    RETURN v_project.id;
  END IF;

  SELECT count(DISTINCT x) INTO v_wanted
  FROM unnest(COALESCE(p_partner_profile_ids, '{}')) x WHERE x <> auth.uid();

  SELECT COALESCE(array_agg(s.id), '{}') INTO v_partner_ids
  FROM students s
  WHERE s.profile_id = ANY (COALESCE(p_partner_profile_ids, '{}'))
    AND s.profile_id <> auth.uid()
    AND s.cohort_id = v_student.cohort_id
    AND NOT s.is_staff_preview
    AND upper(COALESCE(s.admission_status, '')) <> 'PENDING';

  IF cardinality(v_partner_ids) <> v_wanted THEN
    RAISE EXCEPTION 'One of the people you chose cannot be added. Group members must be on your cohort';
  END IF;
  v_is_group := cardinality(v_partner_ids) > 0;

  SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) INTO v_taken
  FROM project_members m
    JOIN students s ON s.id = m.student_id
    JOIN profiles pf ON pf.id = s.profile_id
  WHERE m.student_id = ANY (v_partner_ids)
    AND m.project_id IS DISTINCT FROM v_project.id
  LIMIT 1;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION '% is already in another project', v_taken;
  END IF;

  IF v_project.id IS NULL THEN
    INSERT INTO projects (student_id, title, abstract, topic_source, status, is_group)
    VALUES (v_student.id, btrim(p_title), COALESCE(btrim(p_abstract), ''), 'student', 'proposed', v_is_group)
    RETURNING * INTO v_project;
  ELSE
    -- Leaving members go first, so a project turning individual passes the guard.
    DELETE FROM project_members
    WHERE project_id = v_project.id
      AND student_id <> v_student.id
      AND NOT (student_id = ANY (v_partner_ids));
    UPDATE projects
    SET title = btrim(p_title),
        abstract = COALESCE(btrim(p_abstract), ''),
        topic_source = 'student',
        status = 'proposed',
        is_group = v_is_group
    WHERE id = v_project.id;
  END IF;

  INSERT INTO project_members (project_id, student_id)
  SELECT v_project.id, x FROM unnest(v_partner_ids) x
  ON CONFLICT (project_id, student_id) DO NOTHING;

  RETURN v_project.id;
END;
$function$;

-- members_locked goes on the end: CREATE OR REPLACE VIEW only appends.
CREATE OR REPLACE VIEW public.project_overview AS
  SELECT p.id,
    p.student_id,
    s.student_code,
    s.cohort_id,
    c.name AS cohort_name,
    sp.first_name AS student_first_name,
    sp.last_name AS student_last_name,
    p.is_group,
    public.project_people(p.id) AS member_names,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'student_id', ms.id,
              'profile_id', ms.profile_id,
              'name', btrim(concat_ws(' ', mp.first_name, mp.last_name)),
              'code', ms.student_code,
              'lead', ms.id = p.student_id)
            ORDER BY (ms.id = p.student_id) DESC, mp.first_name, mp.last_name), '[]'::jsonb)
     FROM public.project_members m
       JOIN public.students ms ON ms.id = m.student_id
       JOIN public.profiles mp ON mp.id = ms.profile_id
     WHERE m.project_id = p.id) AS members,
    p.title,
    p.abstract,
    p.topic_source,
    p.status,
    p.review_note,
    p.reviewed_at,
    p.supervisor_id,
    NULLIF(btrim(concat_ws(' ', sup.first_name, sup.last_name)), '') AS supervisor_name,
    p.defence_at,
    p.defence_venue,
    p.outcome,
    p.outcome_note,
    p.outcome_at,
    CASE WHEN public.get_my_role() IN ('admin', 'teacher') OR p.outcome IS NOT NULL THEN p.final_score END AS final_score,
    p.final_approved_at,
    p.created_at,
    p.updated_at,
    p.members_locked
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    JOIN public.profiles sp ON sp.id = s.profile_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
    LEFT JOIN public.profiles sup ON sup.id = p.supervisor_id
  WHERE public.get_my_role() IN ('admin', 'teacher') OR public.is_my_project(p.id);

-- A member added to a group that has no topic yet is told what happens next.
CREATE OR REPLACE FUNCTION public.notify_project_member_added()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  IF NEW.student_id <> v_project.student_id THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT s.profile_id,
      'You are in a project group',
      COALESCE(NULLIF(left(btrim(v_project.title), 200), ''), 'Open Project to see who is in your group.'),
      'project', '/student/project'
    FROM students s WHERE s.id = NEW.student_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project member notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_project_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_people text;
  v_staff_link text := '/admin/projects/' || NEW.id;
  v_when text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only the lead is a member at this moment; anyone added afterwards is told
    -- by on_project_member_added.
    SELECT btrim(concat_ws(' ', p.first_name, p.last_name)) INTO v_people
    FROM students s JOIN profiles p ON p.id = s.profile_id WHERE s.id = NEW.student_id;
    IF NEW.status = 'awaiting_topic' THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT s.profile_id, 'You are leading a project group',
        'Open Project to see your group and send its topic.', 'project', '/student/project'
      FROM students s WHERE s.id = NEW.student_id;
    ELSIF NEW.topic_source = 'supervisor' THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT s.profile_id, 'You have been given a project topic', left(NEW.title, 200), 'project', '/student/project'
      FROM students s WHERE s.id = NEW.student_id;
    ELSE
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT p.id, 'Project topic to review', v_people || ': ' || left(NEW.title, 160), 'project', v_staff_link
      FROM profiles p WHERE p.role = 'admin';
    END IF;
    IF NEW.supervisor_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (NEW.supervisor_id, 'You are supervising a project',
        v_people || COALESCE(': ' || NULLIF(left(btrim(NEW.title), 160), ''), ''), 'project', v_staff_link);
    END IF;
    RETURN NEW;
  END IF;

  v_people := public.project_people(NEW.id);

  -- A topic arrives for review: the first one for a group staff formed, or a
  -- second attempt after changes were asked for.
  IF NEW.status = 'proposed' AND OLD.status IN ('awaiting_topic', 'changes_requested', 'rejected') THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id,
      CASE WHEN OLD.status = 'awaiting_topic' THEN 'Project topic to review' ELSE 'Project topic sent again' END,
      v_people || ': ' || left(NEW.title, 160), 'project', v_staff_link
    FROM profiles p
    WHERE p.id = NEW.supervisor_id OR (NEW.supervisor_id IS NULL AND p.role = 'admin');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'changes_requested', 'rejected') THEN
    PERFORM public.project_notify_members(NEW.id,
      CASE
        WHEN NEW.status = 'approved' AND NEW.topic_source = 'supervisor' THEN 'You have been given a project topic'
        WHEN NEW.status = 'approved' THEN 'Your project topic is approved'
        WHEN NEW.status = 'changes_requested' THEN 'Your project topic needs changes'
        ELSE 'Your project topic was not approved'
      END,
      COALESCE(NULLIF(btrim(NEW.review_note), ''), left(NEW.title, 200)));
  END IF;

  IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id AND NEW.supervisor_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (NEW.supervisor_id, 'You are supervising a project',
      v_people || COALESCE(': ' || NULLIF(left(btrim(NEW.title), 160), ''), ''), 'project', v_staff_link);
    PERFORM public.project_notify_members(NEW.id, 'Your project supervisor has been assigned', 'Open your project to see who it is.');
  END IF;

  IF NEW.defence_at IS DISTINCT FROM OLD.defence_at AND NEW.defence_at IS NOT NULL THEN
    v_when := to_char(NEW.defence_at AT TIME ZONE 'Africa/Lagos', 'FMDay FMDD Mon YYYY, HH12:MI AM')
      || COALESCE(' · ' || NULLIF(btrim(NEW.defence_venue), ''), '');
    PERFORM public.project_notify_members(NEW.id,
      CASE WHEN OLD.defence_at IS NULL THEN 'Your project defence is scheduled' ELSE 'Your project defence has moved' END,
      v_when);
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT m.member_id, 'Project defence: ' || v_people, v_when, 'project', v_staff_link
    FROM project_panel m WHERE m.project_id = NEW.id;
  END IF;

  IF NEW.outcome IS DISTINCT FROM OLD.outcome AND NEW.outcome IS NOT NULL THEN
    PERFORM public.project_notify_members(NEW.id,
      'Your project defence result is in',
      CASE NEW.outcome
        WHEN 'pass' THEN 'Passed.'
        WHEN 'pass_with_corrections' THEN 'Passed with corrections. Upload your corrected copy.'
        ELSE 'You will need to defend again.'
      END);
  END IF;

  IF NEW.final_approved_at IS NOT NULL AND OLD.final_approved_at IS NULL THEN
    PERFORM public.project_notify_members(NEW.id, 'Your corrected project is approved', 'Your project is complete.');
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
