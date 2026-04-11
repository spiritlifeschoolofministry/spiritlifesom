-- Drop the old trigger
DROP TRIGGER IF EXISTS on_student_cohort_assigned ON students;

-- Recreate the function with proper logic
CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cohort_name text;
  cohort_short text;
  next_number integer;
  new_code text;
BEGIN
  -- Only generate code when cohort_id is being set or changed
  IF NEW.cohort_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if cohort_id hasn't changed (unless student_code is null)
  IF TG_OP = 'UPDATE' AND OLD.cohort_id IS NOT DISTINCT FROM NEW.cohort_id AND NEW.student_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO cohort_name FROM cohorts WHERE id = NEW.cohort_id;
  
  IF cohort_name IS NULL THEN
    RETURN NEW;
  END IF;

  cohort_short := replace(replace(cohort_name, '20', ''), '/', '');

  -- Use MAX of existing code numbers instead of COUNT to avoid collisions
  SELECT COALESCE(MAX(
    CASE 
      WHEN student_code LIKE 'SLSM-' || cohort_short || '-%' 
      THEN NULLIF(regexp_replace(student_code, '.*-(\d+)$', '\1'), '')::integer
      ELSE 0
    END
  ), 0) + 1 INTO next_number
  FROM students
  WHERE cohort_id = NEW.cohort_id
    AND student_code IS NOT NULL
    AND id != NEW.id;

  new_code := 'SLSM-' || cohort_short || '-' || lpad(next_number::text, 4, '0');
  NEW.student_code := new_code;
  RETURN NEW;
END;
$function$;

-- Recreate trigger - BEFORE INSERT OR UPDATE
CREATE TRIGGER on_student_cohort_assigned
  BEFORE INSERT OR UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION generate_student_code();