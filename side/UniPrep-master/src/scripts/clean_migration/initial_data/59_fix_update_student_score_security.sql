-- Hotfix 59: Security hardening for update_student_score + fix update_leaderboard_score_after_exam
--
-- PROBLEM 1 — SECURITY: update_student_score (hotfix 58) has SECURITY DEFINER but NO ownership
-- check. Any authenticated user can call supabase.rpc('update_student_score', {
--   p_student_id: 'victim_uuid', p_exam_score: 0 }) to manipulate another student's ELO.
-- FIX: Add the same anti-spoofing check that update_leaderboard_score_after_exam uses:
--   verify auth.uid() owns the p_student_id record before touching it.
--
-- PROBLEM 2 — UNDEFINED RETURN: The live DB may have an older version of
-- update_leaderboard_score_after_exam that returns only new_leaderboard_score, missing
-- the new_elo and elo_change columns → TypeScript sees {delta: undefined, elo: undefined}.
-- FIX: Re-CREATE the function with the full 3-column RETURNS TABLE.
--
-- PROBLEM 3 — DOUBLE ELO: After hotfix 58, update_student_score succeeds from both:
--   (a) mockExamService.submitExam() → scoringService.updateScore() [direct RPC call]
--   (b) update_leaderboard_score_after_exam → internal update_student_score call
-- This applied ELO twice per exam. The TypeScript direct call (a) has been removed.
-- update_leaderboard_score_after_exam is now the single authoritative ELO update path.
--
-- Run after hotfix 58.

-- ============================================================
-- PART 1: update_student_score with ownership check
-- ============================================================

CREATE OR REPLACE FUNCTION update_student_score(
  p_student_id       UUID,
  p_exam_score       DECIMAL,
  p_difficulty       TEXT    DEFAULT 'medium',
  p_transaction_type TEXT    DEFAULT 'exam_completion'
)
RETURNS TABLE(
  new_elo       INTEGER,
  elo_change    INTEGER,
  activity_mult DECIMAL,
  bonus_pts     INTEGER,
  total_score   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller              UUID    := auth.uid();
  v_current_elo         INTEGER;
  v_k_factor            INTEGER;
  v_total_exams         INTEGER;
  v_elo_change          INTEGER;
  v_new_elo             INTEGER;
  v_activity_multiplier DECIMAL;
  v_bonus_points        INTEGER;
  v_monthly_score       INTEGER;
  v_min_elo             INTEGER;
  v_max_elo             INTEGER;
BEGIN
  -- Anti-spoofing: reject any caller trying to update a student they don't own.
  -- The IS NOT NULL guard allows internal/service-role calls where auth.uid() is null.
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT elo_rating, k_factor, total_exams_taken
  INTO   v_current_elo, v_k_factor, v_total_exams
  FROM   students
  WHERE  id = p_student_id;

  SELECT
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'min_elo_rating'),
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'max_elo_rating')
  INTO v_min_elo, v_max_elo;

  v_elo_change          := calculate_elo_change(v_current_elo, p_exam_score, v_k_factor, p_difficulty);
  v_new_elo             := GREATEST(v_min_elo, LEAST(v_max_elo, v_current_elo + v_elo_change));
  v_activity_multiplier := calculate_activity_multiplier(p_student_id);
  v_bonus_points        := calculate_bonus_points(p_student_id);
  v_monthly_score       := ROUND((v_new_elo * v_activity_multiplier) + v_bonus_points);

  v_total_exams := v_total_exams + 1;
  v_k_factor    := CASE
    WHEN v_total_exams < 10 THEN 40
    WHEN v_total_exams < 30 THEN 20
    ELSE 10
  END;

  UPDATE students
  SET
    elo_rating          = v_new_elo,
    monthly_score       = v_monthly_score,
    total_exams_taken   = v_total_exams,
    activity_multiplier = v_activity_multiplier,
    bonus_points        = v_bonus_points,
    k_factor            = v_k_factor,
    last_score_update   = NOW(),
    updated_at          = NOW()
  WHERE id = p_student_id;

  INSERT INTO score_transactions (
    student_id, transaction_type, elo_change, previous_elo, new_elo,
    activity_multiplier, bonus_points, exam_score, exam_difficulty
  ) VALUES (
    p_student_id, p_transaction_type, v_elo_change, v_current_elo, v_new_elo,
    v_activity_multiplier, v_bonus_points, p_exam_score, p_difficulty
  );

  RETURN QUERY SELECT v_new_elo, v_elo_change, v_activity_multiplier, v_bonus_points, v_monthly_score;
END;
$$;

GRANT EXECUTE ON FUNCTION update_student_score(UUID, DECIMAL, TEXT, TEXT) TO authenticated;

-- ============================================================
-- PART 2: Re-create update_leaderboard_score_after_exam
-- Ensures the live DB has the correct 3-column RETURNS TABLE.
-- Body is identical to hotfix 32; only the header is guaranteed.
-- DROP first because CREATE OR REPLACE cannot change an existing return type.
-- ============================================================

DROP FUNCTION IF EXISTS update_leaderboard_score_after_exam(UUID, UUID);

CREATE OR REPLACE FUNCTION update_leaderboard_score_after_exam(
  p_student_id UUID,
  p_attempt_id UUID
)
RETURNS TABLE(
  new_leaderboard_score DECIMAL,
  new_elo               INTEGER,
  elo_change            INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_attempt_user_id    UUID;
  v_exam_percentage    DECIMAL;
  v_leaderboard_score  DECIMAL;
  v_elo_result         RECORD;
  v_weights            DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum       DECIMAL   := 0;
  v_total_weight       DECIMAL   := 0;
  v_recent_exams       RECORD;
  v_idx                INTEGER   := 0;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Verify student ownership (anti-spoofing)
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to caller';
  END IF;

  -- 3. Verify the exam attempt is real, completed, and belongs to the caller
  SELECT percentage, user_id
  INTO   v_exam_percentage, v_attempt_user_id
  FROM   mock_exam_attempts
  WHERE  id      = p_attempt_id
    AND  user_id = v_user_id
    AND  status  = 'completed'
    AND  percentage IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  -- 4. Fetch last 4 completed exam percentages (weighted average)
  FOR v_recent_exams IN
    SELECT percentage
    FROM   mock_exam_attempts
    WHERE  user_id  = v_user_id
      AND  status   = 'completed'
      AND  percentage IS NOT NULL
    ORDER  BY completed_at DESC
    LIMIT  4
  LOOP
    IF    v_idx = 0 THEN v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[1]; v_total_weight := v_total_weight + v_weights[1];
    ELSIF v_idx = 1 THEN v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[2]; v_total_weight := v_total_weight + v_weights[2];
    ELSIF v_idx = 2 THEN v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[3]; v_total_weight := v_total_weight + v_weights[3];
    ELSIF v_idx = 3 THEN v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[4]; v_total_weight := v_total_weight + v_weights[4];
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  -- 5. Weighted leaderboard score
  IF v_total_weight > 0 THEN
    v_leaderboard_score := ROUND(v_weighted_sum / v_total_weight, 2);
  ELSE
    v_leaderboard_score := ROUND(v_exam_percentage, 2);
  END IF;

  -- 6. Write leaderboard_score (SECURITY DEFINER bypasses protections on this column)
  UPDATE students
  SET    leaderboard_score = v_leaderboard_score,
         updated_at        = NOW()
  WHERE  id = p_student_id;

  -- 7. Update ELO / monthly_score atomically (single authoritative ELO path)
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
    v_leaderboard_score              AS new_leaderboard_score,
    COALESCE(v_elo_result.new_elo,    0) AS new_elo,
    COALESCE(v_elo_result.elo_change, 0) AS elo_change;
END;
$$;

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
