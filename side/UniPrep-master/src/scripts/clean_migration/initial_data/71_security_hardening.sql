-- ============================================================================
-- 71_security_hardening.sql
-- Security hardening for admin functions, storage buckets, and user-facing RPCs
-- Fixes: C-1, C-2, C-3, C-4, C-5, H-1, H-2, H-3, H-4, H-5, M-1 through M-6
-- ============================================================================
-- Run on LIVE DB. Updates clean_migration files should mirror these changes.
-- ============================================================================

-- ============================================================================
-- HELPER: Reusable admin check pattern
-- All admin functions below use:
--   IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
-- This matches the pattern in admin_reset_leaderboard and admin_adjust_student_score
-- ============================================================================

-- ============================================================================
-- C-1 FIX: Admin functions in 04b — add admin authorization checks
-- ============================================================================

-- update_student_profile: admin-only
CREATE OR REPLACE FUNCTION update_student_profile(
  p_student_id UUID, p_full_name TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL, p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID; v_result JSONB;
BEGIN
  -- SECURITY: admin-only
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT user_id INTO v_user_id FROM students WHERE id = p_student_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Student not found'); END IF;

  UPDATE profiles SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = NOW()
  WHERE id = v_user_id;

  IF p_city IS NOT NULL THEN UPDATE students SET city = p_city WHERE user_id = v_user_id; END IF;
  IF p_email IS NOT NULL THEN UPDATE auth.users SET email = p_email WHERE id = v_user_id; END IF;

  SELECT jsonb_build_object('success', true, 'data', jsonb_build_object(
    'student_id', p_student_id, 'full_name', p.full_name, 'email', au.email, 'city', s.city
  ))
  INTO v_result
  FROM profiles p LEFT JOIN auth.users au ON p.id = au.id LEFT JOIN students s ON s.user_id = p.id
  WHERE p.id = v_user_id;

  RETURN v_result;
END;
$$;

-- update_student_elo: admin-only
CREATE OR REPLACE FUNCTION update_student_elo(p_student_id UUID, p_new_elo INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old_elo INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT elo_rating INTO v_old_elo FROM students WHERE id = p_student_id;
  IF v_old_elo IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Student not found'); END IF;

  UPDATE students SET elo_rating = p_new_elo WHERE id = p_student_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object(
    'student_id', p_student_id, 'old_elo', v_old_elo, 'new_elo', p_new_elo, 'change', p_new_elo - v_old_elo
  ));
END;
$$;

-- delete_student: admin-only
CREATE OR REPLACE FUNCTION delete_student(p_student_id UUID, p_hard_delete BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT user_id INTO v_user_id FROM students WHERE id = p_student_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Student not found'); END IF;

  IF p_hard_delete THEN
    DELETE FROM daily_stats WHERE student_id = p_student_id;
    DELETE FROM student_teachers WHERE student_id = p_student_id;
    DELETE FROM students WHERE id = p_student_id;
    DELETE FROM profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('success', true, 'message', 'Student permanently deleted');
  ELSE
    UPDATE students SET last_active_date = NULL WHERE id = p_student_id;
    RETURN jsonb_build_object('success', true, 'message', 'Student archived');
  END IF;
END;
$$;

-- get_students_by_city: admin-only (analytics)
CREATE OR REPLACE FUNCTION get_students_by_city()
RETURNS TABLE(city TEXT, student_count BIGINT, avg_elo NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT s.city, COUNT(*)::BIGINT, ROUND(AVG(s.elo_rating), 2)
  FROM students s WHERE s.city IS NOT NULL GROUP BY s.city ORDER BY student_count DESC;
END;
$$;

-- update_teacher_verification: admin-only
CREATE OR REPLACE FUNCTION update_teacher_verification(p_teacher_id UUID, p_is_verified BOOLEAN, p_rejection_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE teachers SET is_verified = p_is_verified, updated_at = NOW() WHERE id = p_teacher_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('teacher_id', p_teacher_id, 'is_verified', p_is_verified));
END;
$$;

-- update_teacher_specializations: admin-only
CREATE OR REPLACE FUNCTION update_teacher_specializations(p_teacher_id UUID, p_specializations TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE teachers SET specializations = p_specializations, updated_at = NOW() WHERE id = p_teacher_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('teacher_id', p_teacher_id, 'specializations', p_specializations));
END;
$$;

-- delete_teacher: admin-only
CREATE OR REPLACE FUNCTION delete_teacher(p_teacher_id UUID, p_hard_delete BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT user_id INTO v_user_id FROM teachers WHERE id = p_teacher_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Teacher not found'); END IF;

  IF p_hard_delete THEN
    DELETE FROM bookings WHERE teacher_id = p_teacher_id;
    DELETE FROM student_teachers WHERE teacher_id = p_teacher_id;
    DELETE FROM teacher_reviews WHERE teacher_id = p_teacher_id;
    DELETE FROM teachers WHERE id = p_teacher_id;
    DELETE FROM profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('success', true, 'message', 'Teacher permanently deleted');
  ELSE
    UPDATE teachers SET is_verified = false WHERE id = p_teacher_id;
    RETURN jsonb_build_object('success', true, 'message', 'Teacher marked as unverified');
  END IF;
END;
$$;

-- ============================================================================
-- C-2 FIX: Question/exam management functions — admin-only
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_delete_questions(p_question_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  DELETE FROM questions WHERE id = ANY(p_question_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('deleted_count', v_deleted));
END;
$$;

CREATE OR REPLACE FUNCTION toggle_question_status(p_question_id UUID, p_is_active BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE questions SET is_active = p_is_active WHERE id = p_question_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('question_id', p_question_id, 'is_active', p_is_active));
END;
$$;

CREATE OR REPLACE FUNCTION create_mock_exam(
  p_title TEXT, p_exam_type TEXT, p_target_group TEXT,
  p_duration_minutes INTEGER, p_total_questions INTEGER
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_exam_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO mock_exams (title, exam_type, target_group, duration_minutes, total_questions)
  VALUES (p_title, p_exam_type, p_target_group, p_duration_minutes, p_total_questions)
  RETURNING id INTO v_exam_id;
  RETURN v_exam_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_mock_exam(
  p_exam_id UUID, p_title TEXT DEFAULT NULL, p_exam_type TEXT DEFAULT NULL,
  p_target_group TEXT DEFAULT NULL, p_duration_minutes INTEGER DEFAULT NULL,
  p_total_questions INTEGER DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE mock_exams SET
    title = COALESCE(p_title, title), exam_type = COALESCE(p_exam_type, exam_type),
    target_group = COALESCE(p_target_group, target_group),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    total_questions = COALESCE(p_total_questions, total_questions)
  WHERE id = p_exam_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION delete_mock_exam(p_exam_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  DELETE FROM mock_exams WHERE id = p_exam_id;
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- C-3 FIX: update_daily_stats — ownership check
-- ============================================================================

CREATE OR REPLACE FUNCTION update_daily_stats(
  p_student_id UUID, p_date DATE DEFAULT CURRENT_DATE,
  p_questions_attempted INTEGER DEFAULT 0, p_questions_correct INTEGER DEFAULT 0,
  p_study_time_minutes INTEGER DEFAULT 0, p_exams_taken INTEGER DEFAULT 0,
  p_exams_completed INTEGER DEFAULT 0, p_practice_sessions INTEGER DEFAULT 0
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- SECURITY: Only the student themselves can update their own stats
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: can only update own stats';
  END IF;

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
    is_active = TRUE, updated_at = NOW();

  UPDATE students SET last_active_date = p_date WHERE id = p_student_id;
END;
$$;

-- ============================================================================
-- C-4 FIX: Teacher assignment — ownership check
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_teacher_to_subject(
  p_student_id UUID, p_subject_id UUID, p_teacher_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- SECURITY: Only the student themselves can assign teachers to their subjects
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: can only manage own teacher assignments';
  END IF;

  INSERT INTO student_teachers (student_id, subject_id, teacher_id)
  VALUES (p_student_id, p_subject_id, p_teacher_id)
  ON CONFLICT (student_id, subject_id) DO UPDATE SET teacher_id = p_teacher_id, updated_at = NOW();
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION remove_teacher_from_subject(
  p_student_id UUID, p_subject_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- SECURITY: Only the student themselves can remove their teacher assignments
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: can only manage own teacher assignments';
  END IF;

  DELETE FROM student_teachers WHERE student_id = p_student_id AND subject_id = p_subject_id;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- C-5 FIX: Scheduled reports RLS — restrict to admins
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can view all scheduled reports" ON scheduled_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Admins can create scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can create scheduled reports" ON scheduled_reports FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Admins can update their scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can update their scheduled reports" ON scheduled_reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Admins can delete their scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can delete their scheduled reports" ON scheduled_reports FOR DELETE
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Admins can view report history" ON report_history;
CREATE POLICY "Admins can view report history" ON report_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

-- ============================================================================
-- H-1 FIX: Storage buckets — make exam-answers and certificates private
-- ============================================================================

UPDATE storage.buckets SET public = false WHERE id = 'exam-answers';
UPDATE storage.buckets SET public = false WHERE id = 'certificates';

-- ============================================================================
-- H-2 FIX: question-images upload — restrict to admins only
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated Upload - Question Images" ON storage.objects;
CREATE POLICY "Admin Upload - Question Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

DROP POLICY IF EXISTS "Authenticated Update - Question Images" ON storage.objects;
CREATE POLICY "Admin Update - Question Images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

DROP POLICY IF EXISTS "Authenticated Delete - Question Images" ON storage.objects;
CREATE POLICY "Admin Delete - Question Images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

-- ============================================================================
-- H-3 FIX: Remove SVG from allowed MIME types (stored XSS vector)
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'question-images';

-- ============================================================================
-- H-4 FIX: update_student_streak_cache — ownership check
-- ============================================================================

CREATE OR REPLACE FUNCTION update_student_streak_cache(
  p_student_id UUID, p_timezone TEXT DEFAULT 'Asia/Baku'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_streak INTEGER;
  v_current_best INTEGER;
  v_current_date DATE;
BEGIN
  -- SECURITY: Only the student themselves (or internal trigger callers via service_role)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: can only update own streak cache';
  END IF;

  v_new_streak := calculate_student_streak(p_student_id, p_timezone);
  v_current_date := (NOW() AT TIME ZONE p_timezone)::DATE;
  SELECT COALESCE(best_streak, 0) INTO v_current_best FROM students WHERE id = p_student_id;

  UPDATE students SET
    current_streak = v_new_streak,
    best_streak = GREATEST(COALESCE(best_streak, 0), v_new_streak),
    streak_last_updated = NOW(),
    last_active_date = v_current_date
  WHERE id = p_student_id;
END;
$$;

-- ============================================================================
-- H-5 FIX: admin_get_user_emails — admin-only
-- ============================================================================

-- Must DROP first: return type change is not allowed with CREATE OR REPLACE
DROP FUNCTION IF EXISTS admin_get_user_emails(uuid[]);
CREATE OR REPLACE FUNCTION admin_get_user_emails(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT au.id as user_id, au.email::TEXT
  FROM auth.users au WHERE au.id = ANY(p_user_ids);
END;
$$;

-- ============================================================================
-- M-1 FIX: check_email_exists — add ownership check (only self-check allowed)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE email_exists BOOLEAN; v_caller_email TEXT;
BEGIN
  -- SECURITY: Only allow checking own email (for profile validation)
  -- or admin checking any email
  SELECT au.email INTO v_caller_email FROM auth.users au WHERE au.id = auth.uid();
  IF LOWER(TRIM(email_to_check)) != LOWER(v_caller_email) AND
     NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: can only check own email';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = LOWER(TRIM(email_to_check))
  ) INTO email_exists;
  RETURN email_exists;
END;
$$;

-- ============================================================================
-- M-2 FIX: get_student_score_history — ownership check
-- ============================================================================

CREATE OR REPLACE FUNCTION get_student_score_history(
  p_student_id UUID, p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  transaction_date TIMESTAMPTZ, transaction_type TEXT, elo_change INTEGER,
  previous_elo INTEGER, new_elo INTEGER, exam_score DECIMAL, notes TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  -- SECURITY: Only own history or admin
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: can only view own score history';
  END IF;

  RETURN QUERY
  SELECT st.created_at, st.transaction_type, st.elo_change,
    st.previous_elo, st.new_elo, st.exam_score, st.notes
  FROM score_transactions st
  WHERE st.student_id = p_student_id
  ORDER BY st.created_at DESC LIMIT p_limit;
END;
$$;

-- ============================================================================
-- M-3 FIX: debug_session_history — ownership check
-- ============================================================================

CREATE OR REPLACE FUNCTION debug_session_history(p_student_id UUID)
RETURNS TABLE(
  session_id UUID, status TEXT, created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, question_count BIGINT
)
LANGUAGE plpgsql AS $$
BEGIN
  -- SECURITY: Only own sessions or admin
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: can only view own session history';
  END IF;

  RETURN QUERY
  SELECT cs.id, cs.status, cs.created_at, cs.cache_expires_at, COUNT(cqr.id)
  FROM competitive_sessions cs
  LEFT JOIN competitive_question_results cqr ON cs.id = cqr.session_id
  WHERE cs.student_id = p_student_id
  GROUP BY cs.id, cs.status, cs.created_at, cs.cache_expires_at
  ORDER BY cs.created_at DESC;
END;
$$;

-- ============================================================================
-- M-4 FIX: increment_prompt_usage / update_prompt_stats — admin-only
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_prompt_usage(prompt_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE ai_prompts SET usage_count = usage_count + 1, last_used_at = NOW()
  WHERE id = prompt_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_prompt_stats(prompt_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_quality NUMERIC; v_avg_latency INTEGER; v_avg_cost NUMERIC; v_success_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT AVG(quality_score)::NUMERIC(3,2), ROUND(AVG(latency_ms))::INTEGER,
    AVG(cost_usd)::NUMERIC(10,6), COUNT(*) FILTER (WHERE status = 'success')
  INTO v_avg_quality, v_avg_latency, v_avg_cost, v_success_count
  FROM ai_usage_logs WHERE request_metadata->>'prompt_id' = prompt_id::text;

  UPDATE ai_prompts SET avg_quality_score = v_avg_quality, avg_latency_ms = v_avg_latency,
    avg_cost_usd = v_avg_cost, success_count = v_success_count
  WHERE id = prompt_id;
END;
$$;

-- ============================================================================
-- M-5 FIX: claim_pending_notifications — restrict to service_role only
-- ============================================================================

REVOKE EXECUTE ON FUNCTION claim_pending_notifications FROM authenticated;
-- service_role GRANT already exists

-- ============================================================================
-- M-6 FIX: mark_messages_as_read — verify p_user_id = auth.uid()
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_messages_as_read(
  p_conversation_id UUID, p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER; v_sender_type TEXT;
BEGIN
  -- SECURITY: Verify caller is the user they claim to be
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only mark own messages as read';
  END IF;

  SELECT CASE
    WHEN student_id IN (SELECT id FROM students WHERE user_id = p_user_id) THEN 'teacher'
    WHEN teacher_id IN (SELECT id FROM teachers WHERE user_id = p_user_id) THEN 'student'
  END INTO v_sender_type
  FROM conversations WHERE id = p_conversation_id;

  IF v_sender_type IS NULL THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  UPDATE messages SET read_at = NOW()
  WHERE conversation_id = p_conversation_id AND sender_type = v_sender_type AND read_at IS NULL;
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
-- M-7 FIX: Missing indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at ON notification_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_competitive_question_results_student_subject ON competitive_question_results(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_ip ON waitlist_rate_limits(ip_address);

-- ============================================================================
-- DONE
-- ============================================================================
