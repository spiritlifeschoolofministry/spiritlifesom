-- Step 1: Clear existing codes to free them and avoid unique-index conflicts
UPDATE public.students
SET student_code = NULL
WHERE id IN (
  '0fcdcb1c-4fbb-45c8-8bc7-ac79ab35bf07',
  'f3e42c57-4c6b-4601-83af-12237a87d647',
  'eb0576ad-94ad-4bf5-9437-5140d855a25d',
  'd015b891-ff02-4ae8-9993-12917cb891a3',
  '2549e49b-5cca-4174-8fa1-efa122408581',
  '303edd92-8450-45f3-8570-b4e54ae90ad9'
);

-- Step 2: Reassign cohort and matric in one update per row, preserving registration order
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0001' WHERE id = '0fcdcb1c-4fbb-45c8-8bc7-ac79ab35bf07';
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0002' WHERE id = 'f3e42c57-4c6b-4601-83af-12237a87d647';
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0003' WHERE id = 'eb0576ad-94ad-4bf5-9437-5140d855a25d';
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0004' WHERE id = 'd015b891-ff02-4ae8-9993-12917cb891a3';
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0005' WHERE id = '2549e49b-5cca-4174-8fa1-efa122408581';
UPDATE public.students SET cohort_id = '12e2cf32-9f82-41c6-b3ec-40b943874715', student_code = 'SLSM-2627-0006' WHERE id = '303edd92-8450-45f3-8570-b4e54ae90ad9';