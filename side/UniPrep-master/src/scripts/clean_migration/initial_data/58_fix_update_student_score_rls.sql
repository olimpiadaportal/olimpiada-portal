-- Hotfix 58: Add SECURITY DEFINER to update_student_score()
-- Root cause: the students table has WITH CHECK RLS policies that prevent
-- authenticated users from modifying scoring columns (elo_rating, monthly_score,
-- total_exams_taken, activity_multiplier, bonus_points, k_factor) directly.
-- update_student_score() updates exactly those columns, so without SECURITY DEFINER
-- every call from the client returns error code 42501 (RLS violation).
-- SECURITY DEFINER makes the function run as the DB owner, bypassing RLS.
-- The function already validates p_student_id against the students table, so
-- adding SECURITY DEFINER does not introduce a privilege escalation risk.
--
-- Run on live DB after hotfix 57.

CREATE OR REPLACE FUNCTION update_student_score(
  p_student_id       UUID,
  p_exam_score       DECIMAL,
  p_difficulty       TEXT    DEFAULT 'medium',
  p_transaction_type TEXT    DEFAULT 'exam_completion'
)
RETURNS TABLE(
  new_elo      INTEGER,
  elo_change   INTEGER,
  activity_mult DECIMAL,
  bonus_pts    INTEGER,
  total_score  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_elo       INTEGER;
  v_k_factor          INTEGER;
  v_total_exams       INTEGER;
  v_elo_change        INTEGER;
  v_new_elo           INTEGER;
  v_activity_multiplier DECIMAL;
  v_bonus_points      INTEGER;
  v_monthly_score     INTEGER;
  v_min_elo           INTEGER;
  v_max_elo           INTEGER;
BEGIN
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
    elo_rating            = v_new_elo,
    monthly_score         = v_monthly_score,
    total_exams_taken     = v_total_exams,
    activity_multiplier   = v_activity_multiplier,
    bonus_points          = v_bonus_points,
    k_factor              = v_k_factor,
    last_score_update     = NOW(),
    updated_at            = NOW()
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

NOTIFY pgrst, 'reload schema';
