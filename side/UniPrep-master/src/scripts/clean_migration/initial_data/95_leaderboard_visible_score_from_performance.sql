-- Hotfix 95: Make visible leaderboard points performance-based
-- Date: 2026-05-26
--
-- Problem:
--   Hotfix 94 made the RPC return visible monthly_score, but monthly_score was
--   still calculated as ELO * activity_multiplier + bonus_points. That allows a
--   very low official exam score to increase leaderboard points when activity
--   multiplier or streak bonus rises.
--
-- Fix:
--   Keep ELO updates and score_transactions for internal history, but make the
--   visible leaderboard points use the existing hybrid performance component:
--     visible points = round((70% exam + 20% practice + 10% streak) * 10)
--   This keeps the user-facing leaderboard in a 0-1000 point range and prevents
--   low official exam results from jumping upward due to activity alone.

ALTER TABLE mock_exam_attempts
  ADD COLUMN IF NOT EXISTS leaderboard_score_updated_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS update_leaderboard_score_after_exam(UUID, UUID);

CREATE OR REPLACE FUNCTION update_leaderboard_score_after_exam(
  p_student_id  UUID,
  p_attempt_id  UUID
)
RETURNS TABLE(
  new_leaderboard_score  DECIMAL,
  exam_component         DECIMAL,
  practice_component     DECIMAL,
  streak_component       DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_exam_percentage   DECIMAL;
  v_is_official       BOOLEAN;
  v_exam_score        DECIMAL := 0;
  v_practice_score    DECIMAL := 0;
  v_streak_bonus      DECIMAL := 0;
  v_final_score       DECIMAL;
  v_weights           DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum      DECIMAL   := 0;
  v_total_weight      DECIMAL   := 0;
  v_recent_exams      RECORD;
  v_processed_at      TIMESTAMPTZ;
  v_current_visible_score DECIMAL;
  v_visible_score     INTEGER;
  v_idx               INTEGER   := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to caller';
  END IF;

  SELECT mea.percentage, me.is_official, mea.leaderboard_score_updated_at
  INTO   v_exam_percentage, v_is_official, v_processed_at
  FROM   mock_exam_attempts mea
  JOIN   mock_exams me ON me.id = mea.mock_exam_id
  WHERE  mea.id      = p_attempt_id
    AND  mea.user_id = v_user_id
    AND  mea.status  = 'completed'
    AND  mea.percentage IS NOT NULL
  FOR UPDATE OF mea;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  IF NOT COALESCE(v_is_official, TRUE) THEN
    RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;

  IF v_processed_at IS NOT NULL THEN
    SELECT s.monthly_score::DECIMAL
    INTO v_current_visible_score
    FROM students s
    WHERE s.id = p_student_id;

    RETURN QUERY
    SELECT
      COALESCE(v_current_visible_score, 0::DECIMAL) AS new_leaderboard_score,
      v_exam_percentage                             AS exam_component,
      COALESCE((SELECT practice_score FROM students WHERE id = p_student_id), 0)::DECIMAL AS practice_component,
      calculate_streak_bonus(p_student_id)          AS streak_component;
    RETURN;
  END IF;

  FOR v_recent_exams IN
    SELECT mea2.percentage
    FROM   mock_exam_attempts mea2
    JOIN   mock_exams me2 ON me2.id = mea2.mock_exam_id
    WHERE  mea2.user_id    = v_user_id
      AND  mea2.status     = 'completed'
      AND  mea2.percentage IS NOT NULL
      AND  me2.is_official = TRUE
    ORDER  BY mea2.completed_at DESC
    LIMIT  4
  LOOP
    IF v_idx < 4 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[v_idx + 1];
      v_total_weight := v_total_weight + v_weights[v_idx + 1];
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_total_weight > 0 THEN
    v_exam_score := v_weighted_sum / v_total_weight;
  ELSE
    v_exam_score := v_exam_percentage;
  END IF;

  v_practice_score := calculate_practice_score(v_user_id);
  v_streak_bonus := calculate_streak_bonus(p_student_id);

  v_final_score := ROUND(
    (v_exam_score * 0.70) +
    (v_practice_score * 0.20) +
    (v_streak_bonus * 0.10),
    2
  );

  v_visible_score := GREATEST(0, LEAST(1000, ROUND(v_final_score * 10)));

  UPDATE students
  SET leaderboard_score = v_final_score,
      practice_score = v_practice_score,
      updated_at = NOW()
  WHERE id = p_student_id;

  PERFORM 1
  FROM update_student_score(
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

  UPDATE students
  SET monthly_score = v_visible_score,
      last_score_update = NOW(),
      updated_at = NOW()
  WHERE id = p_student_id;

  UPDATE mock_exam_attempts
  SET leaderboard_score_updated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_attempt_id;

  RETURN QUERY
  SELECT
    v_visible_score::DECIMAL AS new_leaderboard_score,
    ROUND(v_exam_score, 2) AS exam_component,
    v_practice_score AS practice_component,
    v_streak_bonus AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Official exam leaderboard scoring. Stores visible monthly_score as hybrid performance points from 0 to 1000 and returns it as new_leaderboard_score. Excludes teacher exams and is idempotent per attempt.';

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

UPDATE students
SET monthly_score = GREATEST(0, LEAST(1000, ROUND(COALESCE(leaderboard_score, 0) * 10))),
    updated_at = NOW()
WHERE leaderboard_score IS NOT NULL
  AND leaderboard_score > 0;

NOTIFY pgrst, 'reload schema';
