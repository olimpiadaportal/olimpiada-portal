-- ============================================================================
-- Hotfix 60: Analytics functions need SECURITY DEFINER + correct timezone
-- ============================================================================
-- Problem 1 (RLS): update_student_streak_cache(), trigger_update_streak_function(),
-- and update_daily_stats() all write to the `students` table (current_streak,
-- best_streak, last_active_date). Without SECURITY DEFINER they run as the
-- authenticated user, which is blocked by the students RLS WITH CHECK policy.
-- Symptom: "new row violates row-level security policy for table students"
--          in AnalyticsUpdateService#updateDailyStats / updateAfterActivity.
--
-- Problem 2 (Timezone): All three functions defaulted to 'Africa/Cairo' (UTC+2)
-- which was a copy-paste error. The app targets Azerbaijan students; correct
-- IANA timezone is 'Asia/Baku' (UTC+4). The trigger now reads each student's
-- own user_timezone from the students table, falling back to 'Asia/Baku'.
--
-- Fix: SECURITY DEFINER + SET search_path = public + Asia/Baku default.
-- ============================================================================

-- 1. update_student_streak_cache — writes current_streak, best_streak, last_active_date
CREATE OR REPLACE FUNCTION public.update_student_streak_cache(
  p_student_id UUID,
  p_timezone TEXT DEFAULT 'Asia/Baku'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_streak      INTEGER;
  v_current_best    INTEGER;
  v_current_date    DATE;
BEGIN
  v_new_streak   := calculate_student_streak(p_student_id, p_timezone);
  v_current_date := (NOW() AT TIME ZONE p_timezone)::DATE;

  SELECT COALESCE(best_streak, 0)
  INTO   v_current_best
  FROM   students
  WHERE  id = p_student_id;

  UPDATE students
  SET
    current_streak   = v_new_streak,
    best_streak      = GREATEST(v_current_best, v_new_streak),
    last_active_date = v_current_date
  WHERE id = p_student_id;
END;
$$;

-- 2. trigger_update_streak_function — fires on daily_stats INSERT/UPDATE
--    SECURITY DEFINER: so the UPDATE students inside update_student_streak_cache()
--    isn't blocked by RLS when triggered by a client write.
--    Reads each student's user_timezone for correct local day-boundary calculation.
--    Falls back to 'Asia/Baku' (app's primary market: Azerbaijan).
CREATE OR REPLACE FUNCTION public.trigger_update_streak_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  IF NEW.is_active = TRUE THEN
    SELECT COALESCE(user_timezone, 'Asia/Baku')
    INTO   v_timezone
    FROM   students
    WHERE  id = NEW.student_id;

    PERFORM update_student_streak_cache(NEW.student_id, COALESCE(v_timezone, 'Asia/Baku'));
  END IF;
  RETURN NEW;
END;
$$;

-- 3. update_daily_stats — RPC version that also writes last_active_date to students
CREATE OR REPLACE FUNCTION public.update_daily_stats(
  p_student_id         UUID,
  p_date               DATE    DEFAULT CURRENT_DATE,
  p_questions_attempted INTEGER DEFAULT 0,
  p_questions_correct   INTEGER DEFAULT 0,
  p_study_time_minutes  INTEGER DEFAULT 0,
  p_exams_taken         INTEGER DEFAULT 0,
  p_exams_completed     INTEGER DEFAULT 0,
  p_practice_sessions   INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO daily_stats (
    student_id, date, questions_attempted, questions_correct,
    study_time_minutes, exams_taken, exams_completed, practice_sessions,
    is_active, updated_at
  ) VALUES (
    p_student_id, p_date, p_questions_attempted, p_questions_correct,
    p_study_time_minutes, p_exams_taken, p_exams_completed, p_practice_sessions,
    TRUE, NOW()
  )
  ON CONFLICT (student_id, date)
  DO UPDATE SET
    questions_attempted = daily_stats.questions_attempted + EXCLUDED.questions_attempted,
    questions_correct   = daily_stats.questions_correct   + EXCLUDED.questions_correct,
    study_time_minutes  = daily_stats.study_time_minutes  + EXCLUDED.study_time_minutes,
    exams_taken         = daily_stats.exams_taken         + EXCLUDED.exams_taken,
    exams_completed     = daily_stats.exams_completed     + EXCLUDED.exams_completed,
    practice_sessions   = daily_stats.practice_sessions   + EXCLUDED.practice_sessions,
    is_active           = TRUE,
    updated_at          = NOW();

  UPDATE students
  SET last_active_date = p_date
  WHERE id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_daily_stats(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_streak_cache(UUID, TEXT) TO authenticated;

-- 4. Fix calculate_streak_realtime timezone fallback
-- The old default was 'UTC' — correct it to 'Asia/Baku' for existing users.
CREATE OR REPLACE FUNCTION public.calculate_streak_realtime(
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
  v_last_activity         TIMESTAMPTZ;
  v_current_streak        INTEGER;
  v_best_streak           INTEGER;
  v_user_timezone         TEXT;
  v_hours_since_last      NUMERIC;
  v_last_activity_date    DATE;
  v_current_activity_date DATE;
  v_is_consecutive        BOOLEAN;
  v_is_within_24h         BOOLEAN;
  v_new_streak            INTEGER;
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

  -- Default to Azerbaijan timezone (app's primary market), not UTC
  v_user_timezone := COALESCE(v_user_timezone, 'Asia/Baku');

  IF v_last_activity IS NULL THEN
    RETURN QUERY SELECT
      1::INTEGER,
      'active'::TEXT,
      24::INTEGER,
      (1 > COALESCE(v_best_streak, 0))::BOOLEAN;
    RETURN;
  END IF;

  v_hours_since_last      := EXTRACT(EPOCH FROM (p_activity_timestamp - v_last_activity)) / 3600;
  v_last_activity_date    := (v_last_activity    AT TIME ZONE v_user_timezone)::DATE;
  v_current_activity_date := (p_activity_timestamp AT TIME ZONE v_user_timezone)::DATE;
  v_is_consecutive        := (v_current_activity_date - v_last_activity_date) = 1;
  v_is_within_24h         := v_hours_since_last < 24;

  IF v_is_within_24h OR v_is_consecutive THEN
    IF v_current_activity_date > v_last_activity_date THEN
      v_new_streak := v_current_streak + 1;
    ELSE
      v_new_streak := v_current_streak;
    END IF;

    RETURN QUERY SELECT
      v_new_streak,
      CASE
        WHEN v_hours_since_last > 20 THEN 'at_risk'::TEXT
        ELSE 'active'::TEXT
      END,
      (24 - v_hours_since_last)::INTEGER,
      (v_new_streak > COALESCE(v_best_streak, 0))::BOOLEAN;
  ELSE
    RETURN QUERY SELECT
      1::INTEGER,
      'lost'::TEXT,
      24::INTEGER,
      FALSE::BOOLEAN;
  END IF;
END;
$$;

-- 5. Data migration: fix existing students whose user_timezone was set to 'UTC'
-- by the old incorrect schema default. Since the app targets Azerbaijan, all
-- existing users should be on Asia/Baku. We only touch rows still holding the
-- old default — rows explicitly set to 'UTC' by the user are left alone (no such
-- UI exists yet, so all 'UTC' values came from the wrong schema default).
UPDATE public.students
SET user_timezone = 'Asia/Baku'
WHERE user_timezone IS NULL OR user_timezone = 'UTC';

NOTIFY pgrst, 'reload schema';
