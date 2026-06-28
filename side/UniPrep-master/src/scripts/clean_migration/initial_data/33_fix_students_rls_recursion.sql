-- ============================================================================
-- Migration 33: Fix infinite RLS recursion on students UPDATE policy
--
-- Root cause:
--   The "Users can update own safe student data" policy on students table
--   has a WITH CHECK clause that queries the students table itself:
--     AND leaderboard_score = (SELECT leaderboard_score FROM students WHERE user_id = auth.uid())
--   This triggers RLS evaluation recursively → infinite loop → error 42P17.
--
-- Solution:
--   Use a SECURITY DEFINER helper function to bypass RLS when reading
--   the current scoring column values. The function runs with elevated
--   privileges and returns the protected column values for comparison.
--
-- Affected operations:
--   - Any UPDATE to students table (profile updates, daily stats, analytics)
--   - Triggered by: update_daily_stats, update_analytics, profile edits
-- ============================================================================

-- ============================================================================
-- STEP 1: Create helper function to get protected scoring columns (bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_student_protected_columns(p_user_id UUID)
RETURNS TABLE (
  leaderboard_score BIGINT,
  elo_rating INTEGER,
  monthly_score BIGINT,
  k_factor NUMERIC,
  total_exams_taken INTEGER,
  activity_multiplier NUMERIC,
  bonus_points INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    s.leaderboard_score,
    s.elo_rating,
    s.monthly_score,
    s.k_factor,
    s.total_exams_taken,
    s.activity_multiplier,
    s.bonus_points
  FROM students s
  WHERE s.user_id = p_user_id
  LIMIT 1;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_student_protected_columns(UUID) TO authenticated;

-- ============================================================================
-- STEP 2: Drop the problematic policy
-- ============================================================================
DROP POLICY IF EXISTS "Users can update own safe student data" ON students;

-- ============================================================================
-- STEP 3: Recreate the policy using the helper function (no recursion)
-- ============================================================================
CREATE POLICY "Users can update own safe student data" ON students
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND leaderboard_score   = (SELECT leaderboard_score   FROM public.get_student_protected_columns(auth.uid()))
    AND elo_rating          = (SELECT elo_rating          FROM public.get_student_protected_columns(auth.uid()))
    AND monthly_score       = (SELECT monthly_score       FROM public.get_student_protected_columns(auth.uid()))
    AND k_factor            = (SELECT k_factor            FROM public.get_student_protected_columns(auth.uid()))
    AND total_exams_taken   = (SELECT total_exams_taken   FROM public.get_student_protected_columns(auth.uid()))
    AND activity_multiplier = (SELECT activity_multiplier FROM public.get_student_protected_columns(auth.uid()))
    AND bonus_points        = (SELECT bonus_points        FROM public.get_student_protected_columns(auth.uid()))
  );

-- ============================================================================
-- STEP 4: Verification
-- ============================================================================
SELECT
  EXISTS(
    SELECT 1 FROM pg_proc WHERE proname = 'get_student_protected_columns'
  ) AS helper_function_exists,
  EXISTS(
    SELECT 1 FROM pg_policies
    WHERE tablename = 'students' AND policyname = 'Users can update own safe student data'
  ) AS policy_recreated;
-- Expected: true, true

-- ============================================================================
-- Test: This should now work without recursion error
-- Run as authenticated user to verify:
--   UPDATE students SET full_name = 'Test' WHERE user_id = auth.uid();
-- ============================================================================
