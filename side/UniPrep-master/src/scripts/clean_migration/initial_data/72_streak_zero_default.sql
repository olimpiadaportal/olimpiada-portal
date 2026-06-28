-- ============================================================================
-- 72_streak_zero_default.sql
-- Fix: Streak should be 0 (unconfirmed) until first activity
-- ============================================================================
-- Problem: New users start with current_streak=1, and broken streaks reset to 1.
--          Users see "1 Day Streak" without ever doing any activity.
-- Fix:     Default to 0, gap resets to 0. First activity confirms day 1.
-- ============================================================================

-- 1. Change column defaults for new signups
ALTER TABLE students ALTER COLUMN current_streak SET DEFAULT 0;
ALTER TABLE students ALTER COLUMN best_streak SET DEFAULT 0;

-- NOTE: We do NOT bulk-update existing users' streaks.
-- Existing active users keep their current values.
-- The new logic only affects:
--   a) New signups (start at 0 instead of 1)
--   b) Broken streaks (reset to 0 instead of 1, then bump to 1 on next activity)

-- 2. Updated calculate_streak_realtime: gap returns 0 instead of 1
CREATE OR REPLACE FUNCTION calculate_streak_realtime(
  p_student_id UUID,
  p_activity_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  current_streak INTEGER,
  streak_status TEXT,
  hours_until_loss INTEGER,
  is_new_record BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_activity TIMESTAMPTZ;
  v_current_streak INTEGER;
  v_best_streak INTEGER;
  v_user_timezone TEXT;
  v_hours_since_last NUMERIC;
  v_last_activity_date DATE;
  v_current_activity_date DATE;
  v_new_streak INTEGER;
  v_yesterday_active BOOLEAN;
BEGIN
  SELECT
    last_activity_timestamp,
    s.current_streak,
    best_streak,
    user_timezone
  INTO
    v_last_activity,
    v_current_streak,
    v_best_streak,
    v_user_timezone
  FROM students s
  WHERE id = p_student_id;

  v_user_timezone := COALESCE(v_user_timezone, 'Asia/Baku');

  -- First activity ever (or no activity recorded yet)
  IF v_last_activity IS NULL THEN
    -- If current_streak is 0, user has never done activity — return 0
    -- If current_streak > 0, this is a recalc during activity — return 1
    IF v_current_streak = 0 THEN
      RETURN QUERY SELECT
        0::INTEGER,
        'active'::TEXT,
        24::INTEGER,
        FALSE::BOOLEAN;
    ELSE
      RETURN QUERY SELECT
        1::INTEGER,
        'active'::TEXT,
        24::INTEGER,
        (1 > COALESCE(v_best_streak, 0))::BOOLEAN;
    END IF;
    RETURN;
  END IF;

  v_last_activity_date := (v_last_activity AT TIME ZONE v_user_timezone)::DATE;
  v_current_activity_date := (p_activity_timestamp AT TIME ZONE v_user_timezone)::DATE;
  v_hours_since_last := EXTRACT(EPOCH FROM (p_activity_timestamp - v_last_activity)) / 3600;

  -- Same day: keep streak unchanged (but at least 1 if user has activity today)
  IF v_current_activity_date = v_last_activity_date THEN
    v_new_streak := GREATEST(v_current_streak, 1);
    RETURN QUERY SELECT
      v_new_streak,
      'active'::TEXT,
      24::INTEGER,
      (v_new_streak > COALESCE(v_best_streak, 0))::BOOLEAN;
    RETURN;
  END IF;

  -- Check if yesterday was active (via daily_stats ground truth)
  SELECT EXISTS(
    SELECT 1 FROM daily_stats
    WHERE student_id = p_student_id
      AND date = v_current_activity_date - 1
      AND is_active = TRUE
  ) INTO v_yesterday_active;

  IF v_yesterday_active OR (v_current_activity_date - v_last_activity_date) = 1 THEN
    -- Consecutive day: increment
    v_new_streak := COALESCE(v_current_streak, 0) + 1;
    RETURN QUERY SELECT
      v_new_streak,
      'active'::TEXT,
      24::INTEGER,
      (v_new_streak > COALESCE(v_best_streak, 0))::BOOLEAN;
  ELSE
    -- Gap detected: reset to 0 (unconfirmed until next activity)
    RETURN QUERY SELECT
      0::INTEGER,
      'lost'::TEXT,
      24::INTEGER,
      FALSE::BOOLEAN;
  END IF;
END;
$$;

-- 3. Updated update_streak_on_activity: bumps 0→1 on activity after gap
CREATE OR REPLACE FUNCTION update_streak_on_activity(
  p_student_id   UUID,
  p_activity_type TEXT DEFAULT 'practice'
)
RETURNS TABLE(
  new_streak    INTEGER,
  streak_status TEXT,
  message       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        UUID;
  v_streak_result RECORD;
  v_old_streak    INTEGER;
  v_best_streak   INTEGER;
  v_user_timezone TEXT;
  v_local_date    DATE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT s.current_streak, s.best_streak, COALESCE(s.user_timezone, 'Asia/Baku')
  INTO   v_old_streak, v_best_streak, v_user_timezone
  FROM   students s
  WHERE  id = p_student_id;

  v_local_date := (NOW() AT TIME ZONE v_user_timezone)::DATE;

  SELECT * INTO v_streak_result
  FROM calculate_streak_realtime(p_student_id, NOW());

  -- If streak is 0 after calculation, bump to 1 (user is doing activity right now)
  -- This covers: first-ever activity AND first activity after a gap
  IF v_streak_result.current_streak = 0 THEN
    v_streak_result.current_streak := 1;
  END IF;

  UPDATE students
  SET
    current_streak          = v_streak_result.current_streak,
    best_streak             = GREATEST(COALESCE(best_streak, 0), v_streak_result.current_streak),
    last_activity_timestamp = NOW(),
    last_active_date        = v_local_date,
    updated_at              = NOW()
  WHERE id = p_student_id;

  IF v_streak_result.current_streak > v_old_streak THEN
    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_streak_result.current_streak, 'streak_gained', 'Activity: ' || p_activity_type);
  ELSIF v_streak_result.current_streak < v_old_streak THEN
    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_streak_result.current_streak, 'streak_lost',
      'Streak reset from ' || v_old_streak || ' to ' || v_streak_result.current_streak);
  END IF;

  RETURN QUERY SELECT
    v_streak_result.current_streak,
    v_streak_result.streak_status,
    CASE
      WHEN v_streak_result.is_new_record THEN
        'New record! ' || v_streak_result.current_streak || ' day streak!'
      WHEN v_streak_result.current_streak > v_old_streak THEN
        'Streak increased to ' || v_streak_result.current_streak || ' days!'
      WHEN v_streak_result.streak_status = 'lost' THEN
        'Streak lost. Starting fresh!'
      ELSE
        'Streak maintained: ' || v_streak_result.current_streak || ' days'
    END;
END;
$$;

-- 4. Updated get_streak_status: return recalculated streak (not stored value)
CREATE OR REPLACE FUNCTION get_streak_status(p_student_id UUID)
RETURNS TABLE(
  current_streak INTEGER,
  best_streak INTEGER,
  streak_status TEXT,
  hours_until_loss INTEGER,
  last_activity TIMESTAMPTZ,
  freeze_available BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_student RECORD;
  v_streak_calc RECORD;
BEGIN
  SELECT * INTO v_student
  FROM students s
  WHERE id = p_student_id;

  SELECT * INTO v_streak_calc
  FROM calculate_streak_realtime(p_student_id, NOW());

  RETURN QUERY SELECT
    v_streak_calc.current_streak,
    v_student.best_streak,
    v_streak_calc.streak_status,
    v_streak_calc.hours_until_loss,
    v_student.last_activity_timestamp,
    (v_student.streak_freeze_count > 0)::BOOLEAN;
END;
$$;
