-- Close gaps in 2025/26 sequence: renumber 0029→0023, 0030→0024, 0031→0025
UPDATE public.students SET student_code = NULL WHERE id IN (
  'dd381f0e-f6fe-4a92-aa61-b9946dc620e3',
  '5d83369c-fa41-4afb-8be7-c5ee3ec0d80c',
  'ef8f15bf-c605-4c47-ad80-314d7c04bbd1'
);

UPDATE public.students SET student_code = 'SLSM-2526-0023' WHERE id = 'dd381f0e-f6fe-4a92-aa61-b9946dc620e3';
UPDATE public.students SET student_code = 'SLSM-2526-0024' WHERE id = '5d83369c-fa41-4afb-8be7-c5ee3ec0d80c';
UPDATE public.students SET student_code = 'SLSM-2526-0025' WHERE id = 'ef8f15bf-c605-4c47-ad80-314d7c04bbd1';