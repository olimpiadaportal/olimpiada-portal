-- ============================================================================
-- HOTFIX 10: Fix missing columns in competitive_sessions and competitive_question_results
-- Run this on EXISTING databases
-- ============================================================================
--
-- FIXES:
-- 1. competitive_sessions: Missing 'score' column. The mobile app's
--    competitiveSessionService.ts writes a percentage score (0-100) to this
--    column when saving/updating sessions. Without it, session completion
--    fails with: "Could not find the 'score' column of 'competitive_sessions'"
--
-- 2. competitive_question_results: Missing columns that the mobile app writes
--    for the review screen and adaptive learning:
--    - correct_answer: The correct answer for the question
--    - student_answer: The student's selected answer
--    - question_text: Question text (denormalized for review)
--    - option_a/b/c/d: Answer options (denormalized for review)
--    - topic: Topic for adaptive learning
--    - difficulty: Difficulty level for adaptive learning
--    - time_spent: Time spent on the question (original S10 column name)
--    Error: "Could not find the 'correct_answer' column of 'competitive_question_results'"
--
-- The consolidated schema (01_base_schema.sql) used the S10.1 "recreated"
-- version of competitive_question_results which had a slimmer schema.
-- The mobile app code expects the full set of columns from S10 + denormalized
-- fields added by competitiveSessionService.ts.
-- ============================================================================

-- ============================================================================
-- FIX 1: competitive_sessions - add score column
-- ============================================================================

ALTER TABLE competitive_sessions
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;

COMMENT ON COLUMN competitive_sessions.score IS 'Percentage score (0-100) calculated by the mobile app';

-- ============================================================================
-- FIX 2: competitive_question_results - add missing columns
-- ============================================================================

-- Original S10 columns missing from consolidated schema
ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS correct_answer TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS student_answer TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS topic TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS difficulty TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS time_spent INTEGER DEFAULT 0;

-- Denormalized columns written by mobile app's competitiveSessionService
ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS question_text TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS option_a TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS option_b TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS option_c TEXT;

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS option_d TEXT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify competitive_sessions has score column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'competitive_sessions' AND column_name = 'score';
-- Expected: 1 row with data_type = 'integer'

-- Verify competitive_question_results has all new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'competitive_question_results'
  AND column_name IN ('correct_answer', 'student_answer', 'question_text', 
                       'option_a', 'option_b', 'option_c', 'option_d',
                       'topic', 'difficulty', 'time_spent')
ORDER BY column_name;
-- Expected: 10 rows
