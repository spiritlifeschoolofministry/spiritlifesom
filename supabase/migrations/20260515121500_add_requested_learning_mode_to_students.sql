-- Add a field to keep track of pending learning mode change requests from students
ALTER TABLE students
  ADD COLUMN requested_learning_mode text NULL;
