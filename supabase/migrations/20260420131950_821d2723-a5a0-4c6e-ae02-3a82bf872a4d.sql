-- Re-trigger welcome email for Seraph Media by toggling is_approved off then on.
-- The notify_student_on_approval trigger fires on FALSE -> TRUE transition.
UPDATE public.students
SET is_approved = FALSE
WHERE id = 'ef8f15bf-c605-4c47-ad80-314d7c04bbd1';

UPDATE public.students
SET is_approved = TRUE
WHERE id = 'ef8f15bf-c605-4c47-ad80-314d7c04bbd1';