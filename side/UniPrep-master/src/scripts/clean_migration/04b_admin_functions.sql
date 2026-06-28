-- ============================================================================
-- 04b_admin_functions.sql
-- Elmly Database - Admin Panel Functions
-- ============================================================================
-- Purpose: ALL admin-panel SECURITY DEFINER functions for CRUD, analytics,
--          settings management, notifications, and security
-- Depends on: 01_base_schema.sql, 04_functions_triggers.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from Elmly-Admin SQL stages 1-10
-- Authoritative Rule: Latest applied version used for conflicting functions
-- ============================================================================

-- ============================================================================
-- SECTION 1: DASHBOARD FUNCTIONS (Admin S1 - authoritative: UPDATE_dashboard_stats.sql)
-- ============================================================================

-- 1.1 Get dashboard statistics (authoritative: UPDATE_dashboard_stats.sql)
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
  v_total_students INTEGER;
  v_active_students INTEGER;
  v_total_exams BIGINT;
  v_avg_elo NUMERIC;
  v_total_teachers INTEGER;
  v_active_bookings INTEGER;
  v_total_questions INTEGER;
  v_avg_accuracy NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total_students 
  FROM students s JOIN profiles p ON s.user_id = p.id WHERE p.user_type = 'student';
  
  SELECT COUNT(*) INTO v_active_students
  FROM students s JOIN profiles p ON s.user_id = p.id
  WHERE p.user_type = 'student' AND s.last_active_date >= CURRENT_DATE - 30;
  
  SELECT COALESCE(SUM(s.total_exams_taken), 0) INTO v_total_exams
  FROM students s JOIN profiles p ON s.user_id = p.id WHERE p.user_type = 'student';
  
  SELECT ROUND(AVG(s.elo_rating)::NUMERIC, 1) INTO v_avg_elo
  FROM students s JOIN profiles p ON s.user_id = p.id
  WHERE p.user_type = 'student' AND s.elo_rating IS NOT NULL;
  
  SELECT COUNT(*) INTO v_total_teachers FROM teachers;
  SELECT COUNT(*) INTO v_active_bookings FROM bookings WHERE status IN ('pending', 'confirmed');
  
  SELECT COALESCE(SUM(ds.questions_attempted), 0) INTO v_total_questions
  FROM daily_stats ds JOIN students s ON ds.student_id = s.id
  JOIN profiles p ON s.user_id = p.id
  WHERE p.user_type = 'student' AND ds.date >= CURRENT_DATE - 30;
  
  SELECT ROUND(
    CASE WHEN SUM(ds.questions_attempted) > 0 
    THEN (SUM(ds.questions_correct)::NUMERIC / SUM(ds.questions_attempted) * 100) ELSE 0 END, 2
  ) INTO v_avg_accuracy
  FROM daily_stats ds JOIN students s ON ds.student_id = s.id
  JOIN profiles p ON s.user_id = p.id
  WHERE p.user_type = 'student' AND ds.date >= CURRENT_DATE - 30;
  
  v_stats := jsonb_build_object(
    'total_students', COALESCE(v_total_students, 0),
    'active_students_30d', COALESCE(v_active_students, 0),
    'total_exams', COALESCE(v_total_exams, 0),
    'avg_elo', COALESCE(v_avg_elo, 0),
    'total_teachers', COALESCE(v_total_teachers, 0),
    'active_bookings', COALESCE(v_active_bookings, 0),
    'total_questions_30d', COALESCE(v_total_questions, 0),
    'avg_accuracy_30d', COALESCE(v_avg_accuracy, 0),
    'timestamp', NOW()
  );
  RETURN v_stats;
END;
$$;

-- 1.2 Get student growth data
CREATE OR REPLACE FUNCTION get_student_growth(p_days INTEGER DEFAULT 30)
RETURNS TABLE(date DATE, new_students INTEGER, cumulative_students BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DATE(p.created_at) as date,
    COUNT(*)::INTEGER as new_students,
    SUM(COUNT(*)) OVER (ORDER BY DATE(p.created_at))::BIGINT as cumulative_students
  FROM profiles p WHERE p.user_type = 'student' AND p.created_at >= CURRENT_DATE - p_days
  GROUP BY DATE(p.created_at) ORDER BY date;
END;
$$;

-- 1.3 Get ELO distribution
CREATE OR REPLACE FUNCTION get_elo_distribution()
RETURNS TABLE(elo_bucket INTEGER, student_count INTEGER, tier TEXT, percentage NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total_students INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_students FROM students WHERE elo_rating IS NOT NULL;
  RETURN QUERY
  SELECT (FLOOR(s.elo_rating / 100) * 100)::INTEGER as elo_bucket,
    COUNT(*)::INTEGER as student_count,
    CASE WHEN FLOOR(s.elo_rating / 100) * 100 < 1200 THEN 'Bronze'
         WHEN FLOOR(s.elo_rating / 100) * 100 < 1400 THEN 'Silver'
         WHEN FLOOR(s.elo_rating / 100) * 100 < 1600 THEN 'Gold'
         WHEN FLOOR(s.elo_rating / 100) * 100 < 1800 THEN 'Platinum'
         ELSE 'Diamond' END as tier,
    ROUND((COUNT(*)::NUMERIC / NULLIF(v_total_students, 0) * 100), 2) as percentage
  FROM students s WHERE s.elo_rating IS NOT NULL
  GROUP BY elo_bucket, tier ORDER BY elo_bucket;
END;
$$;

-- 1.4 Get recent activity (authoritative: FIX_recent_activity.sql)
CREATE OR REPLACE FUNCTION get_recent_activity(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(event_type TEXT, user_id UUID, user_name TEXT, event_timestamp TIMESTAMPTZ, metadata JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 'registration'::TEXT AS event_type, p.id AS user_id, p.full_name AS user_name, p.created_at AS event_timestamp,
      jsonb_build_object('user_type', p.user_type, 'city', p.city) AS metadata
    FROM profiles p WHERE p.created_at >= NOW() - INTERVAL '24 hours' AND p.user_type = 'student'
    UNION ALL
    SELECT 'score_change'::TEXT, s.id, p.full_name, st.created_at,
      jsonb_build_object('elo_change', st.elo_change, 'new_elo', st.new_elo)
    FROM score_transactions st JOIN students s ON st.student_id = s.id JOIN profiles p ON s.user_id = p.id
    WHERE st.created_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'admin_action'::TEXT, aal.admin_id, p.full_name, aal.timestamp,
      jsonb_build_object('action', aal.action_type, 'table', aal.table_name)
    FROM admin_audit_log aal JOIN profiles p ON aal.admin_id = p.id
    WHERE aal.timestamp >= NOW() - INTERVAL '24 hours'
  ) sub
  ORDER BY sub.event_timestamp DESC LIMIT p_limit;
END;
$$;

-- 1.5 Get activity heatmap
CREATE OR REPLACE FUNCTION get_activity_heatmap(p_days INTEGER DEFAULT 90)
RETURNS TABLE(date DATE, active_users INTEGER, total_questions INTEGER, total_exams INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT ds.date, COUNT(DISTINCT ds.student_id)::INTEGER,
    SUM(ds.questions_attempted)::INTEGER,
    COUNT(DISTINCT CASE WHEN ds.exams_taken > 0 THEN ds.student_id END)::INTEGER
  FROM daily_stats ds WHERE ds.date >= CURRENT_DATE - p_days AND ds.is_active = TRUE
  GROUP BY ds.date ORDER BY ds.date;
END;
$$;

-- 1.6 Log admin action (S1 version)
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action_type TEXT, p_table_name TEXT DEFAULT NULL, p_record_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL, p_new_values JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_admin_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_log_id UUID; v_admin_id UUID;
BEGIN
  v_admin_id := COALESCE(p_admin_id, auth.uid());
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO admin_audit_log (admin_id, action_type, table_name, record_id, old_values, new_values, ip_address, user_agent)
    VALUES (v_admin_id, p_action_type, p_table_name, p_record_id, p_old_values, p_new_values, p_ip_address, p_user_agent)
    RETURNING id INTO v_log_id;
  END IF;
  RETURN v_log_id;
END;
$$;

-- ============================================================================
-- SECTION 2: STUDENT MANAGEMENT (Admin S2)
-- ============================================================================

-- 2.1 Search students with filters and pagination
CREATE OR REPLACE FUNCTION search_students(
  p_query TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL,
  p_min_elo INTEGER DEFAULT NULL, p_max_elo INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT NULL, p_sort_by TEXT DEFAULT 'created_at',
  p_sort_order TEXT DEFAULT 'DESC', p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  student_id UUID, user_id UUID, full_name TEXT, email TEXT, avatar_url TEXT,
  city TEXT, elo_rating INTEGER, total_exams BIGINT, total_questions BIGINT,
  last_active_date DATE, created_at TIMESTAMPTZ, is_active BOOLEAN, total_count BIGINT
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH filtered_students AS (
    SELECT s.id, s.user_id, p.full_name, COALESCE(au.email, 'no-email@example.com') as email,
      p.avatar_url, s.city, s.elo_rating, s.last_active_date, p.created_at,
      CASE WHEN s.last_active_date >= CURRENT_DATE - 30 THEN true ELSE false END as is_active
    FROM students s INNER JOIN profiles p ON s.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id
    WHERE (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
      AND (p_city IS NULL OR s.city = p_city)
      AND (p_min_elo IS NULL OR s.elo_rating >= p_min_elo)
      AND (p_max_elo IS NULL OR s.elo_rating <= p_max_elo)
      AND (p_status IS NULL OR
        (p_status = 'active' AND s.last_active_date >= CURRENT_DATE - 30) OR
        (p_status = 'inactive' AND (s.last_active_date < CURRENT_DATE - 30 OR s.last_active_date IS NULL)))
  ),
  student_counts AS (
    SELECT fs.id,
      (SELECT COUNT(*)::BIGINT FROM mock_exam_attempts WHERE user_id = fs.user_id) as total_exams,
      (SELECT COUNT(*)::BIGINT FROM student_answers sa WHERE sa.user_id = fs.user_id
        OR sa.practice_session_id IN (SELECT id FROM practice_sessions WHERE user_id = fs.user_id)) as total_questions
    FROM filtered_students fs
  ),
  total_count_cte AS (SELECT COUNT(*)::BIGINT as total FROM filtered_students)
  SELECT fs.id, fs.user_id, fs.full_name, fs.email, fs.avatar_url, fs.city, fs.elo_rating,
    COALESCE(sc.total_exams, 0), COALESCE(sc.total_questions, 0), fs.last_active_date,
    fs.created_at, fs.is_active, tc.total
  FROM filtered_students fs LEFT JOIN student_counts sc ON fs.id = sc.id CROSS JOIN total_count_cte tc
  ORDER BY CASE WHEN p_sort_by = 'name' THEN fs.full_name END,
    CASE WHEN p_sort_by = 'elo' THEN fs.elo_rating END DESC,
    CASE WHEN p_sort_by = 'exams' THEN sc.total_exams END DESC,
    CASE WHEN p_sort_by = 'last_active' THEN fs.last_active_date END DESC,
    fs.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 2.2 Get student detail
CREATE OR REPLACE FUNCTION get_student_detail(p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'student_id', s.id, 'user_id', s.user_id,
    'profile', jsonb_build_object('full_name', p.full_name, 'email', au.email, 'avatar_url', p.avatar_url, 'city', s.city, 'phone', p.phone, 'created_at', p.created_at),
    'stats', jsonb_build_object('elo_rating', s.elo_rating,
      'total_exams', (SELECT COUNT(*) FROM mock_exam_attempts WHERE user_id = s.user_id),
      'total_questions', (SELECT COUNT(*) FROM student_answers sa WHERE sa.user_id = s.user_id OR sa.practice_session_id IN (SELECT id FROM practice_sessions WHERE user_id = s.user_id)),
      'avg_score', (SELECT COALESCE(AVG(percentage), 0) FROM mock_exam_attempts WHERE user_id = s.user_id AND status = 'completed'),
      'last_active_date', s.last_active_date, 'streak_count', s.current_streak,
      'is_active', (s.last_active_date >= CURRENT_DATE - 30))
  ) INTO v_result
  FROM students s JOIN profiles p ON s.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id
  WHERE s.id = p_student_id;
  RETURN v_result;
END;
$$;

-- 2.3 Update student profile
CREATE OR REPLACE FUNCTION update_student_profile(
  p_student_id UUID, p_full_name TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL, p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID; v_result JSONB;
BEGIN
  SELECT user_id INTO v_user_id FROM students WHERE id = p_student_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Student not found'); END IF;
  UPDATE profiles SET full_name = COALESCE(p_full_name, full_name), phone = COALESCE(p_phone, phone), avatar_url = COALESCE(p_avatar_url, avatar_url), updated_at = NOW() WHERE id = v_user_id;
  IF p_city IS NOT NULL THEN UPDATE students SET city = p_city WHERE user_id = v_user_id; END IF;
  IF p_email IS NOT NULL THEN UPDATE auth.users SET email = p_email WHERE id = v_user_id; END IF;
  SELECT jsonb_build_object('success', true, 'data', jsonb_build_object('student_id', p_student_id, 'full_name', p.full_name, 'email', au.email, 'city', s.city))
  INTO v_result FROM profiles p LEFT JOIN auth.users au ON p.id = au.id LEFT JOIN students s ON s.user_id = p.id WHERE p.id = v_user_id;
  RETURN v_result;
END;
$$;

-- 2.4 Update student ELO manually
CREATE OR REPLACE FUNCTION update_student_elo(p_student_id UUID, p_new_elo INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old_elo INTEGER;
BEGIN
  SELECT elo_rating INTO v_old_elo FROM students WHERE id = p_student_id;
  IF v_old_elo IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Student not found'); END IF;
  UPDATE students SET elo_rating = p_new_elo WHERE id = p_student_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('student_id', p_student_id, 'old_elo', v_old_elo, 'new_elo', p_new_elo, 'change', p_new_elo - v_old_elo));
END;
$$;

-- 2.5 Delete student
CREATE OR REPLACE FUNCTION delete_student(p_student_id UUID, p_hard_delete BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
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

-- 2.6 Get students by city
CREATE OR REPLACE FUNCTION get_students_by_city()
RETURNS TABLE(city TEXT, student_count BIGINT, avg_elo NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT s.city, COUNT(*)::BIGINT, ROUND(AVG(s.elo_rating), 2)
  FROM students s WHERE s.city IS NOT NULL GROUP BY s.city ORDER BY student_count DESC;
END;
$$;

-- 2.7 Get student cities
CREATE OR REPLACE FUNCTION get_student_cities()
RETURNS TABLE(city TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT s.city FROM students s WHERE s.city IS NOT NULL ORDER BY s.city;
END;
$$;

-- ============================================================================
-- SECTION 3: TEACHER MANAGEMENT (Admin S2)
-- ============================================================================

-- 3.1 Admin search teachers (Admin S2 version - NOT the student-facing HOTFIX version)
DROP FUNCTION IF EXISTS admin_search_teachers(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION admin_search_teachers(
  p_query TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL,
  p_verification_status TEXT DEFAULT NULL, p_specialization TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at', p_sort_order TEXT DEFAULT 'DESC',
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  teacher_id UUID, user_id UUID, full_name TEXT, email TEXT, avatar_url TEXT,
  city TEXT, is_verified BOOLEAN, specializations TEXT[], hourly_rate NUMERIC,
  rating NUMERIC, total_bookings INTEGER, student_count BIGINT,
  created_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH filtered_teachers AS (
    SELECT t.id, t.user_id, p.full_name, COALESCE(au.email, 'no-email@example.com') as email,
      p.avatar_url, t.city, t.is_verified, t.specializations, t.hourly_rate, t.rating,
      t.current_students, t.total_students, p.created_at
    FROM teachers t INNER JOIN profiles p ON t.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id
    WHERE (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
      AND (p_city IS NULL OR t.city = p_city)
      AND (p_verification_status IS NULL OR (p_verification_status = 'verified' AND t.is_verified = true) OR (p_verification_status = 'unverified' AND t.is_verified = false))
      AND (p_specialization IS NULL OR p_specialization = ANY(t.specializations))
  ),
  teacher_counts AS (
    SELECT ft.id, (SELECT COUNT(*)::INTEGER FROM bookings b WHERE b.teacher_id = ft.id) as total_bookings,
      COALESCE(ft.current_students, 0)::BIGINT as student_count
    FROM filtered_teachers ft
  ),
  total_count_cte AS (SELECT COUNT(*)::BIGINT as total FROM filtered_teachers)
  SELECT ft.id, ft.user_id, ft.full_name, ft.email, ft.avatar_url, ft.city, ft.is_verified,
    ft.specializations, ft.hourly_rate, ft.rating, COALESCE(tc.total_bookings, 0),
    COALESCE(tc.student_count, 0), ft.created_at, tcc.total
  FROM filtered_teachers ft LEFT JOIN teacher_counts tc ON ft.id = tc.id CROSS JOIN total_count_cte tcc
  ORDER BY CASE WHEN p_sort_by = 'name' THEN ft.full_name END,
    CASE WHEN p_sort_by = 'rating' THEN ft.rating END DESC,
    ft.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 3.2 Get teacher detail
CREATE OR REPLACE FUNCTION get_teacher_detail(p_teacher_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'teacher_id', t.id, 'user_id', t.user_id,
    'profile', jsonb_build_object('full_name', p.full_name, 'email', au.email, 'avatar_url', p.avatar_url, 'city', t.city, 'phone', p.phone, 'created_at', p.created_at),
    'info', jsonb_build_object('bio', t.bio, 'specializations', t.specializations, 'experience_years', t.experience_years, 'hourly_rate', t.hourly_rate, 'monthly_rate', t.monthly_rate, 'rating', t.rating, 'is_verified', t.is_verified, 'available_groups', t.available_groups, 'certificates', COALESCE(t.certificates, '{}')),
    'stats', jsonb_build_object(
      'student_count', COALESCE(t.current_students, 0),
      'current_student_count', COALESCE(t.current_students, 0),
      'total_student_count', COALESCE(t.total_students, 0),
      'completed_bookings', (SELECT COUNT(*) FROM bookings WHERE teacher_id = t.id AND status = 'completed'),
      'pending_bookings', (SELECT COUNT(*) FROM bookings WHERE teacher_id = t.id AND status = 'pending'),
      'total_revenue', (SELECT COALESCE(SUM(price), 0) FROM bookings WHERE teacher_id = t.id AND status = 'completed'))
  ) INTO v_result
  FROM teachers t JOIN profiles p ON t.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id
  WHERE t.id = p_teacher_id;
  RETURN v_result;
END;
$$;

-- 3.3 Update teacher profile
CREATE OR REPLACE FUNCTION update_teacher_profile(
  p_teacher_id UUID, p_full_name TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL, p_avatar_url TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL, p_experience_years INTEGER DEFAULT NULL,
  p_hourly_rate NUMERIC DEFAULT NULL, p_monthly_rate NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID; v_result JSONB;
BEGIN
  SELECT user_id INTO v_user_id FROM teachers WHERE id = p_teacher_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Teacher not found'); END IF;
  UPDATE profiles SET full_name = COALESCE(p_full_name, full_name), phone = COALESCE(p_phone, phone), avatar_url = COALESCE(p_avatar_url, avatar_url), updated_at = NOW() WHERE id = v_user_id;
  UPDATE teachers SET city = COALESCE(p_city, city), bio = COALESCE(p_bio, bio), experience_years = COALESCE(p_experience_years, experience_years), hourly_rate = COALESCE(p_hourly_rate, hourly_rate), monthly_rate = COALESCE(p_monthly_rate, monthly_rate), updated_at = NOW() WHERE id = p_teacher_id;
  IF p_email IS NOT NULL THEN UPDATE auth.users SET email = p_email WHERE id = v_user_id; END IF;
  SELECT jsonb_build_object('success', true, 'data', jsonb_build_object('teacher_id', p_teacher_id, 'full_name', p.full_name))
  INTO v_result FROM profiles p WHERE p.id = v_user_id;
  RETURN v_result;
END;
$$;

-- 3.4 Update teacher verification
CREATE OR REPLACE FUNCTION update_teacher_verification(p_teacher_id UUID, p_is_verified BOOLEAN, p_rejection_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_certificate_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COALESCE(array_length(certificates, 1), 0)
  INTO v_certificate_count
  FROM public.teachers
  WHERE id = p_teacher_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teacher not found');
  END IF;

  IF p_is_verified AND v_certificate_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teacher must have at least one certificate before verification'
    );
  END IF;

  v_status := CASE WHEN p_is_verified THEN 'verified' ELSE 'rejected' END;

  UPDATE public.teachers
  SET
    is_verified = p_is_verified,
    verification_status = v_status,
    verification_rejection_reason = CASE
      WHEN v_status = 'rejected' THEN NULLIF(TRIM(p_rejection_reason), '')
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_teacher_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'teacher_id', p_teacher_id,
      'is_verified', p_is_verified,
      'verification_status', v_status
    )
  );
END;
$$;

-- 3.4b Admin update teacher certificates
CREATE OR REPLACE FUNCTION admin_update_teacher_certificates(p_teacher_id UUID, p_certificates TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_certificates TEXT[] := COALESCE(p_certificates, ARRAY[]::TEXT[]);
  v_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id = p_teacher_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teacher not found');
  END IF;

  v_status := CASE
    WHEN COALESCE(array_length(v_certificates, 1), 0) > 0 THEN 'pending'
    ELSE 'not_submitted'
  END;

  UPDATE public.teachers
  SET
    certificates = v_certificates,
    is_verified = FALSE,
    verification_status = v_status,
    verification_rejection_reason = NULL,
    updated_at = NOW()
  WHERE id = p_teacher_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'teacher_id', p_teacher_id,
      'certificate_count', COALESCE(array_length(v_certificates, 1), 0),
      'is_verified', false,
      'verification_status', v_status
    )
  );
END;
$$;

-- 3.5 Update teacher specializations
CREATE OR REPLACE FUNCTION update_teacher_specializations(p_teacher_id UUID, p_specializations TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE teachers SET specializations = p_specializations, updated_at = NOW() WHERE id = p_teacher_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('teacher_id', p_teacher_id, 'specializations', p_specializations));
END;
$$;

-- 3.6 Delete teacher
CREATE OR REPLACE FUNCTION delete_teacher(p_teacher_id UUID, p_hard_delete BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
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

-- 3.7 Get teachers by city
CREATE OR REPLACE FUNCTION get_teachers_by_city()
RETURNS TABLE(city TEXT, teacher_count BIGINT, verified_count BIGINT, avg_rating NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT t.city, COUNT(*)::BIGINT, COUNT(*) FILTER (WHERE t.is_verified = true)::BIGINT, ROUND(AVG(t.rating), 2)
  FROM teachers t WHERE t.city IS NOT NULL GROUP BY t.city ORDER BY teacher_count DESC;
END;
$$;

-- 3.8 Get teacher cities
CREATE OR REPLACE FUNCTION get_teacher_cities()
RETURNS TABLE(city TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT t.city FROM teachers t WHERE t.city IS NOT NULL ORDER BY t.city;
END;
$$;

-- 3.9 Get all specializations
CREATE OR REPLACE FUNCTION get_all_specializations()
RETURNS TABLE(specialization TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT unnest(t.specializations) FROM teachers t
  WHERE t.specializations IS NOT NULL AND array_length(t.specializations, 1) > 0 ORDER BY 1;
END;
$$;

-- ============================================================================
-- SECTION 4: ADMIN MANAGEMENT (Admin S2)
-- ============================================================================

-- 4.1 Get all admins
CREATE OR REPLACE FUNCTION get_all_admins(
  p_query TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL, p_is_active BOOLEAN DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at', p_sort_order TEXT DEFAULT 'DESC',
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  admin_id UUID, user_id UUID, full_name TEXT, email TEXT, avatar_url TEXT,
  role TEXT, permissions JSONB, is_active BOOLEAN, created_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ, created_by_name TEXT, total_count BIGINT
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH filtered_admins AS (
    SELECT a.id, a.user_id, p.full_name, COALESCE(au.email, 'no-email@example.com') as email,
      p.avatar_url, a.role::TEXT, a.permissions, a.is_active, a.created_at, a.last_login_at, a.created_by
    FROM admins a INNER JOIN profiles p ON a.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id
    WHERE (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
      AND (p_role IS NULL OR a.role::TEXT = p_role) AND (p_is_active IS NULL OR a.is_active = p_is_active)
  ),
  admin_creators AS (
    SELECT fa.id, cp.full_name as creator_name FROM filtered_admins fa
    LEFT JOIN admins ca ON fa.created_by = ca.id LEFT JOIN profiles cp ON ca.user_id = cp.id
  ),
  total_count_cte AS (SELECT COUNT(*)::BIGINT as total FROM filtered_admins)
  SELECT fa.id, fa.user_id, fa.full_name, fa.email, fa.avatar_url, fa.role, fa.permissions,
    fa.is_active, fa.created_at, fa.last_login_at, ac.creator_name, tc.total
  FROM filtered_admins fa LEFT JOIN admin_creators ac ON fa.id = ac.id CROSS JOIN total_count_cte tc
  ORDER BY CASE WHEN p_sort_by = 'name' THEN fa.full_name END,
    CASE WHEN p_sort_by = 'role' THEN fa.role END, fa.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 4.2 Get admin detail
CREATE OR REPLACE FUNCTION get_admin_detail(p_admin_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'admin_id', a.id, 'user_id', a.user_id,
    'profile', jsonb_build_object('full_name', p.full_name, 'email', au.email, 'avatar_url', p.avatar_url, 'phone', p.phone),
    'info', jsonb_build_object('role', a.role, 'permissions', a.permissions, 'is_active', a.is_active, 'created_at', a.created_at, 'updated_at', a.updated_at, 'last_login_at', a.last_login_at),
    'stats', jsonb_build_object('total_actions', (SELECT COUNT(*) FROM admin_audit_logs WHERE admin_id = a.id), 'recent_actions_count', (SELECT COUNT(*) FROM admin_audit_logs WHERE admin_id = a.id AND created_at >= NOW() - INTERVAL '30 days'))
  ) INTO v_result
  FROM admins a JOIN profiles p ON a.user_id = p.id LEFT JOIN auth.users au ON p.id = au.id WHERE a.id = p_admin_id;
  RETURN v_result;
END;
$$;

-- 4.3 Create admin
CREATE OR REPLACE FUNCTION create_admin(p_email TEXT, p_full_name TEXT, p_role TEXT DEFAULT 'moderator', p_created_by_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID; v_admin_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM admins WHERE user_id = v_user_id) THEN RETURN jsonb_build_object('success', false, 'error', 'User is already an admin'); END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'User does not exist. Please create user account first.');
  END IF;
  INSERT INTO profiles (id, full_name, user_type, created_at, updated_at) VALUES (v_user_id, p_full_name, 'admin', NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, user_type = 'admin', updated_at = NOW();
  INSERT INTO admins (user_id, role, created_by, created_at, updated_at) VALUES (v_user_id, p_role::admin_role, p_created_by_admin_id, NOW(), NOW()) RETURNING id INTO v_admin_id;
  IF p_created_by_admin_id IS NOT NULL THEN
    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES (p_created_by_admin_id, 'create_admin', 'admin', v_admin_id, jsonb_build_object('email', p_email, 'role', p_role));
  END IF;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('admin_id', v_admin_id, 'user_id', v_user_id, 'email', p_email, 'role', p_role));
END;
$$;

-- 4.4 Update admin role
CREATE OR REPLACE FUNCTION update_admin_role(p_admin_id UUID, p_role TEXT, p_updated_by_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_old_role FROM admins WHERE id = p_admin_id;
  IF v_old_role IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Admin not found'); END IF;
  UPDATE admins SET role = p_role::admin_role, updated_at = NOW() WHERE id = p_admin_id;
  IF p_updated_by_admin_id IS NOT NULL THEN
    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES (p_updated_by_admin_id, 'update_admin_role', 'admin', p_admin_id, jsonb_build_object('old_role', v_old_role, 'new_role', p_role));
  END IF;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('admin_id', p_admin_id, 'old_role', v_old_role, 'new_role', p_role));
END;
$$;

-- 4.5 Update admin status
CREATE OR REPLACE FUNCTION update_admin_status(p_admin_id UUID, p_is_active BOOLEAN, p_updated_by_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE admins SET is_active = p_is_active, updated_at = NOW() WHERE id = p_admin_id;
  IF p_updated_by_admin_id IS NOT NULL THEN
    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES (p_updated_by_admin_id, CASE WHEN p_is_active THEN 'activate_admin' ELSE 'deactivate_admin' END, 'admin', p_admin_id, jsonb_build_object('is_active', p_is_active));
  END IF;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('admin_id', p_admin_id, 'is_active', p_is_active));
END;
$$;

-- 4.6 Delete admin
CREATE OR REPLACE FUNCTION delete_admin(p_admin_id UUID, p_deleted_by_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID; v_email TEXT;
BEGIN
  SELECT a.user_id, au.email INTO v_user_id, v_email FROM admins a LEFT JOIN auth.users au ON a.user_id = au.id WHERE a.id = p_admin_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Admin not found'); END IF;
  IF p_deleted_by_admin_id IS NOT NULL THEN
    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES (p_deleted_by_admin_id, 'delete_admin', 'admin', p_admin_id, jsonb_build_object('email', v_email));
  END IF;
  DELETE FROM admins WHERE id = p_admin_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('admin_id', p_admin_id, 'user_id', v_user_id));
END;
$$;

-- 4.7 Get admin audit logs
CREATE OR REPLACE FUNCTION get_admin_audit_logs(
  p_admin_id UUID DEFAULT NULL, p_action TEXT DEFAULT NULL, p_target_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(log_id UUID, admin_id UUID, admin_name TEXT, action TEXT, target_type TEXT, target_id UUID, details JSONB, ip_address TEXT, created_at TIMESTAMPTZ, total_count BIGINT)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH filtered_logs AS (
    SELECT aal.id, aal.admin_id, aal.action, aal.target_type, aal.target_id, aal.details, aal.ip_address, aal.created_at
    FROM admin_audit_logs aal
    WHERE (p_admin_id IS NULL OR aal.admin_id = p_admin_id) AND (p_action IS NULL OR aal.action = p_action) AND (p_target_type IS NULL OR aal.target_type = p_target_type)
  ),
  total_count_cte AS (SELECT COUNT(*)::BIGINT as total FROM filtered_logs)
  SELECT fl.id, fl.admin_id, p.full_name, fl.action, fl.target_type, fl.target_id, fl.details, fl.ip_address, fl.created_at, tc.total
  FROM filtered_logs fl JOIN admins a ON fl.admin_id = a.id JOIN profiles p ON a.user_id = p.id CROSS JOIN total_count_cte tc
  ORDER BY fl.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;

-- 4.8 Log admin action (S2 version)
CREATE OR REPLACE FUNCTION log_admin_action(p_admin_id UUID, p_action TEXT, p_target_type TEXT DEFAULT NULL, p_target_id UUID DEFAULT NULL, p_details JSONB DEFAULT NULL, p_ip_address TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_log_id UUID;
BEGIN
  INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details, ip_address)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, p_details, p_ip_address) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

-- 4.9 Update admin last login
CREATE OR REPLACE FUNCTION update_admin_last_login(p_admin_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE admins SET last_login_at = NOW() WHERE id = p_admin_id;
$$;

-- 4.10 Get admin by user_id
CREATE OR REPLACE FUNCTION get_admin_by_user_id(p_user_id UUID)
RETURNS TABLE(admin_id UUID, role TEXT, permissions JSONB, is_active BOOLEAN)
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT id, role::TEXT, permissions, is_active FROM admins WHERE user_id = p_user_id;
$$;

-- ============================================================================
-- SECTION 5: SYSTEM SETTINGS FUNCTIONS (Admin S6 - authoritative: 04_fix)
-- ============================================================================

-- 5.1 Get system settings
CREATE OR REPLACE FUNCTION get_system_settings(p_category TEXT DEFAULT NULL, p_include_sensitive BOOLEAN DEFAULT FALSE)
RETURNS TABLE(key TEXT, value JSONB, category TEXT, description TEXT, is_public BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT s.key,
    CASE WHEN s.is_sensitive AND NOT p_include_sensitive THEN '"***REDACTED***"'::JSONB ELSE s.value END,
    s.category, s.description, s.is_public, s.updated_at
  FROM system_settings s WHERE (p_category IS NULL OR s.category = p_category) ORDER BY s.category, s.key;
END;
$$;

-- 5.2 Update system setting (authoritative: 04_fix_audit_log_function.sql)
CREATE OR REPLACE FUNCTION update_system_setting(p_admin_id UUID, p_key TEXT, p_value JSONB, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old_value JSONB; v_category TEXT; v_setting_id UUID; v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  SELECT value, category, id INTO v_old_value, v_category, v_setting_id FROM system_settings WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setting not found: %', p_key; END IF;
  UPDATE system_settings SET value = p_value, updated_by = p_admin_id, updated_at = NOW(), version = version + 1 WHERE key = p_key;
  INSERT INTO settings_history (table_name, record_id, action, old_value, new_value, changed_by, change_reason) VALUES ('system_settings', v_setting_id, 'update', v_old_value, p_value, p_admin_id, p_reason);
  INSERT INTO settings_audit_log (admin_id, action, category, setting_key, old_value, new_value, status) VALUES (p_admin_id, 'UPDATE', v_category, p_key, v_old_value, p_value, 'success');
  v_result := jsonb_build_object('success', true, 'key', p_key, 'old_value', v_old_value, 'new_value', p_value, 'version', (SELECT version FROM system_settings WHERE key = p_key));
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO settings_audit_log (admin_id, action, category, setting_key, old_value, new_value, status) VALUES (p_admin_id, 'UPDATE', v_category, p_key, v_old_value, p_value, 'failed');
  RAISE;
END;
$$;

-- 5.3 Check feature flag enabled
CREATE OR REPLACE FUNCTION is_feature_flag_enabled(p_flag_name TEXT, p_user_id UUID DEFAULT NULL, p_user_group TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_flag RECORD;
BEGIN
  SELECT * INTO v_flag FROM feature_flags WHERE flag_name = p_flag_name;
  IF NOT FOUND OR NOT v_flag.is_enabled THEN RETURN FALSE; END IF;
  IF v_flag.start_date IS NOT NULL AND NOW() < v_flag.start_date THEN RETURN FALSE; END IF;
  IF v_flag.end_date IS NOT NULL AND NOW() > v_flag.end_date THEN RETURN FALSE; END IF;
  IF v_flag.target_groups IS NOT NULL AND p_user_group IS NOT NULL THEN
    IF NOT (p_user_group = ANY(v_flag.target_groups) OR 'all' = ANY(v_flag.target_groups)) THEN RETURN FALSE; END IF;
  END IF;
  IF v_flag.rollout_percentage < 100 AND p_user_id IS NOT NULL THEN
    IF (hashtext(p_user_id::TEXT) % 100) >= v_flag.rollout_percentage THEN RETURN FALSE; END IF;
  END IF;
  RETURN TRUE;
END;
$$;

-- 5.4 Get mobile app settings
CREATE OR REPLACE FUNCTION get_mobile_app_settings()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_settings JSONB; v_feature_flags JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::JSONB) INTO v_settings FROM system_settings WHERE is_public = TRUE;
  SELECT COALESCE(jsonb_object_agg(flag_name, CASE WHEN is_enabled = TRUE AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW()) THEN TRUE ELSE FALSE END), '{}'::JSONB)
  INTO v_feature_flags FROM feature_flags;
  v_settings := v_settings || jsonb_build_object('feature_flags', v_feature_flags);
  v_settings := v_settings || jsonb_build_object('_metadata', jsonb_build_object('synced_at', NOW(), 'version', '1.0.0'));
  RETURN v_settings;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_subscription_public_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled JSONB;
  v_currency JSONB;
  v_enabled_bool BOOLEAN := FALSE;
  v_currency_text TEXT := 'AZN';
BEGIN
  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'subscriptions_enabled'),
    'false'::JSONB
  )
  INTO v_enabled;

  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'currency'),
    '"AZN"'::JSONB
  )
  INTO v_currency;

  v_enabled_bool := CASE
    WHEN jsonb_typeof(v_enabled) = 'boolean' THEN (v_enabled #>> '{}')::BOOLEAN
    WHEN jsonb_typeof(v_enabled) = 'string' THEN LOWER(BTRIM(v_enabled #>> '{}')) IN ('true', '1', 'yes', 'on')
    ELSE FALSE
  END;

  v_currency_text := COALESCE(NULLIF(UPPER(BTRIM(v_currency #>> '{}')), ''), 'AZN');

  RETURN jsonb_build_object(
    'subscriptions_enabled', COALESCE(v_enabled_bool, FALSE),
    'currency', v_currency_text
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_public_legal_document(p_type TEXT)
RETURNS TABLE(content TEXT, last_updated TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('terms_of_service', 'privacy_policy') THEN
    RAISE EXCEPTION 'Invalid legal document type';
  END IF;

  RETURN QUERY
  SELECT
    NULLIF(BTRIM(s.value #>> '{}'), '') AS content,
    s.updated_at AS last_updated
  FROM system_settings s
  WHERE s.key = p_type
  LIMIT 1;
END;
$$;

-- 5.5 Get settings audit log (authoritative: 04_fix)
CREATE OR REPLACE FUNCTION get_settings_audit_log(
  p_admin_id UUID DEFAULT NULL, p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW(), p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(id UUID, admin_name TEXT, action TEXT, category TEXT, setting_key TEXT, setting_name TEXT, old_value JSONB, new_value JSONB, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT sal.id, COALESCE(p.full_name, 'Unknown Admin'), sal.action, sal.category, sal.setting_key,
    INITCAP(REPLACE(sal.setting_key, '_', ' ')), sal.old_value, sal.new_value, sal.status, sal.created_at
  FROM settings_audit_log sal LEFT JOIN profiles p ON sal.admin_id = p.id
  WHERE sal.created_at >= p_start_date AND sal.created_at <= p_end_date AND (p_admin_id IS NULL OR sal.admin_id = p_admin_id)
  ORDER BY sal.created_at DESC LIMIT p_limit;
END;
$$;

-- 5.6 Feature flag audit trigger (Admin S6/04_fix)
CREATE OR REPLACE FUNCTION log_feature_flag_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_action TEXT; v_admin_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_admin_id := COALESCE(NEW.created_by, auth.uid());
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO settings_audit_log (admin_id, action, category, setting_key, old_value, new_value, status)
      VALUES (v_admin_id, 'CREATE', 'feature_flags', NEW.flag_name, NULL, jsonb_build_object('is_enabled', NEW.is_enabled, 'rollout_percentage', NEW.rollout_percentage, 'target_groups', NEW.target_groups, 'display_name', NEW.display_name), 'success');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_admin_id := COALESCE(NEW.updated_by, auth.uid(), OLD.created_by, NEW.created_by);
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO settings_audit_log (admin_id, action, category, setting_key, old_value, new_value, status)
      VALUES (v_admin_id, 'UPDATE', 'feature_flags', NEW.flag_name, jsonb_build_object('is_enabled', OLD.is_enabled, 'rollout_percentage', OLD.rollout_percentage), jsonb_build_object('is_enabled', NEW.is_enabled, 'rollout_percentage', NEW.rollout_percentage), 'success');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_admin_id := COALESCE(OLD.created_by, auth.uid());
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO settings_audit_log (admin_id, action, category, setting_key, old_value, new_value, status)
      VALUES (v_admin_id, 'DELETE', 'feature_flags', OLD.flag_name, jsonb_build_object('is_enabled', OLD.is_enabled), NULL, 'success');
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS feature_flag_audit_trigger ON feature_flags;
CREATE TRIGGER feature_flag_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION log_feature_flag_change();

-- ============================================================================
-- SECTION 6: SECURITY & LOGIN TRACKING (Admin S9)
-- ============================================================================

-- 6.1 Check login allowed (rate limiting)
CREATE OR REPLACE FUNCTION check_login_allowed(p_email TEXT, p_ip_address TEXT DEFAULT NULL)
RETURNS TABLE(allowed BOOLEAN, reason TEXT, retry_after_seconds INTEGER, email_attempts INTEGER, ip_attempts INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_email_attempts INTEGER; v_ip_attempts INTEGER; v_lockout_minutes INTEGER := 15; v_max_email_attempts INTEGER := 5; v_max_ip_attempts INTEGER := 20; v_locked_until TIMESTAMPTZ; v_user_id UUID;
BEGIN
  SELECT p.id, p.locked_until INTO v_user_id, v_locked_until FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = p_email;
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE, 'Account temporarily locked'::TEXT, EXTRACT(EPOCH FROM (v_locked_until - NOW()))::INTEGER, v_max_email_attempts, 0; RETURN;
  END IF;
  IF v_user_id IS NOT NULL AND v_locked_until IS NOT NULL AND v_locked_until <= NOW() THEN
    UPDATE profiles SET locked_until = NULL, failed_login_attempts = 0 WHERE id = v_user_id;
  END IF;
  SELECT COUNT(*) INTO v_email_attempts FROM login_attempts WHERE email = p_email AND success = FALSE AND created_at > NOW() - INTERVAL '15 minutes';
  IF p_ip_address IS NOT NULL THEN SELECT COUNT(*) INTO v_ip_attempts FROM login_attempts WHERE ip_address = p_ip_address AND success = FALSE AND created_at > NOW() - INTERVAL '15 minutes'; ELSE v_ip_attempts := 0; END IF;
  IF v_email_attempts >= v_max_email_attempts THEN RETURN QUERY SELECT FALSE, 'Too many failed login attempts'::TEXT, v_lockout_minutes * 60, v_email_attempts, v_ip_attempts; RETURN; END IF;
  IF v_ip_attempts >= v_max_ip_attempts THEN RETURN QUERY SELECT FALSE, 'Too many login attempts from this IP'::TEXT, v_lockout_minutes * 60, v_email_attempts, v_ip_attempts; RETURN; END IF;
  RETURN QUERY SELECT TRUE, NULL::TEXT, 0, v_email_attempts, v_ip_attempts;
END;
$$;

-- 6.2 Log login attempt
CREATE OR REPLACE FUNCTION log_login_attempt(p_email TEXT, p_ip_address TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_success BOOLEAN DEFAULT FALSE, p_failure_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_log_id UUID; v_user_id UUID;
BEGIN
  INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason) VALUES (p_email, p_ip_address, p_user_agent, p_success, p_failure_reason) RETURNING id INTO v_log_id;
  SELECT p.id INTO v_user_id FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = p_email;
  IF v_user_id IS NOT NULL THEN
    IF p_success THEN UPDATE profiles SET failed_login_attempts = 0, locked_until = NULL, last_failed_login = NULL WHERE id = v_user_id;
    ELSE
      UPDATE profiles SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1, last_failed_login = NOW() WHERE id = v_user_id;
      UPDATE profiles SET locked_until = NOW() + INTERVAL '15 minutes' WHERE id = v_user_id AND failed_login_attempts >= 5;
    END IF;
  END IF;
  DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '24 hours';
  RETURN v_log_id;
END;
$$;

-- 6.3 Admin get login attempts
CREATE OR REPLACE FUNCTION admin_get_login_attempts(
  p_admin_id UUID, p_email TEXT DEFAULT NULL, p_ip_address TEXT DEFAULT NULL,
  p_success BOOLEAN DEFAULT NULL, p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(id UUID, email TEXT, ip_address TEXT, user_agent TEXT, success BOOLEAN, failure_reason TEXT, created_at TIMESTAMPTZ, total_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  WITH filtered AS (
    SELECT la.* FROM login_attempts la
    WHERE (p_email IS NULL OR la.email ILIKE '%' || p_email || '%') AND (p_ip_address IS NULL OR la.ip_address = p_ip_address)
      AND (p_success IS NULL OR la.success = p_success) AND (p_start_date IS NULL OR la.created_at >= p_start_date) AND (p_end_date IS NULL OR la.created_at <= p_end_date)
  )
  SELECT f.id, f.email, f.ip_address, f.user_agent, f.success, f.failure_reason, f.created_at, (SELECT COUNT(*) FROM filtered)::BIGINT
  FROM filtered f ORDER BY f.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 6.4 Admin get login stats
CREATE OR REPLACE FUNCTION admin_get_login_stats(p_admin_id UUID, p_hours INTEGER DEFAULT 24)
RETURNS TABLE(total_attempts BIGINT, successful_attempts BIGINT, failed_attempts BIGINT, unique_emails BIGINT, unique_ips BIGINT, locked_accounts BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM login_attempts WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM login_attempts WHERE success = TRUE AND created_at > NOW() - (p_hours || ' hours')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM login_attempts WHERE success = FALSE AND created_at > NOW() - (p_hours || ' hours')::INTERVAL)::BIGINT,
    (SELECT COUNT(DISTINCT email) FROM login_attempts WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL)::BIGINT,
    (SELECT COUNT(DISTINCT ip_address) FROM login_attempts WHERE ip_address IS NOT NULL AND created_at > NOW() - (p_hours || ' hours')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM profiles WHERE locked_until IS NOT NULL AND locked_until > NOW())::BIGINT;
END;
$$;

-- 6.5 Admin unlock account
CREATE OR REPLACE FUNCTION admin_unlock_account(p_admin_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET locked_until = NULL, failed_login_attempts = 0 WHERE id = p_user_id;
  PERFORM log_admin_action('UPDATE', 'profiles', p_user_id, NULL, jsonb_build_object('action', 'unlock_account'), NULL, NULL, p_admin_id);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- SECTION 7: GRANT PERMISSIONS
-- ============================================================================

-- Dashboard functions
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_growth(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_elo_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_activity(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_heatmap(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action(TEXT, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, UUID) TO authenticated;

-- Student management
GRANT EXECUTE ON FUNCTION search_students TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_detail TO authenticated;
GRANT EXECUTE ON FUNCTION update_student_profile TO authenticated;
GRANT EXECUTE ON FUNCTION update_student_elo TO authenticated;
GRANT EXECUTE ON FUNCTION delete_student TO authenticated;
GRANT EXECUTE ON FUNCTION get_students_by_city TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_cities TO authenticated;

-- Teacher management
GRANT EXECUTE ON FUNCTION admin_search_teachers TO authenticated;
GRANT EXECUTE ON FUNCTION get_teacher_detail TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_profile TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_verification TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_teacher_certificates TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_specializations TO authenticated;
GRANT EXECUTE ON FUNCTION delete_teacher TO authenticated;
GRANT EXECUTE ON FUNCTION get_teachers_by_city TO authenticated;
GRANT EXECUTE ON FUNCTION get_teacher_cities TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_specializations TO authenticated;

-- Admin management
GRANT EXECUTE ON FUNCTION get_all_admins TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_detail TO authenticated;
GRANT EXECUTE ON FUNCTION create_admin TO authenticated;
GRANT EXECUTE ON FUNCTION update_admin_role TO authenticated;
GRANT EXECUTE ON FUNCTION update_admin_status TO authenticated;
GRANT EXECUTE ON FUNCTION delete_admin TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_admin_last_login TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_by_user_id TO authenticated;

-- System settings
GRANT EXECUTE ON FUNCTION get_system_settings TO authenticated;
GRANT EXECUTE ON FUNCTION update_system_setting TO authenticated;
GRANT EXECUTE ON FUNCTION is_feature_flag_enabled TO authenticated;
GRANT EXECUTE ON FUNCTION get_mobile_app_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_mobile_app_settings() TO anon;
GRANT EXECUTE ON FUNCTION get_teacher_subscription_public_config() TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_legal_document(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_legal_document(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_settings_audit_log TO authenticated;

-- Security
GRANT EXECUTE ON FUNCTION check_login_allowed TO authenticated;
GRANT EXECUTE ON FUNCTION check_login_allowed TO anon;
GRANT EXECUTE ON FUNCTION log_login_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION log_login_attempt TO anon;
GRANT EXECUTE ON FUNCTION admin_get_login_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_login_stats TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unlock_account TO authenticated;

-- ============================================================================
-- SECTION 10: ANALYTICS FUNCTIONS (Admin S5)
-- ============================================================================

-- 10.1 Engagement Metrics
CREATE OR REPLACE FUNCTION admin_get_engagement_metrics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_dau INTEGER;
  v_wau INTEGER;
  v_mau INTEGER;
  v_avg_session_duration NUMERIC;
  v_total_sessions INTEGER;
  v_trend_data JSON;
BEGIN
  SELECT COUNT(DISTINCT student_id) INTO v_dau
  FROM daily_stats
  WHERE date BETWEEN p_start_date AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COUNT(DISTINCT student_id) INTO v_wau
  FROM daily_stats
  WHERE date BETWEEN (p_end_date - INTERVAL '7 days')::DATE AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COUNT(DISTINCT student_id) INTO v_mau
  FROM daily_stats
  WHERE date BETWEEN (p_end_date - INTERVAL '30 days')::DATE AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COALESCE(AVG(study_time_minutes), 0), COUNT(*)
  INTO v_avg_session_duration, v_total_sessions
  FROM daily_stats
  WHERE date BETWEEN p_start_date AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT json_agg(json_build_object('date', date, 'activeUsers', active_users) ORDER BY date)
  INTO v_trend_data
  FROM (
    SELECT date, COUNT(DISTINCT student_id) as active_users
    FROM daily_stats
    WHERE date BETWEEN p_start_date AND p_end_date
      AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0)
    GROUP BY date
  ) daily_data;

  v_result := json_build_object(
    'dau', COALESCE(v_dau, 0),
    'wau', COALESCE(v_wau, 0),
    'mau', COALESCE(v_mau, 0),
    'avgSessionDuration', ROUND(COALESCE(v_avg_session_duration, 0), 2),
    'totalSessions', COALESCE(v_total_sessions, 0),
    'avgSessionsPerUser', CASE WHEN v_dau > 0 THEN ROUND(v_total_sessions::NUMERIC / v_dau, 2) ELSE 0 END,
    'retentionRates', json_build_object('day1', 0, 'day7', 0, 'day30', 0),
    'trends', COALESCE(v_trend_data, '[]'::json)
  );
  RETURN v_result;
END;
$$;

-- 10.2 Performance Metrics
CREATE OR REPLACE FUNCTION admin_get_performance_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_subject_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_avg_accuracy NUMERIC;
  v_total_questions INTEGER;
  v_total_correct INTEGER;
  v_total_study_time INTEGER;
  v_subject_performance JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_subject_id IS NULL THEN
    SELECT
      COALESCE(SUM(questions_attempted), 0),
      COALESCE(SUM(questions_correct), 0),
      COALESCE(SUM(study_time_minutes), 0)
    INTO v_total_questions, v_total_correct, v_total_study_time
    FROM daily_stats
    WHERE date BETWEEN p_start_date AND p_end_date
      AND is_active = TRUE;
  ELSE
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
      JOIN questions q ON q.id = sa.question_id
      WHERE ps.completed = TRUE
        AND q.subject_id = p_subject_id
        AND COALESCE(sa.answered_at, sa.created_at)::DATE BETWEEN p_start_date AND p_end_date
      ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
        COALESCE(sa.answered_at, sa.created_at) DESC,
        sa.created_at DESC,
        sa.id DESC
    )
    SELECT
      (COUNT(*) FILTER (WHERE was_skipped = FALSE))::INTEGER,
      (COUNT(*) FILTER (WHERE was_skipped = FALSE AND is_correct = TRUE))::INTEGER,
      ROUND(COALESCE(SUM(time_spent_seconds) FILTER (WHERE was_skipped = FALSE), 0)::NUMERIC / 60)::INTEGER
    INTO v_total_questions, v_total_correct, v_total_study_time
    FROM canonical_answers;
  END IF;

  v_avg_accuracy := CASE WHEN v_total_questions > 0
    THEN (v_total_correct::NUMERIC / v_total_questions * 100) ELSE 0 END;

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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at)::DATE BETWEEN p_start_date AND p_end_date
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT json_agg(subject_data ORDER BY total_attempted DESC)
  INTO v_subject_performance
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempted,
      json_build_object(
        'subjectId', s.id,
        'subjectName', s.name_en,
        'accuracy', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
          2
        ),
        'questionsAttempted', COUNT(*) FILTER (WHERE ca.was_skipped = FALSE),
        'avgScore', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
          2
        ),
        'studyTime', COALESCE(SUM(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE), 0),
        'avgTimeSeconds', ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1),
        'skipRate', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        )
      ) as subject_data
    FROM subjects s
    LEFT JOIN questions q ON q.subject_id = s.id
    LEFT JOIN canonical_answers ca ON ca.question_id = q.id
    WHERE (p_subject_id IS NULL OR s.id = p_subject_id)
    GROUP BY s.id, s.name_en
    HAVING COUNT(ca.question_id) > 0
  ) subquery;

  v_result := json_build_object(
    'avgAccuracy', ROUND(v_avg_accuracy, 2),
    'avgScore', ROUND(v_avg_accuracy, 2),
    'improvementRate', 0,
    'totalQuestionsAttempted', v_total_questions,
    'totalStudyTime', v_total_study_time,
    'subjectPerformance', COALESCE(v_subject_performance, '[]'::json)
  );
  RETURN v_result;
END;
$$;

-- 10.3 Student Segments
CREATE OR REPLACE FUNCTION admin_get_student_segments()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_high_performers INTEGER;
  v_struggling INTEGER;
  v_inactive INTEGER;
  v_power_users INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM students;

  SELECT COUNT(DISTINCT student_id) INTO v_high_performers
  FROM daily_stats
  WHERE date >= CURRENT_DATE - INTERVAL '30 days' AND is_active = TRUE
    AND questions_attempted > 0 AND (questions_correct::NUMERIC / questions_attempted * 100) > 80;

  SELECT COUNT(DISTINCT student_id) INTO v_struggling
  FROM daily_stats
  WHERE date >= CURRENT_DATE - INTERVAL '30 days' AND is_active = TRUE
    AND questions_attempted > 0 AND (questions_correct::NUMERIC / questions_attempted * 100) < 50;

  SELECT COUNT(*) INTO v_inactive
  FROM students s
  WHERE NOT EXISTS (
    SELECT 1 FROM daily_stats ds WHERE ds.student_id = s.id
      AND ds.date >= CURRENT_DATE - INTERVAL '7 days' AND ds.is_active = TRUE
  );

  SELECT COUNT(DISTINCT student_id) INTO v_power_users
  FROM (
    SELECT student_id, COUNT(DISTINCT date) as active_days
    FROM daily_stats WHERE date >= CURRENT_DATE - INTERVAL '7 days' AND is_active = TRUE
    GROUP BY student_id HAVING COUNT(DISTINCT date) >= 5
  ) power;

  v_result := json_build_object(
    'highPerformers', COALESCE(v_high_performers, 0),
    'struggling', COALESCE(v_struggling, 0),
    'inactive', COALESCE(v_inactive, 0),
    'powerUsers', COALESCE(v_power_users, 0),
    'atRisk', 0,
    'total', COALESCE(v_total, 0)
  );
  RETURN v_result;
END;
$$;

-- 10.4 Question Performance
CREATE OR REPLACE FUNCTION admin_get_question_performance(
  p_subject_id   UUID    DEFAULT NULL,
  p_difficulty   TEXT    DEFAULT NULL,
  p_needs_review BOOLEAN DEFAULT NULL,
  p_limit        INTEGER DEFAULT 100,
  p_start_date   DATE    DEFAULT NULL,
  p_end_date     DATE    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(question_data ORDER BY total_attempts DESC NULLS LAST)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'questionId',      q.id,
      'questionText',    LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName',     s.name_en,
      'difficulty',      q.difficulty,
      'accuracy',        ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts',        COALESCE(stats.total_answers, 0),
      'skipRate',        ROUND(COALESCE(stats.skip_rate, 0), 1),
      'avgTimeToAnswer', ROUND(COALESCE(stats.avg_time, 0), 0),
      'needsReview',     (
        COALESCE(stats.accuracy, 100) < 30
        OR COALESCE(stats.accuracy, 0) > 95
        OR COALESCE(stats.skip_rate, 0) > 40
      )
    ) as question_data,
    COALESCE(stats.total_answers, 0) as total_attempts
    FROM questions q
    JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                                  AS total_answers,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END)                    AS accuracy,
        AVG(COALESCE(sa.time_spent_seconds, 0))                                  AS avg_time,
        ROUND(
          COUNT(*) FILTER (WHERE sa.was_skipped = TRUE)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
          1
        )                                                                         AS skip_rate
      FROM student_answers sa
      WHERE sa.question_id = q.id
        AND (p_start_date IS NULL OR sa.answered_at::DATE >= p_start_date)
        AND (p_end_date   IS NULL OR sa.answered_at::DATE <= p_end_date)
    ) stats ON true
    WHERE q.is_active = TRUE
      AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
      AND (p_difficulty IS NULL OR q.difficulty  = p_difficulty)
      AND (
        p_needs_review IS NULL
        OR p_needs_review = FALSE
        OR (
          COALESCE(stats.accuracy, 100) < 30
          OR COALESCE(stats.accuracy, 0) > 95
          OR COALESCE(stats.skip_rate, 0) > 40
        )
      )
    ORDER BY COALESCE(stats.total_answers, 0) DESC NULLS LAST
    LIMIT p_limit
  ) subquery;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- 10.5 Exam Analytics
CREATE OR REPLACE FUNCTION admin_get_exam_analytics(
  p_exam_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(exam_data ORDER BY total_attempts DESC)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'examId', me.id, 'examName', me.title, 'examType', me.exam_type,
      'targetGroup', me.target_group,
      'totalAttempts', COALESCE(stats.total_attempts, 0),
      'completionRate', ROUND(COALESCE(stats.completion_rate, 0), 2),
      'avgScore', ROUND(COALESCE(stats.avg_score, 0), 2),
      'avgDuration', ROUND(COALESCE(stats.avg_duration, 0), 0),
      'passRate', ROUND(COALESCE(stats.pass_rate, 0), 2)
    ) as exam_data,
    COALESCE(stats.total_attempts, 0) as total_attempts
    FROM mock_exams me
    LEFT JOIN LATERAL (
      SELECT COUNT(mea.id) as total_attempts,
        AVG(CASE WHEN mea.status = 'completed' THEN 100.0 ELSE 0.0 END) as completion_rate,
        AVG(mea.percentage) as avg_score,
        AVG(EXTRACT(EPOCH FROM (mea.completed_at - mea.started_at)) / 60) as avg_duration,
        AVG(CASE WHEN mea.percentage >= 60 THEN 100.0 ELSE 0.0 END) as pass_rate
      FROM mock_exam_attempts mea
      WHERE mea.mock_exam_id = me.id
        AND (p_start_date IS NULL OR mea.started_at::DATE >= p_start_date)
        AND (p_end_date IS NULL OR mea.started_at::DATE <= p_end_date)
    ) stats ON true
    WHERE (p_exam_id IS NULL OR me.id = p_exam_id)
    LIMIT 50
  ) subquery;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 10.6 Content Quality Issues
CREATE OR REPLACE FUNCTION admin_get_content_quality_issues()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(quality_data ORDER BY total_attempts DESC)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'questionId',  q.id,
      'questionText', LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName', s.name_en,
      'difficulty',  q.difficulty,
      'accuracy',    ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts',    COALESCE(stats.total_answers, 0),
      'skipRate',    ROUND(COALESCE(stats.skip_rate, 0), 1),
      'needsReview', TRUE
    ) as quality_data,
    COALESCE(stats.total_answers, 0) as total_attempts
    FROM questions q
    JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                                  AS total_answers,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END)                    AS accuracy,
        ROUND(
          COUNT(*) FILTER (WHERE sa.was_skipped = TRUE)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
          1
        )                                                                         AS skip_rate
      FROM student_answers sa
      WHERE sa.question_id = q.id
      HAVING COUNT(*) >= 20
    ) stats ON true
    WHERE q.is_active = TRUE
      AND (
        stats.accuracy < 20
        OR stats.accuracy > 95
        OR stats.skip_rate > 40
      )
    LIMIT 100
  ) subquery;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 10.7 Database Stats
CREATE OR REPLACE FUNCTION admin_get_database_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_db_size TEXT;
  v_total_students INTEGER;
  v_total_questions INTEGER;
  v_total_exams INTEGER;
  v_total_sessions INTEGER;
BEGIN
  SELECT pg_size_pretty(pg_database_size(current_database())) INTO v_db_size;
  SELECT COUNT(*) INTO v_total_students FROM students;
  SELECT COUNT(*) INTO v_total_questions FROM questions;
  SELECT COUNT(*) INTO v_total_exams FROM mock_exams;
  SELECT COUNT(*) INTO v_total_sessions FROM practice_sessions;

  v_result := json_build_object(
    'databaseSize', v_db_size,
    'tables', json_build_object('students', v_total_students, 'questions', v_total_questions,
      'exams', v_total_exams, 'sessions', v_total_sessions),
    'growth', json_build_object(
      'studentsThisMonth', (SELECT COUNT(*) FROM students s JOIN profiles p ON s.user_id = p.id
        WHERE p.created_at >= DATE_TRUNC('month', CURRENT_DATE)),
      'sessionsThisMonth', (SELECT COUNT(*) FROM practice_sessions
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE))
    )
  );
  RETURN v_result;
END;
$$;

-- 10.8 Cohort Analysis
CREATE OR REPLACE FUNCTION admin_get_cohort_analysis(
  p_cohort_type TEXT, p_start_date DATE, p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  IF p_cohort_type = 'registration_date' THEN
    SELECT json_agg(cohort_data ORDER BY cohort_month DESC) INTO v_result
    FROM (
      SELECT TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') as cohort_month,
        json_build_object(
          'cohortName', TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM'),
          'totalStudents', COUNT(DISTINCT s.id),
          'activeStudents', COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END),
          'avgAccuracy', ROUND(COALESCE(AVG(CASE WHEN ds.questions_attempted > 0
            THEN (ds.questions_correct::NUMERIC / ds.questions_attempted * 100) ELSE 0 END), 0), 2),
          'avgQuestionsAttempted', ROUND(COALESCE(AVG(ds.questions_attempted), 0), 0),
          'retentionRate', ROUND(CASE WHEN COUNT(DISTINCT s.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END)::NUMERIC / COUNT(DISTINCT s.id) * 100) ELSE 0 END, 2)
        ) as cohort_data
      FROM students s JOIN profiles p ON s.user_id = p.id
      LEFT JOIN daily_stats ds ON s.id = ds.student_id AND ds.date BETWEEN p_start_date AND p_end_date
      WHERE p.created_at >= p_start_date - INTERVAL '1 year'
      GROUP BY DATE_TRUNC('month', p.created_at)
    ) subquery;
  ELSIF p_cohort_type = 'city' THEN
    SELECT json_agg(cohort_data ORDER BY total_students DESC) INTO v_result
    FROM (
      SELECT COUNT(DISTINCT s.id) as total_students,
        json_build_object(
          'cohortName', COALESCE(s.city, 'Unknown'),
          'totalStudents', COUNT(DISTINCT s.id),
          'activeStudents', COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END),
          'avgAccuracy', ROUND(COALESCE(AVG(CASE WHEN ds.questions_attempted > 0
            THEN (ds.questions_correct::NUMERIC / ds.questions_attempted * 100) ELSE 0 END), 0), 2),
          'avgQuestionsAttempted', ROUND(COALESCE(AVG(ds.questions_attempted), 0), 0),
          'retentionRate', ROUND(CASE WHEN COUNT(DISTINCT s.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END)::NUMERIC / COUNT(DISTINCT s.id) * 100) ELSE 0 END, 2)
        ) as cohort_data
      FROM students s LEFT JOIN daily_stats ds ON s.id = ds.student_id AND ds.date BETWEEN p_start_date AND p_end_date
      GROUP BY s.city
    ) subquery;
  ELSIF p_cohort_type = 'target_group' THEN
    SELECT json_agg(cohort_data ORDER BY total_students DESC) INTO v_result
    FROM (
      SELECT COUNT(DISTINCT s.id) as total_students,
        json_build_object(
          'cohortName', COALESCE(s.target_group, 'Unknown'),
          'totalStudents', COUNT(DISTINCT s.id),
          'activeStudents', COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END),
          'avgAccuracy', ROUND(COALESCE(AVG(CASE WHEN ds.questions_attempted > 0
            THEN (ds.questions_correct::NUMERIC / ds.questions_attempted * 100) ELSE 0 END), 0), 2),
          'avgQuestionsAttempted', ROUND(COALESCE(AVG(ds.questions_attempted), 0), 0),
          'retentionRate', ROUND(CASE WHEN COUNT(DISTINCT s.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN ds.is_active THEN s.id END)::NUMERIC / COUNT(DISTINCT s.id) * 100) ELSE 0 END, 2)
        ) as cohort_data
      FROM students s LEFT JOIN daily_stats ds ON s.id = ds.student_id AND ds.date BETWEEN p_start_date AND p_end_date
      GROUP BY s.target_group
    ) subquery;
  ELSE
    v_result := '[]'::json;
  END IF;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 10.9 Feature Usage
CREATE OR REPLACE FUNCTION admin_get_feature_usage(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'practiceMode', json_build_object(
      'totalSessions', (SELECT COUNT(*) FROM practice_sessions WHERE created_at::DATE BETWEEN p_start_date AND p_end_date),
      'uniqueUsers', (SELECT COUNT(DISTINCT user_id) FROM practice_sessions WHERE created_at::DATE BETWEEN p_start_date AND p_end_date)
    ),
    'examMode', json_build_object(
      'totalAttempts', (SELECT COUNT(*) FROM mock_exam_attempts WHERE started_at::DATE BETWEEN p_start_date AND p_end_date),
      'uniqueUsers', (SELECT COUNT(DISTINCT user_id) FROM mock_exam_attempts WHERE started_at::DATE BETWEEN p_start_date AND p_end_date)
    ),
    'competitiveMode', json_build_object('totalMatches', 0, 'uniquePlayers', 0)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 10.10 Performance Trends
CREATE OR REPLACE FUNCTION admin_get_performance_trends(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'date', date, 'activeUsers', active_users, 'totalSessions', total_sessions,
    'avgAccuracy', avg_accuracy, 'totalQuestions', total_questions
  ) ORDER BY date)
  INTO v_result
  FROM (
    SELECT ds.date, COUNT(DISTINCT ds.student_id) as active_users,
      COUNT(DISTINCT ps.id) as total_sessions,
      ROUND(AVG(CASE WHEN ds.questions_attempted > 0
        THEN (ds.questions_correct::NUMERIC / ds.questions_attempted * 100) ELSE 0 END), 2) as avg_accuracy,
      SUM(ds.questions_attempted) as total_questions
    FROM daily_stats ds
    LEFT JOIN practice_sessions ps ON ps.created_at::DATE = ds.date
    WHERE ds.date BETWEEN p_start_date AND p_end_date AND ds.is_active = TRUE
    GROUP BY ds.date ORDER BY ds.date
  ) trends;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 10.11 User Emails Helper
CREATE OR REPLACE FUNCTION admin_get_user_emails(user_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_object_agg(id, email) INTO v_result
  FROM auth.users WHERE id = ANY(user_ids);
  RETURN COALESCE(v_result, '{}'::json);
END;
$$;

-- Analytics function grants
GRANT EXECUTE ON FUNCTION admin_get_engagement_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_metrics(DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_student_segments TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_cohort_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_question_performance TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_exam_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_content_quality_issues TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_database_stats TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_feature_usage TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_trends TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_emails TO authenticated;

-- ============================================================================
-- Student list RPC (efficient single query, bypasses RLS via SECURITY DEFINER)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_student_list(
  p_start_date DATE    DEFAULT NULL,
  p_end_date   DATE    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_data ORDER BY total_questions DESC NULLS LAST)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'id',                 s.id,
      'userId',             s.user_id,
      'name',               COALESCE(p.full_name, 'Unknown'),
      'city',               COALESCE(s.city, 'Unknown'),
      'targetGroup',        COALESCE(s.target_group, 'Unknown'),
      'currentStreak',      COALESCE(s.current_streak, 0),
      'lastActive',         s.last_active_date,
      'questionsAttempted', COALESCE(stats.total_questions, 0),
      'accuracy',           COALESCE(ROUND(
                              CASE WHEN stats.total_questions > 0
                                THEN stats.total_correct::NUMERIC / stats.total_questions * 100
                              ELSE 0 END, 1
                            ), 0),
      'studyTime',          COALESCE(stats.total_study_time, 0)
    ) AS row_data,
    COALESCE(stats.total_questions, 0) AS total_questions
    FROM students s
    -- profiles.id = auth.users.id (profiles has no separate user_id column)
    LEFT JOIN profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(ds.questions_attempted)  AS total_questions,
        SUM(ds.questions_correct)    AS total_correct,
        SUM(ds.study_time_minutes)   AS total_study_time
      FROM daily_stats ds
      WHERE ds.student_id = s.id
        AND (p_start_date IS NULL OR ds.date >= p_start_date)
        AND (p_end_date   IS NULL OR ds.date <= p_end_date)
    ) stats ON true
    -- Exclude admin/teacher profiles
    WHERE (p.user_type IS NULL OR p.user_type = 'student')
    ORDER BY COALESCE(stats.total_questions, 0) DESC NULLS LAST
    LIMIT p_limit
  ) subquery;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_student_list(DATE, DATE, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_student_list(DATE, DATE, INTEGER) TO authenticated;

-- ============================================================================
-- SECTION 11: QUESTION FEEDBACK FUNCTIONS (Hotfixes 65, 69, 70)
-- ============================================================================

-- 11.1 Grouped question feedback getter
-- Returns ONE row per (question_id, feedback_type) with aggregated reporters array.
CREATE OR REPLACE FUNCTION admin_get_question_feedback_grouped()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      (array_agg(qf.id ORDER BY qf.created_at))[1] AS id,
      qf.question_id,
      MAX(q.question_text)                          AS question_text,
      MAX(s.name_en)                                AS subject_name,
      MAX(q.difficulty)                             AS difficulty,
      MAX(q.topic)                                  AS topic,
      qf.feedback_type,
      CASE
        WHEN bool_or(qf.status = 'pending')   THEN 'pending'
        WHEN bool_or(qf.status = 'reviewed')  THEN 'reviewed'
        WHEN bool_or(qf.status = 'resolved')  THEN 'resolved'
        ELSE 'dismissed'
      END                                           AS status,
      (
        SELECT qf2.admin_notes
        FROM   question_feedback qf2
        WHERE  qf2.question_id    = qf.question_id
          AND  qf2.feedback_type  = qf.feedback_type
          AND  qf2.admin_notes   IS NOT NULL
        ORDER BY qf2.updated_at DESC
        LIMIT 1
      )                                             AS admin_notes,
      MIN(qf.created_at)                            AS created_at,
      COUNT(*)::INT                                 AS total_reports,
      json_agg(
        json_build_object(
          'user_id',    qf.user_id,
          'name',       COALESCE(u.raw_user_meta_data->>'full_name', 'Anonymous'),
          'created_at', qf.created_at,
          'comment',    qf.comment
        )
        ORDER BY qf.created_at DESC
      )                                             AS reporters
    FROM  question_feedback qf
    JOIN  questions  q ON q.id = qf.question_id
    JOIN  subjects   s ON s.id = q.subject_id
    JOIN  auth.users u ON u.id = qf.user_id
    GROUP BY qf.question_id, qf.feedback_type
    ORDER BY
      CASE
        WHEN bool_or(qf.status = 'pending')   THEN 0
        WHEN bool_or(qf.status = 'reviewed')  THEN 1
        WHEN bool_or(qf.status = 'resolved')  THEN 2
        ELSE 3
      END,
      MIN(qf.created_at) DESC
    LIMIT 200
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_question_feedback_grouped() TO service_role;

-- 11.2 Group feedback updater — updates ALL rows for a (question_id, feedback_type) pair
CREATE OR REPLACE FUNCTION admin_update_feedback_group(
  p_question_id   UUID,
  p_feedback_type TEXT,
  p_status        TEXT,
  p_admin_notes   TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE question_feedback
  SET
    status       = p_status,
    admin_notes  = COALESCE(p_admin_notes, admin_notes),
    resolved_at  = CASE WHEN p_status IN ('resolved', 'dismissed') THEN NOW()    ELSE resolved_at END,
    resolved_by  = CASE WHEN p_status IN ('resolved', 'dismissed') THEN auth.uid() ELSE resolved_by END,
    updated_at   = NOW()
  WHERE question_id   = p_question_id
    AND feedback_type = p_feedback_type;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_feedback_group(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- DONE - Admin panel functions created
-- ============================================================================
-- Total: 50+ admin functions covering:
--   - Dashboard stats & activity (S1)
--   - Student CRUD & search (S2)
--   - Teacher CRUD & search (S2)
--   - Admin CRUD & role management (S2)
--   - Analytics & engagement metrics (S5)
--   - System settings & feature flags (S6)
--   - Security & login tracking (S9)
--   - Question feedback management (S11)
-- ============================================================================
