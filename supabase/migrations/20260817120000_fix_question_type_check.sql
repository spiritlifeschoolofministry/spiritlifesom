-- The app has always used mcq_single / mcq_multi (see QuestionType in src/lib/exam-utils.ts),
-- but the original question_bank check constraint only allowed the legacy 'mcq'. Every insert
-- from the question editor and the CSV importer failed with question_bank_question_type_check.

update public.question_bank
set question_type = 'mcq_single'
where question_type = 'mcq';

alter table public.question_bank
  drop constraint if exists question_bank_question_type_check;

alter table public.question_bank
  add constraint question_bank_question_type_check
  check (question_type in (
    'mcq_single', 'mcq_multi', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching'
  ));
