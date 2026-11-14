-- Projects: per-cohort settings, scoring modes, soft delete and a real archive.
--
-- 1. Settings that were fixed numbers are now per cohort: how much the project
--    weighs in the overall grade, the largest group allowed, and how projects
--    are scored by default.
-- 2. Scoring modes. A project is scored as a group (one score everybody
--    shares), individually (each member scored separately), or both (a group
--    score and an individual score, combined by a weight).
-- 3. Soft delete. An admin's delete hides the project and frees its students
--    to start another; it can be restored for 30 days, then it is purged.
-- 4. Archive. Staff can add projects from before the portal, and the archive
--    view lists those beside the ones completed here.

-- ---------------------------------------------------------------------------
-- 1. Cohort settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.cohorts
  -- How many courses the project counts as in the overall grade. 1 = the same
  -- as one course, 2 = double, 0 = shown but not counted.
  ADD COLUMN IF NOT EXISTS project_weight NUMERIC(4,2) NOT NULL DEFAULT 1
    CHECK (project_weight >= 0 AND project_weight <= 20),
  ADD COLUMN IF NOT EXISTS project_group_max INT NOT NULL DEFAULT 10
    CHECK (project_group_max BETWEEN 2 AND 100),
  ADD COLUMN IF NOT EXISTS project_scoring_mode TEXT NOT NULL DEFAULT 'group'
    CHECK (project_scoring_mode IN ('group', 'individual', 'both'));

-- ---------------------------------------------------------------------------
-- 2. Scoring modes
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  -- NULL on insert means "use the cohort's default"; projects_before_write fills it.
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT CHECK (scoring_mode IS NULL OR scoring_mode IN ('group', 'individual', 'both')),
  -- In 'both' mode: the share of a member's result that is their individual
  -- score, as a percentage. The rest is the group score.
  ADD COLUMN IF NOT EXISTS individual_weight NUMERIC(5,2) NOT NULL DEFAULT 50
    CHECK (individual_weight >= 0 AND individual_weight <= 100),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.project_members
  -- False while the member's project is in the bin: the row is kept so a
  -- restore knows who was in it, but the student is free to join another.
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  -- This member's own result as a percentage, kept by project_refresh_scores().
  ADD COLUMN IF NOT EXISTS final_score NUMERIC(5,2);

-- One *active* project per student, rather than one project ever.
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_student_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_members_one_active
  ON public.project_members (student_id) WHERE active;
-- The lead is a member, so the index above covers them too.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_student_id_key;
CREATE INDEX IF NOT EXISTS idx_projects_lead ON public.projects (student_id);
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON public.projects (deleted_at) WHERE deleted_at IS NOT NULL;

-- A score is now either for the whole project (student_id NULL) or for one
-- member of it.
ALTER TABLE public.project_scores ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT extensions.gen_random_uuid();
ALTER TABLE public.project_scores ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE public.project_scores DROP CONSTRAINT IF EXISTS project_scores_pkey;
ALTER TABLE public.project_scores ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS project_scores_one_each
  ON public.project_scores (project_id, member_id, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.project_scores DROP CONSTRAINT IF EXISTS project_scores_student_fkey;
ALTER TABLE public.project_scores ADD CONSTRAINT project_scores_student_fkey
  FOREIGN KEY (project_id, student_id) REFERENCES public.project_members(project_id, student_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.is_my_project(p_project_id UUID)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_members m JOIN students s ON s.id = m.student_id
    WHERE m.project_id = p_project_id AND m.active AND s.profile_id = auth.uid()
  );
$function$;

-- Works out every member's result and the project's overall figure.
--   group:      each member = the panel's average group score
--   individual: each member = the panel's average score for that member
--   both:       each member = group x (100 - w)% + their own x w%, once both exist
-- The project's own final_score is the group score in group mode, otherwise the
-- average of its members' results.
CREATE OR REPLACE FUNCTION public.project_refresh_scores(p_project_id UUID)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_weight numeric;
  v_group numeric;
BEGIN
  SELECT COALESCE(scoring_mode, 'group'), individual_weight INTO v_mode, v_weight
  FROM projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT avg(total / out_of * 100) INTO v_group
  FROM project_scores WHERE project_id = p_project_id AND student_id IS NULL;

  UPDATE project_members m
  SET final_score = round((
    SELECT CASE v_mode
      WHEN 'group' THEN v_group
      WHEN 'individual' THEN ind.pct
      ELSE CASE WHEN v_group IS NOT NULL AND ind.pct IS NOT NULL
             THEN v_group * (100 - v_weight) / 100 + ind.pct * v_weight / 100 END
    END
    FROM (SELECT avg(s.total / s.out_of * 100) AS pct
          FROM project_scores s
          WHERE s.project_id = p_project_id AND s.student_id = m.student_id) ind
  ), 2)
  WHERE m.project_id = p_project_id;

  UPDATE projects p
  SET final_score = round(CASE
      WHEN v_mode = 'group' THEN v_group
      ELSE (SELECT avg(final_score) FROM project_members WHERE project_id = p_project_id AND final_score IS NOT NULL)
    END, 2)
  WHERE p.id = p_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.project_refresh_scores(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.projects_refresh_score()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.project_refresh_scores(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NULL;
END;
$function$;

-- A new member inherits the group score; a changed mode or weight re-works everyone.
DROP TRIGGER IF EXISTS project_members_refresh ON public.project_members;
CREATE TRIGGER project_members_refresh
AFTER INSERT ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.projects_refresh_score();

CREATE OR REPLACE FUNCTION public.projects_scoring_changed()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.project_refresh_scores(NEW.id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS projects_scoring_changed ON public.projects;
CREATE TRIGGER projects_scoring_changed
AFTER UPDATE OF scoring_mode, individual_weight ON public.projects
FOR EACH ROW
WHEN (NEW.scoring_mode IS DISTINCT FROM OLD.scoring_mode OR NEW.individual_weight IS DISTINCT FROM OLD.individual_weight)
EXECUTE FUNCTION public.projects_scoring_changed();

-- Saving a score. A function because "one score per panel member per target"
-- is an expression index (the target may be NULL), which a plain upsert from
-- the app cannot name. Runs as the caller, so the row policies still decide
-- who may score.
CREATE OR REPLACE FUNCTION public.save_project_score(
  p_project_id UUID, p_member_id UUID, p_student_id UUID, p_scores JSONB, p_comment TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE project_scores
  SET scores = p_scores, comment = NULLIF(btrim(p_comment), '')
  WHERE project_id = p_project_id AND member_id = p_member_id
    AND student_id IS NOT DISTINCT FROM p_student_id;
  IF NOT FOUND THEN
    INSERT INTO project_scores (project_id, member_id, student_id, scores, total, comment)
    VALUES (p_project_id, p_member_id, p_student_id, p_scores, 0, NULLIF(btrim(p_comment), ''));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_project_score(UUID, UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_project_score(UUID, UUID, UUID, JSONB, TEXT) TO authenticated;

-- New projects take the cohort's default scoring mode.
CREATE OR REPLACE FUNCTION public.projects_before_write()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    IF NEW.defence_at IS DISTINCT FROM OLD.defence_at THEN
      NEW.defence_reminded_at := NULL;
    END IF;
    IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
      NEW.outcome_at := CASE WHEN NEW.outcome IS NULL THEN NULL ELSE now() END;
      NEW.final_approved_at := NULL;
    END IF;
  ELSE
    IF NEW.outcome IS NOT NULL THEN
      NEW.outcome_at := now();
    END IF;
    IF NEW.scoring_mode IS NULL THEN
      SELECT c.project_scoring_mode INTO NEW.scoring_mode
      FROM students s JOIN cohorts c ON c.id = s.cohort_id WHERE s.id = NEW.student_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_members_guard()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project projects%ROWTYPE;
  v_lead_cohort uuid;
  v_member students%ROWTYPE;
  v_max int;
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
  SELECT COALESCE(project_group_max, 10) INTO v_max FROM cohorts WHERE id = v_lead_cohort;
  IF (SELECT count(*) FROM project_members WHERE project_id = NEW.project_id AND active) >= COALESCE(v_max, 10) THEN
    RAISE EXCEPTION 'A group on this cohort can have at most % members', COALESCE(v_max, 10);
  END IF;
  RETURN NEW;
END;
$function$;


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
  WHERE m.student_id = v_student.id AND m.active AND p.deleted_at IS NULL;

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
    AND m.active
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


-- ---------------------------------------------------------------------------
-- 3. Soft delete
-- ---------------------------------------------------------------------------

-- Admins only: it takes a project away from students.
CREATE OR REPLACE FUNCTION public.delete_project(p_project_id UUID)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can delete a project';
  END IF;
  UPDATE projects SET deleted_at = now(), deleted_by = auth.uid()
  WHERE id = p_project_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found, or already deleted';
  END IF;
  INSERT INTO notifications (user_id, title, body, type, link)
  SELECT s.profile_id, 'Your project was removed by the school',
    'You can start a new one from the Project page. Speak to the school if this is a mistake.', 'project', '/student/project'
  FROM project_members m JOIN students s ON s.id = m.student_id
  WHERE m.project_id = p_project_id AND m.active;
  UPDATE project_members SET active = false WHERE project_id = p_project_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_project(p_project_id UUID)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_busy text;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can restore a project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Project not found in the bin';
  END IF;
  -- Somebody may have started another project since.
  SELECT btrim(concat_ws(' ', pf.first_name, pf.last_name)) INTO v_busy
  FROM project_members old
    JOIN project_members other ON other.student_id = old.student_id AND other.active AND other.project_id <> old.project_id
    JOIN students s ON s.id = old.student_id
    JOIN profiles pf ON pf.id = s.profile_id
  WHERE old.project_id = p_project_id
  LIMIT 1;
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION '% is now in another project, so this one cannot be restored', v_busy;
  END IF;
  UPDATE project_members SET active = true WHERE project_id = p_project_id;
  UPDATE projects SET deleted_at = NULL, deleted_by = NULL WHERE id = p_project_id;
  INSERT INTO notifications (user_id, title, body, type, link)
  SELECT s.profile_id, 'Your project has been restored', 'It is back on your Project page.', 'project', '/student/project'
  FROM project_members m JOIN students s ON s.id = m.student_id
  WHERE m.project_id = p_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_project(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project(UUID) TO authenticated;

-- The bin, for staff.
CREATE OR REPLACE VIEW public.project_trash AS
  SELECT p.id,
    p.title,
    public.project_people(p.id) AS people,
    s.cohort_id,
    c.name AS cohort_name,
    p.deleted_at,
    p.deleted_at + interval '30 days' AS purge_at
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
  WHERE p.deleted_at IS NOT NULL
    AND public.get_my_role() IN ('admin', 'teacher');

REVOKE ALL ON public.project_trash FROM anon;
GRANT SELECT ON public.project_trash TO authenticated;

-- Thirty days in the bin, then gone for good. Files already uploaded stay in
-- storage; Admin > Storage is where orphaned files are cleared.
CREATE OR REPLACE FUNCTION public.project_purge_deleted()
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
$function$;

REVOKE ALL ON FUNCTION public.project_purge_deleted() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('project-purge-deleted', '20 2 * * *', $$ SELECT public.project_purge_deleted(); $$);

-- Deleting or restoring is not news about the topic, defence or result.
DROP TRIGGER IF EXISTS on_project_change ON public.projects;
DROP TRIGGER IF EXISTS on_project_change_insert ON public.projects;
DROP TRIGGER IF EXISTS on_project_change_update ON public.projects;
CREATE TRIGGER on_project_change_insert
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_project_change();
CREATE TRIGGER on_project_change_update
AFTER UPDATE ON public.projects
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION public.notify_project_change();

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
      AND defence_reminded_at IS NULL AND outcome IS NULL AND deleted_at IS NULL
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

-- ---------------------------------------------------------------------------
-- 4. Views and the archive
-- ---------------------------------------------------------------------------

-- Projects from before the portal, or done outside it, added by staff.
CREATE TABLE IF NOT EXISTS public.project_archive_entries (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 300),
  abstract TEXT NOT NULL DEFAULT '' CHECK (length(abstract) <= 5000),
  authors TEXT NOT NULL CHECK (length(btrim(authors)) BETWEEN 2 AND 500),
  -- Free text: an old cohort may not exist in the portal.
  cohort_label TEXT CHECK (cohort_label IS NULL OR length(cohort_label) <= 120),
  year INT CHECK (year IS NULL OR year BETWEEN 1980 AND 2100),
  file_path TEXT CHECK (file_path IS NULL OR length(file_path) <= 600),
  file_name TEXT CHECK (file_name IS NULL OR length(file_name) <= 300),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_archive_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read archive entries"
  ON public.project_archive_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage archive entries"
  ON public.project_archive_entries FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'teacher'))
  WITH CHECK (public.get_my_role() IN ('admin', 'teacher'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_archive_entries TO authenticated;
GRANT ALL ON public.project_archive_entries TO service_role;

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
              'lead', ms.id = p.student_id,
              -- Each member's own result; staff only, a student gets theirs in final_score.
              'score', CASE WHEN public.get_my_role() IN ('admin', 'teacher') THEN m.final_score END)
            ORDER BY (ms.id = p.student_id) DESC, mp.first_name, mp.last_name), '[]'::jsonb)
     FROM public.project_members m
       JOIN public.students ms ON ms.id = m.student_id
       JOIN public.profiles mp ON mp.id = ms.profile_id
     WHERE m.project_id = p.id AND m.active) AS members,
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
    -- Staff: the project's overall figure. A student: their own result, which
    -- differs between members when individuals are scored, once there is an outcome.
    CASE
      WHEN public.get_my_role() IN ('admin', 'teacher') THEN p.final_score
      WHEN p.outcome IS NOT NULL THEN (
        SELECT mm.final_score FROM public.project_members mm
        WHERE mm.project_id = p.id AND mm.active AND mm.student_id = public.get_my_student_id())
    END AS final_score,
    p.final_approved_at,
    p.created_at,
    p.updated_at,
    p.members_locked,
    COALESCE(p.scoring_mode, 'group') AS scoring_mode,
    p.individual_weight
  FROM public.projects p
    JOIN public.students s ON s.id = p.student_id
    JOIN public.profiles sp ON sp.id = s.profile_id
    LEFT JOIN public.cohorts c ON c.id = s.cohort_id
    LEFT JOIN public.profiles sup ON sup.id = p.supervisor_id
  WHERE p.deleted_at IS NULL
    AND (public.get_my_role() IN ('admin', 'teacher') OR public.is_my_project(p.id));


-- Everything in the archive: projects completed in the portal, and the ones
-- staff added. `source` tells them apart ('portal' entries cannot be edited here).
DROP VIEW IF EXISTS public.project_archive;
CREATE VIEW public.project_archive AS
  SELECT p.id,
    'portal'::text AS source,
    p.title,
    p.abstract,
    p.is_group,
    public.project_people(p.id) AS authors,
    c.name AS cohort_name,
    EXTRACT(YEAR FROM COALESCE(p.final_approved_at, p.outcome_at))::int AS year,
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
    AND p.deleted_at IS NULL
    AND COALESCE(s.is_staff_preview, false) = false
    AND (p.outcome = 'pass' OR (p.outcome = 'pass_with_corrections' AND p.final_approved_at IS NOT NULL))
  UNION ALL
  SELECT e.id,
    'added'::text,
    e.title,
    e.abstract,
    false,
    e.authors,
    e.cohort_label,
    e.year,
    e.created_at,
    e.file_path,
    e.file_name
  FROM public.project_archive_entries e
  WHERE auth.uid() IS NOT NULL;

REVOKE ALL ON public.project_overview, public.project_archive FROM anon;
GRANT SELECT ON public.project_overview, public.project_archive TO authenticated;

COMMENT ON VIEW public.project_overview IS
  'Live (not deleted) projects with member and supervisor names. Owner privileges; the WHERE clause is the access rule.';
COMMENT ON VIEW public.project_archive IS
  'Completed projects plus staff-added past projects, for signed-in users. Owner privileges.';

-- Existing rows: work the per-member results out once.
SELECT public.project_refresh_scores(id) FROM public.projects;
