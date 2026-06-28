-- Hotfix 93: Sync visible leaderboard points after official exam completion
-- Date: 2026-05-26
--
-- Problem:
--   Hotfix 90 made leaderboard reads and ranks use students.monthly_score.
--   update_leaderboard_score_after_exam still updated only students.leaderboard_score,
--   so mobile/web RPC calls succeeded but the visible leaderboard points did not move.
--
-- Fix:
--   Keep the existing hybrid leaderboard_score calculation, but also call
--   update_student_score() for official exams so elo_rating/monthly_score are refreshed.
--   Teacher exams still return zeros and do not affect leaderboard points.
--
-- Rollback:
--   Re-run the previous update_leaderboard_score_after_exam definition from hotfix 73
--   or from the pre-hotfix 93 consolidated 04_functions_triggers.sql.

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
  v_elo_result        RECORD;
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

  SELECT mea.percentage, me.is_official
  INTO   v_exam_percentage, v_is_official
  FROM   mock_exam_attempts mea
  JOIN   mock_exams me ON me.id = mea.mock_exam_id
  WHERE  mea.id      = p_attempt_id
    AND  mea.user_id = v_user_id
    AND  mea.status  = 'completed'
    AND  mea.percentage IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  IF NOT COALESCE(v_is_official, TRUE) THEN
    RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
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

  UPDATE students
  SET    leaderboard_score = v_final_score,
         practice_score = v_practice_score,
         updated_at = NOW()
  WHERE  id = p_student_id;

  SELECT *
  INTO v_elo_result
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

  RETURN QUERY
  SELECT
    v_final_score              AS new_leaderboard_score,
    ROUND(v_exam_score, 2)     AS exam_component,
    v_practice_score           AS practice_component,
    v_streak_bonus             AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Hybrid scoring RPC for official exams. Updates leaderboard_score and refreshes visible monthly_score/ELO via update_student_score. Teacher exams return zeros.';

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
