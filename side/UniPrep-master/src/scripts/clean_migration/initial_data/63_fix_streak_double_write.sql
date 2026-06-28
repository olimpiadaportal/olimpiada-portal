-- ============================================================================
-- Hotfix 63: Fix streak double-write bug (trigger vs RPC race condition)
-- ============================================================================
-- PROBLEM: Two competing paths both write students.current_streak:
--   Path A (trigger): daily_stats INSERT → trigger_update_streak_function
--          → update_student_streak_cache → calculate_student_streak (from scratch)
--          → UPDATE students SET current_streak = X
--   Path B (RPC): streakService.updateStreakRealtime() → update_streak_on_activity
--          → calculate_streak_realtime (incremental from current_streak)
--          → UPDATE students SET current_streak = Y
--
-- Path A fires during the same DB transaction as the daily_stats write.
-- Path B then reads the result of Path A and increments by 1. On the SECOND
-- activity of the same day, Path A recalculates from scratch (e.g., 2) and
-- overwrites Path B's inflated value (e.g., 3), causing a visible drop.
--
-- FIX: Make update_streak_on_activity the single authoritative streak writer.
-- Neuter the trigger so it no longer touches students.current_streak.
-- ============================================================================

-- 1. Neuter the trigger — no-op that just returns NEW
CREATE OR REPLACE FUNCTION trigger_update_streak_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Streak is now managed exclusively by update_streak_on_activity RPC.
  -- This trigger only exists to maintain backward compatibility.
  RETURN NEW;
END;
$$;

-- 2. Fix calculate_streak_realtime to properly validate via daily_stats
-- This ensures the RPC path uses ground-truth data, not just last_activity_timestamp.
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

  -- First activity ever
  IF v_last_activity IS NULL THEN
    RETURN QUERY SELECT
      1::INTEGER,
      'active'::TEXT,
      24::INTEGER,
      (1 > COALESCE(v_best_streak, 0))::BOOLEAN;
    RETURN;
  END IF;

  v_last_activity_date := (v_last_activity AT TIME ZONE v_user_timezone)::DATE;
  v_current_activity_date := (p_activity_timestamp AT TIME ZONE v_user_timezone)::DATE;
  v_hours_since_last := EXTRACT(EPOCH FROM (p_activity_timestamp - v_last_activity)) / 3600;

  -- Same day: keep streak unchanged
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
    -- Gap detected: reset to 1
    RETURN QUERY SELECT
      1::INTEGER,
      'lost'::TEXT,
      24::INTEGER,
      FALSE::BOOLEAN;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
