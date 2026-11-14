-- Projects: group projects, and a rubric each cohort sets for itself.
--
-- Groups. A project now has members (project_members). An individual project
-- has one, a group project several; `projects.student_id` stays as the lead,
-- the student who proposed it or was named first. A student can be in one
-- project only, which the UNIQUE on project_members.student_id holds. Every
-- member can hand in work and sees the same feedback, defence and result.
--
-- Rubric. What the panel scores against was a constant in the app. It is now
-- rows in project_rubric_criteria, per cohort, and the database works out each
-- score's total from them, so a total can never disagree with its marks.
-- The project's final score becomes a percentage, since a rubric no longer has
-- to add up to 100.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, student_id)
);

INSERT INTO public.project_members (project_id, student_id)
SELECT id, student_id FROM public.projects
ON CONFLICT DO NOTHING;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- "My project" now means "a project I am a member of".
CREATE OR REPLACE FUNCTION public.is_my_project(p_project_id UUID)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_members m JOIN students s ON s.id = m.student_id
    WHERE m.project_id = p_project_id AND s.profile_id = auth.uid()
  );
$function$;

CREATE POLICY "Members read their project's members"
  ON public.project_members FOR SELECT TO authenticated
  USING (public.is_my_project(project_id));

CREATE POLICY "Staff manage project members"
  ON public.project_members FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

-- The lead is always a member.
CREATE OR REPLACE FUNCTION public.projects_add_lead()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO project_members (project_id, student_id) VALUES (NEW.id, NEW.student_id);
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That student is already in a project';
END;
$function$;

DROP TRIGGER IF EXISTS a_projects_add_lead ON public.projects;
CREATE TRIGGER a_projects_add_lead
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_add_lead();

-- Whoever adds a member (a student through submit_project_topic, or staff
-- directly), the same rules hold: same cohort as the lead, a real admitted
-- student, and no second member on an individual project.
CREATE OR REPLACE FUNCTION public.project_members_guard()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
  v_lead_cohort uuid;
  v_member students%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- During a project's own deletion the project row is already gone.
    IF EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id AND student_id = OLD.student_id) THEN
      RAISE EXCEPTION 'The lead cannot be removed from the project';
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  IF NEW.student_id = v_project.student_id THEN
    RETURN NEW;
  END IF;
  IF NOT v_project.is_group THEN
    RAISE EXCEPTION 'This is an individual project. Make it a group project to add members';
  END IF;
  SELECT cohort_id INTO v_lead_cohort FROM students WHERE id = v_project.student_id;
  SELECT * INTO v_member FROM students WHERE id = NEW.student_id;
  IF v_member.id IS NULL OR v_member.is_staff_preview
     OR upper(COALESCE(v_member.admission_status, '')) = 'PENDING'
     OR v_member.cohort_id IS DISTINCT FROM v_lead_cohort THEN
    RAISE EXCEPTION 'Group members must be admitted students on the same cohort';
  END IF;
  IF (SELECT count(*) FROM project_members WHERE project_id = NEW.project_id) >= 10 THEN
    RAISE EXCEPTION 'A group can have at most 10 members';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS project_members_guard ON public.project_members;
CREATE TRIGGER project_members_guard
BEFORE INSERT OR DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.project_members_guard();

-- "Ada Obi, Tunde Bello" for a project, lead first.
CREATE OR REPLACE FUNCTION public.project_people(p_project_id UUID)
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(string_agg(btrim(concat_ws(' ', p.first_name, p.last_name)), ', '
           ORDER BY (m.student_id = pr.student_id) DESC, p.first_name, p.last_name), '')
  FROM project_members m
    JOIN projects pr ON pr.id = m.project_id
    JOIN students s ON s.id = m.student_id
    JOIN profiles p ON p.id = s.profile_id
  WHERE m.project_id = p_project_id;
$function$;

REVOKE ALL ON FUNCTION public.project_people(UUID) FROM PUBLIC, anon, authenticated;

-- One notification to every member of a project.
CREATE OR REPLACE FUNCTION public.project_notify_members(p_project_id UUID, p_title TEXT, p_body TEXT)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  INSERT INTO notifications (user_id, title, body, type, link)
  SELECT s.profile_id, p_title, p_body, 'project', '/student/project'
  FROM project_members m JOIN students s ON s.id = m.student_id
  WHERE m.project_id = p_project_id;
$function$;

REVOKE ALL ON FUNCTION public.project_notify_members(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- A student added to somebody else's group is told.
CREATE OR REPLACE FUNCTION public.notify_project_member_added()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  IF NEW.student_id <> v_project.student_id THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT s.profile_id, 'You are in a group project', left(v_project.title, 200), 'project', '/student/project'
    FROM students s WHERE s.id = NEW.student_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project member notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_project_member_added ON public.project_members;
CREATE TRIGGER on_project_member_added
AFTER INSERT ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.notify_project_member_added();

-- Handing in: any member may, against the lead's cohort's stages.
CREATE OR REPLACE FUNCTION public.can_hand_in_project_work(p_project_id UUID, p_stage_id UUID, p_kind TEXT)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_my_project(p_project_id) AND EXISTS (
    SELECT 1 FROM projects p
    JOIN students lead ON lead.id = p.student_id
    WHERE p.id = p_project_id
      AND p.status = 'approved'
      AND (
        (p_kind = 'stage' AND (p.outcome IS NULL OR p.outcome = 'redefend') AND EXISTS (
          SELECT 1 FROM project_stages st WHERE st.id = p_stage_id AND st.cohort_id = lead.cohort_id
        ))
        OR (p_kind = 'correction'
            AND p_stage_id IS NULL
            AND p.outcome = 'pass_with_corrections'
            AND p.final_approved_at IS NULL)
      )
  );
$function$;

-- Proposing a topic, now with the option of naming group members. Partners are
-- given as profile ids because that is what a student can see of a coursemate
-- (classmate_directory). An empty list means an individual project.
DROP FUNCTION IF EXISTS public.submit_project_topic(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_project_topic(
  p_title TEXT, p_abstract TEXT, p_partner_profile_ids UUID[] DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student students%ROWTYPE;
  v_project projects%ROWTYPE;
  v_partner_ids uuid[];
  v_wanted int;
  v_taken text;
  v_is_group boolean;
BEGIN
  SELECT * INTO v_student FROM students WHERE profile_id = auth.uid();
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Only students can propose a project topic';
  END IF;
  IF upper(COALESCE(v_student.admission_status, '')) = 'PENDING' THEN
    RAISE EXCEPTION 'You can propose a topic once your admission is approved';
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

  SELECT p.* INTO v_project
  FROM projects p JOIN project_members m ON m.project_id = p.id
  WHERE m.student_id = v_student.id;

  IF v_project.id IS NOT NULL AND v_project.student_id <> v_student.id THEN
    RAISE EXCEPTION 'You are already in a group project. Its topic is managed by the student who proposed it';
  END IF;
  IF v_project.status = 'approved' THEN
    RAISE EXCEPTION 'Your topic is already approved. Ask your supervisor if it needs to change';
  END IF;

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

REVOKE ALL ON FUNCTION public.submit_project_topic(TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_project_topic(TEXT, TEXT, UUID[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rubric per cohort
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_rubric_criteria (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 160),
  max_marks NUMERIC(5,1) NOT NULL CHECK (max_marks > 0 AND max_marks <= 1000),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_rubric_cohort ON public.project_rubric_criteria (cohort_id, position);

ALTER TABLE public.project_rubric_criteria ENABLE ROW LEVEL SECURITY;

-- Students may see what they will be scored on.
CREATE POLICY "Signed-in users read the project rubric"
  ON public.project_rubric_criteria FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage the project rubric"
  ON public.project_rubric_criteria FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_rubric_criteria TO authenticated;
GRANT ALL ON public.project_rubric_criteria TO service_role;

-- What a score is out of. Kept on the score so it stays true if the rubric is
-- changed afterwards.
ALTER TABLE public.project_scores ADD COLUMN IF NOT EXISTS out_of NUMERIC(6,1) NOT NULL DEFAULT 100;
ALTER TABLE public.project_scores DROP CONSTRAINT IF EXISTS project_scores_total_check;
ALTER TABLE public.project_scores ALTER COLUMN total TYPE NUMERIC(6,2);
ALTER TABLE public.project_scores ADD CONSTRAINT project_scores_total_check
  CHECK (total >= 0 AND out_of > 0 AND total <= out_of);

-- `scores` is { criterion id: marks }. The total and what it is out of are
-- worked out here from the cohort's rubric, never taken from the client.
CREATE OR REPLACE FUNCTION public.project_scores_apply_rubric()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cohort uuid;
  c RECORD;
  v_mark numeric;
  v_total numeric := 0;
  v_out_of numeric := 0;
  v_clean jsonb := '{}'::jsonb;
BEGIN
  SELECT s.cohort_id INTO v_cohort
  FROM projects p JOIN students s ON s.id = p.student_id
  WHERE p.id = NEW.project_id;

  FOR c IN SELECT id, label, max_marks FROM project_rubric_criteria WHERE cohort_id = v_cohort ORDER BY position, created_at LOOP
    BEGIN
      v_mark := (NEW.scores ->> c.id::text)::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_mark := NULL;
    END;
    IF v_mark IS NULL THEN
      RAISE EXCEPTION 'Enter a mark for "%"', c.label;
    END IF;
    IF v_mark < 0 OR v_mark > c.max_marks THEN
      RAISE EXCEPTION '"%" is marked out of %', c.label, trim(trailing '.' from trim(trailing '0' from c.max_marks::text));
    END IF;
    v_total := v_total + v_mark;
    v_out_of := v_out_of + c.max_marks;
    v_clean := v_clean || jsonb_build_object(c.id::text, v_mark);
  END LOOP;

  IF v_out_of = 0 THEN
    RAISE EXCEPTION 'Set the scoring rubric for this cohort before entering scores';
  END IF;

  NEW.scores := v_clean;
  NEW.total := v_total;
  NEW.out_of := v_out_of;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS project_scores_apply_rubric ON public.project_scores;
CREATE TRIGGER project_scores_apply_rubric
BEFORE INSERT OR UPDATE ON public.project_scores
FOR EACH ROW EXECUTE FUNCTION public.project_scores_apply_rubric();

-- The final score is the panel's average as a percentage.
CREATE OR REPLACE FUNCTION public.projects_refresh_score()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET final_score = (SELECT round(avg(total / out_of * 100), 2) FROM project_scores WHERE project_id = v_project)
  WHERE id = v_project;
  RETURN NULL;
END;
$function$;

COMMENT ON COLUMN public.projects.final_score IS
  'Mean of the panel''s scores as a percentage (0-100), kept by projects_refresh_score().';

-- ---------------------------------------------------------------------------
-- Views: members and group flag; archive lists every author
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.project_overview;
CREATE VIEW public.project_overview AS
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
    p.updated_at
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    JOIN public.profiles sp ON sp.id = s.profile_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
    LEFT JOIN public.profiles sup ON sup.id = p.supervisor_id
  WHERE public.get_my_role() IN ('admin', 'teacher') OR public.is_my_project(p.id);

DROP VIEW IF EXISTS public.project_archive;
CREATE VIEW public.project_archive AS
  SELECT p.id,
    p.title,
    p.abstract,
    p.is_group,
    public.project_people(p.id) AS authors,
    c.name AS cohort_name,
    COALESCE(p.final_approved_at, p.outcome_at) AS completed_at,
    f.file_path,
    f.file_name
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
    LEFT JOIN LATERAL (
      SELECT sub.file_path, sub.file_name
      FROM public.project_submissions sub
      WHERE sub.project_id = p.id AND sub.status = 'approved'
      ORDER BY (sub.kind = 'correction') DESC, sub.submitted_at DESC
      LIMIT 1
    ) f ON true
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(s.is_staff_preview, false) = false
    AND (p.outcome = 'pass' OR (p.outcome = 'pass_with_corrections' AND p.final_approved_at IS NOT NULL));

REVOKE ALL ON public.project_overview, public.project_archive FROM anon;
GRANT SELECT ON public.project_overview, public.project_archive TO authenticated;

COMMENT ON VIEW public.project_overview IS
  'Projects with member and supervisor names. Owner privileges; the WHERE clause is the access rule.';
COMMENT ON VIEW public.project_archive IS
  'Completed projects for signed-in users to browse. Owner privileges.';

-- ---------------------------------------------------------------------------
-- Notifications: every member hears what the lead used to hear alone
-- ---------------------------------------------------------------------------

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
    IF NEW.topic_source = 'supervisor' THEN
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
      VALUES (NEW.supervisor_id, 'You are supervising a project', v_people || ': ' || left(NEW.title, 160), 'project', v_staff_link);
    END IF;
    RETURN NEW;
  END IF;

  v_people := public.project_people(NEW.id);

  IF NEW.status = 'proposed' AND OLD.status IN ('changes_requested', 'rejected') THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id, 'Project topic sent again', v_people || ': ' || left(NEW.title, 160), 'project', v_staff_link
    FROM profiles p
    WHERE p.id = NEW.supervisor_id OR (NEW.supervisor_id IS NULL AND p.role = 'admin');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'changes_requested', 'rejected') THEN
    PERFORM public.project_notify_members(NEW.id,
      CASE NEW.status
        WHEN 'approved' THEN 'Your project topic is approved'
        WHEN 'changes_requested' THEN 'Your project topic needs changes'
        ELSE 'Your project topic was not approved'
      END,
      COALESCE(NULLIF(btrim(NEW.review_note), ''), left(NEW.title, 200)));
  END IF;

  IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id AND NEW.supervisor_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (NEW.supervisor_id, 'You are supervising a project', v_people || ': ' || left(NEW.title, 160), 'project', v_staff_link);
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

CREATE OR REPLACE FUNCTION public.notify_project_submission()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
  v_what text;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE((SELECT title FROM project_stages WHERE id = NEW.stage_id), 'Corrected copy') INTO v_what;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id, 'Project work handed in', public.project_people(v_project.id) || ': ' || v_what, 'project', '/admin/projects/' || v_project.id
    FROM profiles p
    WHERE p.id = v_project.supervisor_id OR (v_project.supervisor_id IS NULL AND p.role = 'admin');
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'changes_requested')
    -- An approved corrected copy completes the project, which has its own notice.
    AND NOT (NEW.kind = 'correction' AND NEW.status = 'approved') THEN
    PERFORM public.project_notify_members(v_project.id,
      CASE NEW.status WHEN 'approved' THEN v_what || ' approved' ELSE v_what || ' needs changes' END,
      COALESCE(left(NULLIF(btrim(NEW.feedback), ''), 200), 'Open your project to see the feedback.'));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project submission notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_defence_reminders()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_when text;
BEGIN
  FOR r IN
    UPDATE projects SET defence_reminded_at = now()
    WHERE defence_at > now() AND defence_at <= now() + interval '24 hours'
      AND defence_reminded_at IS NULL AND outcome IS NULL
    RETURNING id, supervisor_id, defence_at, defence_venue
  LOOP
    v_when := to_char(r.defence_at AT TIME ZONE 'Africa/Lagos', 'FMDay FMDD Mon, HH12:MI AM')
      || COALESCE(' · ' || NULLIF(btrim(r.defence_venue), ''), '');
    PERFORM public.project_notify_members(r.id, 'Your project defence is tomorrow', v_when);
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT DISTINCT who.id, 'Project defence tomorrow', v_when, 'project', '/admin/projects/' || r.id
    FROM (
      SELECT member_id AS id FROM project_panel WHERE project_id = r.id
      UNION SELECT r.supervisor_id WHERE r.supervisor_id IS NOT NULL
    ) who;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.project_defence_reminders() FROM PUBLIC, anon, authenticated;
