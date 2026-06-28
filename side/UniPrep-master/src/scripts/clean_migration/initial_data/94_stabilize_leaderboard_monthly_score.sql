-- Hotfix 94: Stabilize visible leaderboard score recalculation
-- Date: 2026-05-26
--
-- Problems:
--   1. calculate_activity_multiplier looked for activity types
--      ('quiz_completed', 'exam_completed') that activity_log does not allow.
--      Exam rows are stored as 'mock_exam', so exam activity was ignored.
--   2. update_leaderboard_score_after_exam could apply the ELO/monthly score
--      update more than once if the same completed attempt was submitted again.
--   3. The RPC returned the stored hybrid component as new_leaderboard_score,
--      while the visible leaderboard uses monthly_score.
--
-- Fix:
--   - Count activity days from activity_log, completed official exam attempts,
--     and completed practice sessions using Asia/Baku day boundaries.
--   - Mark each exam attempt once leaderboard scoring is applied and lock the
--     attempt row during scoring.
--   - Return the visible monthly_score as new_leaderboard_score.

ALTER TABLE mock_exam_attempts
  ADD COLUMN IF NOT EXISTS leaderboard_score_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN mock_exam_attempts.leaderboard_score_updated_at IS
  'Set when official exam leaderboard/ELO scoring has been applied; prevents duplicate scoring for the same attempt.';

CREATE OR REPLACE FUNCTION calculate_activity_multiplier(
  p_student_id UUID
)
RETURNS DECIMAL
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_days INTEGER;
  v_multiplier DECIMAL;
BEGIN
  WITH active_days AS (
    SELECT (created_at AT TIME ZONE 'Asia/Baku')::DATE AS active_date
    FROM activity_log
    WHERE student_id = p_student_id
      AND created_at >= NOW() - INTERVAL '30 days'
      AND activity_type IN ('practice_session', 'mock_exam')

    UNION

    SELECT (mea.completed_at AT TIME ZONE 'Asia/Baku')::DATE AS active_date
    FROM mock_exam_attempts mea
    JOIN students s ON s.user_id = mea.user_id
    JOIN mock_exams me ON me.id = mea.mock_exam_id
    WHERE s.id = p_student_id
      AND mea.status = 'completed'
      AND mea.completed_at >= NOW() - INTERVAL '30 days'
      AND COALESCE(me.is_official, TRUE) = TRUE

    UNION

    SELECT (ps.completed_at AT TIME ZONE 'Asia/Baku')::DATE AS active_date
    FROM practice_sessions ps
    JOIN students s ON s.user_id = ps.user_id
    WHERE s.id = p_student_id
      AND ps.completed = TRUE
      AND ps.completed_at >= NOW() - INTERVAL '30 days'
  )
  SELECT COUNT(DISTINCT active_date)
  INTO v_active_days
  FROM active_days
  WHERE active_date IS NOT NULL;

  v_multiplier := LEAST(1.5, 0.5 + (v_active_days::DECIMAL / 30.0));

  RETURN ROUND(v_multiplier, 2);
END;
$$;

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
  v_new_visible_score DECIMAL;
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

  UPDATE students
  SET    leaderboard_score = v_final_score,
         practice_score = v_practice_score,
         updated_at = NOW()
  WHERE  id = p_student_id;

  SELECT total_score
  INTO v_new_visible_score
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

  UPDATE mock_exam_attempts
  SET leaderboard_score_updated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_attempt_id;

  RETURN QUERY
  SELECT
    COALESCE(v_new_visible_score, v_final_score) AS new_leaderboard_score,
    ROUND(v_exam_score, 2) AS exam_component,
    v_practice_score AS practice_component,
    v_streak_bonus AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Official exam leaderboard scoring. Returns visible monthly_score as new_leaderboard_score and keeps hybrid leaderboard_score as a stored component. Validates ownership, excludes teacher exams, and is idempotent per attempt.';

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
