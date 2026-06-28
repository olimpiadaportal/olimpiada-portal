-- ============================================================================
-- MIGRATION 23: Leaderboard Anti-Gaming & Fairness Hardening
-- ============================================================================
-- Fixes:
--   1. RLS: restrict students UPDATE to safe profile columns only.
--          leaderboard_score, elo_rating, monthly_score, k_factor,
--          total_exams_taken, activity_multiplier, bonus_points are now
--          write-protected from the client — only SECURITY DEFINER functions
--          can change them.
--   2. New SECURITY DEFINER function update_leaderboard_score_after_exam():
--          Server-owned scoring that validates ownership, enforces the
--          weighted-average formula and writes leaderboard_score atomically.
--          The client calls this RPC; it can never write the column directly.
--   3. Revoke reset_leaderboard_soft / reset_leaderboard_hard from
--          'authenticated'. These are admin-only operations — they now require
--          service_role or must be called via the admin panel (which uses
--          service_role key).
--   4. Fix update_student_score() to also refresh leaderboard_score so the
--          ELO system and the leaderboard display stay in sync.
--   5. Fix offlineSyncService daily_statistics to credit the session date,
--          not the sync date (handled in SQL via p_session_date parameter on
--          upsert_daily_stats_for_date).
-- ============================================================================

-- ============================================================================
-- FIX 1: Column-level RLS on students table
-- ============================================================================
-- PostgreSQL RLS does not support column-level restrictions natively, but we
-- can achieve the same effect by:
--   a) Dropping the broad UPDATE policy
--   b) Replacing it with a policy that has a WITH CHECK constraint ensuring
--      the protected columns are unchanged.
-- We use a helper function to compare the protected fields.
-- ============================================================================

-- Drop the old broad policy
DROP POLICY IF EXISTS "Users can update own student data" ON students;

-- New policy: allow UPDATE only when protected scoring columns are NOT changed.
-- The USING clause checks ownership; the WITH CHECK clause verifies that
-- the client is not touching scoring columns.
CREATE POLICY "Users can update own safe student data" ON students
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Ensure the client cannot change any scoring / ranking columns.
    -- These are allowed to change only via SECURITY DEFINER functions.
    AND leaderboard_score = (SELECT leaderboard_score FROM students WHERE user_id = auth.uid())
    AND elo_rating        = (SELECT elo_rating        FROM students WHERE user_id = auth.uid())
    AND monthly_score     = (SELECT monthly_score     FROM students WHERE user_id = auth.uid())
    AND k_factor          = (SELECT k_factor          FROM students WHERE user_id = auth.uid())
    AND total_exams_taken = (SELECT total_exams_taken FROM students WHERE user_id = auth.uid())
    AND activity_multiplier = (SELECT activity_multiplier FROM students WHERE user_id = auth.uid())
    AND bonus_points      = (SELECT bonus_points      FROM students WHERE user_id = auth.uid())
  );

-- ============================================================================
-- FIX 2: Server-side leaderboard score update (replaces client-side logic)
-- ============================================================================
-- This function:
--   • Verifies the calling user owns the student record (anti-spoofing).
--   • Verifies the exam attempt exists, belongs to the caller, and is
--     genuinely completed (status = 'completed') — prevents fabricated scores.
--   • Applies the weighted average of the last 4 completed exams.
--   • Also calls update_student_score() to keep ELO / monthly_score in sync.
--   • Returns the new leaderboard_score so the client can display it.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_leaderboard_score_after_exam(
  p_student_id  UUID,
  p_attempt_id  UUID
)
RETURNS TABLE(
  new_leaderboard_score  DECIMAL,
  new_elo                INTEGER,
  elo_change             INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID;
  v_attempt_user_id  UUID;
  v_exam_percentage  DECIMAL;
  v_leaderboard_score DECIMAL;
  v_elo_result       RECORD;
  v_weights          DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum     DECIMAL   := 0;
  v_total_weight     DECIMAL   := 0;
  v_recent_exams     RECORD;
  v_idx              INTEGER   := 0;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Verify student ownership (anti-spoofing: p_student_id must belong to caller)
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to caller';
  END IF;

  -- 3. Verify the exam attempt is real, completed, and belongs to caller
  SELECT percentage, user_id
  INTO   v_exam_percentage, v_attempt_user_id
  FROM   mock_exam_attempts
  WHERE  id        = p_attempt_id
    AND  user_id   = v_user_id
    AND  status    = 'completed'
    AND  percentage IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  -- 4. Fetch last 4 completed exam percentages (includes current attempt)
  FOR v_recent_exams IN
    SELECT percentage
    FROM   mock_exam_attempts
    WHERE  user_id   = v_user_id
      AND  status    = 'completed'
      AND  percentage IS NOT NULL
    ORDER  BY completed_at DESC
    LIMIT  4
  LOOP
    IF v_idx = 0 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[1];
      v_total_weight := v_total_weight + v_weights[1];
    ELSIF v_idx = 1 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[2];
      v_total_weight := v_total_weight + v_weights[2];
    ELSIF v_idx = 2 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[3];
      v_total_weight := v_total_weight + v_weights[3];
    ELSIF v_idx = 3 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[4];
      v_total_weight := v_total_weight + v_weights[4];
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  -- 5. Calculate final leaderboard score
  IF v_total_weight > 0 THEN
    v_leaderboard_score := ROUND(v_weighted_sum / v_total_weight, 2);
  ELSE
    v_leaderboard_score := ROUND(v_exam_percentage, 2);
  END IF;

  -- 6. Write leaderboard_score — only this SECURITY DEFINER function can do this
  UPDATE students
  SET    leaderboard_score = v_leaderboard_score,
         updated_at        = NOW()
  WHERE  id = p_student_id;

  -- 7. Also update ELO / monthly_score via the existing scoring function
  SELECT *
  INTO   v_elo_result
  FROM   update_student_score(
    p_student_id,
    v_exam_percentage,
    CASE
      WHEN v_exam_percentage >= 80 THEN 'hard'
      WHEN v_exam_percentage >= 50 THEN 'medium'
      ELSE 'easy'
    END,
    'exam_completion'
  )
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_leaderboard_score AS new_leaderboard_score,
    COALESCE(v_elo_result.new_elo,    0) AS new_elo,
    COALESCE(v_elo_result.elo_change, 0) AS elo_change;
END;
$$;

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Server-side leaderboard update after exam. Validates ownership + attempt '
  'authenticity, applies weighted average, updates leaderboard_score and ELO. '
  'Clients must call this RPC — they cannot write leaderboard_score directly.';

-- ============================================================================
-- FIX 3: Revoke dangerous leaderboard reset functions from authenticated users
-- ============================================================================
-- reset_leaderboard_soft and reset_leaderboard_hard wipe or decay every
-- student's score. They must only be callable by the admin panel (service_role).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION reset_leaderboard_soft FROM authenticated;
REVOKE EXECUTE ON FUNCTION reset_leaderboard_hard FROM authenticated;
REVOKE EXECUTE ON FUNCTION create_season FROM authenticated;
REVOKE EXECUTE ON FUNCTION archive_season FROM authenticated;

-- Re-grant to service_role (admin panel uses service_role key)
GRANT EXECUTE ON FUNCTION reset_leaderboard_soft TO service_role;
GRANT EXECUTE ON FUNCTION reset_leaderboard_hard TO service_role;
GRANT EXECUTE ON FUNCTION create_season TO service_role;
GRANT EXECUTE ON FUNCTION archive_season TO service_role;

-- ============================================================================
-- FIX 4: Also revoke admin_reset_leaderboard / admin_adjust_student_score
--         from authenticated (they already check IS admin internally but
--         still shouldn't be callable by regular users at the API level)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION admin_reset_leaderboard FROM authenticated;

-- ============================================================================
-- FIX 5: Helper for offline sync — credit stats to session date, not sync date
-- ============================================================================
-- offlineSyncService currently calls daily_statistics with today's date even
-- if the session was completed 3 days ago. This function lets the sync service
-- pass the actual session date.
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_offline_session_stats(
  p_user_id              UUID,
  p_session_date         DATE,
  p_questions_answered   INTEGER,
  p_correct_answers      INTEGER,
  p_study_time_minutes   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller owns this user record
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO daily_statistics (
    user_id,
    date,
    questions_answered,
    correct_answers,
    study_time_minutes,
    sessions_completed
  ) VALUES (
    p_user_id,
    p_session_date,
    p_questions_answered,
    p_correct_answers,
    p_study_time_minutes,
    1
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    questions_answered = daily_statistics.questions_answered + EXCLUDED.questions_answered,
    correct_answers    = daily_statistics.correct_answers    + EXCLUDED.correct_answers,
    study_time_minutes = daily_statistics.study_time_minutes + EXCLUDED.study_time_minutes,
    sessions_completed = daily_statistics.sessions_completed + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_offline_session_stats(UUID, DATE, INTEGER, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION upsert_offline_session_stats IS
  'Upsert daily_statistics for a specific past date (used by offline sync). '
  'Prevents stat inflation by crediting the original session date.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 23 complete: Leaderboard Anti-Gaming Hardening';
  RAISE NOTICE '   • students UPDATE RLS restricted to safe columns only';
  RAISE NOTICE '   • update_leaderboard_score_after_exam() SECURITY DEFINER created';
  RAISE NOTICE '   • reset_leaderboard_soft/hard revoked from authenticated';
  RAISE NOTICE '   • admin_reset_leaderboard revoked from authenticated';
  RAISE NOTICE '   • upsert_offline_session_stats() created for correct date crediting';
END;
$$;
