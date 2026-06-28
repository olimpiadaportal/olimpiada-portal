-- Hotfix 77: Add option_e column to teacher_questions table
-- Teacher question form now supports 5 MCQ options (A–E)

ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS option_e TEXT;
