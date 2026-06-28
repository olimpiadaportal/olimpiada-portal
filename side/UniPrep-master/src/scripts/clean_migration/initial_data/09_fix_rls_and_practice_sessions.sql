-- ============================================================================
-- HOTFIX 09: Fix RLS policies for ai_usage_logs + Add shuffled_questions column
-- Run this on EXISTING databases
-- ============================================================================
--
-- FIXES:
-- 1. ai_usage_logs RLS: Edge functions (ai-generate-questions, ai-explain) use
--    the anon key + user JWT (not service role key) for DB operations. Since
--    ai_usage_logs has RLS enabled with NO policies, INSERT fails with:
--    "new row violates row-level security policy for table ai_usage_logs"
--    Fix: Add INSERT policy for authenticated users and SELECT for own rows.
--
-- 2. practice_sessions.shuffled_questions: The webapp stores shuffled option
--    order in this JSONB column for the review page. The column was missing
--    from the consolidated schema, causing 400 Bad Request on PATCH.
-- ============================================================================

-- ============================================================================
-- FIX 1: ai_usage_logs RLS policies
-- ============================================================================

-- Allow authenticated users to insert their own usage logs
-- (Edge functions run with user's JWT via anon key)
DROP POLICY IF EXISTS "Users can insert own usage logs" ON ai_usage_logs;
CREATE POLICY "Users can insert own usage logs" ON ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to view their own usage logs
DROP POLICY IF EXISTS "Users can view own usage logs" ON ai_usage_logs;
CREATE POLICY "Users can view own usage logs" ON ai_usage_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Allow service role full access (for admin panel analytics)
-- Note: service_role bypasses RLS by default, but explicit policy for clarity
DROP POLICY IF EXISTS "Service role full access to usage logs" ON ai_usage_logs;
CREATE POLICY "Service role full access to usage logs" ON ai_usage_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FIX 2: Add shuffled_questions column to practice_sessions
-- ============================================================================

-- The webapp stores the shuffled option order for each question so the review
-- page can show options in the same order the student saw during the test.
ALTER TABLE practice_sessions 
  ADD COLUMN IF NOT EXISTS shuffled_questions JSONB DEFAULT NULL;

COMMENT ON COLUMN practice_sessions.shuffled_questions IS 'Stores shuffled option order for review page - webapp only';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify ai_usage_logs policies
SELECT polname, polcmd 
FROM pg_policy 
WHERE polrelid = 'ai_usage_logs'::regclass
ORDER BY polname;
-- Expected: 2-3 policies (insert, select, and optionally service_role all)

-- Verify shuffled_questions column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'practice_sessions' AND column_name = 'shuffled_questions';
-- Expected: 1 row with data_type = 'jsonb'
