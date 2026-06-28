-- Hotfix 103: Offline sync Home surfaces and read-time streak status
-- Purpose:
--   - Make offline practice/quiz replay mirror the online completion side effects.
--   - Credit daily_progress and study_progress during authoritative offline sync.
--   - Use answered questions, not skipped questions, for learning analytics/goals.
--   - Make streak status reflect a missed day on read, not only after the next activity.

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
  v_last_activity_date DATE;
  v_current_activity_date DATE;
  v_today_active BOOLEAN := FALSE;
  v_yesterday_active BOOLEAN := FALSE;
  v_display_streak INTEGER := 0;
  v_check_date DATE;
  v_hours_until_loss INTEGER := 0;
BEGIN
  SELECT
    last_activity_timestamp,
    COALESCE(s.current_streak, 0),
    COALESCE(best_streak, 0),
    COALESCE(user_timezone, 'Asia/Baku')
  INTO
    v_last_activity,
    v_current_streak,
    v_best_streak,
    v_user_timezone
  FROM students s
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 'lost'::TEXT, 0::INTEGER, FALSE::BOOLEAN;
    RETURN;
  END IF;

  v_current_activity_date := (p_activity_timestamp AT TIME ZONE v_user_timezone)::DATE;

  IF v_last_activity IS NOT NULL THEN
    v_last_activity_date := (v_last_activity AT TIME ZONE v_user_timezone)::DATE;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM daily_stats
    WHERE student_id = p_student_id
      AND date = v_current_activity_date
      AND is_active = TRUE
  ) INTO v_today_active;

  SELECT EXISTS(
    SELECT 1
    FROM daily_stats
    WHERE student_id = p_student_id
      AND date = v_current_activity_date - 1
      AND is_active = TRUE
  ) INTO v_yesterday_active;

  -- Confirmed today: count the active run ending today.
  IF v_today_active OR v_last_activity_date = v_current_activity_date THEN
    v_display_streak := GREATEST(calculate_student_streak(p_student_id, v_user_timezone), v_current_streak, 1);
    RETURN QUERY SELECT
      v_display_streak,
      'active'::TEXT,
      24::INTEGER,
      (v_display_streak > v_best_streak)::BOOLEAN;
    RETURN;
  END IF;

  -- Yesterday was active, but today is not confirmed yet. The streak is alive
  -- until the local day ends, so display the existing streak as at-risk.
  IF v_yesterday_active OR v_last_activity_date = v_current_activity_date - 1 THEN
    v_check_date := v_current_activity_date - 1;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM daily_stats
        WHERE student_id = p_student_id
          AND date = v_check_date
          AND is_active = TRUE
      );

      v_display_streak := v_display_streak + 1;
      v_check_date := v_check_date - 1;
      EXIT WHEN v_display_streak >= 365;
    END LOOP;

    v_display_streak := GREATEST(v_display_streak, v_current_streak, 1);
    v_hours_until_loss := GREATEST(
      CEIL(EXTRACT(EPOCH FROM (((v_current_activity_date + 1)::TIMESTAMP AT TIME ZONE v_user_timezone) - p_activity_timestamp)) / 3600)::INTEGER,
      0
    );

    RETURN QUERY SELECT
      v_display_streak,
      'at_risk'::TEXT,
      v_hours_until_loss,
      FALSE::BOOLEAN;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    0::INTEGER,
    'lost'::TEXT,
    0::INTEGER,
    FALSE::BOOLEAN;
END;
$$;

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
  v_old_streak    INTEGER := 0;
  v_best_streak   INTEGER := 0;
  v_user_timezone TEXT;
  v_last_activity TIMESTAMPTZ;
  v_last_activity_date DATE;
  v_local_date    DATE;
  v_yesterday_active BOOLEAN := FALSE;
  v_prior_streak INTEGER := 0;
  v_check_date DATE;
  v_new_streak INTEGER := 1;
  v_status TEXT := 'active';
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT
    COALESCE(s.current_streak, 0),
    COALESCE(s.best_streak, 0),
    COALESCE(s.user_timezone, 'Asia/Baku'),
    s.last_activity_timestamp
  INTO v_old_streak, v_best_streak, v_user_timezone, v_last_activity
  FROM students s
  WHERE id = p_student_id;

  v_local_date := (NOW() AT TIME ZONE v_user_timezone)::DATE;

  IF v_last_activity IS NOT NULL THEN
    v_last_activity_date := (v_last_activity AT TIME ZONE v_user_timezone)::DATE;
  END IF;

  IF v_last_activity_date = v_local_date THEN
    v_new_streak := GREATEST(v_old_streak, 1);
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM daily_stats
      WHERE student_id = p_student_id
        AND date = v_local_date - 1
        AND is_active = TRUE
    ) INTO v_yesterday_active;

    IF v_yesterday_active OR v_last_activity_date = v_local_date - 1 THEN
      v_check_date := v_local_date - 1;
      LOOP
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM daily_stats
          WHERE student_id = p_student_id
            AND date = v_check_date
            AND is_active = TRUE
        );

        v_prior_streak := v_prior_streak + 1;
        v_check_date := v_check_date - 1;
        EXIT WHEN v_prior_streak >= 365;
      END LOOP;

      v_new_streak := GREATEST(v_old_streak, v_prior_streak, 0) + 1;
    ELSE
      v_new_streak := 1;
      IF v_old_streak > 0 THEN
        v_status := 'lost';
      END IF;
    END IF;
  END IF;

  UPDATE students
  SET
    current_streak          = v_new_streak,
    best_streak             = GREATEST(COALESCE(best_streak, 0), v_new_streak),
    last_activity_timestamp = NOW(),
    last_active_date        = v_local_date,
    updated_at              = NOW()
  WHERE id = p_student_id;

  IF v_new_streak > v_old_streak THEN
    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_new_streak, 'streak_gained', 'Activity: ' || p_activity_type);
  ELSIF v_new_streak < v_old_streak THEN
    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_new_streak, 'streak_lost',
      'Streak reset from ' || v_old_streak || ' to ' || v_new_streak);
  END IF;

  RETURN QUERY SELECT
    v_new_streak,
    v_status,
    CASE
      WHEN v_new_streak > v_best_streak THEN
        'New record! ' || v_new_streak || ' day streak!'
      WHEN v_new_streak > v_old_streak THEN
        'Streak increased to ' || v_new_streak || ' days!'
      WHEN v_status = 'lost' THEN
        'Streak lost. Starting fresh!'
      ELSE
        'Streak maintained: ' || v_new_streak || ' days'
    END;
END;
$$;

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_student RECORD;
  v_streak_calc RECORD;
  v_local_date DATE;
BEGIN
  v_caller := auth.uid();

  SELECT * INTO v_student
  FROM students s
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  IF v_caller IS NOT NULL
     AND v_student.user_id IS DISTINCT FROM v_caller
     AND NOT EXISTS (
       SELECT 1 FROM admins a WHERE a.user_id = v_caller AND a.is_active = TRUE
     ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT * INTO v_streak_calc
  FROM calculate_streak_realtime(p_student_id, NOW());

  v_local_date := (NOW() AT TIME ZONE COALESCE(v_student.user_timezone, 'Asia/Baku'))::DATE;

  IF v_streak_calc.streak_status = 'lost' AND COALESCE(v_student.current_streak, 0) > 0 THEN
    UPDATE students
    SET current_streak = 0, updated_at = NOW()
    WHERE id = p_student_id;

    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    SELECT p_student_id, 0, 'streak_lost', 'Streak expired after a missed day'
    WHERE NOT EXISTS (
      SELECT 1
      FROM streak_history
      WHERE student_id = p_student_id
        AND event_type = 'streak_lost'
        AND (timestamp AT TIME ZONE COALESCE(v_student.user_timezone, 'Asia/Baku'))::DATE = v_local_date
    );
  END IF;

  RETURN QUERY SELECT
    v_streak_calc.current_streak,
    COALESCE(v_student.best_streak, 0),
    v_streak_calc.streak_status,
    v_streak_calc.hours_until_loss,
    v_student.last_activity_timestamp,
    (COALESCE(v_student.streak_freeze_count, 0) > 0)::BOOLEAN;
END;
$$;

CREATE OR REPLACE FUNCTION sync_offline_practice_session(
  p_offline_session_id TEXT,
  p_subject_id UUID,
  p_mode TEXT DEFAULT 'practice',
  p_total_questions INTEGER DEFAULT 0,
  p_correct_answers INTEGER DEFAULT 0,
  p_total_time_seconds INTEGER DEFAULT 0,
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_completed_at TIMESTAMPTZ DEFAULT NOW(),
  p_question_ids UUID[] DEFAULT '{}'::UUID[],
  p_answers JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_student_id UUID;
  v_user_timezone TEXT;
  v_session_id UUID;
  v_answer JSONB;
  v_question_id UUID;
  v_selected_answer TEXT;
  v_answered_at TIMESTAMPTZ;
  v_answered_questions INTEGER := 0;
  v_safe_correct INTEGER := 0;
  v_study_time_minutes INTEGER := 0;
  v_progress_date DATE;
  v_local_today DATE;
  v_goal_questions INTEGER := 20;
  v_goal_time INTEGER := 30;
  v_streak_count INTEGER := 0;
  v_check_date DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(BTRIM(p_offline_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'Offline session id is required';
  END IF;

  IF p_mode NOT IN ('practice', 'quiz') THEN
    RAISE EXCEPTION 'Invalid practice mode';
  END IF;

  SELECT id, COALESCE(user_timezone, 'Asia/Baku')
  INTO v_student_id, v_user_timezone
  FROM students
  WHERE user_id = v_user_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM subjects WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'Subject not found';
  END IF;

  SELECT id INTO v_session_id
  FROM practice_sessions
  WHERE user_id = v_user_id
    AND offline_session_id = p_offline_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  IF jsonb_typeof(COALESCE(p_answers, '[]'::JSONB)) = 'array' THEN
    SELECT COUNT(*)::INTEGER
    INTO v_answered_questions
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::JSONB)) AS item(value)
    WHERE NULLIF(BTRIM(COALESCE(item.value ->> 'selected_answer', '')), '') IS NOT NULL;
  END IF;

  v_safe_correct := LEAST(
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(v_answered_questions, 0)
  );
  v_study_time_minutes := GREATEST(ROUND(COALESCE(p_total_time_seconds, 0)::NUMERIC / 60)::INTEGER, 0);
  v_progress_date := (COALESCE(p_completed_at, NOW()) AT TIME ZONE v_user_timezone)::DATE;
  v_local_today := (NOW() AT TIME ZONE v_user_timezone)::DATE;

  INSERT INTO practice_sessions (
    user_id,
    subject_id,
    mode,
    total_questions,
    correct_answers,
    total_time_seconds,
    completed,
    started_at,
    completed_at,
    analytics_updated,
    question_ids,
    offline_session_id
  ) VALUES (
    v_user_id,
    p_subject_id,
    p_mode,
    GREATEST(COALESCE(p_total_questions, 0), 0),
    v_safe_correct,
    GREATEST(COALESCE(p_total_time_seconds, 0), 0),
    TRUE,
    COALESCE(p_started_at, NOW()),
    COALESCE(p_completed_at, NOW()),
    TRUE,
    COALESCE(p_question_ids, '{}'::UUID[]),
    p_offline_session_id
  )
  RETURNING id INTO v_session_id;

  IF jsonb_typeof(COALESCE(p_answers, '[]'::JSONB)) = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(COALESCE(p_answers, '[]'::JSONB))
    LOOP
      v_question_id := NULLIF(v_answer ->> 'question_id', '')::UUID;
      v_selected_answer := NULLIF(BTRIM(COALESCE(v_answer ->> 'selected_answer', '')), '');
      v_answered_at := COALESCE(NULLIF(v_answer ->> 'answered_at', '')::TIMESTAMPTZ, COALESCE(p_completed_at, NOW()));

      IF v_question_id IS NOT NULL AND v_selected_answer IS NOT NULL THEN
        INSERT INTO student_answers (
          user_id,
          question_id,
          practice_session_id,
          selected_answer,
          text_answer,
          is_correct,
          time_spent_seconds,
          was_skipped,
          answered_at
        )
        SELECT
          v_user_id,
          v_question_id,
          v_session_id,
          CASE WHEN v_selected_answer IN ('A', 'B', 'C', 'D', 'E') THEN v_selected_answer ELSE NULL END,
          CASE WHEN v_selected_answer IN ('A', 'B', 'C', 'D', 'E') THEN NULL ELSE v_selected_answer END,
          COALESCE((v_answer ->> 'is_correct')::BOOLEAN, FALSE),
          GREATEST(COALESCE((v_answer ->> 'time_spent_seconds')::INTEGER, 0), 0),
          FALSE,
          v_answered_at
        WHERE NOT EXISTS (
          SELECT 1
          FROM student_answers
          WHERE user_id = v_user_id
            AND practice_session_id = v_session_id
            AND question_id = v_question_id
        );
      END IF;
    END LOOP;
  END IF;

  PERFORM update_daily_stats(
    v_student_id,
    v_progress_date,
    v_answered_questions,
    v_safe_correct,
    v_study_time_minutes,
    0,
    0,
    1
  );

  IF v_answered_questions > 0 THEN
    INSERT INTO study_progress (
      student_id,
      subject_id,
      questions_attempted,
      questions_correct,
      study_time
    ) VALUES (
      v_student_id,
      p_subject_id,
      v_answered_questions,
      v_safe_correct,
      v_study_time_minutes * 60
    )
    ON CONFLICT (student_id, subject_id) DO UPDATE SET
      questions_attempted = study_progress.questions_attempted + EXCLUDED.questions_attempted,
      questions_correct = study_progress.questions_correct + EXCLUDED.questions_correct,
      study_time = COALESCE(study_progress.study_time, 0) + EXCLUDED.study_time,
      updated_at = NOW();
  END IF;

  SELECT COALESCE(daily_question_target, 20), COALESCE(daily_time_target_minutes, 30)
  INTO v_goal_questions, v_goal_time
  FROM student_goals
  WHERE student_id = v_student_id;

  INSERT INTO daily_progress (
    student_id,
    date,
    questions_completed,
    time_spent_minutes,
    accuracy,
    question_goal_met,
    time_goal_met
  ) VALUES (
    v_student_id,
    v_progress_date,
    v_answered_questions,
    v_study_time_minutes,
    CASE WHEN v_answered_questions > 0 THEN ROUND((v_safe_correct::DECIMAL / v_answered_questions) * 100, 2) ELSE 0 END,
    v_answered_questions >= v_goal_questions,
    v_study_time_minutes >= v_goal_time
  )
  ON CONFLICT (student_id, date) DO UPDATE SET
    questions_completed = daily_progress.questions_completed + EXCLUDED.questions_completed,
    time_spent_minutes = daily_progress.time_spent_minutes + EXCLUDED.time_spent_minutes,
    accuracy = CASE
      WHEN (daily_progress.questions_completed + EXCLUDED.questions_completed) > 0
      THEN ROUND(
        ((daily_progress.accuracy * daily_progress.questions_completed
          + EXCLUDED.accuracy * EXCLUDED.questions_completed)
         / (daily_progress.questions_completed + EXCLUDED.questions_completed)), 2)
      ELSE 0
    END,
    question_goal_met = (daily_progress.questions_completed + EXCLUDED.questions_completed) >= v_goal_questions,
    time_goal_met = (daily_progress.time_spent_minutes + EXCLUDED.time_spent_minutes) >= v_goal_time,
    updated_at = NOW();

  INSERT INTO activity_log (
    student_id,
    activity_type,
    activity_title,
    activity_description,
    activity_data,
    created_at
  ) VALUES (
    v_student_id,
    'practice_session',
    CASE WHEN p_mode = 'quiz' THEN 'Offline quiz completed' ELSE 'Offline practice completed' END,
    'Synced from offline mode',
    jsonb_build_object(
      'offline_session_id', p_offline_session_id,
      'subject_id', p_subject_id,
      'mode', p_mode,
      'questions_answered', v_answered_questions,
      'total_questions', GREATEST(COALESCE(p_total_questions, 0), 0),
      'correct_answers', v_safe_correct
    ),
    COALESCE(p_completed_at, NOW())
  );

  UPDATE students
  SET
    last_activity_timestamp = GREATEST(
      COALESCE(last_activity_timestamp, '1970-01-01'::TIMESTAMPTZ),
      COALESCE(p_completed_at, NOW())
    ),
    last_active_date = GREATEST(COALESCE(last_active_date, v_progress_date), v_progress_date),
    updated_at = NOW()
  WHERE id = v_student_id;

  IF v_progress_date >= v_local_today - 1 THEN
    v_check_date := v_progress_date;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM daily_stats
        WHERE student_id = v_student_id
          AND date = v_check_date
          AND is_active = TRUE
      );

      v_streak_count := v_streak_count + 1;
      v_check_date := v_check_date - 1;
      EXIT WHEN v_streak_count >= 365;
    END LOOP;

    UPDATE students
    SET
      current_streak = GREATEST(COALESCE(current_streak, 0), v_streak_count),
      best_streak = GREATEST(COALESCE(best_streak, 0), v_streak_count),
      updated_at = NOW()
    WHERE id = v_student_id;
  END IF;

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_streak_realtime(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION update_streak_on_activity(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_streak_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_offline_practice_session(
  TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], JSONB
) TO authenticated;

COMMENT ON FUNCTION sync_offline_practice_session IS
  'Idempotently syncs a complete offline practice/quiz session into practice_sessions, student_answers, daily_stats, daily_progress, and study_progress.';
