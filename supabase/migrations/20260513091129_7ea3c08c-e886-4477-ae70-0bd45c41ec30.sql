-- Update student records
UPDATE public.students 
SET learning_mode = 'Physical' 
WHERE learning_mode = 'On-site';

-- Update fee structures
UPDATE public.fee_structures 
SET learning_mode = 'Physical' 
WHERE learning_mode = 'On-site';