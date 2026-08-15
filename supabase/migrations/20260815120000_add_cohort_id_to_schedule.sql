-- Attendance was being measured against the number of check-in records a student
-- happened to have, so a student who attended 6 of 13 classes scored 6/6 = 100%.
-- The denominator must be the classes their cohort actually held, which requires
-- schedule rows to (a) belong to a cohort and (b) declare whether they count.

ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL;

-- Not every scheduled row is a class: Graduation, Break, Orientation, Project
-- Defence and Proposal Submission are calendar entries, not attendance events.
ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS counts_for_attendance boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Backfill: cohort ownership
-- Cohort date windows overlap (2025/26 ends 2026-05-31, 2026/2027 starts
-- 2026-05-16), so windows alone are ambiguous. Attendance-derived ownership is
-- also unreliable because students were reassigned into 2026/2027 and their old
-- records followed them. These boundaries come from inspecting the actual data.
-- ---------------------------------------------------------------------------

-- 2026/2027 — live cohort. Real teaching begins 2026-05-09.
UPDATE public.schedule SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715'
WHERE date >= '2026-05-09'
  AND date NOT IN ('2026-05-17', '2026-05-31');  -- prior cohort's defence + graduation

-- 2025/26 — its curriculum, plus its two closing events inside the overlap.
UPDATE public.schedule SET cohort_id = 'd1bba941-3aa6-4eef-8c0c-e03aa622951f'
WHERE (date >= '2025-05-31' AND date < '2026-05-09')
   OR date IN ('2026-05-17', '2026-05-31');

-- ---------------------------------------------------------------------------
-- Backfill: which sessions count toward attendance
-- Attendance tracking only went live in May 2026. Counting the 2025 curriculum
-- would fabricate absences for every student, so a one-time heuristic is used:
-- a session counts only if it is a class type AND actually drew a class-sized
-- turnout. Real sessions drew 36-53 check-ins; stray/test rows drew exactly 1.
-- ---------------------------------------------------------------------------
UPDATE public.schedule s
SET counts_for_attendance = false
WHERE s.activity_type IN ('Graduation', 'Break', 'Orientation', 'Proposal Submission', 'Project Defence')
   OR (SELECT count(*) FROM public.attendance a WHERE a.schedule_id = s.id) < 5;

-- One counted class per cohort per day. Non-counted rows are exempt, so a cohort
-- can still hold a Lecture and a Practical on the same date (e.g. 2026-03-14).
CREATE UNIQUE INDEX IF NOT EXISTS schedule_cohort_date_counted_uniq
  ON public.schedule (cohort_id, date)
  WHERE cohort_id IS NOT NULL AND counts_for_attendance;

CREATE INDEX IF NOT EXISTS schedule_cohort_id_idx ON public.schedule (cohort_id);

-- ---------------------------------------------------------------------------
-- The previous policy let any student read every row with a NULL course_id,
-- which is where cohort scoping now lives. Make visibility follow cohort_id.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "View: own cohort or staff" ON public.schedule;

CREATE POLICY "View: own cohort or staff" ON public.schedule
FOR SELECT TO public
USING (
  (auth.uid() IS NOT NULL) AND (
    (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]))
    OR (EXISTS (
      SELECT 1 FROM students s
      WHERE s.profile_id = auth.uid() AND s.cohort_id = schedule.cohort_id
    ))
    -- Unassigned legacy rows stay visible; they count for nobody.
    OR (schedule.cohort_id IS NULL AND schedule.course_id IS NULL)
    OR (EXISTS (
      SELECT 1
      FROM students s
      JOIN courses c ON (schedule.course_id = c.id)
      WHERE s.profile_id = auth.uid() AND s.cohort_id = c.cohort_id
    ))
  )
);
