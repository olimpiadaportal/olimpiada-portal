-- ============================================================================
-- Hotfix 61: S10.2 streak RPCs need SECURITY DEFINER to update students table
-- ============================================================================
-- Problem: update_streak_on_activity(), use_streak_freeze(), and recover_streak()
-- all UPDATE the students table (current_streak, best_streak, last_activity_timestamp,
-- etc.) without SECURITY DEFINER. They run as the authenticated user and are
-- blocked by the students RLS WITH CHECK policy → 42501 error.
--
-- Hotfix 60 fixed the S8 trigger chain (update_student_streak_cache,
-- trigger_update_streak_function, update_daily_stats). This hotfix fixes the
-- S10.2 authoritative functions called directly by the mobile streakService.
--
-- Security: each function validates that auth.uid() owns p_student_id (same
-- anti-spoofing pattern as update_student_score in hotfix 59). The IS NOT NULL
-- guard allows internal calls from other SECURITY DEFINER functions where
-- auth.uid() returns NULL.
--
-- Also fixed: update_streak_on_activity now stores last_active_date in the
-- student's local timezone (Asia/Baku default) rather than raw UTC CURRENT_DATE.
-- ============================================================================

-- 1. update_streak_on_activity (S10.2) — the primary function called by streakService
DROP FUNCTION IF EXISTS public.update_streak_on_activity(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.update_streak_on_activity(
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
  -- Anti-spoofing: caller must own this student record.
  -- IS NOT NULL guard preserves internal call paths (auth.uid() = NULL).
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  -- Read current values + user timezone in a single SELECT
  SELECT s.current_streak, s.best_streak, COALESCE(s.user_timezone, 'Asia/Baku')
  INTO   v_old_streak, v_best_streak, v_user_timezone
  FROM   students s
  WHERE  id = p_student_id;

  -- Calculate today's date in the student's local timezone
  v_local_date := (NOW() AT TIME ZONE v_user_timezone)::DATE;

  -- Run the realtime streak calculation (timezone-aware via calculate_streak_realtime)
  SELECT * INTO v_streak_result
  FROM calculate_streak_realtime(p_student_id, NOW());

  -- Persist updated streak values
  UPDATE students
  SET
    current_streak          = v_streak_result.current_streak,
    best_streak             = GREATEST(COALESCE(best_streak, 0), v_streak_result.current_streak),
    last_activity_timestamp = NOW(),
    last_active_date        = v_local_date,
    updated_at              = NOW()
  WHERE id = p_student_id;

  -- Record streak history events
  IF v_streak_result.current_streak > v_old_streak THEN
    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_streak_result.current_streak, 'streak_gained',
            'Activity: ' || p_activity_type);
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

GRANT EXECUTE ON FUNCTION public.update_streak_on_activity(UUID, TEXT) TO authenticated;

-- 2. use_streak_freeze (S10.2) — writes streak_freeze_count, last_activity_timestamp
CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        UUID;
  v_freeze_count  INTEGER;
  v_current_streak INTEGER;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT streak_freeze_count, s.current_streak
  INTO   v_freeze_count, v_current_streak
  FROM   students s
  WHERE  id = p_student_id;

  IF v_freeze_count > 0 THEN
    UPDATE students
    SET
      streak_freeze_count          = streak_freeze_count - 1,
      streak_freeze_used_this_month = TRUE,
      last_activity_timestamp      = NOW()
    WHERE id = p_student_id;

    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_current_streak, 'streak_frozen', 'Streak freeze used');

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_streak_freeze(UUID) TO authenticated;

-- 3. recover_streak (S10.2) — writes current_streak
CREATE OR REPLACE FUNCTION public.recover_streak(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        UUID;
  v_last_activity TIMESTAMPTZ;
  v_hours_since   NUMERIC;
  v_lost_streak   INTEGER;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT last_activity_timestamp
  INTO   v_last_activity
  FROM   students
  WHERE  id = p_student_id;

  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_last_activity)) / 3600;

  IF v_hours_since < 24 THEN
    SELECT streak_value INTO v_lost_streak
    FROM   streak_history
    WHERE  student_id  = p_student_id
      AND  event_type  = 'streak_lost'
    ORDER  BY timestamp DESC
    LIMIT  1;

    IF v_lost_streak IS NOT NULL THEN
      UPDATE students
      SET current_streak = v_lost_streak
      WHERE id = p_student_id;

      INSERT INTO streak_history (student_id, streak_value, event_type)
      VALUES (p_student_id, v_lost_streak, 'streak_recovered');

      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_streak(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
