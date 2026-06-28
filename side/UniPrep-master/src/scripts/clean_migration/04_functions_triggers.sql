-- ============================================================================
-- 04_functions_triggers.sql
-- Elmly Database - All Functions & Triggers
-- ============================================================================
-- Purpose: Create ALL functions and triggers for a fresh Supabase instance
-- Depends on: 01_base_schema.sql, 02_indexes.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- Authoritative Rule: Latest applied version used for conflicting functions
-- ============================================================================

-- ============================================================================
-- SECTION 1: UTILITY FUNCTIONS
-- ============================================================================

-- 1.0 Helper function to get student protected columns (bypasses RLS)
-- Used by "Users can update own safe student data" policy to avoid infinite recursion.
-- Direct subqueries to students table in RLS policies trigger recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.get_student_protected_columns(p_user_id UUID)
RETURNS TABLE (
  leaderboard_score BIGINT,
  elo_rating INTEGER,
  monthly_score BIGINT,
  k_factor NUMERIC,
  total_exams_taken INTEGER,
  activity_multiplier NUMERIC,
  bonus_points INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    s.leaderboard_score,
    s.elo_rating,
    s.monthly_score,
    s.k_factor,
    s.total_exams_taken,
    s.activity_multiplier,
    s.bonus_points
  FROM students s
  WHERE s.user_id = p_user_id
  LIMIT 1;
$$;

-- 1.1 Generic updated_at trigger function (used by many tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1.2 Teacher rating auto-calculation
CREATE OR REPLACE FUNCTION update_teacher_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE teachers
  SET rating = (
    SELECT COALESCE(AVG(rating), 0)
    FROM teacher_reviews
    WHERE teacher_id = NEW.teacher_id
  )
  WHERE id = NEW.teacher_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 2: AUTH & REGISTRATION FUNCTIONS (S10.3 authoritative)
-- ============================================================================

-- 2.1 Handle new user signup (creates profile + student/teacher records)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := CASE
    WHEN NEW.raw_user_meta_data->>'user_type' IN ('student', 'teacher')
    THEN NEW.raw_user_meta_data->>'user_type'
    ELSE 'student'
  END;

  -- Step 1: Create profile record (required for ALL users)
  -- ON CONFLICT DO UPDATE ensures profile is always current even on re-signup
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    v_user_type,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    phone      = COALESCE(EXCLUDED.phone, profiles.phone),
    user_type  = EXCLUDED.user_type,
    updated_at = NOW();

  -- Step 2: Create student record if user_type is 'student'
  IF v_user_type = 'student' THEN
    INSERT INTO public.students (
      user_id,
      current_streak,
      best_streak,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      1,
      1,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Step 3: Create teacher record if user_type is 'teacher'
  IF v_user_type = 'teacher' THEN
    INSERT INTO public.teachers (
      user_id,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log with full context so the error is visible in Supabase DB logs
    RAISE LOG 'handle_new_user error for user %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 Create student record with UPSERT (S10.3 authoritative)
CREATE OR REPLACE FUNCTION public.create_student_record(
  p_user_id UUID,
  p_city TEXT,
  p_target_group TEXT DEFAULT NULL,
  p_target_university TEXT DEFAULT NULL,
  p_graduation_year INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_user_meta JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  -- (auth.uid() is NULL when email not yet confirmed, so verify user was just created)
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create record for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  -- Ensure profile exists before inserting student (handles trigger race condition).
  -- The handle_new_user trigger should have created it, but if it failed silently
  -- (e.g. RLS timing issue) this guarantees the FK constraint is satisfied.
  SELECT raw_user_meta_data INTO v_user_meta FROM auth.users WHERE id = p_user_id;
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_user_meta->>'full_name', v_user_meta->>'email', p_user_id::TEXT),
    v_user_meta->>'first_name',
    v_user_meta->>'last_name',
    v_user_meta->>'phone',
    'student',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.students (
    user_id, city, target_group, target_university, graduation_year
  ) VALUES (
    p_user_id, p_city, p_target_group, p_target_university, p_graduation_year
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    target_group = EXCLUDED.target_group,
    target_university = EXCLUDED.target_university,
    graduation_year = EXCLUDED.graduation_year,
    updated_at = NOW()
  RETURNING id INTO v_student_id;

  RETURN v_student_id;
END;
$$;

-- 2.3 Create teacher record with UPSERT (S10.3 authoritative)
CREATE OR REPLACE FUNCTION public.create_teacher_record(
  p_user_id UUID,
  p_city TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_specializations TEXT[] DEFAULT NULL,
  p_experience_years INTEGER DEFAULT NULL,
  p_hourly_rate DECIMAL DEFAULT NULL,
  p_monthly_rate DECIMAL DEFAULT NULL,
  p_available_groups TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
  v_user_meta JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create record for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  -- Ensure profile exists before inserting teacher (handles trigger race condition).
  SELECT raw_user_meta_data INTO v_user_meta FROM auth.users WHERE id = p_user_id;
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_user_meta->>'full_name', v_user_meta->>'email', p_user_id::TEXT),
    v_user_meta->>'first_name',
    v_user_meta->>'last_name',
    v_user_meta->>'phone',
    'teacher',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teachers (
    user_id, city, bio, specializations, experience_years, hourly_rate, monthly_rate, available_groups
  ) VALUES (
    p_user_id, p_city, p_bio, p_specializations, p_experience_years, p_hourly_rate, p_monthly_rate, p_available_groups
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    bio = EXCLUDED.bio,
    specializations = EXCLUDED.specializations,
    experience_years = EXCLUDED.experience_years,
    hourly_rate = EXCLUDED.hourly_rate,
    monthly_rate = EXCLUDED.monthly_rate,
    available_groups = EXCLUDED.available_groups,
    updated_at = NOW()
  RETURNING id INTO v_teacher_id;

  RETURN v_teacher_id;
END;
$$;

-- 2.4 Create default user settings on signup (S3) - TRIGGER version
CREATE OR REPLACE FUNCTION public.create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.4b Create default user settings - RPC version (Stage 9 fix)
-- Mobile app calls this as RPC with p_user_id during signup
CREATE OR REPLACE FUNCTION public.create_default_user_settings(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create settings for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = p_user_id) THEN
    RETURN TRUE;
  END IF;
  INSERT INTO public.user_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN RETURN TRUE;
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating default settings for user %: %', p_user_id, SQLERRM;
    RETURN FALSE;
END;
$$;

-- 2.5 Check email exists (Stage 9 - Auth Enhancement)
-- Used during signup to prevent duplicate accounts
CREATE OR REPLACE FUNCTION check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE email_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = LOWER(TRIM(email_to_check))
  ) INTO email_exists;
  RETURN email_exists;
END;
$$;

-- 2.6 Verify user password (CRITICAL-01 security fix: scoped to auth.uid() only)
-- Used for password change operations. Only verifies the CALLING user's own password.
CREATE OR REPLACE FUNCTION verify_user_password(password_attempt text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  stored_password_hash text;
BEGIN
  SELECT encrypted_password
  INTO stored_password_hash
  FROM auth.users
  WHERE id = auth.uid();

  IF stored_password_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN (stored_password_hash = extensions.crypt(password_attempt, stored_password_hash));
END;
$$;

COMMENT ON FUNCTION verify_user_password(text) IS
'Securely verifies the calling user''s current password using auth.uid(). Security audit fix: scoped to own user only.';

-- ============================================================================
-- SECTION 3: PROFILE SYNC FUNCTIONS (S9)
-- ============================================================================

-- 3.1 Sync profile changes to student record
CREATE OR REPLACE FUNCTION sync_profile_to_student()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE students
  SET
    city = COALESCE(NEW.city, students.city),
    bio = COALESCE(NEW.bio, students.bio),
    target_university = COALESCE(NEW.target_university, students.target_university),
    target_group = COALESCE(NEW.target_group, students.target_group),
    updated_at = NEW.updated_at
  WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.2 Sync profile changes to teacher record
CREATE OR REPLACE FUNCTION sync_profile_to_teacher()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE teachers
  SET
    city = COALESCE(NEW.city, teachers.city),
    bio = COALESCE(NEW.bio, teachers.bio),
    updated_at = NEW.updated_at
  WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.3 Authenticated student-safe profile field update
-- SECURITY DEFINER required: the students table has strict RLS to protect
-- scoring/leaderboard fields. This RPC updates only profile-safe fields and
-- scopes the write to auth.uid().
CREATE OR REPLACE FUNCTION public.update_own_student_profile_fields(
  p_city TEXT DEFAULT NULL,
  p_target_group TEXT DEFAULT NULL,
  p_target_university TEXT DEFAULT NULL,
  p_graduation_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  city TEXT,
  target_group TEXT,
  target_university TEXT,
  graduation_year INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.students s
  SET
    city = COALESCE(NULLIF(BTRIM(p_city), ''), s.city),
    target_group = COALESCE(NULLIF(BTRIM(p_target_group), ''), s.target_group),
    target_university = COALESCE(NULLIF(BTRIM(p_target_university), ''), s.target_university),
    graduation_year = COALESCE(p_graduation_year, s.graduation_year),
    updated_at = NOW()
  WHERE s.user_id = v_user_id
  RETURNING
    s.city,
    s.target_group,
    s.target_university,
    s.graduation_year
  INTO
    city,
    target_group,
    target_university,
    graduation_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student record not found';
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) IS
'Allows an authenticated student to update only their own non-scoring profile fields on students. Scoring and leaderboard fields remain protected by server-side scoring RPCs.';

-- ============================================================================
-- SECTION 4: ANALYTICS & DAILY STATS FUNCTIONS (S8)
-- ============================================================================

-- 4.1 Update daily stats (upsert)
-- SECURITY DEFINER required: function writes last_active_date to students table
-- which is blocked by RLS WITH CHECK when called as authenticated user.
CREATE OR REPLACE FUNCTION update_daily_stats(
  p_student_id UUID,
  p_date DATE DEFAULT CURRENT_DATE,
  p_questions_attempted INTEGER DEFAULT 0,
  p_questions_correct INTEGER DEFAULT 0,
  p_study_time_minutes INTEGER DEFAULT 0,
  p_exams_taken INTEGER DEFAULT 0,
  p_exams_completed INTEGER DEFAULT 0,
  p_practice_sessions INTEGER DEFAULT 0
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
    questions_correct = daily_stats.questions_correct + EXCLUDED.questions_correct,
    study_time_minutes = daily_stats.study_time_minutes + EXCLUDED.study_time_minutes,
    exams_taken = daily_stats.exams_taken + EXCLUDED.exams_taken,
    exams_completed = daily_stats.exams_completed + EXCLUDED.exams_completed,
    practice_sessions = daily_stats.practice_sessions + EXCLUDED.practice_sessions,
    is_active = TRUE,
    updated_at = NOW();
    
  UPDATE students
  SET last_active_date = p_date
  WHERE id = p_student_id;
END;
$$;

-- 4.2 Check goal completion trigger function
CREATE OR REPLACE FUNCTION check_goal_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_value >= NEW.target_value AND NEW.is_completed = FALSE THEN
    NEW.is_completed := TRUE;
    NEW.completed_at := NOW();
    NEW.is_active := FALSE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: STREAK FUNCTIONS (S8 base, S10.2 authoritative upgrade)
-- ============================================================================

-- 5.1 Calculate student streak with timezone (S8)
CREATE OR REPLACE FUNCTION calculate_student_streak(
  p_student_id UUID,
  p_timezone TEXT DEFAULT 'Asia/Baku'
)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
  v_current_date DATE;
  v_check_date DATE;
  v_has_activity BOOLEAN;
BEGIN
  v_current_date := (NOW() AT TIME ZONE p_timezone)::DATE;
  v_check_date := v_current_date;
  
  LOOP
    SELECT is_active INTO v_has_activity
    FROM daily_stats
    WHERE student_id = p_student_id
    AND date = v_check_date;
    
    IF v_has_activity IS NULL OR v_has_activity = FALSE THEN
      EXIT;
    END IF;
    
    v_streak := v_streak + 1;
    v_check_date := v_check_date - INTERVAL '1 day';
    
    IF v_streak >= 365 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN v_streak;
END;
$$ LANGUAGE plpgsql;

-- 5.2 Update cached streak (S8)
-- SECURITY DEFINER required: writes current_streak, best_streak, last_active_date
-- to students table, which is blocked by RLS without elevated privileges.
CREATE OR REPLACE FUNCTION update_student_streak_cache(
  p_student_id UUID,
  p_timezone TEXT DEFAULT 'Asia/Baku'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_streak INTEGER;
  v_current_best INTEGER;
  v_current_date DATE;
BEGIN
  v_new_streak := calculate_student_streak(p_student_id, p_timezone);
  v_current_date := (NOW() AT TIME ZONE p_timezone)::DATE;
  
  SELECT COALESCE(best_streak, 0) INTO v_current_best
  FROM students
  WHERE id = p_student_id;
  
  UPDATE students
  SET
    current_streak = v_new_streak,
    best_streak = GREATEST(v_current_best, v_new_streak),
    last_active_date = v_current_date
  WHERE id = p_student_id;
END;
$$;

-- 5.3 Trigger function for auto-updating streak on daily_stats change
-- SECURITY DEFINER required so the UPDATE inside update_student_streak_cache
-- runs as the function owner (postgres) and bypasses students RLS.
-- Reads the student's own user_timezone so streak day-boundaries are always
-- in their local time. Falls back to 'Asia/Baku' (app's primary market).
CREATE OR REPLACE FUNCTION trigger_update_streak_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Streak is now managed exclusively by update_streak_on_activity RPC.
  -- This trigger only exists to maintain backward compatibility with daily_stats
  -- INSERT/UPDATE triggers. It NO LONGER touches students.current_streak.
  RETURN NEW;
END;
$$;

-- 5.4 Real-time streak calculation (S10.2 authoritative - fixed version)
-- This is the SOLE source of truth for streak calculation.
-- Uses daily_stats as ground truth for yesterday's activity.
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
    -- If called during actual activity, return 1 (confirms day 1)
    -- If called for status check (no activity yet), return 0
    -- We distinguish by checking if current_streak is still 0 (no prior activity)
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
    -- Gap detected: reset to 0 (unconfirmed until next activity)
    RETURN QUERY SELECT
      0::INTEGER,
      'lost'::TEXT,
      24::INTEGER,
      FALSE::BOOLEAN;
  END IF;
END;
$$;

-- 5.5 Update streak on activity (S10.2)
-- SECURITY DEFINER: updates current_streak, best_streak, last_activity_timestamp,
-- last_active_date in students. Anti-spoofing: validates caller owns p_student_id.
-- last_active_date is stored in the student's local timezone (not raw UTC).
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

-- 5.6 Use streak freeze (S10.2)
-- SECURITY DEFINER: writes streak_freeze_count, last_activity_timestamp to students.
CREATE OR REPLACE FUNCTION use_streak_freeze(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller         UUID;
  v_freeze_count   INTEGER;
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
      streak_freeze_count           = streak_freeze_count - 1,
      streak_freeze_used_this_month = TRUE,
      last_activity_timestamp       = NOW()
    WHERE id = p_student_id;

    INSERT INTO streak_history (student_id, streak_value, event_type, notes)
    VALUES (p_student_id, v_current_streak, 'streak_frozen', 'Streak freeze used');

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 5.7 Recover lost streak (S10.2)
-- SECURITY DEFINER: writes current_streak to students.
CREATE OR REPLACE FUNCTION recover_streak(p_student_id UUID)
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
    WHERE  student_id = p_student_id
      AND  event_type = 'streak_lost'
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

-- 5.8 Get streak status (S10.2 authoritative - fixed version)
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

-- 5.9 Monthly streak freeze reset (S10.2)
CREATE OR REPLACE FUNCTION reset_monthly_streak_freezes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_students_updated INTEGER;
BEGIN
  UPDATE students
  SET 
    streak_freeze_used_this_month = FALSE,
    streak_freeze_count = LEAST(streak_freeze_count + 1, 3)
  WHERE streak_freeze_used_this_month = TRUE;

  GET DIAGNOSTICS v_students_updated = ROW_COUNT;
  RETURN v_students_updated;
END;
$$;

-- ============================================================================
-- SECTION 6: LEADERBOARD FUNCTIONS (S10.2 authoritative)
-- ============================================================================

-- 6.1 Get City Leaderboard (S10.2 updated for monthly score)
CREATE OR REPLACE FUNCTION get_city_leaderboard(
  p_city TEXT,
  p_rank_type TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  score DECIMAL,
  monthly_score BIGINT,
  streak INTEGER,
  city TEXT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
    s.leaderboard_score as score,
    s.monthly_score::DECIMAL,
    s.current_streak as streak,
    s.city,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE 
          WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
          ELSE s.current_streak::DECIMAL 
        END DESC
    ) as rank
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE s.city = p_city
    AND COALESCE(us.show_in_leaderboard, true) = true
    AND (
      CASE 
        WHEN p_rank_type = 'score' THEN s.monthly_score > 0
        ELSE s.current_streak > 0 
      END
    )
  ORDER BY rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 Get National Leaderboard (S10.2 updated)
CREATE OR REPLACE FUNCTION get_national_leaderboard(
  p_rank_type TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  score DECIMAL,
  monthly_score DECIMAL,
  streak INTEGER,
  city TEXT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
    s.leaderboard_score as score,
    s.monthly_score::DECIMAL,
    s.current_streak as streak,
    s.city,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE 
          WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
          ELSE s.current_streak::DECIMAL 
        END DESC
    ) as rank
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE COALESCE(us.show_in_leaderboard, true) = true
    AND (
      CASE 
        WHEN p_rank_type = 'score' THEN s.monthly_score > 0
        ELSE s.current_streak > 0 
      END
    )
  ORDER BY rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.3 Get Student Rank (S8)
CREATE OR REPLACE FUNCTION get_student_rank(
  p_student_id UUID,
  p_rank_type TEXT,
  p_scope TEXT
)
RETURNS TABLE (
  rank BIGINT,
  total BIGINT,
  value DECIMAL
) AS $$
BEGIN
  IF p_scope = 'city' THEN
    RETURN QUERY
    WITH ranked_students AS (
      SELECT 
        s.id,
        s.monthly_score,
        s.current_streak,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE 
              WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
              ELSE s.current_streak::DECIMAL 
            END DESC
        ) as student_rank
      FROM students s
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      WHERE s.city = (SELECT city FROM students WHERE id = p_student_id)
        AND COALESCE(us.show_in_leaderboard, true) = true
        AND (
          CASE 
            WHEN p_rank_type = 'score' THEN s.monthly_score > 0
            ELSE s.current_streak > 0 
          END
        )
    )
    SELECT 
      student_rank as rank,
      (SELECT COUNT(*) FROM ranked_students)::BIGINT as total,
      CASE 
        WHEN p_rank_type = 'score' THEN monthly_score 
        ELSE current_streak::DECIMAL 
      END as value
    FROM ranked_students
    WHERE id = p_student_id;
  ELSE
    RETURN QUERY
    WITH ranked_students AS (
      SELECT 
        s.id,
        s.monthly_score,
        s.current_streak,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE 
              WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
              ELSE s.current_streak::DECIMAL 
            END DESC
        ) as student_rank
      FROM students s
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      WHERE COALESCE(us.show_in_leaderboard, true) = true
        AND (
          CASE 
            WHEN p_rank_type = 'score' THEN s.monthly_score > 0
            ELSE s.current_streak > 0 
          END
        )
    )
    SELECT 
      student_rank as rank,
      (SELECT COUNT(*) FROM ranked_students)::BIGINT as total,
      CASE 
        WHEN p_rank_type = 'score' THEN monthly_score 
        ELSE current_streak::DECIMAL 
      END as value
    FROM ranked_students
    WHERE id = p_student_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 7: ELO SCORING FUNCTIONS (S10.2)
-- ============================================================================

-- 7.1 Calculate ELO Change
CREATE OR REPLACE FUNCTION calculate_elo_change(
  p_current_elo INTEGER,
  p_exam_score DECIMAL,
  p_k_factor INTEGER,
  p_difficulty TEXT DEFAULT 'medium'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_score DECIMAL;
  v_actual_score DECIMAL;
  v_opponent_elo INTEGER;
  v_elo_change INTEGER;
BEGIN
  v_opponent_elo := CASE p_difficulty
    WHEN 'easy' THEN p_current_elo - 100
    WHEN 'medium' THEN p_current_elo
    WHEN 'hard' THEN p_current_elo + 100
    ELSE p_current_elo
  END;

  v_expected_score := 1.0 / (1.0 + POWER(10, (v_opponent_elo - p_current_elo) / 400.0));
  v_actual_score := p_exam_score / 100.0;
  v_elo_change := ROUND(p_k_factor * (v_actual_score - v_expected_score));

  RETURN v_elo_change;
END;
$$;

-- 7.2 Calculate Activity Multiplier
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

-- 7.3 Calculate Bonus Points
CREATE OR REPLACE FUNCTION calculate_bonus_points(
  p_student_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_bonus_points INTEGER := 0;
  v_current_streak INTEGER;
  v_achievement_count INTEGER;
  v_accuracy_variance DECIMAL;
  v_mastered_subjects INTEGER;
  v_streak_multiplier INTEGER;
  v_achievement_multiplier INTEGER;
  v_consistency_bonus INTEGER;
  v_mastery_bonus INTEGER;
BEGIN
  SELECT 
    (setting_value->>'streak_bonus_multiplier')::INTEGER,
    (setting_value->>'achievement_bonus_multiplier')::INTEGER,
    (setting_value->>'consistency_bonus')::INTEGER,
    (setting_value->>'subject_mastery_bonus')::INTEGER
  INTO 
    v_streak_multiplier,
    v_achievement_multiplier,
    v_consistency_bonus,
    v_mastery_bonus
  FROM leaderboard_settings
  WHERE setting_key IN (
    'streak_bonus_multiplier',
    'achievement_bonus_multiplier',
    'consistency_bonus',
    'subject_mastery_bonus'
  );

  SELECT COALESCE(s.current_streak, 0)
  INTO v_current_streak
  FROM students s
  WHERE id = p_student_id;

  v_bonus_points := v_bonus_points + LEAST(100, v_current_streak * COALESCE(v_streak_multiplier, 5));

  SELECT COUNT(*)
  INTO v_achievement_count
  FROM achievements
  WHERE student_id = p_student_id;

  v_bonus_points := v_bonus_points + (v_achievement_count * COALESCE(v_achievement_multiplier, 10));

  SELECT STDDEV(
    CASE 
      WHEN activity_type = 'quiz_completed' THEN 
        (activity_data->>'score')::DECIMAL
      ELSE NULL
    END
  )
  INTO v_accuracy_variance
  FROM activity_log
  WHERE student_id = p_student_id
    AND created_at >= NOW() - INTERVAL '30 days'
    AND activity_type = 'quiz_completed';

  IF v_accuracy_variance IS NOT NULL AND v_accuracy_variance < 15 THEN
    v_bonus_points := v_bonus_points + COALESCE(v_consistency_bonus, 50);
  END IF;

  v_mastered_subjects := 0;
  v_bonus_points := v_bonus_points + (v_mastered_subjects * COALESCE(v_mastery_bonus, 25));

  RETURN v_bonus_points;
END;
$$;

-- 7.4 Update Student Score (main scoring function)
-- SECURITY DEFINER required: the students table WITH CHECK RLS policy blocks
-- authenticated users from modifying scoring columns (elo_rating, monthly_score,
-- total_exams_taken, etc.). SECURITY DEFINER makes it run as the DB owner.
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
  -- Anti-spoofing: reject callers trying to update a student they don't own.
  -- The IS NOT NULL guard allows internal calls (e.g. from update_leaderboard_score_after_exam)
  -- where auth.uid() matches the already-validated student owner.
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to calling user';
  END IF;

  SELECT elo_rating, k_factor, total_exams_taken
  INTO v_current_elo, v_k_factor, v_total_exams
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
  SELECT COALESCE(monthly_score, 0)
  INTO v_monthly_score
  FROM students
  WHERE id = p_student_id;

  v_total_exams := v_total_exams + 1;
  v_k_factor := CASE
    WHEN v_total_exams < 10 THEN 40
    WHEN v_total_exams < 30 THEN 20
    ELSE 10
  END;

  UPDATE students
  SET 
    elo_rating = v_new_elo,
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

-- 7.5 Apply Monthly Decay
CREATE OR REPLACE FUNCTION apply_monthly_decay()
RETURNS TABLE(
  students_affected INTEGER,
  total_elo_reduced INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_decay_enabled BOOLEAN;
  v_decay_percentage INTEGER;
  v_students_affected INTEGER;
  v_total_elo_reduced INTEGER := 0;
  v_student RECORD;
BEGIN
  SELECT (setting_value::TEXT)::BOOLEAN
  INTO v_decay_enabled
  FROM leaderboard_settings
  WHERE setting_key = 'monthly_decay_enabled';

  IF NOT v_decay_enabled THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  SELECT (setting_value::TEXT)::INTEGER
  INTO v_decay_percentage
  FROM leaderboard_settings
  WHERE setting_key = 'monthly_decay_percentage';

  v_decay_percentage := COALESCE(v_decay_percentage, 10);

  FOR v_student IN
    SELECT id, elo_rating, monthly_score
    FROM students
    WHERE show_in_leaderboard = TRUE
  LOOP
    DECLARE
      v_old_elo INTEGER := v_student.elo_rating;
      v_new_elo INTEGER;
      v_elo_reduction INTEGER;
    BEGIN
      v_new_elo := ROUND(v_old_elo * (100 - v_decay_percentage) / 100.0);
      v_elo_reduction := v_old_elo - v_new_elo;

      UPDATE students
      SET 
        elo_rating = v_new_elo,
        monthly_score = 0,
        bonus_points = 0,
        last_score_update = NOW()
      WHERE id = v_student.id;

      INSERT INTO score_transactions (
        student_id, transaction_type, elo_change, previous_elo, new_elo, notes
      ) VALUES (
        v_student.id, 'monthly_decay', -v_elo_reduction, v_old_elo, v_new_elo,
        'Automatic monthly decay: ' || v_decay_percentage || '%'
      );

      v_total_elo_reduced := v_total_elo_reduced + v_elo_reduction;
    END;
  END LOOP;

  GET DIAGNOSTICS v_students_affected = ROW_COUNT;

  RETURN QUERY SELECT v_students_affected, v_total_elo_reduced;
END;
$$;

-- 7.6 Refresh Leaderboard Cache
CREATE OR REPLACE FUNCTION refresh_leaderboard_cache()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM leaderboard_cache;

  INSERT INTO leaderboard_cache (
    leaderboard_type, city, target_group, rank, student_id, student_name,
    score, elo_rating, monthly_score, activity_multiplier, streak, exams_taken
  )
  SELECT 
    'score', s.city,
    TRIM(REPLACE(s.target_group, 'qrup', '')),
    ROW_NUMBER() OVER (
      PARTITION BY s.city, s.target_group 
      ORDER BY s.monthly_score DESC, s.elo_rating DESC
    ),
    s.id,
    CONCAT(SPLIT_PART(p.full_name, ' ', 1), ' ', LEFT(SPLIT_PART(p.full_name, ' ', 2), 1), '.'),
    s.leaderboard_score, s.elo_rating, s.monthly_score,
    s.activity_multiplier, s.current_streak, s.total_exams_taken
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE COALESCE(us.show_in_leaderboard, TRUE) = TRUE;

  INSERT INTO leaderboard_cache (
    leaderboard_type, city, target_group, rank, student_id, student_name,
    streak, elo_rating, monthly_score, exams_taken
  )
  SELECT 
    'streak', s.city,
    TRIM(REPLACE(s.target_group, 'qrup', '')),
    ROW_NUMBER() OVER (
      PARTITION BY s.city, s.target_group 
      ORDER BY s.current_streak DESC, s.monthly_score DESC
    ),
    s.id,
    CONCAT(SPLIT_PART(p.full_name, ' ', 1), ' ', LEFT(SPLIT_PART(p.full_name, ' ', 2), 1), '.'),
    s.current_streak, s.elo_rating, s.monthly_score, s.total_exams_taken
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE COALESCE(us.show_in_leaderboard, TRUE) = TRUE;
END;
$$;

-- 7.7 Trigger monthly decay (callable via webhook)
CREATE OR REPLACE FUNCTION trigger_monthly_decay()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM apply_monthly_decay();
  PERFORM refresh_leaderboard_cache();
  
  RETURN jsonb_build_object(
    'success', true,
    'students_affected', v_result.students_affected,
    'total_elo_reduced', v_result.total_elo_reduced,
    'timestamp', NOW()
  );
END;
$$;

-- ============================================================================
-- SECTION 8: ADMIN SCORING FUNCTIONS (S10.2)
-- ============================================================================

-- 8.1 Admin Reset Leaderboard
CREATE OR REPLACE FUNCTION admin_reset_leaderboard(
  p_admin_id UUID,
  p_reset_type TEXT DEFAULT 'soft',
  p_decay_percentage INTEGER DEFAULT 50,
  p_season_name TEXT DEFAULT NULL
)
RETURNS TABLE(
  students_affected INTEGER,
  season_archived BOOLEAN,
  reset_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_students_affected INTEGER;
  v_season_name TEXT;
  v_base_elo INTEGER;
BEGIN
  SELECT user_type = 'admin' INTO v_is_admin FROM profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can reset leaderboard';
  END IF;

  SELECT setting_value::INTEGER INTO v_base_elo
  FROM leaderboard_settings WHERE setting_key = 'base_elo_rating';

  v_season_name := COALESCE(p_season_name, TO_CHAR(NOW(), 'YYYY-MM'));

  CASE p_reset_type
    WHEN 'soft' THEN
      UPDATE students
      SET elo_rating = ROUND(elo_rating * (100 - p_decay_percentage) / 100.0),
          monthly_score = 0, bonus_points = 0, last_score_update = NOW()
      WHERE show_in_leaderboard = TRUE;

    WHEN 'hard' THEN
      UPDATE students
      SET elo_rating = v_base_elo, monthly_score = 0, bonus_points = 0,
          total_exams_taken = 0, k_factor = 40, last_score_update = NOW()
      WHERE show_in_leaderboard = TRUE;

    WHEN 'seasonal' THEN
      INSERT INTO leaderboard_history (
        season_name, season_start, season_end, student_id, student_name,
        city, target_group, final_rank, final_elo_rating, final_monthly_score,
        total_exams_taken, current_streak
      )
      SELECT 
        v_season_name, DATE_TRUNC('month', NOW() - INTERVAL '1 month'),
        DATE_TRUNC('month', NOW()) - INTERVAL '1 day',
        s.id, CONCAT(SPLIT_PART(p.full_name, ' ', 1), ' ', LEFT(SPLIT_PART(p.full_name, ' ', 2), 1), '.'),
        s.city, s.target_group,
        ROW_NUMBER() OVER (ORDER BY s.monthly_score DESC, s.elo_rating DESC),
        s.elo_rating, s.monthly_score, s.total_exams_taken, s.current_streak
      FROM students s
      JOIN profiles p ON s.user_id = p.id
      WHERE s.show_in_leaderboard = TRUE;

      UPDATE students
      SET elo_rating = v_base_elo, monthly_score = 0, bonus_points = 0, last_score_update = NOW()
      WHERE show_in_leaderboard = TRUE;
  END CASE;

  GET DIAGNOSTICS v_students_affected = ROW_COUNT;
  PERFORM refresh_leaderboard_cache();

  RETURN QUERY SELECT v_students_affected, (p_reset_type = 'seasonal')::BOOLEAN, p_reset_type;
END;
$$;

-- 8.2 Admin Adjust Student Score
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

-- 8.3 Get Leaderboard Statistics
CREATE OR REPLACE FUNCTION get_leaderboard_stats()
RETURNS TABLE(
  total_students INTEGER, avg_elo DECIMAL, median_elo INTEGER,
  top_elo INTEGER, bottom_elo INTEGER, active_students_30d INTEGER,
  total_score_transactions BIGINT, last_reset_date TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER,
    ROUND(AVG(s.elo_rating), 2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.elo_rating)::INTEGER,
    MAX(s.elo_rating), MIN(s.elo_rating),
    COUNT(DISTINCT CASE WHEN s.last_active_date >= CURRENT_DATE - INTERVAL '30 days' THEN s.id END)::INTEGER,
    (SELECT COUNT(*) FROM score_transactions),
    (SELECT MAX(created_at) FROM score_transactions WHERE transaction_type = 'season_reset')
  FROM students s
  WHERE s.show_in_leaderboard = TRUE;
END;
$$;

-- 8.4 Get Student Score History
CREATE OR REPLACE FUNCTION get_student_score_history(
  p_student_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  transaction_date TIMESTAMPTZ, transaction_type TEXT, elo_change INTEGER,
  previous_elo INTEGER, new_elo INTEGER, exam_score DECIMAL, notes TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT st.created_at, st.transaction_type, st.elo_change,
    st.previous_elo, st.new_elo, st.exam_score, st.notes
  FROM score_transactions st
  WHERE st.student_id = p_student_id
  ORDER BY st.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 8.5 Admin Archive Season
CREATE OR REPLACE FUNCTION admin_archive_season(
  p_admin_id UUID,
  p_season_name TEXT
)
RETURNS TABLE(season_name TEXT, students_archived INTEGER, archive_date TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_students_archived INTEGER;
BEGIN
  SELECT user_type = 'admin' INTO v_is_admin FROM profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO leaderboard_history (
    season_name, season_start, season_end, student_id, student_name,
    city, target_group, final_rank, final_elo_rating, final_monthly_score,
    total_exams_taken, current_streak
  )
  SELECT 
    p_season_name, DATE_TRUNC('month', NOW() - INTERVAL '1 month'),
    DATE_TRUNC('month', NOW()) - INTERVAL '1 day',
    s.id, CONCAT(SPLIT_PART(p.full_name, ' ', 1), ' ', LEFT(SPLIT_PART(p.full_name, ' ', 2), 1), '.'),
    s.city, s.target_group,
    ROW_NUMBER() OVER (ORDER BY s.monthly_score DESC, s.elo_rating DESC),
    s.elo_rating, s.monthly_score, s.total_exams_taken, s.current_streak
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  WHERE s.show_in_leaderboard = TRUE;

  GET DIAGNOSTICS v_students_archived = ROW_COUNT;
  RETURN QUERY SELECT p_season_name, v_students_archived, NOW();
END;
$$;

-- 8.6 Admin Update Setting
CREATE OR REPLACE FUNCTION admin_update_setting(
  p_admin_id UUID,
  p_setting_key TEXT,
  p_setting_value JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT user_type = 'admin' INTO v_is_admin FROM profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE leaderboard_settings
  SET setting_value = p_setting_value, updated_by = p_admin_id, updated_at = NOW()
  WHERE setting_key = p_setting_key;

  IF NOT FOUND THEN
    INSERT INTO leaderboard_settings (setting_key, setting_value, updated_by)
    VALUES (p_setting_key, p_setting_value, p_admin_id);
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- SECTION 8.8-8.9: ANTI-GAMING & FAIRNESS FUNCTIONS (Migration 32)
-- ============================================================================
-- These functions were added as part of the leaderboard anti-gaming hardening.
-- They MUST run AFTER update_student_score() is defined (Section 7.4).
--
-- Key principle: leaderboard_score, elo_rating, monthly_score and related
-- scoring columns on the students table are NEVER written by the client.
-- The client calls these RPCs; the server validates and writes atomically.
-- ============================================================================

-- 8.8a Helper: Calculate practice score from recent practice sessions
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

  IF v_total_questions > 0 THEN
    v_accuracy := (v_total_correct::DECIMAL / v_total_questions) * 100;
    v_practice_score := LEAST(100, v_accuracy + LEAST(10, v_total_questions / 50.0));
  END IF;

  RETURN ROUND(v_practice_score, 2);
END;
$$;

-- 8.8b Helper: Calculate streak bonus
CREATE OR REPLACE FUNCTION calculate_streak_bonus(p_student_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current_streak INTEGER := 0;
  v_streak_bonus DECIMAL := 0;
BEGIN
  SELECT COALESCE(current_streak, 0)
  INTO v_current_streak
  FROM students
  WHERE id = p_student_id;

  -- 7-day streak = 50 points, 14-day = 75 points, 30-day = 100 points
  IF v_current_streak >= 30 THEN
    v_streak_bonus := 100;
  ELSIF v_current_streak >= 14 THEN
    v_streak_bonus := 75 + ((v_current_streak - 14) * 1.5625);
  ELSIF v_current_streak >= 7 THEN
    v_streak_bonus := 50 + ((v_current_streak - 7) * 3.57);
  ELSIF v_current_streak > 0 THEN
    v_streak_bonus := v_current_streak * 7.14;
  END IF;

  RETURN ROUND(LEAST(100, v_streak_bonus), 2);
END;
$$;

-- 8.8c Server-side leaderboard score update after exam (HYBRID SCORING)
-- Formula: 70% exam score + 20% practice score + 10% streak bonus
-- Drop existing function first because return type changed from old ELO-based version
-- LEADERBOARD GUARD added (hotfix 73): teacher exams silently return zeros — no leaderboard update.
-- Last-4-exams loop filters to is_official=TRUE only.
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
  v_visible_score     INTEGER;
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

  -- 3. Verify the exam attempt is real, completed, and belongs to caller;
  --    also fetch is_official to decide whether to update leaderboard.
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

  -- LEADERBOARD GUARD: teacher exams do not affect leaderboard — return zeros silently.
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

  -- 4. Calculate EXAM SCORE (70% weight) - weighted average of last 4 OFFICIAL exams
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

  -- 5. Calculate PRACTICE SCORE (20% weight)
  v_practice_score := calculate_practice_score(v_user_id);

  -- 6. Calculate STREAK BONUS (10% weight)
  v_streak_bonus := calculate_streak_bonus(p_student_id);

  -- 7. Calculate FINAL HYBRID SCORE
  v_final_score := ROUND(
    (v_exam_score * 0.70) +
    (v_practice_score * 0.20) +
    (v_streak_bonus * 0.10),
    2
  );

  -- 8. Update student's hybrid leaderboard score
  UPDATE students
  SET    leaderboard_score = v_final_score,
         practice_score = v_practice_score,
         updated_at = NOW()
  WHERE  id = p_student_id;

  -- 9. Refresh the visible leaderboard points too.
  -- Hotfix 90 made leaderboard reads/ranks use monthly_score, so the official
  -- exam completion path must keep the ELO/monthly score in sync with the
  -- hybrid score. The app-level flows guard against duplicate calls.
  PERFORM 1
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

  v_visible_score := GREATEST(0, LEAST(1000, ROUND(v_final_score * 10)));

  UPDATE students
  SET monthly_score = v_visible_score,
      last_score_update = NOW(),
      updated_at = NOW()
  WHERE id = p_student_id;

  UPDATE mock_exam_attempts
  SET leaderboard_score_updated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_attempt_id;

  RETURN QUERY
  SELECT
    v_visible_score::DECIMAL AS new_leaderboard_score,
    ROUND(v_exam_score, 2)     AS exam_component,
    v_practice_score           AS practice_component,
    v_streak_bonus             AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Official exam leaderboard scoring. Stores visible monthly_score as hybrid performance points from 0 to 1000 and returns it as new_leaderboard_score. '
  'Hybrid component: 70% exam (weighted avg of last 4 official exams), 20% practice (30-day accuracy), 10% streak bonus. '
  'Teacher exams (is_official=FALSE) silently return zeros — leaderboard unaffected. '
  'Validates ownership + attempt authenticity and is idempotent per attempt. Clients call via RPC.';

-- 8.9 Sync offline practice sessions atomically
-- Keeps offline replay idempotent by offline_session_id.
CREATE OR REPLACE FUNCTION upsert_practice_answer_with_timing(
  p_practice_session_id UUID,
  p_question_id UUID,
  p_selected_answer TEXT DEFAULT NULL,
  p_text_answer TEXT DEFAULT NULL,
  p_is_correct BOOLEAN DEFAULT NULL,
  p_time_spent_seconds INTEGER DEFAULT 0,
  p_was_skipped BOOLEAN DEFAULT FALSE,
  p_answered_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_user_id UUID;
  v_session_subject_id UUID;
  v_session_question_ids UUID[];
  v_question_subject_id UUID;
  v_question_type TEXT;
  v_correct_answer TEXT;
  v_selected_answer TEXT;
  v_text_answer TEXT;
  v_has_answer BOOLEAN;
  v_was_skipped BOOLEAN;
  v_is_correct BOOLEAN;
  v_time_spent INTEGER;
  v_answered_at TIMESTAMPTZ;
  v_answer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_practice_session_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'Practice session and question are required';
  END IF;

  SELECT ps.user_id, ps.subject_id, COALESCE(ps.question_ids, '{}'::UUID[])
  INTO v_session_user_id, v_session_subject_id, v_session_question_ids
  FROM practice_sessions ps
  WHERE ps.id = p_practice_session_id;

  IF v_session_user_id IS NULL OR v_session_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Practice session not found';
  END IF;

  SELECT q.subject_id, COALESCE(q.question_type, 'mcq'), q.correct_answer
  INTO v_question_subject_id, v_question_type, v_correct_answer
  FROM questions q
  WHERE q.id = p_question_id
    AND q.is_active = TRUE;

  IF v_question_subject_id IS NULL THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF v_question_subject_id <> v_session_subject_id THEN
    RAISE EXCEPTION 'Question does not belong to this practice session subject';
  END IF;

  IF array_length(v_session_question_ids, 1) > 0
     AND NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'Question does not belong to this practice session';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::TEXT || ':' || p_practice_session_id::TEXT || ':' || p_question_id::TEXT,
      0
    )
  );

  v_selected_answer := CASE
    WHEN NULLIF(BTRIM(COALESCE(p_selected_answer, '')), '') IN ('A', 'B', 'C', 'D', 'E')
      THEN NULLIF(BTRIM(p_selected_answer), '')
    ELSE NULL
  END;
  v_text_answer := NULLIF(BTRIM(COALESCE(
    p_text_answer,
    CASE WHEN v_selected_answer IS NULL THEN p_selected_answer ELSE NULL END,
    ''
  )), '');
  v_has_answer := v_selected_answer IS NOT NULL OR v_text_answer IS NOT NULL;
  v_was_skipped := COALESCE(p_was_skipped, FALSE) OR NOT v_has_answer;
  v_time_spent := LEAST(GREATEST(COALESCE(p_time_spent_seconds, 0), 0), 1800);
  v_answered_at := COALESCE(p_answered_at, NOW());

  IF v_was_skipped THEN
    v_is_correct := FALSE;
    v_selected_answer := NULL;
    v_text_answer := NULL;
  ELSIF p_is_correct IS NOT NULL THEN
    v_is_correct := p_is_correct;
  ELSIF v_question_type = 'codable_open' THEN
    v_is_correct := LOWER(BTRIM(COALESCE(v_text_answer, ''))) = LOWER(BTRIM(COALESCE(v_correct_answer, '')));
  ELSE
    v_is_correct := COALESCE(v_selected_answer, '') = COALESCE(v_correct_answer, '');
  END IF;

  SELECT sa.id
  INTO v_answer_id
  FROM student_answers sa
  WHERE sa.user_id = v_user_id
    AND sa.practice_session_id = p_practice_session_id
    AND sa.question_id = p_question_id
  ORDER BY sa.answered_at DESC NULLS LAST, sa.created_at DESC NULLS LAST, sa.id DESC
  LIMIT 1;

  IF v_answer_id IS NULL THEN
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
    ) VALUES (
      v_user_id,
      p_question_id,
      p_practice_session_id,
      v_selected_answer,
      v_text_answer,
      v_is_correct,
      v_time_spent,
      v_was_skipped,
      v_answered_at
    )
    RETURNING id INTO v_answer_id;
  ELSE
    UPDATE student_answers
    SET
      selected_answer = v_selected_answer,
      text_answer = v_text_answer,
      is_correct = v_is_correct,
      was_skipped = v_was_skipped,
      time_spent_seconds = GREATEST(COALESCE(student_answers.time_spent_seconds, 0), v_time_spent),
      answered_at = GREATEST(COALESCE(student_answers.answered_at, v_answered_at), v_answered_at)
    WHERE id = v_answer_id;
  END IF;

  RETURN v_answer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_practice_answer_with_timing(
  UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, BOOLEAN, TIMESTAMPTZ
) TO authenticated;

COMMENT ON FUNCTION upsert_practice_answer_with_timing IS
  'Ownership-checked practice answer upsert that stores cumulative per-question timing in student_answers.';

CREATE OR REPLACE FUNCTION get_student_timing_performance(
  p_student_id UUID,
  p_period_days INTEGER DEFAULT 30,
  p_subject_id UUID DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  subject_name_en TEXT,
  subject_name_az TEXT,
  topic_name TEXT,
  subtopic_id UUID,
  subtopic_name TEXT,
  total_attempts INTEGER,
  answered_attempts INTEGER,
  skipped_attempts INTEGER,
  correct_attempts INTEGER,
  accuracy NUMERIC,
  avg_time_seconds NUMERIC,
  median_time_seconds NUMERIC,
  p95_time_seconds NUMERIC,
  avg_expected_seconds NUMERIC,
  easy_attempts INTEGER,
  medium_attempts INTEGER,
  hard_attempts INTEGER,
  fast_count INTEGER,
  normal_count INTEGER,
  slow_count INTEGER,
  very_slow_count INTEGER,
  last_attempted TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_student_user_id UUID;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT s.user_id INTO v_student_user_id
  FROM students s
  WHERE s.id = p_student_id;

  IF v_student_user_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM admins a
    WHERE a.user_id = v_user_id
      AND a.is_active = TRUE
  ) INTO v_is_admin;

  IF v_student_user_id <> v_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH canonical_answers AS (
    SELECT DISTINCT ON (sa.user_id, sa.practice_session_id, sa.question_id)
      sa.user_id,
      sa.practice_session_id,
      sa.question_id,
      COALESCE(sa.is_correct, FALSE) AS is_correct,
      COALESCE(sa.was_skipped, FALSE) AS was_skipped,
      LEAST(GREATEST(COALESCE(sa.time_spent_seconds, 0), 0), 1800) AS time_spent_seconds,
      COALESCE(sa.answered_at, sa.created_at) AS answered_at
    FROM student_answers sa
    JOIN practice_sessions ps ON ps.id = sa.practice_session_id
    WHERE ps.user_id = v_student_user_id
      AND ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - (GREATEST(COALESCE(p_period_days, 30), 1) || ' days')::INTERVAL
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  ),
  answer_context AS (
    SELECT
      ca.*,
      q.subject_id,
      q.topic,
      q.subtopic_id,
      LOWER(COALESCE(q.difficulty, 'medium')) AS difficulty,
      CASE LOWER(COALESCE(q.difficulty, 'medium'))
        WHEN 'easy' THEN 35
        WHEN 'hard' THEN 120
        ELSE 75
      END AS expected_seconds
    FROM canonical_answers ca
    JOIN questions q ON q.id = ca.question_id
    WHERE p_subject_id IS NULL OR q.subject_id = p_subject_id
  )
  SELECT
    s.id AS subject_id,
    s.name_en AS subject_name,
    s.name_en AS subject_name_en,
    s.name_az AS subject_name_az,
    ac.topic AS topic_name,
    ss.id AS subtopic_id,
    ss.subtopic_name,
    COUNT(*)::INTEGER AS total_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE))::INTEGER AS answered_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = TRUE))::INTEGER AS skipped_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.is_correct = TRUE))::INTEGER AS correct_attempts,
    ROUND(
      COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE ac.was_skipped = FALSE), 0) * 100,
      2
    ) AS accuracy,
    ROUND((AVG(ac.time_spent_seconds) FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds,
    (percentile_disc(0.5) WITHIN GROUP (ORDER BY ac.time_spent_seconds)
      FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC AS median_time_seconds,
    (percentile_disc(0.95) WITHIN GROUP (ORDER BY ac.time_spent_seconds)
      FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC AS p95_time_seconds,
    ROUND((AVG(ac.expected_seconds) FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC, 1) AS avg_expected_seconds,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'easy'))::INTEGER AS easy_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'medium'))::INTEGER AS medium_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'hard'))::INTEGER AS hard_attempts,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE AND ac.time_spent_seconds <= ac.expected_seconds * 0.6
    ))::INTEGER AS fast_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE
        AND ac.time_spent_seconds > ac.expected_seconds * 0.6
        AND ac.time_spent_seconds <= ac.expected_seconds * 1.2
    ))::INTEGER AS normal_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE
        AND ac.time_spent_seconds > ac.expected_seconds * 1.2
        AND ac.time_spent_seconds <= ac.expected_seconds * 2.0
    ))::INTEGER AS slow_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE AND ac.time_spent_seconds > ac.expected_seconds * 2.0
    ))::INTEGER AS very_slow_count,
    MAX(ac.answered_at) AS last_attempted
  FROM answer_context ac
  JOIN subjects s ON s.id = ac.subject_id
  LEFT JOIN subject_subtopics ss ON ss.id = ac.subtopic_id
  GROUP BY s.id, s.name_en, s.name_az, ac.topic, ss.id, ss.subtopic_name
  HAVING COUNT(*) > 0
  ORDER BY s.name_en, ac.topic NULLS LAST, ss.subtopic_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_timing_performance(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION get_student_timing_performance IS
  'Student/admin scoped timing analytics over deduplicated canonical practice answers with localized subject names and difficulty-adjusted bucket context.';

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
  v_session_id UUID;
  v_answer JSONB;
  v_question_id UUID;
  v_selected_answer TEXT;
  v_answered_at TIMESTAMPTZ;
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

  SELECT id INTO v_student_id
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
    question_ids,
    offline_session_id
  ) VALUES (
    v_user_id,
    p_subject_id,
    p_mode,
    GREATEST(COALESCE(p_total_questions, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(COALESCE(p_total_time_seconds, 0), 0),
    TRUE,
    COALESCE(p_started_at, NOW()),
    COALESCE(p_completed_at, NOW()),
    COALESCE(p_question_ids, '{}'::UUID[]),
    p_offline_session_id
  )
  RETURNING id INTO v_session_id;

  IF jsonb_typeof(COALESCE(p_answers, '[]'::JSONB)) = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(COALESCE(p_answers, '[]'::JSONB))
    LOOP
      v_question_id := NULLIF(v_answer ->> 'question_id', '')::UUID;
      v_selected_answer := NULLIF(v_answer ->> 'selected_answer', '');
      v_answered_at := COALESCE(NULLIF(v_answer ->> 'answered_at', '')::TIMESTAMPTZ, COALESCE(p_completed_at, NOW()));

      IF v_question_id IS NOT NULL AND v_selected_answer IN ('A', 'B', 'C', 'D', 'E') THEN
        INSERT INTO student_answers (
          user_id,
          question_id,
          practice_session_id,
          selected_answer,
          is_correct,
          time_spent_seconds,
          was_skipped,
          answered_at
        )
        SELECT
          v_user_id,
          v_question_id,
          v_session_id,
          v_selected_answer,
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
    COALESCE(p_completed_at::DATE, CURRENT_DATE),
    GREATEST(COALESCE(p_total_questions, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(ROUND(COALESCE(p_total_time_seconds, 0)::NUMERIC / 60)::INTEGER, 0),
    0,
    0,
    1
  );

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION sync_offline_practice_session IS
  'Idempotently syncs a complete offline practice/quiz session owned by auth.uid() into practice_sessions, student_answers, and daily_stats.';

-- 8.10 Upsert offline session stats to the correct session date
-- Prevents stat inflation when syncing multi-day offline sessions at once.
CREATE OR REPLACE FUNCTION upsert_offline_session_stats(
  p_user_id              UUID,
  p_session_date         DATE,
  p_questions_answered   INTEGER,
  p_correct_answers      INTEGER,
  p_study_time_minutes   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  -- Verify the caller owns this user record (anti-spoofing)
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot update stats for another user';
  END IF;

  SELECT id INTO v_student_id
  FROM students
  WHERE user_id = p_user_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  PERFORM update_daily_stats(
    v_student_id,
    COALESCE(p_session_date, CURRENT_DATE),
    GREATEST(COALESCE(p_questions_answered, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(COALESCE(p_study_time_minutes, 0), 0),
    0,
    0,
    1
  );
END;
$$;

COMMENT ON FUNCTION upsert_offline_session_stats IS
  'Legacy helper for crediting offline practice stats to daily_stats on the original session date.';

-- 8.10b Hotfix 103: offline sync Home surfaces and read-time streak status.
-- This backport intentionally appears after the original S10.2/102 definitions
-- so the final deployed function bodies match the live hotfix history.
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

  IF v_today_active OR v_last_activity_date = v_current_activity_date THEN
    v_display_streak := GREATEST(calculate_student_streak(p_student_id, v_user_timezone), v_current_streak, 1);
    RETURN QUERY SELECT
      v_display_streak,
      'active'::TEXT,
      24::INTEGER,
      (v_display_streak > v_best_streak)::BOOLEAN;
    RETURN;
  END IF;

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

-- 8.7 Get Top Performers
CREATE OR REPLACE FUNCTION get_top_performers(
  p_limit INTEGER DEFAULT 10,
  p_city TEXT DEFAULT NULL,
  p_target_group TEXT DEFAULT NULL
)
RETURNS TABLE(
  rank INTEGER, student_id UUID, student_name TEXT, elo_rating INTEGER,
  monthly_score INTEGER, current_streak INTEGER, total_exams INTEGER,
  city TEXT, target_group TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY s.monthly_score DESC, s.elo_rating DESC)::INTEGER,
    s.id,
    CONCAT(SPLIT_PART(p.full_name, ' ', 1), ' ', LEFT(SPLIT_PART(p.full_name, ' ', 2), 1), '.'),
    s.elo_rating, s.monthly_score, s.current_streak, s.total_exams_taken,
    s.city, s.target_group
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  WHERE s.show_in_leaderboard = TRUE
    AND (p_city IS NULL OR s.city = p_city)
    AND (p_target_group IS NULL OR s.target_group = p_target_group)
  ORDER BY s.monthly_score DESC, s.elo_rating DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- SECTION 9: COMPETITIVE MODE FUNCTIONS (S10, S10.1)
-- ============================================================================

-- 9.1 Get student weak topics
CREATE OR REPLACE FUNCTION get_student_weak_topics(
  p_student_id UUID,
  p_subject_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  topic TEXT, total_questions INTEGER, correct_questions INTEGER, accuracy NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.topic, COUNT(*)::INTEGER,
    SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::INTEGER,
    ROUND((SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
  FROM competitive_question_results r
  WHERE r.student_id = p_student_id AND r.subject_id = p_subject_id
  GROUP BY r.topic
  HAVING COUNT(*) >= 3
    AND (SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) < 0.60
  ORDER BY accuracy ASC, total_questions DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.2 Get student recent accuracy
CREATE OR REPLACE FUNCTION get_student_recent_accuracy(
  p_student_id UUID,
  p_subject_id UUID,
  p_question_count INTEGER DEFAULT 50
)
RETURNS NUMERIC AS $$
DECLARE
  v_accuracy NUMERIC;
BEGIN
  SELECT ROUND(
    (SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2
  )
  INTO v_accuracy
  FROM (
    SELECT is_correct
    FROM competitive_question_results
    WHERE student_id = p_student_id AND subject_id = p_subject_id
    ORDER BY created_at DESC
    LIMIT p_question_count
  ) recent_questions;
  
  RETURN COALESCE(v_accuracy, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.3 Check if first session
CREATE OR REPLACE FUNCTION is_first_session(
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_session_count
  FROM competitive_sessions
  WHERE student_id = p_student_id AND subject_id = p_subject_id;
  RETURN v_session_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.4 Get topic performance summary
CREATE OR REPLACE FUNCTION get_topic_performance_summary(
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS TABLE (
  topic TEXT, total_questions INTEGER, correct_questions INTEGER,
  accuracy NUMERIC, avg_time_spent NUMERIC, last_attempted TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.topic, COUNT(*)::INTEGER,
    SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::INTEGER,
    ROUND((SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2),
    ROUND(AVG(r.time_spent), 2),
    MAX(r.created_at)
  FROM competitive_question_results r
  WHERE r.student_id = p_student_id AND r.subject_id = p_subject_id
  GROUP BY r.topic
  ORDER BY accuracy ASC, total_questions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.5 Get student weak subtopics (Stage 7 — subtopic-level breakdown)
-- Companion to get_student_weak_topics(); only includes results with subtopic_id recorded.
CREATE OR REPLACE FUNCTION get_student_weak_subtopics(
  p_student_id UUID,
  p_subject_id UUID,
  p_limit       INTEGER DEFAULT 50
)
RETURNS TABLE (
  subtopic_id       UUID,
  subtopic_name     TEXT,
  topic             TEXT,
  total_questions   INTEGER,
  correct_questions INTEGER,
  accuracy          NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.subtopic_id,
    ss.subtopic_name,
    r.topic,
    COUNT(*)::INTEGER,
    SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::INTEGER,
    ROUND(
      (SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2
    )
  FROM competitive_question_results r
  JOIN subject_subtopics ss ON ss.id = r.subtopic_id
  WHERE r.student_id  = p_student_id
    AND r.subject_id  = p_subject_id
    AND r.subtopic_id IS NOT NULL
  GROUP BY r.subtopic_id, ss.subtopic_name, r.topic
  HAVING COUNT(*) >= 3
    AND (SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) < 0.60
  ORDER BY accuracy ASC, total_questions DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_student_weak_subtopics(UUID, UUID, INTEGER) TO authenticated;

-- 9.6 Clear expired competitive cache (S10.1)
CREATE OR REPLACE FUNCTION clear_expired_competitive_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM competitive_sessions
  WHERE cache_expires_at < NOW() AND status = 'completed';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- 9.6 Clear all competitive cache (admin only, S10.1)
CREATE OR REPLACE FUNCTION clear_all_competitive_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can clear all cache';
  END IF;

  DELETE FROM competitive_sessions WHERE status = 'completed';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- 9.7 Debug session history (S10.1)
CREATE OR REPLACE FUNCTION debug_session_history(p_student_id UUID)
RETURNS TABLE(
  session_id UUID, status TEXT, created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, question_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id, cs.status, cs.created_at, cs.cache_expires_at,
    COUNT(cqr.id)
  FROM competitive_sessions cs
  LEFT JOIN competitive_question_results cqr ON cs.id = cqr.session_id
  WHERE cs.student_id = p_student_id
  GROUP BY cs.id, cs.status, cs.created_at, cs.cache_expires_at
  ORDER BY cs.created_at DESC;
END;
$$;

-- ============================================================================
-- SECTION 10: AI FUNCTIONS (S9.5)
-- ============================================================================

-- 10.1 Cleanup expired AI insights
CREATE OR REPLACE FUNCTION cleanup_expired_insights()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_insights
  WHERE expires_at < NOW() AND is_read = TRUE;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 10.2 Get cached AI insight
CREATE OR REPLACE FUNCTION get_cached_ai_insight(
  p_student_id UUID,
  p_insight_type TEXT
)
RETURNS JSONB AS $$
DECLARE
  cached_insight JSONB;
BEGIN
  SELECT insight_data INTO cached_insight
  FROM ai_insights
  WHERE student_id = p_student_id
    AND insight_type = p_insight_type
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY generated_at DESC
  LIMIT 1;
  RETURN cached_insight;
END;
$$ LANGUAGE plpgsql;

-- 10.3 Get AI cost statistics
CREATE OR REPLACE FUNCTION get_ai_cost_stats(
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_requests BIGINT, total_cost DECIMAL(10,4), avg_cost DECIMAL(10,4),
  total_tokens BIGINT, success_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COALESCE(SUM(cost_usd), 0),
    COALESCE(AVG(cost_usd), 0),
    COALESCE(SUM(tokens_used), 0)::BIGINT,
    (COUNT(*) FILTER (WHERE success = true)::DECIMAL / NULLIF(COUNT(*), 0) * 100)
  FROM ai_usage_logs
  WHERE created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 10A: ROLE HIERARCHY FUNCTIONS (Admin S2)
-- ============================================================================

-- 10A.1 Get role level for hierarchy comparison
CREATE OR REPLACE FUNCTION get_role_level(role admin_role)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE role
    WHEN 'super_admin' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'moderator' THEN 1
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 10A.2 Check if one role can manage another
CREATE OR REPLACE FUNCTION can_manage_role(
  current_user_role admin_role,
  target_role admin_role
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_role_level(current_user_role) > get_role_level(target_role);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 10A.3 Prevent super admin demotion (FIX_TRIGGERS authoritative - handles NULL auth.uid())
CREATE OR REPLACE FUNCTION prevent_super_admin_demotion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'super_admin' AND NEW.role != 'super_admin' THEN
    IF (SELECT COUNT(*) FROM admins WHERE role = 'super_admin' AND is_active = true) <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last super admin';
    END IF;
    IF auth.uid() IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM admins
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
      ) THEN
        RAISE EXCEPTION 'Only super admins can demote other super admins';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10A.4 Prevent last super admin deletion (FIX_TRIGGERS authoritative)
CREATE OR REPLACE FUNCTION prevent_last_super_admin_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'super_admin' AND OLD.is_active = true THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = false) THEN
      IF (SELECT COUNT(*) FROM admins WHERE role = 'super_admin' AND is_active = true) <= 1 THEN
        RAISE EXCEPTION 'Cannot delete or deactivate the last super admin';
      END IF;
      IF auth.uid() IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM admins
          WHERE user_id = auth.uid()
          AND role = 'super_admin'
          AND is_active = true
        ) THEN
          RAISE EXCEPTION 'Only super admins can delete or deactivate other super admins';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 10B: AI PROMPT MANAGEMENT FUNCTIONS (Admin S5.5)
-- ============================================================================

-- 10B.1 Increment prompt usage counter
CREATE OR REPLACE FUNCTION increment_prompt_usage(prompt_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_prompts
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE id = prompt_id;
END;
$$;

-- 10B.2 Update prompt stats from usage logs
CREATE OR REPLACE FUNCTION update_prompt_stats(prompt_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_quality NUMERIC;
  v_avg_latency INTEGER;
  v_avg_cost NUMERIC;
  v_success_count INTEGER;
BEGIN
  SELECT 
    AVG(quality_score)::NUMERIC(3,2),
    ROUND(AVG(latency_ms))::INTEGER,
    AVG(cost_usd)::NUMERIC(10,6),
    COUNT(*) FILTER (WHERE status = 'success')
  INTO v_avg_quality, v_avg_latency, v_avg_cost, v_success_count
  FROM ai_usage_logs
  WHERE request_metadata->>'prompt_id' = prompt_id::text;
  
  UPDATE ai_prompts
  SET 
    avg_quality_score = v_avg_quality,
    avg_latency_ms = v_avg_latency,
    avg_cost_usd = v_avg_cost,
    success_count = v_success_count
  WHERE id = prompt_id;
END;
$$;

-- 10B.3 Auto-update ai_prompts updated_at
CREATE OR REPLACE FUNCTION update_ai_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10B.4 Auto-update notification timestamp
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 10C: PUSH TOKEN FUNCTIONS (S9/FIX_RLS — HIGH-03 security audit fix)
-- ============================================================================

-- 10C.1 Upsert push token with time-bound auth validation
CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_user_id UUID,
  p_token TEXT,
  p_platform TEXT DEFAULT 'unknown',
  p_device_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'User ID and token cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot register token for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  -- Upsert the push token
  INSERT INTO public.push_tokens (
    user_id, token, platform, device_name, updated_at
  ) VALUES (
    p_user_id, p_token, p_platform, p_device_name, NOW()
  )
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error upserting push token for user %: %', p_user_id, SQLERRM;
    RETURN FALSE;
END;
$$;

-- Grant to both authenticated and anon (needed for signup flow)
GRANT EXECUTE ON FUNCTION public.upsert_push_token(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_push_token(UUID, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- SECTION 11: MESSAGING FUNCTIONS (S10)
-- ============================================================================

-- 11.1 Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message = COALESCE(
      NEW.content,
      CASE NEW.file_type
        WHEN 'image' THEN '📷 Photo'
        WHEN 'pdf'   THEN '📄 PDF'
        ELSE              '📎 File'
      END
    ),
    last_message_at = NEW.created_at,
    updated_at = NOW(),
    unread_count_student = CASE 
      WHEN NEW.sender_type = 'teacher' THEN unread_count_student + 1
      ELSE unread_count_student
    END,
    unread_count_teacher = CASE 
      WHEN NEW.sender_type = 'student' THEN unread_count_teacher + 1
      ELSE unread_count_teacher
    END
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11.2 Mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_sender_type TEXT;
BEGIN
  SELECT 
    CASE 
      WHEN student_id IN (SELECT id FROM students WHERE user_id = p_user_id) THEN 'teacher'
      WHEN teacher_id IN (SELECT id FROM teachers WHERE user_id = p_user_id) THEN 'student'
    END INTO v_sender_type
  FROM conversations
  WHERE id = p_conversation_id;
  
  UPDATE messages
  SET read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_type = v_sender_type
    AND read_at IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  IF v_sender_type = 'student' THEN
    UPDATE conversations SET unread_count_teacher = 0 WHERE id = p_conversation_id;
  ELSE
    UPDATE conversations SET unread_count_student = 0 WHERE id = p_conversation_id;
  END IF;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 12: STUDY SESSION HELPER FUNCTIONS (S9.1)
-- ============================================================================

-- 12.1 Get recent study sessions
CREATE OR REPLACE FUNCTION get_recent_study_sessions(
  p_student_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, subject_name TEXT, duration_minutes INTEGER,
  questions_attempted INTEGER, questions_correct INTEGER,
  accuracy DECIMAL(5,2), start_time TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.id,
    COALESCE(s.name_en, 'General'),
    ss.duration_minutes,
    ss.questions_attempted,
    ss.questions_correct,
    CASE 
      WHEN ss.questions_attempted > 0 
      THEN (ss.questions_correct::DECIMAL / ss.questions_attempted * 100)
      ELSE 0 
    END,
    ss.start_time
  FROM study_sessions ss
  LEFT JOIN subjects s ON ss.subject_id = s.id
  WHERE ss.student_id = p_student_id
    AND ss.end_time IS NOT NULL
  ORDER BY ss.start_time DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 12.2 Calculate study streak (S9.1)
CREATE OR REPLACE FUNCTION calculate_study_streak(p_student_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_streak INTEGER := 0;
  check_date DATE;
BEGIN
  check_date := CURRENT_DATE;
  
  LOOP
    IF EXISTS (
      SELECT 1 FROM study_sessions
      WHERE student_id = p_student_id AND DATE(start_time) = check_date
    ) OR EXISTS (
      SELECT 1 FROM student_exam_attempts
      WHERE student_id = p_student_id AND DATE(started_at) = check_date
    ) THEN
      current_streak := current_streak + 1;
      check_date := check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
    
    IF current_streak >= 365 THEN EXIT; END IF;
  END LOOP;
  
  RETURN current_streak;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 12.5: TEACHER MARKETPLACE FUNCTIONS (S10.2B)
-- ============================================================================

-- 12.5.1 Get student's assigned teachers
CREATE OR REPLACE FUNCTION get_student_teachers(p_student_id UUID)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  teacher_id UUID,
  teacher_name TEXT,
  teacher_city TEXT,
  assigned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id as subject_id,
    sub.name_az as subject_name,
    t.id as teacher_id,
    p.full_name as teacher_name,
    p.city as teacher_city,
    st.created_at as assigned_at
  FROM student_teachers st
  JOIN subjects sub ON st.subject_id = sub.id
  JOIN teachers t ON st.teacher_id = t.id
  JOIN profiles p ON t.user_id = p.id
  WHERE st.student_id = p_student_id
  ORDER BY sub.name_az;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_student_teachers IS 'Get all teachers assigned by a student';

-- 12.5.2 Search teachers (student-facing)
DROP FUNCTION IF EXISTS search_teachers(TEXT, UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION search_teachers(
  p_query TEXT,
  p_subject_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  teacher_id UUID,
  teacher_name TEXT,
  teacher_city TEXT,
  teacher_avatar_url TEXT,
  subject_count INTEGER,
  student_count INTEGER
) AS $$
DECLARE
  v_subject_name_en TEXT;
  v_subject_name_az TEXT;
BEGIN
  IF p_subject_id IS NOT NULL THEN
    SELECT name_en, name_az INTO v_subject_name_en, v_subject_name_az
    FROM subjects WHERE id = p_subject_id;
  END IF;

  RETURN QUERY
  SELECT
    t.id as teacher_id,
    p.full_name as teacher_name,
    p.city as teacher_city,
    p.avatar_url as teacher_avatar_url,
    COALESCE(array_length(t.specializations, 1), 0)::INTEGER as subject_count,
    (
      SELECT COUNT(DISTINCT student_id) FROM (
        SELECT student_id FROM student_teachers st WHERE st.teacher_id = t.id
        UNION
        SELECT student_id FROM bookings b WHERE b.teacher_id = t.id AND b.status = 'completed'
      ) AS combined_students
    )::INTEGER as student_count
  FROM teachers t
  JOIN profiles p ON t.user_id = p.id
  WHERE
    (p_query IS NULL OR p_query = '' OR p.full_name ILIKE '%' || p_query || '%')
    AND (
      v_subject_name_en IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(t.specializations) AS spec
        WHERE
          LOWER(spec) = LOWER(v_subject_name_en)
          OR LOWER(spec) = LOWER(v_subject_name_az)
          OR spec ILIKE '%' || v_subject_name_en || '%'
          OR v_subject_name_en ILIKE '%' || spec || '%'
          OR spec ILIKE '%' || v_subject_name_az || '%'
          OR v_subject_name_az ILIKE '%' || spec || '%'
      )
    )
    AND (p_city IS NULL OR p.city = p_city)
  GROUP BY t.id, p.full_name, p.city, p.avatar_url, t.specializations
  ORDER BY student_count DESC, p.full_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION search_teachers IS 'Search for teachers by name, subject, or city';

-- 12.5.3 Assign teacher to subject
CREATE OR REPLACE FUNCTION assign_teacher_to_subject(
  p_student_id UUID,
  p_subject_id UUID,
  p_teacher_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO student_teachers (student_id, subject_id, teacher_id, status)
  VALUES (p_student_id, p_subject_id, p_teacher_id, 'active')
  ON CONFLICT (student_id, subject_id)
  DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id,
    status     = 'active',
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'assign_teacher_to_subject error: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assign_teacher_to_subject IS 'Assign or update teacher for a subject';

-- 12.5.4 Remove teacher from subject
CREATE OR REPLACE FUNCTION remove_teacher_from_subject(
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM student_teachers
  WHERE student_id = p_student_id
    AND subject_id = p_subject_id;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION remove_teacher_from_subject IS 'Remove teacher assignment for a subject';

-- 12.5.5 Get leaderboard with teacher info
CREATE OR REPLACE FUNCTION get_leaderboard_with_teachers(
  p_city TEXT DEFAULT NULL,
  p_rank_type TEXT DEFAULT 'score',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  student_id UUID,
  display_name TEXT,
  score DECIMAL,
  streak INTEGER,
  city TEXT,
  target_group TEXT,
  rank BIGINT,
  teachers JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_students AS (
    SELECT
      s.id,
      SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
      s.monthly_score::DECIMAL as score,
      s.current_streak,
      s.city,
      s.target_group,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN p_rank_type = 'score' THEN s.monthly_score
            ELSE s.current_streak
          END DESC
      ) as rank
    FROM students s
    JOIN profiles p ON s.user_id = p.id
    LEFT JOIN user_settings us ON p.id = us.user_id
    WHERE
      (p_city IS NULL OR s.city = p_city)
      AND COALESCE(us.show_in_leaderboard, true) = true
      AND (
        CASE
          WHEN p_rank_type = 'score' THEN s.monthly_score > 0
          ELSE s.current_streak > 0
        END
      )
  ),
  student_teachers_agg AS (
    SELECT
      st.student_id,
      jsonb_agg(
        jsonb_build_object(
          'subject', sub.name_az,
          'teacher_name', tp.full_name,
          'teacher_city', tp.city
        )
      ) as teachers
    FROM student_teachers st
    JOIN subjects sub ON st.subject_id = sub.id
    JOIN teachers t ON st.teacher_id = t.id
    JOIN profiles tp ON t.user_id = tp.id
    JOIN leaderboard_display_settings lds ON st.student_id = lds.student_id
    WHERE lds.show_teachers = true
    GROUP BY st.student_id
  )
  SELECT
    rs.id as student_id,
    rs.display_name,
    rs.score,
    rs.current_streak as streak,
    rs.city,
    rs.target_group,
    rs.rank,
    COALESCE(sta.teachers, '[]'::jsonb) as teachers
  FROM ranked_students rs
  LEFT JOIN student_teachers_agg sta ON rs.id = sta.student_id
  ORDER BY rs.rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_leaderboard_with_teachers IS 'Get leaderboard with teacher information';

-- 12.5.6 Trigger function: update student_teachers timestamp
CREATE OR REPLACE FUNCTION update_student_teachers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 13: ALL TRIGGERS
-- ============================================================================

-- 13.1 Auth triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_user_settings();

-- 13.2 Profile sync triggers (S9)
DROP TRIGGER IF EXISTS sync_profile_to_student_trigger ON profiles;
CREATE TRIGGER sync_profile_to_student_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  WHEN (
    OLD.city IS DISTINCT FROM NEW.city OR
    OLD.bio IS DISTINCT FROM NEW.bio OR
    OLD.target_university IS DISTINCT FROM NEW.target_university OR
    OLD.target_group IS DISTINCT FROM NEW.target_group
  )
  EXECUTE FUNCTION sync_profile_to_student();

DROP TRIGGER IF EXISTS sync_profile_to_teacher_trigger ON profiles;
CREATE TRIGGER sync_profile_to_teacher_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  WHEN (
    OLD.city IS DISTINCT FROM NEW.city OR
    OLD.bio IS DISTINCT FROM NEW.bio
  )
  EXECUTE FUNCTION sync_profile_to_teacher();

-- 13.3 updated_at triggers (applied to all tables with updated_at)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teachers_updated_at ON teachers;
CREATE TRIGGER update_teachers_updated_at
  BEFORE UPDATE ON teachers FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sync denormalized user_id columns on bookings (M28 - breaks RLS recursion)
CREATE OR REPLACE FUNCTION public.bookings_sync_user_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT user_id INTO NEW.student_user_id FROM students WHERE id = NEW.student_id;
  SELECT user_id INTO NEW.teacher_user_id FROM teachers WHERE id = NEW.teacher_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_sync_user_ids ON public.bookings;
CREATE TRIGGER trg_bookings_sync_user_ids
  BEFORE INSERT OR UPDATE OF student_id, teacher_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_sync_user_ids();

-- Guard booking lifecycle/payment transitions for normal authenticated clients.
-- Service-role Edge Functions/webhooks keep authority for Stripe/admin flows
-- because auth.uid() is NULL in those server-side calls.
CREATE OR REPLACE FUNCTION public.guard_booking_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_student BOOLEAN := FALSE;
  v_is_teacher BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = v_actor
      AND is_active = TRUE
  )
  INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  v_is_student := OLD.student_user_id = v_actor;
  v_is_teacher := OLD.teacher_user_id = v_actor;

  IF NOT v_is_student AND NOT v_is_teacher THEN
    RAISE EXCEPTION 'You are not allowed to update this booking';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Payment status can only be changed by the payment system';
  END IF;

  IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
    RAISE EXCEPTION 'Payment intent can only be changed by the payment system';
  END IF;

  IF NEW.price IS DISTINCT FROM OLD.price THEN
    RAISE EXCEPTION 'Booking price can only be changed by the server';
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Completed bookings cannot be cancelled';
    END IF;

    IF OLD.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Paid bookings require support/refund handling before cancellation';
    END IF;

    IF v_is_student AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Students can only cancel before teacher acceptance';
    END IF;

    IF v_is_teacher AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Teachers can only cancel before payment flow starts';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    IF NOT v_is_teacher THEN
      RAISE EXCEPTION 'Only the teacher can confirm a free booking from the client';
    END IF;

    IF OLD.status <> 'pending' OR OLD.payment_status <> 'free' THEN
      RAISE EXCEPTION 'Use the payment flow to confirm paid bookings';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status = 'awaiting_payment' AND OLD.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'Use the payment flow to request payment';
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    IF NOT v_is_teacher THEN
      RAISE EXCEPTION 'Only the teacher can mark a booking completed';
    END IF;

    IF OLD.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be completed';
    END IF;

    IF OLD.payment_status NOT IN ('free', 'paid') THEN
      RAISE EXCEPTION 'Bookings can be completed only after payment is settled';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_state_transitions ON public.bookings;
CREATE TRIGGER trg_guard_booking_state_transitions
  BEFORE UPDATE OF status, payment_status, payment_intent_id, price
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_booking_state_transitions();

COMMENT ON FUNCTION public.guard_booking_state_transitions IS
  'Blocks unsafe authenticated-client booking/payment state transitions. Service-role payment/admin flows remain authoritative.';

DROP TRIGGER IF EXISTS update_study_progress_updated_at ON study_progress;
CREATE TRIGGER update_study_progress_updated_at
  BEFORE UPDATE ON study_progress FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_study_goals_updated_at ON study_goals;
CREATE TRIGGER trigger_study_goals_updated_at
  BEFORE UPDATE ON study_goals FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER trigger_daily_stats_updated_at
  BEFORE UPDATE ON daily_stats FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_study_reminders_updated_at ON study_reminders;
CREATE TRIGGER update_study_reminders_updated_at
  BEFORE UPDATE ON study_reminders FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_test_sets_updated_at ON test_sets;
CREATE TRIGGER update_test_sets_updated_at
  BEFORE UPDATE ON test_sets FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_test_progress_updated_at ON student_test_set_progress;
CREATE TRIGGER update_student_test_progress_updated_at
  BEFORE UPDATE ON student_test_set_progress FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_configuration_updated_at ON ai_configuration;
CREATE TRIGGER update_ai_configuration_updated_at
  BEFORE UPDATE ON ai_configuration FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_subject_subtopics ON subject_subtopics;
CREATE TRIGGER set_updated_at_subject_subtopics
  BEFORE UPDATE ON subject_subtopics FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 13.4 Teacher rating trigger
DROP TRIGGER IF EXISTS update_teacher_rating_trigger ON teacher_reviews;
CREATE TRIGGER update_teacher_rating_trigger
  AFTER INSERT OR UPDATE ON teacher_reviews FOR EACH ROW
  EXECUTE FUNCTION update_teacher_rating();

-- 13.4b Student teachers timestamp trigger (S10.2B)
DROP TRIGGER IF EXISTS trigger_update_student_teachers_timestamp ON student_teachers;
CREATE TRIGGER trigger_update_student_teachers_timestamp
  BEFORE UPDATE ON student_teachers
  FOR EACH ROW
  EXECUTE FUNCTION update_student_teachers_timestamp();

-- 13.5 Goal completion trigger
DROP TRIGGER IF EXISTS trigger_check_goal_completion ON study_goals;
CREATE TRIGGER trigger_check_goal_completion
  BEFORE UPDATE ON study_goals FOR EACH ROW
  EXECUTE FUNCTION check_goal_completion();

-- 13.6 Streak update trigger
DROP TRIGGER IF EXISTS trigger_update_streak ON daily_stats;
CREATE TRIGGER trigger_update_streak
  AFTER INSERT OR UPDATE OF is_active ON daily_stats FOR EACH ROW
  EXECUTE FUNCTION trigger_update_streak_function();

-- 13.7 Messaging trigger
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON messages FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- 13.8 Role hierarchy: prevent super admin demotion
DROP TRIGGER IF EXISTS prevent_super_admin_demotion_trigger ON admins;
CREATE TRIGGER prevent_super_admin_demotion_trigger
  BEFORE UPDATE ON admins FOR EACH ROW
  EXECUTE FUNCTION prevent_super_admin_demotion();

-- 13.9 Role hierarchy: prevent last super admin deletion
DROP TRIGGER IF EXISTS prevent_last_super_admin_deletion_trigger ON admins;
CREATE TRIGGER prevent_last_super_admin_deletion_trigger
  BEFORE DELETE OR UPDATE ON admins FOR EACH ROW
  EXECUTE FUNCTION prevent_last_super_admin_deletion();

-- 13.10 AI prompts updated_at trigger
DROP TRIGGER IF EXISTS trigger_update_ai_prompts_updated_at ON ai_prompts;
CREATE TRIGGER trigger_update_ai_prompts_updated_at
  BEFORE UPDATE ON ai_prompts FOR EACH ROW
  EXECUTE FUNCTION update_ai_prompts_updated_at();

-- 13.9 Notification updated_at trigger
DROP TRIGGER IF EXISTS trigger_update_notification_timestamp ON admin_notifications;
CREATE TRIGGER trigger_update_notification_timestamp
  BEFORE UPDATE ON admin_notifications FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

-- ============================================================================
-- SECTION 14: GRANT PERMISSIONS
-- ============================================================================

-- RLS helper function (Migration 33 - fixes infinite recursion)
GRANT EXECUTE ON FUNCTION public.get_student_protected_columns(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

GRANT EXECUTE ON FUNCTION update_daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_student_streak TO authenticated;
GRANT EXECUTE ON FUNCTION update_student_streak_cache TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_streak_realtime TO authenticated;
GRANT EXECUTE ON FUNCTION update_streak_on_activity TO authenticated;
GRANT EXECUTE ON FUNCTION use_streak_freeze TO authenticated;
GRANT EXECUTE ON FUNCTION recover_streak TO authenticated;
GRANT EXECUTE ON FUNCTION get_streak_status TO authenticated;
GRANT EXECUTE ON FUNCTION get_city_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_national_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_rank TO authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_as_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_expired_competitive_cache TO authenticated;
GRANT EXECUTE ON FUNCTION debug_session_history TO authenticated;
GRANT EXECUTE ON FUNCTION create_student_record TO authenticated;
GRANT EXECUTE ON FUNCTION create_student_record TO anon;
GRANT EXECUTE ON FUNCTION create_teacher_record TO authenticated;
GRANT EXECUTE ON FUNCTION create_teacher_record TO anon;
GRANT EXECUTE ON FUNCTION increment_prompt_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_prompt_usage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_prompt_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_prompt_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_user_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_user_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_user_settings(UUID) TO anon;

-- Anti-gaming functions (Migration 32)
GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_offline_session_stats(UUID, DATE, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Teacher marketplace functions (S10.2B)
GRANT EXECUTE ON FUNCTION get_student_teachers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_teachers(TEXT, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_teacher_to_subject(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_teacher_from_subject(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard_with_teachers(TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- SECTION 18: GOAL SETTING & STUDY PLANS (Phase 1)
-- ============================================================================

-- 18.1 Upsert daily progress (called after practice/exam completion)
CREATE OR REPLACE FUNCTION upsert_daily_progress(
  p_student_id UUID,
  p_questions INT,
  p_correct INT,
  p_time_minutes INT
)
RETURNS daily_progress
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_goal_questions INT;
  v_goal_time INT;
  v_result daily_progress;
BEGIN
  SELECT COALESCE(daily_question_target, 20), COALESCE(daily_time_target_minutes, 30)
  INTO v_goal_questions, v_goal_time
  FROM student_goals WHERE student_id = p_student_id;

  IF NOT FOUND THEN
    v_goal_questions := 20;
    v_goal_time := 30;
  END IF;

  INSERT INTO daily_progress (
    student_id, date, questions_completed, time_spent_minutes, accuracy,
    question_goal_met, time_goal_met
  ) VALUES (
    p_student_id, v_today, p_questions, p_time_minutes,
    CASE WHEN p_questions > 0 THEN ROUND((p_correct::DECIMAL / p_questions) * 100, 2) ELSE 0 END,
    p_questions >= v_goal_questions,
    p_time_minutes >= v_goal_time
  )
  ON CONFLICT (student_id, date) DO UPDATE SET
    questions_completed = daily_progress.questions_completed + p_questions,
    time_spent_minutes = daily_progress.time_spent_minutes + p_time_minutes,
    accuracy = CASE
      WHEN (daily_progress.questions_completed + p_questions) > 0
      THEN ROUND(
        ((daily_progress.accuracy * daily_progress.questions_completed
          + (CASE WHEN p_questions > 0 THEN (p_correct::DECIMAL / p_questions) * 100 ELSE 0 END) * p_questions)
         / (daily_progress.questions_completed + p_questions)), 2)
      ELSE 0
    END,
    question_goal_met = (daily_progress.questions_completed + p_questions) >= v_goal_questions,
    time_goal_met = (daily_progress.time_spent_minutes + p_time_minutes) >= v_goal_time,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_daily_progress(UUID, INT, INT, INT) TO authenticated;
COMMENT ON FUNCTION upsert_daily_progress IS 'Upsert daily progress after practice/exam. Accumulates questions and time, recalculates accuracy.';

-- 18.2 Triggers for updated_at on goal/plan tables
CREATE OR REPLACE FUNCTION update_goal_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_student_goals_updated_at ON student_goals;
CREATE TRIGGER trigger_student_goals_updated_at
  BEFORE UPDATE ON student_goals
  FOR EACH ROW EXECUTE FUNCTION update_goal_plan_updated_at();

DROP TRIGGER IF EXISTS trigger_study_plans_updated_at ON study_plans;
CREATE TRIGGER trigger_study_plans_updated_at
  BEFORE UPDATE ON study_plans
  FOR EACH ROW EXECUTE FUNCTION update_goal_plan_updated_at();

-- ============================================================================
-- SECTION 19: TEACHER AVAILABILITY (Phase 3)
-- ============================================================================

-- 19.1 updated_at trigger for teacher_availability
DROP TRIGGER IF EXISTS update_teacher_availability_updated_at ON teacher_availability;
CREATE TRIGGER update_teacher_availability_updated_at
  BEFORE UPDATE ON teacher_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 19.2 get_teacher_availability_status() RPC
-- Returns 'available' | 'busy' | 'offline' based on current time
CREATE OR REPLACE FUNCTION public.get_teacher_availability_status(p_teacher_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_availability BOOLEAN;
  v_is_on_time_off   BOOLEAN;
  v_current_day      INTEGER;
  v_current_time     TIME;
BEGIN
  v_current_day  := EXTRACT(DOW FROM NOW())::INTEGER;
  v_current_time := (NOW() AT TIME ZONE 'UTC')::TIME;

  SELECT EXISTS(
    SELECT 1 FROM teacher_time_off
    WHERE teacher_id = p_teacher_id
      AND CURRENT_DATE BETWEEN start_date AND end_date
  ) INTO v_is_on_time_off;

  IF v_is_on_time_off THEN
    RETURN 'offline';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM teacher_availability
    WHERE teacher_id = p_teacher_id
      AND day_of_week = v_current_day
      AND is_available = TRUE
      AND v_current_time BETWEEN start_time AND end_time
  ) INTO v_has_availability;

  IF v_has_availability THEN
    RETURN 'available';
  END IF;

  RETURN 'busy';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_availability_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_availability_status(UUID) TO anon;
COMMENT ON FUNCTION public.get_teacher_availability_status IS 'Returns available/busy/offline for a teacher based on current time and their schedule.';

-- ============================================================================
-- SECTION 20: BOOKING REMINDERS (Phase 5)
-- ============================================================================
-- Called by the notification processor (cron-job.org -> /api/notifications/processor).
-- Finds confirmed bookings in the 24h / 1h / 15min windows, inserts into
-- notification_queue for both student and teacher, and records the send in
-- booking_reminders (UNIQUE constraint prevents duplicates).

CREATE OR REPLACE FUNCTION public.send_booking_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking       RECORD;
  v_student_user  UUID;
  v_teacher_user  UUID;
  v_reminder_type TEXT;
  v_title_student TEXT;
  v_body_student  TEXT;
  v_title_teacher TEXT;
  v_body_teacher  TEXT;
  v_session_dt    TIMESTAMPTZ;
BEGIN
  FOR v_booking IN
    SELECT
      b.id,
      b.student_id,
      b.teacher_id,
      b.scheduled_date,
      b.scheduled_time,
      subj.name_en AS subject_name,
      sp.full_name  AS student_name,
      tp.full_name  AS teacher_name
    FROM bookings b
    JOIN subjects  subj ON subj.id = b.subject_id
    JOIN students  st   ON st.id   = b.student_id
    JOIN profiles  sp   ON sp.id   = st.user_id
    JOIN teachers  te   ON te.id   = b.teacher_id
    JOIN profiles  tp   ON tp.id   = te.user_id
    WHERE b.status = 'confirmed'
  LOOP
    v_session_dt := (v_booking.scheduled_date::TEXT || ' ' || v_booking.scheduled_time)::TIMESTAMPTZ;

    SELECT user_id INTO v_student_user FROM students WHERE id = v_booking.student_id;
    SELECT user_id INTO v_teacher_user FROM teachers WHERE id = v_booking.teacher_id;

    -- Determine which reminder window this booking falls into
    IF v_session_dt BETWEEN (NOW() + INTERVAL '23 hours 45 minutes')
                        AND (NOW() + INTERVAL '24 hours 15 minutes') THEN
      v_reminder_type := '24h';
    ELSIF v_session_dt BETWEEN (NOW() + INTERVAL '45 minutes')
                           AND (NOW() + INTERVAL '1 hour 15 minutes') THEN
      v_reminder_type := '1h';
    ELSIF v_session_dt BETWEEN (NOW() + INTERVAL '5 minutes')
                           AND (NOW() + INTERVAL '20 minutes') THEN
      v_reminder_type := '15min';
    ELSE
      CONTINUE;
    END IF;

    -- Skip if already sent (idempotent)
    IF EXISTS (
      SELECT 1 FROM booking_reminders
      WHERE booking_id = v_booking.id AND reminder_type = v_reminder_type
    ) THEN
      CONTINUE;
    END IF;

    -- Build notification content
    IF v_reminder_type = '24h' THEN
      v_title_student := 'Session Tomorrow';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' is tomorrow at ' || v_booking.scheduled_time || '.';
      v_title_teacher := 'Session Tomorrow';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') is tomorrow at ' || v_booking.scheduled_time || '.';
    ELSIF v_reminder_type = '1h' THEN
      v_title_student := 'Session in 1 Hour';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' starts in 1 hour.';
      v_title_teacher := 'Session in 1 Hour';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') starts in 1 hour.';
    ELSE
      v_title_student := 'Session Starting Soon';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' starts in 15 minutes!';
      v_title_teacher := 'Session Starting Soon';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') starts in 15 minutes!';
    END IF;

    -- Queue notification for student
    IF v_student_user IS NOT NULL THEN
      INSERT INTO notification_queue (
        user_id, title, body, notification_type, data, status, channels
      ) VALUES (
        v_student_user,
        v_title_student,
        v_body_student,
        'booking_reminder',
        jsonb_build_object(
          'type',      'booking_reminder',
          'bookingId', v_booking.id::TEXT,
          'teacherId', v_booking.teacher_id::TEXT
        ),
        'pending',
        ARRAY['push', 'in_app']::TEXT[]
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- Queue notification for teacher
    IF v_teacher_user IS NOT NULL THEN
      INSERT INTO notification_queue (
        user_id, title, body, notification_type, data, status, channels
      ) VALUES (
        v_teacher_user,
        v_title_teacher,
        v_body_teacher,
        'booking_reminder',
        jsonb_build_object(
          'type',      'booking_reminder',
          'bookingId', v_booking.id::TEXT,
          'studentId', v_booking.student_id::TEXT
        ),
        'pending',
        ARRAY['push', 'in_app']::TEXT[]
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- Record send to prevent duplicates
    INSERT INTO booking_reminders (booking_id, reminder_type)
    VALUES (v_booking.id, v_reminder_type)
    ON CONFLICT (booking_id, reminder_type) DO NOTHING;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_booking_reminders() TO service_role;
COMMENT ON FUNCTION public.send_booking_reminders IS
  'Queues booking reminder notifications at 24h, 1h, and 15min before confirmed sessions. '
  'Called by the external cron-job.org processor via /api/notifications/processor. '
  'Idempotent: booking_reminders UNIQUE constraint prevents duplicate sends.';

-- ============================================================================
-- SECTION 20: BOOKING-BASED MESSAGING RESTRICTION (Phase 36)
-- ============================================================================

-- 20.1 Check if student has active booking with teacher
CREATE OR REPLACE FUNCTION has_active_booking(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND teacher_id = p_teacher_id
      AND status IN ('confirmed', 'completed')
  );
END;
$$;

-- 20.2 Approve conversation (called when booking is confirmed)
CREATE OR REPLACE FUNCTION approve_conversation(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (student_id, teacher_id, is_approved, approved_at)
    VALUES (p_student_id, p_teacher_id, TRUE, NOW())
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE conversations
    SET is_approved = TRUE, approved_at = COALESCE(approved_at, NOW()), updated_at = NOW()
    WHERE id = v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$;

-- 20.3 Revoke conversation approval (called when all bookings are cancelled)
CREATE OR REPLACE FUNCTION revoke_conversation_if_no_bookings(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND teacher_id = p_teacher_id
      AND status IN ('confirmed', 'completed')
  ) THEN
    UPDATE conversations
    SET is_approved = FALSE, updated_at = NOW()
    WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  END IF;
END;
$$;

-- 20.4 Trigger to manage conversation approval on booking status change
CREATE OR REPLACE FUNCTION trigger_manage_conversation_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    PERFORM approve_conversation(NEW.student_id, NEW.teacher_id);
  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed') THEN
    PERFORM revoke_conversation_if_no_bookings(NEW.student_id, NEW.teacher_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manage_conversation_on_booking ON bookings;
CREATE TRIGGER trg_manage_conversation_on_booking
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_manage_conversation_on_booking();

-- 20.5 Check messaging eligibility (for UI display)
CREATE OR REPLACE FUNCTION check_messaging_eligibility(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS TABLE (
  can_message BOOLEAN,
  has_booking BOOLEAN,
  booking_status TEXT,
  conversation_id UUID,
  is_approved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_active_booking BOOLEAN;
  v_has_pending_booking BOOLEAN;
  v_booking_status TEXT;
  v_conversation_id UUID;
  v_is_approved BOOLEAN;
BEGIN
  SELECT TRUE INTO v_has_active_booking
  FROM bookings
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id
    AND status IN ('confirmed', 'completed')
  LIMIT 1;
  v_has_active_booking := COALESCE(v_has_active_booking, FALSE);
  
  SELECT TRUE INTO v_has_pending_booking
  FROM bookings
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id
    AND status = 'pending'
  LIMIT 1;
  v_has_pending_booking := COALESCE(v_has_pending_booking, FALSE);
  
  IF v_has_active_booking THEN
    v_booking_status := 'confirmed';
  ELSIF v_has_pending_booking THEN
    v_booking_status := 'pending';
  ELSE
    v_booking_status := NULL;
  END IF;
  
  SELECT id, is_approved
  INTO v_conversation_id, v_is_approved
  FROM conversations
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  
  v_is_approved := COALESCE(v_is_approved, FALSE);
  
  RETURN QUERY SELECT 
    (v_is_approved OR v_has_active_booking) AS can_message,
    (v_has_active_booking OR v_has_pending_booking) AS has_booking,
    v_booking_status AS booking_status,
    v_conversation_id AS conversation_id,
    v_is_approved AS is_approved;
END;
$$;

-- 20.6 Booking conflict check (prevent spam/duplicates)
CREATE OR REPLACE FUNCTION check_booking_conflicts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Prevent duplicate date/time bookings
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND student_id = NEW.student_id
      AND teacher_id = NEW.teacher_id
      AND scheduled_date = NEW.scheduled_date
      AND scheduled_time = NEW.scheduled_time
      AND status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'You already have a booking with this teacher at this date and time';
  END IF;
  
  -- Max 3 pending requests per teacher
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND teacher_id = NEW.teacher_id
      AND status = 'pending'
  ) >= 3 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'You have too many pending requests with this teacher. Please wait for a response.';
  END IF;
  
  -- Max 10 pending requests overall
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND status = 'pending'
  ) >= 10 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'You have too many pending booking requests. Please wait for responses.';
  END IF;
  
  -- Rate limit: max 5 requests per hour
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND created_at > NOW() - INTERVAL '1 hour'
  ) >= 5 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Too many booking requests. Please wait before making more requests.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_booking_conflicts ON bookings;
CREATE TRIGGER trg_check_booking_conflicts
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_conflicts();

-- 20.7 Grant permissions
GRANT EXECUTE ON FUNCTION has_active_booking(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_messaging_eligibility(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_conversation_if_no_bookings(UUID, UUID) TO service_role;

-- ============================================================================
-- SECTION 21: WAITLIST FUNCTIONS (Pre-Launch Security)
-- ============================================================================

-- 21.1 Clean up old rate limit records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_waitlist_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM waitlist_rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 21.2 Enhanced join_waitlist function with rate limiting
CREATE OR REPLACE FUNCTION join_waitlist(
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'landing_page',
  p_locale TEXT DEFAULT 'az',
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber_id UUID;
  v_existing RECORD;
  v_rate_limit RECORD;
  v_max_attempts_per_hour INTEGER := 5;
  v_block_duration INTERVAL := '1 hour';
BEGIN
  -- Validate email format
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  -- Rate limiting check (if IP provided)
  IF p_ip_address IS NOT NULL THEN
    SELECT * INTO v_rate_limit
    FROM waitlist_rate_limits
    WHERE ip_address = p_ip_address
    AND (blocked_until IS NULL OR blocked_until > NOW())
    ORDER BY last_attempt_at DESC
    LIMIT 1;

    IF v_rate_limit.blocked_until IS NOT NULL AND v_rate_limit.blocked_until > NOW() THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'rate_limited',
        'retry_after', EXTRACT(EPOCH FROM (v_rate_limit.blocked_until - NOW()))::INTEGER
      );
    END IF;

    IF v_rate_limit.id IS NOT NULL THEN
      IF v_rate_limit.first_attempt_at > NOW() - INTERVAL '1 hour' 
         AND v_rate_limit.attempt_count >= v_max_attempts_per_hour THEN
        UPDATE waitlist_rate_limits
        SET blocked_until = NOW() + v_block_duration, last_attempt_at = NOW()
        WHERE id = v_rate_limit.id;
        
        RETURN jsonb_build_object(
          'success', false, 
          'error', 'rate_limited',
          'retry_after', EXTRACT(EPOCH FROM v_block_duration)::INTEGER
        );
      END IF;

      UPDATE waitlist_rate_limits
      SET attempt_count = attempt_count + 1, last_attempt_at = NOW()
      WHERE id = v_rate_limit.id;
    ELSE
      INSERT INTO waitlist_rate_limits (ip_address, email_hash)
      VALUES (p_ip_address, encode(sha256(LOWER(TRIM(p_email))::bytea), 'hex'));
    END IF;
  END IF;

  -- Check if email already exists
  SELECT id, status INTO v_existing
  FROM waitlist_subscribers
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'unsubscribed' THEN
      UPDATE waitlist_subscribers
      SET status = 'pending', updated_at = NOW(), ip_address = p_ip_address
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true, 'message', 'resubscribed', 'id', v_existing.id);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'already_subscribed');
    END IF;
  END IF;

  -- Insert new subscriber
  INSERT INTO waitlist_subscribers (email, name, source, locale, metadata, ip_address)
  VALUES (LOWER(TRIM(p_email)), TRIM(p_name), p_source, p_locale, p_metadata, p_ip_address)
  RETURNING id INTO v_subscriber_id;

  RETURN jsonb_build_object('success', true, 'message', 'subscribed', 'id', v_subscriber_id);
END;
$$;

-- 21.3 Bulk status update function for admin
CREATE OR REPLACE FUNCTION bulk_update_waitlist_status(
  p_subscriber_ids UUID[],
  p_status TEXT,
  p_send_email BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_subscriber RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('pending', 'invited', 'registered', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  UPDATE waitlist_subscribers
  SET 
    status = p_status,
    invited_at = CASE WHEN p_status = 'invited' THEN NOW() ELSE invited_at END,
    registered_at = CASE WHEN p_status = 'registered' THEN NOW() ELSE registered_at END,
    updated_at = NOW()
  WHERE id = ANY(p_subscriber_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_send_email AND p_status = 'invited' THEN
    FOR v_subscriber IN 
      SELECT id, email, name, locale FROM waitlist_subscribers WHERE id = ANY(p_subscriber_ids)
    LOOP
      INSERT INTO waitlist_email_queue (subscriber_id, recipient_email, recipient_name, template_name, locale, metadata)
      VALUES (v_subscriber.id, v_subscriber.email, v_subscriber.name, 
              'waitlist_invitation_' || COALESCE(v_subscriber.locale, 'az'),
              COALESCE(v_subscriber.locale, 'az'),
              jsonb_build_object('subscriber_id', v_subscriber.id))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'updated_count', v_updated_count,
    'emails_queued', CASE WHEN p_send_email AND p_status = 'invited' THEN v_updated_count ELSE 0 END
  );
END;
$$;

-- 21.4 Function to get pending waitlist emails
CREATE OR REPLACE FUNCTION get_pending_waitlist_emails(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID, subscriber_id UUID, recipient_email TEXT, recipient_name TEXT,
  template_name TEXT, locale TEXT, metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE waitlist_email_queue weq
  SET status = 'processing', last_attempt_at = NOW(), attempts = attempts + 1
  WHERE weq.id IN (
    SELECT weq2.id FROM waitlist_email_queue weq2
    WHERE weq2.status = 'pending'
    ORDER BY weq2.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING weq.id, weq.subscriber_id, weq.recipient_email, weq.recipient_name, weq.template_name, weq.locale, weq.metadata;
END;
$$;

-- 21.5 Function to mark waitlist email as sent/failed
CREATE OR REPLACE FUNCTION update_waitlist_email_status(
  p_email_id UUID, p_status TEXT, p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE waitlist_email_queue
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
      error_message = p_error_message
  WHERE id = p_email_id;
END;
$$;

-- 21.6 Get waitlist stats for admin dashboard
CREATE OR REPLACE FUNCTION get_waitlist_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'invited', COUNT(*) FILTER (WHERE status = 'invited'),
    'registered', COUNT(*) FILTER (WHERE status = 'registered'),
    'unsubscribed', COUNT(*) FILTER (WHERE status = 'unsubscribed'),
    'today', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
    'this_week', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'this_month', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
    'by_source', (
      SELECT jsonb_object_agg(source, cnt) FROM (
        SELECT source, COUNT(*) as cnt FROM waitlist_subscribers WHERE status != 'unsubscribed' GROUP BY source
      ) s
    ),
    'by_locale', (
      SELECT jsonb_object_agg(locale, cnt) FROM (
        SELECT COALESCE(locale, 'unknown') as locale, COUNT(*) as cnt FROM waitlist_subscribers WHERE status != 'unsubscribed' GROUP BY locale
      ) l
    )
  ) INTO v_stats FROM waitlist_subscribers;

  RETURN v_stats;
END;
$$;

-- 21.7 Get waitlist subscribers with pagination
CREATE OR REPLACE FUNCTION get_waitlist_subscribers(
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_order_by TEXT DEFAULT 'created_at',
  p_order_dir TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
  id UUID, email TEXT, name TEXT, source TEXT, status TEXT,
  locale TEXT, metadata JSONB, created_at TIMESTAMPTZ, invited_at TIMESTAMPTZ, registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT w.id, w.email, w.name, w.source, w.status, w.locale, w.metadata, w.created_at, w.invited_at, w.registered_at
  FROM waitlist_subscribers w
  WHERE (p_status IS NULL OR w.status = p_status)
    AND (p_search IS NULL OR w.email ILIKE '%' || p_search || '%' OR w.name ILIKE '%' || p_search || '%')
  ORDER BY
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN w.created_at END DESC,
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN w.created_at END ASC,
    CASE WHEN p_order_by = 'email' AND p_order_dir = 'DESC' THEN w.email END DESC,
    CASE WHEN p_order_by = 'email' AND p_order_dir = 'ASC' THEN w.email END ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 21.8 Export waitlist emails for campaigns
CREATE OR REPLACE FUNCTION export_waitlist_emails(p_status TEXT DEFAULT 'pending')
RETURNS TABLE (email TEXT, name TEXT, locale TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT w.email, w.name, w.locale
  FROM waitlist_subscribers w
  WHERE w.status = p_status
  ORDER BY w.created_at ASC;
END;
$$;

-- 21.9 Single subscriber status update (with email queueing)
CREATE OR REPLACE FUNCTION update_waitlist_status(
  p_subscriber_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('pending', 'invited', 'registered', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT id, email, name, locale INTO v_subscriber
  FROM waitlist_subscribers WHERE id = p_subscriber_id;

  IF v_subscriber.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE waitlist_subscribers
  SET status = p_status,
      notes = COALESCE(p_notes, notes),
      invited_at = CASE WHEN p_status = 'invited' THEN NOW() ELSE invited_at END,
      registered_at = CASE WHEN p_status = 'registered' THEN NOW() ELSE registered_at END,
      updated_at = NOW()
  WHERE id = p_subscriber_id;

  IF p_status = 'invited' AND p_send_email THEN
    INSERT INTO waitlist_email_queue (subscriber_id, recipient_email, recipient_name, template_name, locale, metadata)
    VALUES (v_subscriber.id, v_subscriber.email, v_subscriber.name,
            'waitlist_invitation_' || COALESCE(v_subscriber.locale, 'az'),
            COALESCE(v_subscriber.locale, 'az'),
            jsonb_build_object('subscriber_id', v_subscriber.id))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'email_queued', p_status = 'invited' AND p_send_email);
END;
$$;

-- 21.10 Grant waitlist permissions
GRANT EXECUTE ON FUNCTION join_waitlist TO anon, authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_waitlist_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_waitlist_status TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_waitlist_rate_limits TO authenticated;
GRANT EXECUTE ON FUNCTION get_waitlist_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_waitlist_subscribers TO authenticated;
GRANT EXECUTE ON FUNCTION export_waitlist_emails TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_waitlist_emails TO service_role;
GRANT EXECUTE ON FUNCTION update_waitlist_email_status TO service_role;

-- ============================================================================
-- SECTION 22: PAYMENT INFRASTRUCTURE FUNCTIONS (Phase 8)
-- ============================================================================

-- 22.1 Process Booking Payment (called by stripe-webhook Edge Function)
-- Creates 3 transaction rows + updates wallets + updates booking
CREATE OR REPLACE FUNCTION process_booking_payment(
  p_booking_id          UUID,
  p_student_user_id     UUID,
  p_teacher_user_id     UUID,
  p_amount              DECIMAL,
  p_currency            TEXT,
  p_external_payment_id TEXT,
  p_idempotency_key     TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate   DECIMAL;
  v_commission_amount DECIMAL;
  v_teacher_amount    DECIMAL;
BEGIN
  -- Idempotency guard: if this key was already processed, return true silently
  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN TRUE;
  END IF;

  -- Fetch commission rate from system_settings (default 15%)
  SELECT COALESCE((value::TEXT)::DECIMAL, 0.15)
  INTO v_commission_rate
  FROM system_settings WHERE key = 'commission_rate';

  IF v_commission_rate IS NULL THEN
    v_commission_rate := 0.15;
  END IF;

  v_commission_amount := ROUND(p_amount * v_commission_rate, 2);
  v_teacher_amount    := p_amount - v_commission_amount;

  -- Row 1: Student payment
  INSERT INTO transactions (from_user_id, to_user_id, booking_id, amount, currency, type, status,
    external_payment_id, commission_rate, commission_amount, description, idempotency_key, completed_at)
  VALUES (p_student_user_id, p_teacher_user_id, p_booking_id, p_amount, p_currency,
    'booking_payment', 'completed', p_external_payment_id,
    v_commission_rate, v_commission_amount,
    'Booking payment', p_idempotency_key, NOW());

  -- Row 2: Teacher earning
  INSERT INTO transactions (to_user_id, booking_id, amount, currency, type, status,
    commission_rate, commission_amount, description, idempotency_key, completed_at)
  VALUES (p_teacher_user_id, p_booking_id, v_teacher_amount, p_currency,
    'teacher_earning', 'completed',
    v_commission_rate, v_commission_amount,
    'Earning from booking', p_idempotency_key || '_earning', NOW());

  -- Row 3: Platform commission
  INSERT INTO transactions (from_user_id, booking_id, amount, currency, type, status,
    description, idempotency_key, completed_at)
  VALUES (p_teacher_user_id, p_booking_id, v_commission_amount, p_currency,
    'platform_commission', 'completed',
    'Platform commission', p_idempotency_key || '_commission', NOW());

  -- Update teacher wallet
  INSERT INTO wallets (user_id, balance, total_earned, currency)
  VALUES (p_teacher_user_id, v_teacher_amount, v_teacher_amount, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET
    balance      = wallets.balance + v_teacher_amount,
    total_earned = wallets.total_earned + v_teacher_amount,
    updated_at   = NOW();

  -- Update student wallet (spending tracker only, balance stays 0)
  INSERT INTO wallets (user_id, balance, total_spent, currency)
  VALUES (p_student_user_id, 0, p_amount, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET
    total_spent = wallets.total_spent + p_amount,
    updated_at  = NOW();

  -- Update booking: mark as paid, awaiting teacher acceptance
  UPDATE bookings SET
    price          = p_amount,
    payment_status = 'paid',
    payment_intent_id = p_external_payment_id,
    status         = 'pending',
    updated_at     = NOW()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- 22.2 Process Refund (called by stripe-webhook Edge Function)
CREATE OR REPLACE FUNCTION process_refund(
  p_booking_id      UUID,
  p_reason          TEXT,
  p_idempotency_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking          RECORD;
  v_original_payment RECORD;
  v_teacher_amount   DECIMAL;
BEGIN
  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_original_payment FROM transactions
  WHERE booking_id = p_booking_id AND type = 'booking_payment' AND status = 'completed'
  LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_teacher_amount := v_original_payment.amount - COALESCE(v_original_payment.commission_amount, 0);

  -- Record refund transaction
  INSERT INTO transactions (from_user_id, to_user_id, booking_id, amount, currency, type, status,
    description, idempotency_key, completed_at)
  VALUES (v_original_payment.to_user_id, v_original_payment.from_user_id,
    p_booking_id, v_original_payment.amount, v_original_payment.currency,
    'refund', 'completed', p_reason, p_idempotency_key, NOW());

  -- Reverse teacher wallet balance
  UPDATE wallets SET
    balance      = GREATEST(balance - v_teacher_amount, 0),
    total_earned = GREATEST(total_earned - v_teacher_amount, 0),
    updated_at   = NOW()
  WHERE user_id = v_original_payment.to_user_id;

  -- Update booking
  UPDATE bookings SET
    status             = 'cancelled',
    payment_status     = 'refunded',
    cancelled_at       = NOW(),
    cancellation_reason = p_reason,
    updated_at         = NOW()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- 22.3 Updated_at triggers for payment tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wallets_updated_at') THEN
    CREATE TRIGGER set_wallets_updated_at
      BEFORE UPDATE ON wallets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_payout_requests_updated_at') THEN
    CREATE TRIGGER set_payout_requests_updated_at
      BEFORE UPDATE ON payout_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_user_subscriptions_updated_at') THEN
    CREATE TRIGGER set_user_subscriptions_updated_at
      BEFORE UPDATE ON user_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_subscription_tiers_updated_at') THEN
    CREATE TRIGGER set_subscription_tiers_updated_at
      BEFORE UPDATE ON subscription_tiers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 22.4 Grant payment function permissions
GRANT EXECUTE ON FUNCTION process_booking_payment TO service_role;
GRANT EXECUTE ON FUNCTION process_refund TO service_role;

-- ============================================================================
-- SECTION 9: TEACHER QUESTIONS & EXAMS (hotfix 73)
-- ============================================================================

-- 9.1 admin_set_exam_official — toggle Official Elmly stamp
CREATE OR REPLACE FUNCTION admin_set_exam_official(p_exam_id UUID, p_is_official BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE mock_exams SET is_official = p_is_official WHERE id = p_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_exam_official(UUID, BOOLEAN) TO authenticated;

-- 9.2 admin_approve_teacher_exam — approve or reject a teacher-created exam
CREATE OR REPLACE FUNCTION admin_approve_teacher_exam(p_exam_id UUID, p_approved BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE mock_exams
    SET is_approved = p_approved
    WHERE id = p_exam_id AND created_by_teacher IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_teacher_exam(UUID, BOOLEAN) TO authenticated;

-- 9.3 get_teacher_exam_questions — SECURITY DEFINER so students never touch teacher_questions directly.
--     Also allows the creating teacher to preview an unapproved exam.
CREATE OR REPLACE FUNCTION get_teacher_exam_questions(p_exam_id UUID)
RETURNS TABLE (
  question_order      INTEGER,
  source              TEXT,
  question_id         UUID,
  teacher_question_id UUID,
  question_text       TEXT,
  option_a            TEXT,
  option_b            TEXT,
  option_c            TEXT,
  option_d            TEXT,
  correct_answer      TEXT,
  explanation         TEXT,
  image_url           TEXT,
  question_type       TEXT,
  teacher_name        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be an approved student, OR the teacher who owns the exam
  IF NOT EXISTS (
    SELECT 1 FROM mock_exams
    WHERE id = p_exam_id
      AND created_by_teacher IS NOT NULL
      AND (
        is_approved = TRUE                                 -- approved: any authenticated user
        OR EXISTS (                                        -- or: the creating teacher previewing
          SELECT 1 FROM teachers t
          WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Exam not found, not approved, or access denied';
  END IF;

  RETURN QUERY
    SELECT
      teq.question_order,
      CASE WHEN teq.question_id IS NOT NULL THEN 'elmly'::TEXT ELSE 'teacher'::TEXT END AS source,
      teq.question_id,
      teq.teacher_question_id,
      COALESCE(q.question_text,   tq.question_text)   AS question_text,
      COALESCE(q.option_a,        tq.option_a)        AS option_a,
      COALESCE(q.option_b,        tq.option_b)        AS option_b,
      COALESCE(q.option_c,        tq.option_c)        AS option_c,
      COALESCE(q.option_d,        tq.option_d)        AS option_d,
      COALESCE(q.correct_answer,  tq.correct_answer)  AS correct_answer,
      COALESCE(q.explanation,     tq.explanation)     AS explanation,
      COALESCE(q.image_url,       tq.image_url)       AS image_url,
      COALESCE(q.question_type::TEXT, tq.question_type) AS question_type,
      CASE WHEN tq.id IS NOT NULL
           THEN (SELECT p.full_name FROM profiles p
                 JOIN teachers t2 ON t2.user_id = p.id
                 WHERE t2.id = tq.teacher_id)
      END AS teacher_name
    FROM teacher_exam_questions teq
    LEFT JOIN questions q           ON q.id  = teq.question_id
    LEFT JOIN teacher_questions tq  ON tq.id = teq.teacher_question_id
    WHERE teq.exam_id = p_exam_id
    ORDER BY teq.question_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_questions(UUID) TO authenticated;

-- 9.4 get_recommended_teacher_exams — ranked list of teachers for ExamsHub
--     Score = group match (40) + city match (20) + bookmarked (25) + popularity (10) + recency (5)
CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id  UUID,
  full_name   TEXT,
  avatar_url  TEXT,
  subjects    TEXT[],
  exam_count  BIGINT,
  avg_rating  DECIMAL,
  score       DECIMAL
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_group    TEXT;
  v_student_city     TEXT;
BEGIN
  -- Fetch student profile data for scoring
  SELECT s.target_group, s.city
  INTO   v_student_group, v_student_city
  FROM   students s
  WHERE  s.id = p_student_id;

  RETURN QUERY
  WITH teacher_stats AS (
    SELECT
      me.created_by_teacher                                             AS t_id,
      COUNT(*)                                                          AS exam_count,
      MAX(me.created_at)                                                AS last_exam_at,
      COALESCE(SUM(attempt_counts.cnt), 0)                             AS total_attempts,
      COALESCE(AVG(tr.rating), 0)                                      AS avg_rating
    FROM mock_exams me
    LEFT JOIN (
      SELECT mock_exam_id, COUNT(*) AS cnt
      FROM mock_exam_attempts
      WHERE status = 'completed'
      GROUP BY mock_exam_id
    ) attempt_counts ON attempt_counts.mock_exam_id = me.id
    LEFT JOIN teacher_reviews tr ON tr.teacher_id = me.created_by_teacher
    WHERE me.created_by_teacher IS NOT NULL
      AND me.is_approved = TRUE
    GROUP BY me.created_by_teacher
    HAVING COUNT(*) >= 1
  ),
  teacher_subjects AS (
    SELECT
      me2.created_by_teacher AS t_id,
      ARRAY_AGG(DISTINCT s.name_az) AS subjects
    FROM mock_exams me2
    JOIN teacher_exam_questions teq ON teq.exam_id = me2.id
    LEFT JOIN questions q ON q.id = teq.question_id
    LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
    LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
    WHERE me2.created_by_teacher IS NOT NULL AND me2.is_approved = TRUE
    GROUP BY me2.created_by_teacher
  )
  SELECT
    t.id                      AS teacher_id,
    p.full_name,
    p.avatar_url,
    COALESCE(ts2.subjects, ARRAY[]::TEXT[]) AS subjects,
    ts.exam_count,
    ROUND(ts.avg_rating::DECIMAL, 2)        AS avg_rating,
    ROUND((
      -- Group match
      CASE WHEN v_student_group IS NOT NULL
            AND me_group.target_group = v_student_group THEN 40 ELSE 0 END
      -- City match
      + CASE WHEN v_student_city IS NOT NULL
              AND t.city = v_student_city THEN 20 ELSE 0 END
      -- Bookmarked
      + CASE WHEN EXISTS (
          SELECT 1 FROM favorite_teachers ft
          JOIN students stu ON stu.id = ft.student_id
          WHERE ft.teacher_id = t.id AND stu.id = p_student_id
        ) THEN 25 ELSE 0 END
      -- Popularity (max 10)
      + LEAST(ts.total_attempts::DECIMAL / 50.0, 10)
      -- Recency (max 5, decays over 30 days)
      + GREATEST(0, 5.0 - (EXTRACT(EPOCH FROM (NOW() - ts.last_exam_at)) / 86400.0 / 30.0 * 5.0))
    )::DECIMAL, 2)            AS score
  FROM teacher_stats ts
  JOIN teachers t         ON t.id = ts.t_id
  JOIN profiles p         ON p.id = t.user_id
  LEFT JOIN teacher_subjects ts2 ON ts2.t_id = t.id
  LEFT JOIN LATERAL (
    SELECT target_group FROM mock_exams
    WHERE created_by_teacher = t.id AND is_approved = TRUE
    GROUP BY target_group ORDER BY COUNT(*) DESC LIMIT 1
  ) me_group ON TRUE
  ORDER BY score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

-- ============================================================================
-- TEACHER SUBSCRIPTION STUDENT COUNTS (hotfix 107)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_teacher_subscription_counts(p_teacher_id UUID)
RETURNS TABLE(current_students INTEGER, total_students INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT ts.student_id) FILTER (
      WHERE ts.status IN ('active', 'trialing')
        AND (ts.current_period_end IS NULL OR ts.current_period_end > NOW())
    )::INTEGER AS current_students,
    COUNT(DISTINCT ts.student_id) FILTER (
      WHERE ts.ever_active = TRUE
    )::INTEGER AS total_students
  FROM public.teacher_subscriptions ts
  WHERE ts.teacher_id = p_teacher_id;
$$;

COMMENT ON FUNCTION public.get_teacher_subscription_counts(UUID) IS
  'Returns current and lifetime teacher student counts from recurring teacher_subscriptions only.';

CREATE OR REPLACE FUNCTION public.refresh_teacher_subscription_counts(p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  SELECT current_students, total_students
  INTO v_current, v_total
  FROM public.get_teacher_subscription_counts(p_teacher_id);

  UPDATE public.teachers
  SET
    current_students = COALESCE(v_current, 0),
    total_students = COALESCE(v_total, 0),
    updated_at = NOW()
  WHERE id = p_teacher_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_teacher_subscription_counts(UUID) IS
  'Refreshes denormalized teacher current/total student counters from teacher_subscriptions.';

CREATE OR REPLACE FUNCTION public.teacher_subscriptions_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();

  IF NEW.status IN ('active', 'trialing') THEN
    NEW.ever_active := TRUE;
    NEW.activated_at := COALESCE(NEW.activated_at, NOW());
  END IF;

  IF NEW.status IN ('cancelled', 'incomplete_expired') THEN
    NEW.ended_at := COALESCE(NEW.ended_at, NOW());
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
  END IF;

  NEW.currency := LOWER(COALESCE(NULLIF(NEW.currency, ''), 'azn'));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_subscriptions_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
BEGIN
  v_teacher_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.teacher_id
    ELSE NEW.teacher_id
  END;

  PERFORM public.refresh_teacher_subscription_counts(v_teacher_id);

  IF TG_OP = 'UPDATE' AND OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN
    PERFORM public.refresh_teacher_subscription_counts(OLD.teacher_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_subscriptions_before_write ON public.teacher_subscriptions;
CREATE TRIGGER trg_teacher_subscriptions_before_write
  BEFORE INSERT OR UPDATE ON public.teacher_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_subscriptions_before_write();

DROP TRIGGER IF EXISTS trg_teacher_subscriptions_after_write ON public.teacher_subscriptions;
CREATE TRIGGER trg_teacher_subscriptions_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_subscriptions_after_write();

GRANT EXECUTE ON FUNCTION public.get_teacher_subscription_counts(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_teacher_subscription_counts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_subscriptions_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_subscriptions_after_write() FROM PUBLIC;

-- ============================================================================
-- TEACHER SUBSCRIPTION ACCOUNTING (hotfix 108)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_teacher_subscription_payment(
  p_teacher_subscription_id UUID,
  p_student_user_id UUID,
  p_teacher_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_external_payment_id TEXT,
  p_external_invoice_id TEXT,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate NUMERIC := 0.15;
  v_commission_amount NUMERIC;
  v_teacher_amount NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::NUMERIC
      WHEN jsonb_typeof(value) = 'string' THEN trim(BOTH '"' FROM value::TEXT)::NUMERIC
      ELSE NULL
    END,
    0.15
  )
  INTO v_commission_rate
  FROM public.system_settings
  WHERE key = 'commission_rate';

  v_commission_rate := COALESCE(v_commission_rate, 0.15);
  v_commission_amount := ROUND(p_amount * v_commission_rate, 2);
  v_teacher_amount := p_amount - v_commission_amount;

  INSERT INTO public.transactions (
    from_user_id, to_user_id, amount, currency, type, status,
    external_payment_id, commission_rate, commission_amount,
    description, metadata, idempotency_key, completed_at
  )
  VALUES (
    p_student_user_id, p_teacher_user_id, p_amount, upper(p_currency),
    'subscription_charge', 'completed', p_external_payment_id,
    v_commission_rate, v_commission_amount,
    'Teacher monthly subscription charge',
    jsonb_build_object(
      'teacher_subscription_id', p_teacher_subscription_id,
      'stripe_invoice_id', p_external_invoice_id
    ),
    p_idempotency_key, NOW()
  );

  INSERT INTO public.transactions (
    to_user_id, amount, currency, type, status,
    commission_rate, commission_amount, description, metadata,
    idempotency_key, completed_at
  )
  VALUES (
    p_teacher_user_id, v_teacher_amount, upper(p_currency),
    'teacher_earning', 'completed', v_commission_rate, v_commission_amount,
    'Teacher subscription earning',
    jsonb_build_object(
      'teacher_subscription_id', p_teacher_subscription_id,
      'stripe_invoice_id', p_external_invoice_id
    ),
    p_idempotency_key || '_earning', NOW()
  );

  IF v_commission_amount > 0 THEN
    INSERT INTO public.transactions (
      from_user_id, amount, currency, type, status,
      description, metadata, idempotency_key, completed_at
    )
    VALUES (
      p_teacher_user_id, v_commission_amount, upper(p_currency),
      'platform_commission', 'completed',
      'Platform commission from teacher subscription',
      jsonb_build_object(
        'teacher_subscription_id', p_teacher_subscription_id,
        'stripe_invoice_id', p_external_invoice_id
      ),
      p_idempotency_key || '_commission', NOW()
    );
  END IF;

  INSERT INTO public.wallets (user_id, balance, total_earned, currency)
  VALUES (p_teacher_user_id, v_teacher_amount, v_teacher_amount, upper(p_currency))
  ON CONFLICT (user_id) DO UPDATE SET
    balance = public.wallets.balance + v_teacher_amount,
    total_earned = public.wallets.total_earned + v_teacher_amount,
    updated_at = NOW();

  INSERT INTO public.wallets (user_id, balance, total_spent, currency)
  VALUES (p_student_user_id, 0, p_amount, upper(p_currency))
  ON CONFLICT (user_id) DO UPDATE SET
    total_spent = public.wallets.total_spent + p_amount,
    updated_at = NOW();

  UPDATE public.teacher_subscriptions
  SET
    stripe_latest_invoice_id = p_external_invoice_id,
    stripe_latest_payment_intent_id = p_external_payment_id,
    last_payment_at = NOW(),
    last_payment_failed_at = NULL,
    updated_at = NOW()
  WHERE id = p_teacher_subscription_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_teacher_subscription_payment(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_teacher_subscription_payment(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Role-scoped teacher subscription management views.
CREATE OR REPLACE FUNCTION public.get_my_teacher_subscriptions()
RETURNS TABLE(
  subscription_id UUID,
  teacher_id UUID,
  teacher_user_id UUID,
  teacher_name TEXT,
  teacher_avatar_url TEXT,
  subject_id UUID,
  subject_name_en TEXT,
  subject_name_az TEXT,
  status TEXT,
  monthly_amount NUMERIC,
  currency TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ts.id, t.id, t.user_id, p.full_name, p.avatar_url,
         s.id, s.name_en, s.name_az, ts.status, ts.monthly_amount,
         upper(ts.currency), ts.current_period_start, ts.current_period_end,
         ts.cancel_at_period_end, ts.last_payment_at,
         ts.last_payment_failed_at, ts.created_at
  FROM public.teacher_subscriptions ts
  JOIN public.students st ON st.id = ts.student_id AND st.user_id = auth.uid()
  JOIN public.teachers t ON t.id = ts.teacher_id
  JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.subjects s ON s.id = ts.subject_id
  ORDER BY
    CASE ts.status
      WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 WHEN 'past_due' THEN 2
      WHEN 'unpaid' THEN 3 WHEN 'incomplete' THEN 4 ELSE 5
    END,
    ts.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_subscribers()
RETURNS TABLE(
  subscription_id UUID,
  student_id UUID,
  student_user_id UUID,
  student_name TEXT,
  student_avatar_url TEXT,
  subject_id UUID,
  subject_name_en TEXT,
  subject_name_az TEXT,
  status TEXT,
  monthly_amount NUMERIC,
  currency TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ts.id, st.id, st.user_id, p.full_name, p.avatar_url,
         s.id, s.name_en, s.name_az, ts.status, ts.monthly_amount,
         upper(ts.currency), ts.current_period_start, ts.current_period_end,
         ts.cancel_at_period_end, ts.last_payment_at,
         ts.last_payment_failed_at, ts.created_at
  FROM public.teacher_subscriptions ts
  JOIN public.teachers t ON t.id = ts.teacher_id AND t.user_id = auth.uid()
  JOIN public.students st ON st.id = ts.student_id
  JOIN public.profiles p ON p.id = st.user_id
  LEFT JOIN public.subjects s ON s.id = ts.subject_id
  ORDER BY
    CASE ts.status
      WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 WHEN 'past_due' THEN 2
      WHEN 'unpaid' THEN 3 WHEN 'incomplete' THEN 4 ELSE 5
    END,
    ts.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_teacher_subscriptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_teacher_subscribers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_subscribers() TO authenticated;

CREATE OR REPLACE FUNCTION public.process_teacher_subscription_refund(
  p_external_payment_id TEXT,
  p_refunded_total NUMERIC,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_payment public.transactions%ROWTYPE;
  v_already_refunded NUMERIC;
  v_refund_amount NUMERIC;
  v_teacher_amount NUMERIC;
BEGIN
  IF p_external_payment_id IS NULL
     OR p_external_payment_id = ''
     OR p_refunded_total IS NULL
     OR p_refunded_total <= 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO v_original_payment
  FROM public.transactions
  WHERE external_payment_id = p_external_payment_id
    AND type = 'subscription_charge'
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_already_refunded
  FROM public.transactions t
  WHERE t.external_payment_id = p_external_payment_id
    AND t.type = 'refund'
    AND t.status = 'completed'
    AND t.metadata->>'teacher_subscription_id'
      = v_original_payment.metadata->>'teacher_subscription_id';

  v_refund_amount :=
    LEAST(v_original_payment.amount, p_refunded_total) - v_already_refunded;

  IF v_refund_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  v_teacher_amount := ROUND(
    v_refund_amount
      * (
          (v_original_payment.amount - COALESCE(v_original_payment.commission_amount, 0))
          / v_original_payment.amount
        ),
    2
  );

  INSERT INTO public.transactions (
    from_user_id,
    to_user_id,
    amount,
    currency,
    type,
    status,
    external_payment_id,
    description,
    metadata,
    idempotency_key,
    completed_at
  )
  VALUES (
    v_original_payment.to_user_id,
    v_original_payment.from_user_id,
    v_refund_amount,
    v_original_payment.currency,
    'refund',
    'completed',
    p_external_payment_id,
    p_reason,
    v_original_payment.metadata || jsonb_build_object(
      'refunded_transaction_id', v_original_payment.id
      ,'stripe_refunded_total', p_refunded_total
    ),
    p_idempotency_key,
    NOW()
  );

  UPDATE public.wallets
  SET
    balance = GREATEST(balance - v_teacher_amount, 0),
    total_earned = GREATEST(total_earned - v_teacher_amount, 0),
    updated_at = NOW()
  WHERE user_id = v_original_payment.to_user_id;

  UPDATE public.wallets
  SET
    total_spent = GREATEST(total_spent - v_refund_amount, 0),
    updated_at = NOW()
  WHERE user_id = v_original_payment.from_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_teacher_subscription_refund(
  TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_teacher_subscription_refund(
  TEXT, NUMERIC, TEXT, TEXT
) TO service_role;

-- ============================================================================
-- DONE - All functions and triggers created
-- ============================================================================
-- Total: 65+ functions, 26+ triggers
-- Covers: Auth, profiles, analytics, streaks, leaderboards, scoring,
--         competitive mode, AI, messaging, study sessions, booking reminders,
--         booking-based messaging restriction, waitlist security, payments
-- ============================================================================
