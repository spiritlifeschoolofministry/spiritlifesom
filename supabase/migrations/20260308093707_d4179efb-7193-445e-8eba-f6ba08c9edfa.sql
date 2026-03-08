-- When a new fee_structure is created, auto-generate individual fee records 
-- for all admitted students in that cohort
CREATE OR REPLACE FUNCTION public.create_student_fees_from_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
  SELECT 
    s.id,
    NEW.cohort_id,
    NEW.fee_name,
    NEW.amount,
    0,
    'Unpaid'
  FROM students s
  WHERE s.cohort_id = NEW.cohort_id
    AND s.admission_status = 'ADMITTED'
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_fee_structure_created
  AFTER INSERT ON fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.create_student_fees_from_structure();

-- Also create fee records when a student gets admitted (for existing fee structures)
CREATE OR REPLACE FUNCTION public.create_fees_for_new_admitted_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admission_status = 'ADMITTED' 
    AND (OLD.admission_status IS NULL OR OLD.admission_status != 'ADMITTED')
    AND NEW.cohort_id IS NOT NULL THEN
    
    INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
    SELECT 
      NEW.id,
      NEW.cohort_id,
      fs.fee_name,
      fs.amount,
      0,
      'Unpaid'
    FROM fee_structures fs
    WHERE fs.cohort_id = NEW.cohort_id
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_student_admitted_create_fees
  AFTER UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION public.create_fees_for_new_admitted_student();