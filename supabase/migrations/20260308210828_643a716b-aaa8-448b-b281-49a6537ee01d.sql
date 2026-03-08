-- Backfill student code for the student missing it
DO $$
DECLARE
  rec RECORD;
  cohort_name text;
  cohort_short text;
  next_number integer;
  new_code text;
BEGIN
  FOR rec IN SELECT id, cohort_id FROM students WHERE student_code IS NULL AND cohort_id IS NOT NULL
  LOOP
    SELECT name INTO cohort_name FROM cohorts WHERE id = rec.cohort_id;
    cohort_short := replace(replace(cohort_name, '20', ''), '/', '');
    SELECT count(*) + 1 INTO next_number FROM students WHERE cohort_id = rec.cohort_id AND student_code IS NOT NULL;
    new_code := 'SLSM-' || cohort_short || '-' || lpad(next_number::text, 4, '0');
    UPDATE students SET student_code = new_code WHERE id = rec.id;
  END LOOP;
END;
$$;