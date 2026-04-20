CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_unique
  ON public.students (student_code)
  WHERE student_code IS NOT NULL;