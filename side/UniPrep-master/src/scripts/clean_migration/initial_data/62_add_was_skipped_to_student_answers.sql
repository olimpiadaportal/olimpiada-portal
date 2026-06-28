-- ============================================================================
-- Hotfix 62: Add was_skipped column to student_answers
-- ============================================================================
-- Problem: Skipped questions have NO student_answers row, so the adaptive
-- question selection algorithm treats them as "never seen" → same questions
-- reappear every session.
--
-- Fix: Add was_skipped BOOLEAN column. When a student skips a question,
-- the app inserts a row with is_correct=false, was_skipped=true.
-- The adaptive algorithm then buckets skipped questions with incorrect ones
-- (90% wrong+skipped / 10% correct reinforcement).
-- ============================================================================

ALTER TABLE student_answers
ADD COLUMN IF NOT EXISTS was_skipped BOOLEAN DEFAULT FALSE;

-- Index for efficient adaptive selection queries
CREATE INDEX IF NOT EXISTS idx_student_answers_user_skipped
ON student_answers (user_id, was_skipped)
WHERE was_skipped = TRUE;

NOTIFY pgrst, 'reload schema';
