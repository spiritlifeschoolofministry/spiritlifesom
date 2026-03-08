-- Create the missing trigger for student code generation
CREATE TRIGGER on_student_cohort_assigned
  BEFORE INSERT OR UPDATE OF cohort_id ON public.students
  FOR EACH ROW
  WHEN (NEW.cohort_id IS NOT NULL AND NEW.student_code IS NULL)
  EXECUTE FUNCTION public.generate_student_code();