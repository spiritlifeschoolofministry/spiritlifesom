-- Fees and materials could each target exactly one learning mode, so covering
-- two modes meant duplicating the fee or re-uploading the file. Targeting
-- becomes a set: learning_modes text[].
--
-- 'All' is kept as a sentinel meaning every mode, rather than being expanded to
-- the current list, so a mode added later is included automatically. It is
-- stored alone: {All}, never {All,Online}.
--
-- Matching stays literal: a student's own mode must appear in the set, or the
-- set must be {All}. Hybrid does not implicitly match Online or Physical here -
-- admin now selects exactly which modes a fee applies to, so a fee can no
-- longer reach a student nobody chose. Course material access keeps its own
-- broader rule, applied when the student reads (StudentMaterials).

-- course_materials -----------------------------------------------------------
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS learning_modes text[];

UPDATE public.course_materials
  SET learning_modes = ARRAY[COALESCE(NULLIF(trim(learning_mode), ''), 'All')]
  WHERE learning_modes IS NULL;

ALTER TABLE public.course_materials
  ALTER COLUMN learning_modes SET DEFAULT ARRAY['All']::text[],
  ALTER COLUMN learning_modes SET NOT NULL;

ALTER TABLE public.course_materials
  ADD CONSTRAINT course_materials_learning_modes_not_empty
  CHECK (array_length(learning_modes, 1) >= 1);

ALTER TABLE public.course_materials DROP COLUMN learning_mode;

COMMENT ON COLUMN public.course_materials.learning_modes IS
  'Learning modes this material targets, e.g. {Online,Hybrid}. {All} means every mode.';

-- fee_structures -------------------------------------------------------------
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS learning_modes text[];

UPDATE public.fee_structures
  SET learning_modes = ARRAY[COALESCE(NULLIF(trim(learning_mode), ''), 'All')]
  WHERE learning_modes IS NULL;

ALTER TABLE public.fee_structures
  ALTER COLUMN learning_modes SET DEFAULT ARRAY['All']::text[],
  ALTER COLUMN learning_modes SET NOT NULL;

ALTER TABLE public.fee_structures
  ADD CONSTRAINT fee_structures_learning_modes_not_empty
  CHECK (array_length(learning_modes, 1) >= 1);

ALTER TABLE public.fee_structures DROP COLUMN learning_mode;

COMMENT ON COLUMN public.fee_structures.learning_modes IS
  'Learning modes this fee applies to, e.g. {Online,Hybrid}. {All} means every mode.';

-- Assignment triggers --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student_fees_from_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
  SELECT s.id, NEW.cohort_id, NEW.fee_name, NEW.amount, 0, 'Unpaid'
  FROM students s
  WHERE s.cohort_id = NEW.cohort_id
    AND s.admission_status = 'ADMITTED'
    AND ('All' = ANY (NEW.learning_modes) OR s.learning_mode = ANY (NEW.learning_modes))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_fees_for_new_admitted_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.admission_status = 'ADMITTED'
    AND (OLD.admission_status IS NULL OR OLD.admission_status != 'ADMITTED')
    AND NEW.cohort_id IS NOT NULL THEN

    INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
    SELECT NEW.id, NEW.cohort_id, fs.fee_name, fs.amount, 0, 'Unpaid'
    FROM fee_structures fs
    WHERE fs.cohort_id = NEW.cohort_id
      AND ('All' = ANY (fs.learning_modes) OR NEW.learning_mode = ANY (fs.learning_modes))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
