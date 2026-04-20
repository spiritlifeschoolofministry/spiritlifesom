CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_start date;
  c_end date;
  cohort_short text;
  next_number integer;
  new_code text;
BEGIN
  -- No cohort assigned yet → nothing to do
  IF NEW.cohort_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If a code already exists (auto-generated previously OR manually set by admin),
  -- never overwrite it. Returning students keep their original cohort's code.
  IF NEW.student_code IS NOT NULL AND NEW.student_code <> '' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, if admin explicitly cleared the code, we'll regenerate based on current cohort.
  -- Otherwise (cohort changed but code still null somehow), generate fresh.

  SELECT start_date, end_date INTO c_start, c_end
  FROM cohorts WHERE id = NEW.cohort_id;

  IF c_start IS NULL OR c_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- Two-digit start year + two-digit end year, always 4 chars (e.g. 2025-2026 → "2526")
  cohort_short := lpad((EXTRACT(YEAR FROM c_start)::int % 100)::text, 2, '0')
               || lpad((EXTRACT(YEAR FROM c_end)::int   % 100)::text, 2, '0');

  -- Next sequence based on MAX existing number in this cohort matching the prefix
  SELECT COALESCE(MAX(
    CASE
      WHEN student_code LIKE 'SLSM-' || cohort_short || '-%'
      THEN NULLIF(regexp_replace(student_code, '.*-(\d+)$', '\1'), '')::integer
      ELSE 0
    END
  ), 0) + 1
  INTO next_number
  FROM students
  WHERE cohort_id = NEW.cohort_id
    AND student_code IS NOT NULL
    AND id != NEW.id;

  new_code := 'SLSM-' || cohort_short || '-' || lpad(next_number::text, 4, '0');
  NEW.student_code := new_code;
  RETURN NEW;
END;
$function$;

-- Recreate trigger to be safe
DROP TRIGGER IF EXISTS on_student_cohort_assigned ON public.students;
CREATE TRIGGER on_student_cohort_assigned
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_student_code();