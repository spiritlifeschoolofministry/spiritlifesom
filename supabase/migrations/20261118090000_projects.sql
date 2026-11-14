-- Academic project and project defence.
--
-- One project per student. The topic either comes from the student (proposed,
-- then approved, sent back or rejected by staff) or is given by the supervisor
-- (assigned already approved). After that: drafts against the cohort's stages
-- with supervisor feedback, a defence with a panel that scores it, an outcome,
-- and a corrected copy where the outcome asks for one.
--
-- Students never write to `projects` directly. Their only way in is
-- submit_project_topic(), so a student cannot approve their own topic, pick a
-- supervisor or set a score by sending extra columns.

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 300),
  abstract TEXT NOT NULL DEFAULT '' CHECK (length(abstract) <= 5000),
  -- Who the topic came from. 'supervisor' topics skip the approval step.
  topic_source TEXT NOT NULL DEFAULT 'student' CHECK (topic_source IN ('student', 'supervisor')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'changes_requested', 'approved', 'rejected')),
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 2000),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  defence_at TIMESTAMPTZ,
  defence_venue TEXT CHECK (defence_venue IS NULL OR length(defence_venue) <= 300),
  defence_reminded_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('pass', 'pass_with_corrections', 'redefend')),
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 2000),
  outcome_at TIMESTAMPTZ,
  -- Mean of the panel's totals, kept current by a trigger on project_scores.
  final_score NUMERIC(5,2),
  -- Set when staff approve the corrected copy after "pass with corrections".
  final_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_supervisor ON public.projects (supervisor_id);

-- The stages a cohort's projects go through (proposal, chapters, final copy…).
CREATE TABLE IF NOT EXISTS public.project_stages (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_stages_cohort ON public.project_stages (cohort_id, position);

-- A file a student has handed in: a draft for a stage, or the corrected copy
-- after the defence. Several per stage are expected; the newest one counts.
CREATE TABLE IF NOT EXISTS public.project_submissions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.project_stages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'stage' CHECK (kind IN ('stage', 'correction')),
  file_path TEXT NOT NULL CHECK (length(file_path) <= 600),
  file_name TEXT NOT NULL CHECK (length(file_name) <= 300),
  note TEXT CHECK (note IS NULL OR length(note) <= 2000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'changes_requested')),
  feedback TEXT CHECK (feedback IS NULL OR length(feedback) <= 5000),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_submissions_project ON public.project_submissions (project_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.project_panel (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.project_scores (
  project_id UUID NOT NULL,
  member_id UUID NOT NULL,
  -- { criterion key: marks }. The rubric itself lives in src/lib/projects.ts.
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total NUMERIC(5,2) NOT NULL CHECK (total >= 0 AND total <= 100),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, member_id),
  -- Only somebody on the panel can have a score; leaving the panel removes it.
  FOREIGN KEY (project_id, member_id) REFERENCES public.project_panel(project_id, member_id) ON DELETE CASCADE
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_panel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scores ENABLE ROW LEVEL SECURITY;

-- projects: staff do everything; a student has no direct access at all and
-- reads their own through project_overview.
CREATE POLICY "Staff manage projects"
  ON public.projects FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Signed-in users read project stages"
  ON public.project_stages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage project stages"
  ON public.project_stages FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

CREATE OR REPLACE FUNCTION public.is_my_project(p_project_id UUID)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p JOIN students s ON s.id = p.student_id
    WHERE p.id = p_project_id AND s.profile_id = auth.uid()
  );
$function$;

CREATE POLICY "Students read their own project submissions"
  ON public.project_submissions FOR SELECT TO authenticated
  USING (public.is_my_project(project_id));

-- Whether the signed-in student may hand this in: a draft needs an approved
-- topic and a stage of the student's own cohort; a corrected copy needs the
-- outcome that asks for one. A function, not a subquery in the policy, because
-- students have no read access to `projects` and a policy subquery runs as them.
CREATE OR REPLACE FUNCTION public.can_hand_in_project_work(p_project_id UUID, p_stage_id UUID, p_kind TEXT)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN students s ON s.id = p.student_id
    WHERE p.id = p_project_id
      AND s.profile_id = auth.uid()
      AND p.status = 'approved'
      AND (
        (p_kind = 'stage' AND (p.outcome IS NULL OR p.outcome = 'redefend') AND EXISTS (
          SELECT 1 FROM project_stages st WHERE st.id = p_stage_id AND st.cohort_id = s.cohort_id
        ))
        OR (p_kind = 'correction'
            AND p_stage_id IS NULL
            AND p.outcome = 'pass_with_corrections'
            AND p.final_approved_at IS NULL)
      )
  );
$function$;

CREATE POLICY "Students hand in project work"
  ON public.project_submissions FOR INSERT TO authenticated
  WITH CHECK (
    status = 'submitted'
    AND feedback IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL
    AND public.can_hand_in_project_work(project_id, stage_id, kind)
  );

CREATE POLICY "Students withdraw unreviewed project work"
  ON public.project_submissions FOR DELETE TO authenticated
  USING (public.is_my_project(project_id) AND status = 'submitted');

CREATE POLICY "Staff manage project submissions"
  ON public.project_submissions FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Staff manage project panels"
  ON public.project_panel FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Staff read project scores"
  ON public.project_scores FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'));

-- A panel member enters their own score. An admin may enter one on a member's
-- behalf (a visiting examiner who scored on paper).
CREATE POLICY "Panel members score"
  ON public.project_scores FOR INSERT TO authenticated
  WITH CHECK (
    (member_id = auth.uid() AND public.get_my_role() IN ('admin', 'teacher'))
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "Panel members change their score"
  ON public.project_scores FOR UPDATE TO authenticated
  USING ((member_id = auth.uid() AND public.get_my_role() IN ('admin', 'teacher')) OR public.get_my_role() = 'admin')
  WITH CHECK ((member_id = auth.uid() AND public.get_my_role() IN ('admin', 'teacher')) OR public.get_my_role() = 'admin');

CREATE POLICY "Admins remove scores"
  ON public.project_scores FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.projects, public.project_stages, public.project_submissions, public.project_panel, public.project_scores
  TO authenticated;
GRANT ALL ON
  public.projects, public.project_stages, public.project_submissions, public.project_panel, public.project_scores
  TO service_role;

-- The student's way to propose a topic, or send it again after staff asked for
-- changes or rejected it.
CREATE OR REPLACE FUNCTION public.submit_project_topic(p_title TEXT, p_abstract TEXT)
  RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student students%ROWTYPE;
  v_project projects%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_student FROM students WHERE profile_id = auth.uid();
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Only students can propose a project topic';
  END IF;
  IF upper(COALESCE(v_student.admission_status, '')) = 'PENDING' THEN
    RAISE EXCEPTION 'You can propose a topic once your admission is approved';
  END IF;

  SELECT * INTO v_project FROM projects WHERE student_id = v_student.id;

  IF v_project.id IS NULL THEN
    INSERT INTO projects (student_id, title, abstract, topic_source, status)
    VALUES (v_student.id, btrim(p_title), COALESCE(btrim(p_abstract), ''), 'student', 'proposed')
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF v_project.status = 'approved' THEN
    RAISE EXCEPTION 'Your topic is already approved. Ask your supervisor if it needs to change';
  END IF;

  UPDATE projects
  SET title = btrim(p_title),
      abstract = COALESCE(btrim(p_abstract), ''),
      topic_source = 'student',
      status = 'proposed',
      updated_at = now()
  WHERE id = v_project.id;
  RETURN v_project.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_project_topic(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_project_topic(TEXT, TEXT) TO authenticated;

-- One row per project with the names both portals need. Staff see every
-- project; a student sees their own, and sees the score only once there is an
-- outcome.
CREATE OR REPLACE VIEW public.project_overview AS
  SELECT p.id,
    p.student_id,
    s.student_code,
    s.cohort_id,
    c.name AS cohort_name,
    sp.first_name AS student_first_name,
    sp.last_name AS student_last_name,
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
  WHERE public.get_my_role() IN ('admin', 'teacher') OR s.profile_id = auth.uid();

-- Finished projects, for every signed-in user to browse: passed outright, or
-- passed with corrections and the corrected copy approved. The file is the
-- newest approved one.
CREATE OR REPLACE VIEW public.project_archive AS
  SELECT p.id,
    p.title,
    p.abstract,
    sp.first_name,
    sp.last_name,
    c.name AS cohort_name,
    COALESCE(p.final_approved_at, p.outcome_at) AS completed_at,
    f.file_path,
    f.file_name
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    JOIN public.profiles sp ON sp.id = s.profile_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
    LEFT JOIN LATERAL (
      SELECT sub.file_path, sub.file_name
      FROM public.project_submissions sub
      WHERE sub.project_id = p.id AND sub.status = 'approved'
      -- The corrected copy when there is one, otherwise the newest approved draft.
      ORDER BY (sub.kind = 'correction') DESC, sub.submitted_at DESC
      LIMIT 1
    ) f ON true
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(s.is_staff_preview, false) = false
    AND (p.outcome = 'pass' OR (p.outcome = 'pass_with_corrections' AND p.final_approved_at IS NOT NULL));

REVOKE ALL ON public.project_overview, public.project_archive FROM anon;
GRANT SELECT ON public.project_overview, public.project_archive TO authenticated;

COMMENT ON VIEW public.project_overview IS
  'Projects with student and supervisor names. Owner privileges; the WHERE clause is the access rule.';
COMMENT ON VIEW public.project_archive IS
  'Completed projects for signed-in users to browse. Owner privileges.';

-- Keeps derived fields honest whoever writes the row.
CREATE OR REPLACE FUNCTION public.projects_before_write()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    -- A moved defence is reminded again.
    IF NEW.defence_at IS DISTINCT FROM OLD.defence_at THEN
      NEW.defence_reminded_at := NULL;
    END IF;
    IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
      NEW.outcome_at := CASE WHEN NEW.outcome IS NULL THEN NULL ELSE now() END;
      -- A new outcome starts the corrections sign-off afresh.
      NEW.final_approved_at := NULL;
    END IF;
  ELSIF NEW.outcome IS NOT NULL THEN
    NEW.outcome_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS projects_before_write ON public.projects;
CREATE TRIGGER projects_before_write
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_before_write();

-- The panel's average, recomputed whenever a score changes.
CREATE OR REPLACE FUNCTION public.projects_refresh_score()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET final_score = (SELECT round(avg(total), 2) FROM project_scores WHERE project_id = v_project)
  WHERE id = v_project;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS project_scores_refresh ON public.project_scores;
CREATE TRIGGER project_scores_refresh
AFTER INSERT OR UPDATE OR DELETE ON public.project_scores
FOR EACH ROW EXECUTE FUNCTION public.projects_refresh_score();

-- Approving the corrected copy completes the project.
CREATE OR REPLACE FUNCTION public.project_correction_reviewed()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind = 'correction' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE projects SET final_approved_at = now()
    WHERE id = NEW.project_id AND outcome = 'pass_with_corrections';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS project_correction_reviewed ON public.project_submissions;
CREATE TRIGGER project_correction_reviewed
AFTER UPDATE OF status ON public.project_submissions
FOR EACH ROW EXECUTE FUNCTION public.project_correction_reviewed();

-- Notifications. Each fires on a change, never on a state, and never fails the
-- write that caused it.
CREATE OR REPLACE FUNCTION public.notify_project_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student_user uuid;
  v_student_name text;
  v_staff_link text := '/admin/projects/' || NEW.id;
  v_when text;
BEGIN
  SELECT s.profile_id, btrim(concat_ws(' ', p.first_name, p.last_name))
  INTO v_student_user, v_student_name
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.id = NEW.student_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_source = 'supervisor' THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (v_student_user, 'You have been given a project topic', left(NEW.title, 200), 'project', '/student/project');
    ELSE
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT p.id, 'Project topic to review', v_student_name || ': ' || left(NEW.title, 160), 'project', v_staff_link
      FROM profiles p WHERE p.role = 'admin';
    END IF;
    IF NEW.supervisor_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (NEW.supervisor_id, 'You are supervising a project', v_student_name || ': ' || left(NEW.title, 160), 'project', v_staff_link);
    END IF;
    RETURN NEW;
  END IF;

  -- Topic sent again by the student.
  IF NEW.status = 'proposed' AND OLD.status IN ('changes_requested', 'rejected') THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id, 'Project topic sent again', v_student_name || ': ' || left(NEW.title, 160), 'project', v_staff_link
    FROM profiles p
    WHERE p.id = NEW.supervisor_id OR (NEW.supervisor_id IS NULL AND p.role = 'admin');
  END IF;

  -- Topic decided.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'changes_requested', 'rejected') THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      v_student_user,
      CASE NEW.status
        WHEN 'approved' THEN 'Your project topic is approved'
        WHEN 'changes_requested' THEN 'Your project topic needs changes'
        ELSE 'Your project topic was not approved'
      END,
      COALESCE(NULLIF(btrim(NEW.review_note), ''), left(NEW.title, 200)),
      'project', '/student/project'
    );
  END IF;

  IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id AND NEW.supervisor_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES
      (NEW.supervisor_id, 'You are supervising a project', v_student_name || ': ' || left(NEW.title, 160), 'project', v_staff_link),
      (v_student_user, 'Your project supervisor has been assigned', 'Open your project to see who it is.', 'project', '/student/project');
  END IF;

  IF NEW.defence_at IS DISTINCT FROM OLD.defence_at AND NEW.defence_at IS NOT NULL THEN
    v_when := to_char(NEW.defence_at AT TIME ZONE 'Africa/Lagos', 'FMDay FMDD Mon YYYY, HH12:MI AM')
      || COALESCE(' · ' || NULLIF(btrim(NEW.defence_venue), ''), '');
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (v_student_user,
      CASE WHEN OLD.defence_at IS NULL THEN 'Your project defence is scheduled' ELSE 'Your project defence has moved' END,
      v_when, 'project', '/student/project');
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT m.member_id, 'Project defence: ' || v_student_name, v_when, 'project', v_staff_link
    FROM project_panel m WHERE m.project_id = NEW.id;
  END IF;

  IF NEW.outcome IS DISTINCT FROM OLD.outcome AND NEW.outcome IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (v_student_user,
      'Your project defence result is in',
      CASE NEW.outcome
        WHEN 'pass' THEN 'Passed.'
        WHEN 'pass_with_corrections' THEN 'Passed with corrections. Upload your corrected copy.'
        ELSE 'You will need to defend again.'
      END,
      'project', '/student/project');
  END IF;

  IF NEW.final_approved_at IS NOT NULL AND OLD.final_approved_at IS NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (v_student_user, 'Your corrected project is approved', 'Your project is complete.', 'project', '/student/project');
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_project_change ON public.projects;
CREATE TRIGGER on_project_change
AFTER INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_project_change();

CREATE OR REPLACE FUNCTION public.notify_project_submission()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
  v_student_user uuid;
  v_student_name text;
  v_what text;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  SELECT s.profile_id, btrim(concat_ws(' ', p.first_name, p.last_name))
  INTO v_student_user, v_student_name
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.id = v_project.student_id;
  SELECT COALESCE((SELECT title FROM project_stages WHERE id = NEW.stage_id), 'Corrected copy') INTO v_what;

  IF TG_OP = 'INSERT' THEN
    -- To the supervisor; to admins when nobody supervises yet.
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT p.id, 'Project work handed in', v_student_name || ': ' || v_what, 'project', '/admin/projects/' || v_project.id
    FROM profiles p
    WHERE p.id = v_project.supervisor_id OR (v_project.supervisor_id IS NULL AND p.role = 'admin');
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'changes_requested')
    -- An approved corrected copy completes the project, which has its own notice.
    AND NOT (NEW.kind = 'correction' AND NEW.status = 'approved') THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (v_student_user,
      CASE NEW.status WHEN 'approved' THEN v_what || ' approved' ELSE v_what || ' needs changes' END,
      COALESCE(left(NULLIF(btrim(NEW.feedback), ''), 200), 'Open your project to see the feedback.'),
      'project', '/student/project');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Project submission notice failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_project_submission ON public.project_submissions;
CREATE TRIGGER on_project_submission
AFTER INSERT OR UPDATE OF status ON public.project_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_project_submission();

-- The day before: remind the student, the supervisor and the panel, once.
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
    RETURNING id, student_id, supervisor_id, defence_at, defence_venue
  LOOP
    v_when := to_char(r.defence_at AT TIME ZONE 'Africa/Lagos', 'FMDay FMDD Mon, HH12:MI AM')
      || COALESCE(' · ' || NULLIF(btrim(r.defence_venue), ''), '');
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT s.profile_id, 'Your project defence is tomorrow', v_when, 'project', '/student/project'
    FROM students s WHERE s.id = r.student_id;
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

SELECT cron.schedule(
  'project-defence-reminders',
  '5 * * * *',
  $$ SELECT public.project_defence_reminders(); $$
);
