-- Hotfix 57: Add missing columns to exam_answers table
-- These columns are referenced throughout the codebase (mockExamService, ExamGradingScreen, etc.)
-- but were never added to the base schema migration file.
--
-- image_url     : photo of a handwritten written_open answer
-- ai_score      : 0-100 score assigned by the AI grading edge function
-- final_score   : resolved score (ai_score after manual override, if any)
-- ai_explanation: feedback text returned by the AI grader
--
-- Run once on the live DB; safe to re-run (IF NOT EXISTS guards each column).

ALTER TABLE exam_answers
  ADD COLUMN IF NOT EXISTS image_url      TEXT,
  ADD COLUMN IF NOT EXISTS ai_score       DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS final_score    DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT;

NOTIFY pgrst, 'reload schema';
