
-- Drop the restrictive fee_type check constraint
ALTER TABLE fees DROP CONSTRAINT fees_fee_type_check;

-- Backfill: create fee records for all existing admitted students from fee_structures
INSERT INTO fees (student_id, cohort_id, fee_type, amount_due, amount_paid, payment_status)
SELECT 
  s.id,
  fs.cohort_id,
  fs.fee_name,
  fs.amount,
  0,
  'Unpaid'
FROM students s
JOIN fee_structures fs ON s.cohort_id = fs.cohort_id
WHERE s.admission_status = 'ADMITTED'
ON CONFLICT DO NOTHING;
