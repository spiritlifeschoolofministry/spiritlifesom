-- =====================================================
-- ONLINE EXAMS SYSTEM
-- =====================================================

-- Question bank (reusable questions)
CREATE TABLE public.question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  cohort_id UUID,
  created_by UUID,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq','true_false','short_answer','essay','fill_blank','matching')),
  question_text TEXT NOT NULL,
  image_url TEXT,
  code_snippet TEXT,
  code_language TEXT,
  options JSONB,
  correct_answer JSONB,
  explanation TEXT,
  points NUMERIC NOT NULL DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qbank_course ON public.question_bank(course_id) WHERE archived = false;
CREATE INDEX idx_qbank_tags ON public.question_bank USING GIN(tags);

-- Exams
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  cohort_id UUID NOT NULL,
  created_by UUID,
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  total_points NUMERIC NOT NULL DEFAULT 0,
  passing_score NUMERIC NOT NULL DEFAULT 50,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  allow_late_entry BOOLEAN NOT NULL DEFAULT false,
  late_entry_cutoff_minutes INTEGER DEFAULT 15,
  randomize_questions BOOLEAN NOT NULL DEFAULT true,
  randomize_options BOOLEAN NOT NULL DEFAULT true,
  questions_per_attempt INTEGER,
  max_tab_switches INTEGER NOT NULL DEFAULT 3,
  enforce_fullscreen BOOLEAN NOT NULL DEFAULT true,
  block_shortcuts BOOLEAN NOT NULL DEFAULT true,
  allow_mobile BOOLEAN NOT NULL DEFAULT true,
  autosave_interval_seconds INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','in_progress','closed','archived')),
  results_released BOOLEAN NOT NULL DEFAULT false,
  show_correct_answers BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  target_audience TEXT NOT NULL DEFAULT 'cohort' CHECK (target_audience IN ('cohort','specific')),
  target_student_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exams_cohort_status ON public.exams(cohort_id, status);
CREATE INDEX idx_exams_window ON public.exams(start_at, end_at);

-- Exam ↔ question link
CREATE TABLE public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  points_override NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, question_id)
);
CREATE INDEX idx_exam_questions_exam ON public.exam_questions(exam_id);

-- Exam attempts (single attempt per student per exam)
CREATE TABLE public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  auto_submitted BOOLEAN NOT NULL DEFAULT false,
  submission_reason TEXT CHECK (submission_reason IN ('manual','timeout','tab_switches','fullscreen_exit','admin','disconnect')),
  duration_used_seconds INTEGER NOT NULL DEFAULT 0,
  server_deadline_at TIMESTAMPTZ NOT NULL,
  question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  option_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
  tab_switch_count INTEGER NOT NULL DEFAULT 0,
  fullscreen_exits INTEGER NOT NULL DEFAULT 0,
  suspicious_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  active_session_id UUID,
  last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
  score NUMERIC,
  manual_score_override NUMERIC,
  graded_at TIMESTAMPTZ,
  graded_by UUID,
  regrade_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','grading','graded','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);
CREATE INDEX idx_attempts_exam ON public.exam_attempts(exam_id, status);
CREATE INDEX idx_attempts_student ON public.exam_attempts(student_id);
CREATE INDEX idx_attempts_heartbeat ON public.exam_attempts(last_heartbeat_at) WHERE status = 'in_progress';

-- Exam answers (autosaved)
CREATE TABLE public.exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE RESTRICT,
  answer JSONB,
  is_correct BOOLEAN,
  points_awarded NUMERIC,
  manual_feedback TEXT,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  autosaved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);
CREATE INDEX idx_answers_attempt ON public.exam_answers(attempt_id);

-- Anti-cheat event log
CREATE TABLE public.exam_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_attempt ON public.exam_events(attempt_id, occurred_at DESC);

-- =====================================================
-- updated_at triggers
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_exam_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_qbank_touch BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.touch_exam_updated_at();
CREATE TRIGGER trg_exams_touch BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.touch_exam_updated_at();
CREATE TRIGGER trg_attempts_touch BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_exam_updated_at();

-- =====================================================
-- Lock exam editing when first attempt starts
-- =====================================================
CREATE OR REPLACE FUNCTION public.lock_exam_on_first_attempt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.exams
  SET locked_at = COALESCE(locked_at, now()),
      status = CASE WHEN status = 'published' THEN 'in_progress' ELSE status END
  WHERE id = NEW.exam_id AND locked_at IS NULL;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_lock_exam_on_attempt
  AFTER INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.lock_exam_on_first_attempt();

-- =====================================================
-- Audit manual score overrides
-- =====================================================
CREATE OR REPLACE FUNCTION public.trg_audit_exam_regrade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.manual_score_override IS DISTINCT FROM NEW.manual_score_override THEN
    PERFORM audit_log_event(
      'exam.score_override', 'exam_attempt', NEW.id,
      'Exam score overridden: ' || COALESCE(OLD.manual_score_override::text, OLD.score::text, 'NULL')
        || ' → ' || COALESCE(NEW.manual_score_override::text, 'NULL'),
      jsonb_build_object('score', OLD.score, 'manual_override', OLD.manual_score_override),
      jsonb_build_object('score', NEW.score, 'manual_override', NEW.manual_score_override),
      jsonb_build_object('exam_id', NEW.exam_id, 'student_id', NEW.student_id)
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_audit_exam_regrade
  AFTER UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_exam_regrade();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_events ENABLE ROW LEVEL SECURITY;

-- Question bank
CREATE POLICY qbank_staff_manage ON public.question_bank
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));

-- Exams: staff manage
CREATE POLICY exams_staff_manage ON public.exams
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));

-- Exams: students see published exams for their cohort (and within window OR upcoming)
CREATE POLICY exams_student_view ON public.exams
  FOR SELECT TO authenticated
  USING (
    status IN ('published','in_progress','closed')
    AND (
      cohort_id IN (SELECT cohort_id FROM students WHERE profile_id = auth.uid())
      OR get_my_student_id() = ANY (target_student_ids)
    )
  );

-- exam_questions: staff manage; students view for exams they can see
CREATE POLICY exam_questions_staff ON public.exam_questions
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));

CREATE POLICY exam_questions_student_view ON public.exam_questions
  FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT id FROM exams WHERE status IN ('published','in_progress','closed')
        AND cohort_id IN (SELECT cohort_id FROM students WHERE profile_id = auth.uid())
    )
  );

-- Attempts: students manage their own; staff view/manage all
CREATE POLICY attempts_student_own ON public.exam_attempts
  FOR ALL TO authenticated
  USING (student_id = get_my_student_id())
  WITH CHECK (student_id = get_my_student_id());

CREATE POLICY attempts_staff_all ON public.exam_attempts
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));

-- Answers: students manage their own; staff view/grade
CREATE POLICY answers_student_own ON public.exam_answers
  FOR ALL TO authenticated
  USING (attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = get_my_student_id()))
  WITH CHECK (attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = get_my_student_id()));

CREATE POLICY answers_staff_all ON public.exam_answers
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));

-- Events: students insert their own; staff view all
CREATE POLICY events_student_insert ON public.exam_events
  FOR INSERT TO authenticated
  WITH CHECK (attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = get_my_student_id()));

CREATE POLICY events_student_view_own ON public.exam_events
  FOR SELECT TO authenticated
  USING (attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = get_my_student_id()));

CREATE POLICY events_staff_all ON public.exam_events
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin','teacher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','teacher']));