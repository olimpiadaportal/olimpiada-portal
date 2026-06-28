-- Hotfix 96: Make monthly_score official-leaderboard owned
-- Date: 2026-05-26
--
-- Problem:
--   Hotfix 95 made official exam leaderboard points performance-based, but the
--   generic update_student_score() RPC still wrote students.monthly_score using
--   the older ELO * activity_multiplier + bonus formula. Practice quiz and
--   competitive flows call update_student_score(), so they could overwrite the
--   visible leaderboard score after an official exam.
--
-- Fix:
--   update_student_score() now updates ELO, k-factor, activity multiplier, bonus
--   metadata, and score_transactions, but preserves the current monthly_score.
--   The visible leaderboard score is owned by update_leaderboard_score_after_exam().

CREATE OR REPLACE FUNCTION update_student_score(
  p_student_id UUID,
  p_exam_score DECIMAL,
  p_difficulty TEXT DEFAULT 'medium',
  p_transaction_type TEXT DEFAULT 'exam_completion'
)
RETURNS TABLE(
  new_elo INTEGER,
  elo_change INTEGER,
  activity_mult DECIMAL,
  bonus_pts INTEGER,
  total_score INTEGER
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
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT elo_rating, k_factor, total_exams_taken, COALESCE(monthly_score, 0)
  INTO v_current_elo, v_k_factor, v_total_exams, v_monthly_score
  FROM students
  WHERE id = p_student_id;

  SELECT
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'min_elo_rating'),
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'max_elo_rating')
  INTO v_min_elo, v_max_elo;

  v_elo_change := calculate_elo_change(v_current_elo, p_exam_score, v_k_factor, p_difficulty);
  v_new_elo := GREATEST(v_min_elo, LEAST(v_max_elo, v_current_elo + v_elo_change));
  v_activity_multiplier := calculate_activity_multiplier(p_student_id);
  v_bonus_points := calculate_bonus_points(p_student_id);

  v_total_exams := v_total_exams + 1;
  v_k_factor := CASE
    WHEN v_total_exams < 10 THEN 40
    WHEN v_total_exams < 30 THEN 20
    ELSE 10
  END;

  UPDATE students
  SET elo_rating = v_new_elo,
      total_exams_taken = v_total_exams,
      activity_multiplier = v_activity_multiplier,
      bonus_points = v_bonus_points,
      k_factor = v_k_factor,
      last_score_update = NOW(),
      updated_at = NOW()
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

UPDATE students
SET monthly_score = GREATEST(0, LEAST(1000, ROUND(COALESCE(leaderboard_score, 0) * 10))),
    updated_at = NOW()
WHERE leaderboard_score IS NOT NULL
  AND leaderboard_score > 0;

NOTIFY pgrst, 'reload schema';
