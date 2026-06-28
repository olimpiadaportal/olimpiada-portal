-- Hotfix 97: Keep admin ELO adjustments from rewriting visible leaderboard points
-- Date: 2026-05-27
--
-- Context:
--   The main leaderboard is now intentionally official-exam based. The visible
--   leaderboard value lives in students.monthly_score and is owned by
--   update_leaderboard_score_after_exam().
--
-- Problem:
--   admin_adjust_student_score() still recalculated monthly_score from the old
--   ELO/activity/bonus formula.
--
-- Fix:
--   Admin ELO adjustments continue to update ELO and audit history, but they no
--   longer rewrite visible leaderboard points. A future dedicated admin override
--   can be added if manual visible leaderboard correction is needed.

CREATE OR REPLACE FUNCTION admin_adjust_student_score(
  p_admin_id UUID,
  p_student_id UUID,
  p_elo_adjustment INTEGER,
  p_reason TEXT
)
RETURNS TABLE(old_elo INTEGER, new_elo INTEGER, adjustment INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_old_elo INTEGER;
  v_new_elo INTEGER;
  v_min_elo INTEGER;
  v_max_elo INTEGER;
BEGIN
  SELECT user_type = 'admin' INTO v_is_admin FROM profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT elo_rating INTO v_old_elo FROM students WHERE id = p_student_id;
  IF v_old_elo IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'min_elo_rating'),
    (SELECT setting_value::INTEGER FROM leaderboard_settings WHERE setting_key = 'max_elo_rating')
  INTO v_min_elo, v_max_elo;

  v_new_elo := GREATEST(v_min_elo, LEAST(v_max_elo, v_old_elo + p_elo_adjustment));

  UPDATE students
  SET elo_rating = v_new_elo,
      last_score_update = NOW(),
      updated_at = NOW()
  WHERE id = p_student_id;

  INSERT INTO score_transactions (
    student_id, transaction_type, elo_change, previous_elo, new_elo, admin_id, notes
  ) VALUES (p_student_id, 'admin_adjustment', v_new_elo - v_old_elo, v_old_elo, v_new_elo, p_admin_id, p_reason);

  PERFORM refresh_leaderboard_cache();
  RETURN QUERY SELECT v_old_elo, v_new_elo, v_new_elo - v_old_elo;
END;
$$;

NOTIFY pgrst, 'reload schema';
