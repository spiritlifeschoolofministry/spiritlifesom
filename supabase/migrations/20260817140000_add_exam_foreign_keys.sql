-- The exam tables declared course_id / cohort_id / student_id as plain UUID columns with no
-- REFERENCES clause. PostgREST derives its embedded-resource joins from foreign keys, so every
-- query of the form `.select("*, courses(code,title)")` failed with PGRST200 ("could not find a
-- relationship"). The admin exam list swallowed that error and rendered "No exams yet", which is
-- why a saved draft appeared to vanish.
--
-- No orphaned rows exist, so these constraints apply cleanly.

alter table public.exams
  add constraint exams_course_id_fkey
    foreign key (course_id) references public.courses(id) on delete restrict,
  add constraint exams_cohort_id_fkey
    foreign key (cohort_id) references public.cohorts(id) on delete restrict;

alter table public.question_bank
  add constraint question_bank_course_id_fkey
    foreign key (course_id) references public.courses(id) on delete restrict,
  add constraint question_bank_cohort_id_fkey
    foreign key (cohort_id) references public.cohorts(id) on delete set null;

alter table public.exam_attempts
  add constraint exam_attempts_student_id_fkey
    foreign key (student_id) references public.students(id) on delete cascade;

create index if not exists idx_exams_course on public.exams(course_id);
create index if not exists idx_question_bank_course on public.question_bank(course_id);
create index if not exists idx_exam_attempts_student on public.exam_attempts(student_id);
