-- Auto-submitting an exam was failing at the database.
--
-- The runner and exam-submit grew reasons the CHECK constraint never learned:
-- 'tab_switch_exceeded', 'camera_blocked' and 'microphone_blocked'. Every
-- auto-submission for those causes was rejected by Postgres, exam-submit
-- answered 500 ("Edge Function returned a non-2xx status code"), and because
-- the row was never marked submitted the attempt stayed in_progress — so the
-- student simply resumed the paper they had just been cut off from.
ALTER TABLE public.exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_submission_reason_check;

ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_submission_reason_check
  CHECK (submission_reason IN (
    'manual',
    'timeout',
    'tab_switches',
    'tab_switch_exceeded',
    'fullscreen_exit',
    'fullscreen_exceeded',
    'camera_blocked',
    'microphone_blocked',
    'admin',
    'disconnect'
  ));

-- Fullscreen had no consequence: exiting it was logged and warned about, and
-- nothing else. Give it a limit of its own rather than borrowing the tab-switch
-- one, so a lecturer can set the two independently.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS max_fullscreen_exits INTEGER NOT NULL DEFAULT 3;
