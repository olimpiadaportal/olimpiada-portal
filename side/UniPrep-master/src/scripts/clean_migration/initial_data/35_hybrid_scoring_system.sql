-- Migration: Hybrid Scoring System
-- Date: 2026-02-28
-- Description: Implements hybrid scoring for leaderboard:
--   70% from exam scores (weighted average of last 4 exams)
--   20% from practice sessions (based on questions answered correctly)
--   10% from streak bonus (current streak days)
-- Also removes ELO-based ranking from user-facing calculations

-- ============================================================================
-- 1. Add practice_score column to students table for tracking practice contribution
-- ============================================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS practice_score DECIMAL(5,2) DEFAULT 0;

COMMENT ON COLUMN students.practice_score IS 'Practice session contribution to leaderboard (0-100 scale)';

-- ============================================================================
-- 2. Create function to calculate practice score from recent practice sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_practice_score(p_user_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_practice_score DECIMAL := 0;
  v_total_correct INTEGER := 0;
  v_total_questions INTEGER := 0;
  v_accuracy DECIMAL;
BEGIN
  -- Get practice stats from last 30 days
  SELECT 
    COALESCE(SUM(correct_answers), 0),
    COALESCE(SUM(total_questions), 0)
  INTO v_total_correct, v_total_questions
  FROM practice_sessions
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
    AND total_questions > 0;

  -- Calculate accuracy-based score (0-100)
  IF v_total_questions > 0 THEN
    v_accuracy := (v_total_correct::DECIMAL / v_total_questions) * 100;
    -- Apply diminishing returns for very high question counts
    -- Base score is accuracy, with bonus for volume (max 10 points)
    v_practice_score := LEAST(100, v_accuracy + LEAST(10, v_total_questions / 50.0));
  END IF;

  RETURN ROUND(v_practice_score, 2);
END;
$$;

COMMENT ON FUNCTION calculate_practice_score IS 
  'Calculates practice contribution score (0-100) based on accuracy and volume from last 30 days';

-- ============================================================================
-- 3. Create function to calculate streak bonus
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_streak_bonus(p_student_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current_streak INTEGER := 0;
  v_streak_bonus DECIMAL := 0;
BEGIN
  -- Get current streak from students table
  SELECT COALESCE(current_streak, 0)
  INTO v_current_streak
  FROM students
  WHERE id = p_student_id;

  -- Calculate streak bonus (0-100 scale)
  -- 7-day streak = 50 points, 14-day = 75 points, 30-day = 100 points
  IF v_current_streak >= 30 THEN
    v_streak_bonus := 100;
  ELSIF v_current_streak >= 14 THEN
    v_streak_bonus := 75 + ((v_current_streak - 14) * 1.5625); -- scales to 100 at 30
  ELSIF v_current_streak >= 7 THEN
    v_streak_bonus := 50 + ((v_current_streak - 7) * 3.57); -- scales to 75 at 14
  ELSIF v_current_streak > 0 THEN
    v_streak_bonus := v_current_streak * 7.14; -- scales to 50 at 7
  END IF;

  RETURN ROUND(LEAST(100, v_streak_bonus), 2);
END;
$$;

COMMENT ON FUNCTION calculate_streak_bonus IS 
  'Calculates streak bonus (0-100) based on current streak days. 7d=50, 14d=75, 30d=100';

-- ============================================================================
-- 4. Update the main leaderboard scoring function for hybrid scoring
-- ============================================================================
-- Drop existing function first because return type is changing
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
  v_exam_score        DECIMAL := 0;
  v_practice_score    DECIMAL := 0;
  v_streak_bonus      DECIMAL := 0;
  v_final_score       DECIMAL;
  v_weights           DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum      DECIMAL   := 0;
  v_total_weight      DECIMAL   := 0;
  v_recent_exams      RECORD;
  v_idx               INTEGER   := 0;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Verify student ownership
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to caller';
  END IF;

  -- 3. Verify the exam attempt is real, completed, and belongs to caller
  SELECT percentage
  INTO   v_exam_percentage
  FROM   mock_exam_attempts
  WHERE  id        = p_attempt_id
    AND  user_id   = v_user_id
    AND  status    = 'completed'
    AND  percentage IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  -- 4. Calculate EXAM SCORE (70% weight) - weighted average of last 4 exams
  FOR v_recent_exams IN
    SELECT percentage
    FROM   mock_exam_attempts
    WHERE  user_id   = v_user_id
      AND  status    = 'completed'
      AND  percentage IS NOT NULL
    ORDER  BY completed_at DESC
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

  -- 5. Calculate PRACTICE SCORE (20% weight)
  v_practice_score := calculate_practice_score(v_user_id);

  -- 6. Calculate STREAK BONUS (10% weight)
  v_streak_bonus := calculate_streak_bonus(p_student_id);

  -- 7. Calculate FINAL HYBRID SCORE
  -- Formula: (exam_score * 0.70) + (practice_score * 0.20) + (streak_bonus * 0.10)
  v_final_score := ROUND(
    (v_exam_score * 0.70) + 
    (v_practice_score * 0.20) + 
    (v_streak_bonus * 0.10), 
    2
  );

  -- 8. Update student's leaderboard score and practice score
  UPDATE students
  SET    leaderboard_score = v_final_score,
         practice_score = v_practice_score,
         updated_at = NOW()
  WHERE  id = p_student_id;

  RETURN QUERY
  SELECT
    v_final_score      AS new_leaderboard_score,
    ROUND(v_exam_score, 2)     AS exam_component,
    v_practice_score   AS practice_component,
    v_streak_bonus     AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Hybrid scoring: 70% exam (weighted avg of last 4), 20% practice (30-day accuracy), 10% streak bonus. '
  'Validates ownership + attempt authenticity. Clients call via RPC.';

-- ============================================================================
-- 5. Create function to recalculate leaderboard score without new exam
--    (useful for daily updates based on practice/streak changes)
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_leaderboard_score(p_student_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_exam_score        DECIMAL := 0;
  v_practice_score    DECIMAL := 0;
  v_streak_bonus      DECIMAL := 0;
  v_final_score       DECIMAL;
  v_weights           DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum      DECIMAL   := 0;
  v_total_weight      DECIMAL   := 0;
  v_recent_exams      RECORD;
  v_idx               INTEGER   := 0;
BEGIN
  -- Get user_id for this student
  SELECT user_id INTO v_user_id FROM students WHERE id = p_student_id;
  
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate exam score from last 4 exams
  FOR v_recent_exams IN
    SELECT percentage
    FROM   mock_exam_attempts
    WHERE  user_id   = v_user_id
      AND  status    = 'completed'
      AND  percentage IS NOT NULL
    ORDER  BY completed_at DESC
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
  END IF;

  -- Calculate practice and streak scores
  v_practice_score := calculate_practice_score(v_user_id);
  v_streak_bonus := calculate_streak_bonus(p_student_id);

  -- Calculate final score
  v_final_score := ROUND(
    (v_exam_score * 0.70) + 
    (v_practice_score * 0.20) + 
    (v_streak_bonus * 0.10), 
    2
  );

  -- Update student record
  UPDATE students
  SET    leaderboard_score = v_final_score,
         practice_score = v_practice_score,
         updated_at = NOW()
  WHERE  id = p_student_id;

  RETURN v_final_score;
END;
$$;

COMMENT ON FUNCTION recalculate_leaderboard_score IS
  'Recalculates hybrid leaderboard score for a student without requiring a new exam. '
  'Useful for daily batch updates to reflect practice/streak changes.';

-- ============================================================================
-- 6. Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION calculate_practice_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_streak_bonus(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_leaderboard_score(UUID) TO authenticated;

-- ============================================================================
-- 7. Update leaderboard settings to reflect new scoring system
-- ============================================================================
INSERT INTO leaderboard_settings (setting_key, setting_value, description)
VALUES 
  ('exam_weight', '0.70', 'Weight of exam scores in hybrid leaderboard calculation'),
  ('practice_weight', '0.20', 'Weight of practice sessions in hybrid leaderboard calculation'),
  ('streak_weight', '0.10', 'Weight of streak bonus in hybrid leaderboard calculation')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- Done! Hybrid scoring system is now active.
-- Score breakdown: 70% exams + 20% practice + 10% streak
-- ============================================================================
