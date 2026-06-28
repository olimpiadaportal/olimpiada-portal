-- ============================================
-- CONSOLIDATED: Analytics & AI Management Functions
-- ============================================
-- Source: Admin S5 (01_analytics_functions, 02_content_analytics, 03_system_analytics)
--         Admin S5.5 (03_ai_analytics, 08_budget_alerts, 11_cost_optimization)
--         Admin S8 (01_audit_functions)
-- Authoritative: S5/01 is the integrated-fixes version for engagement/performance analytics
-- Dependencies: 01_base_schema.sql (tables), 04c (question/exam tables)
-- ============================================

-- ============================================
-- SECTION 1: ENGAGEMENT & PERFORMANCE ANALYTICS (S5/01)
-- ============================================

-- 1a. Engagement Metrics (DAU, WAU, MAU)
CREATE OR REPLACE FUNCTION admin_get_engagement_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'dau', (SELECT COUNT(DISTINCT user_id) FROM daily_stats WHERE date = CURRENT_DATE),
    'wau', (SELECT COUNT(DISTINCT user_id) FROM daily_stats WHERE date >= CURRENT_DATE - INTERVAL '7 days'),
    'mau', (SELECT COUNT(DISTINCT user_id) FROM daily_stats WHERE date >= CURRENT_DATE - INTERVAL '30 days'),
    'total_users', (SELECT COUNT(*) FROM profiles WHERE user_type = 'student'),
    'new_users_today', (SELECT COUNT(*) FROM profiles WHERE created_at::DATE = CURRENT_DATE AND user_type = 'student'),
    'new_users_week', (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND user_type = 'student'),
    'avg_session_duration', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::NUMERIC, 1), 0)
      FROM practice_sessions WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL AND ended_at IS NOT NULL
    ),
    'daily_active_trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.date, 'count', d.count) ORDER BY d.date), '[]'::jsonb)
      FROM (
        SELECT date, COUNT(DISTINCT user_id) as count
        FROM daily_stats WHERE date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY date
      ) d
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 1b. Performance Metrics
CREATE OR REPLACE FUNCTION admin_get_performance_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

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
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT jsonb_build_object(
    'overall_accuracy', COALESCE(ROUND(
      COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ), 0),
    'total_answers', COUNT(*) FILTER (WHERE ca.was_skipped = FALSE),
    'total_skipped', COUNT(*) FILTER (WHERE ca.was_skipped = TRUE),
    'total_practice_sessions', (
      SELECT COUNT(*) FROM practice_sessions
      WHERE started_at >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
    ),
    'avg_study_time_minutes', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::NUMERIC, 1), 0)
      FROM practice_sessions
      WHERE started_at >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
        AND ended_at IS NOT NULL
    ),
    'subject_performance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'subject_id', s.id,
        'subject_name', s.name_en,
        'accuracy', COALESCE(ROUND(
          COUNT(*) FILTER (WHERE c2.was_skipped = FALSE AND c2.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE c2.was_skipped = FALSE), 0) * 100,
          1
        ), 0),
        'total_answers', COUNT(*) FILTER (WHERE c2.was_skipped = FALSE),
        'avg_time_seconds', ROUND((AVG(c2.time_spent_seconds) FILTER (WHERE c2.was_skipped = FALSE))::NUMERIC, 1),
        'skip_rate', COALESCE(ROUND(
          COUNT(*) FILTER (WHERE c2.was_skipped = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        ), 0)
      )), '[]'::jsonb)
      FROM subjects s
      JOIN questions q ON q.subject_id = s.id
      JOIN canonical_answers c2 ON c2.question_id = q.id
      GROUP BY s.id, s.name_en
    )
  ) INTO v_result
  FROM canonical_answers ca;
  RETURN v_result;
END;
$$;

-- 1c. Student Segments
CREATE OR REPLACE FUNCTION admin_get_student_segments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'high_performers', (
      SELECT COUNT(*) FROM students s
      JOIN daily_stats ds ON ds.user_id = s.user_id
      WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY s.id HAVING AVG(ds.accuracy) > 80
    ),
    'struggling', (
      SELECT COUNT(*) FROM students s
      JOIN daily_stats ds ON ds.user_id = s.user_id
      WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY s.id HAVING AVG(ds.accuracy) < 40
    ),
    'inactive', (
      SELECT COUNT(*) FROM students s
      WHERE NOT EXISTS (
        SELECT 1 FROM daily_stats ds WHERE ds.user_id = s.user_id AND ds.date >= CURRENT_DATE - INTERVAL '14 days'
      )
    ),
    'total_students', (SELECT COUNT(*) FROM students)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 1d. Cohort Analysis
CREATE OR REPLACE FUNCTION admin_get_cohort_analysis(p_weeks INTEGER DEFAULT 8)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cohort_week', cohort_week, 'cohort_size', cohort_size,
    'retention', retention
  ) ORDER BY cohort_week), '[]'::jsonb) INTO v_result
  FROM (
    SELECT 
      DATE_TRUNC('week', p.created_at)::DATE as cohort_week,
      COUNT(DISTINCT p.id) as cohort_size,
      jsonb_agg(DISTINCT jsonb_build_object(
        'week', w.week_num,
        'active', (SELECT COUNT(DISTINCT ds.user_id) FROM daily_stats ds
          WHERE ds.user_id = p.id
          AND ds.date >= DATE_TRUNC('week', p.created_at) + (w.week_num || ' weeks')::INTERVAL
          AND ds.date < DATE_TRUNC('week', p.created_at) + ((w.week_num + 1) || ' weeks')::INTERVAL)
      )) as retention
    FROM profiles p
    CROSS JOIN generate_series(0, p_weeks - 1) as w(week_num)
    WHERE p.user_type = 'student'
      AND p.created_at >= NOW() - (p_weeks || ' weeks')::INTERVAL
    GROUP BY DATE_TRUNC('week', p.created_at)
  ) cohorts;
  RETURN v_result;
END;
$$;

-- 1e. Get User Emails (helper)
CREATE OR REPLACE FUNCTION admin_get_user_emails(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id as user_id, au.email::TEXT
  FROM auth.users au WHERE au.id = ANY(p_user_ids);
END;
$$;

-- Grant engagement/performance analytics permissions
GRANT EXECUTE ON FUNCTION admin_get_engagement_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_metrics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_student_segments TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_cohort_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_emails TO authenticated;

-- ============================================
-- SECTION 2: CONTENT ANALYTICS (S5/02)
-- ============================================

-- 2a. Question Performance
-- NOTE: Defined in 04b_admin_functions.sql with the full signature including date params.
-- Do NOT create an overloaded version here — PostgREST cannot disambiguate.
-- Removed the (p_subject_id, p_limit) TABLE-returning overload to fix RPC ambiguity.

-- 2b. Exam Analytics
CREATE OR REPLACE FUNCTION admin_get_exam_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_attempts', COUNT(*),
    'unique_students', COUNT(DISTINCT user_id),
    'avg_score', ROUND(AVG(score)::NUMERIC, 1),
    'avg_duration_minutes', ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60)::NUMERIC, 1),
    'completion_rate', ROUND((COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 1),
    'by_exam', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'exam_id', ea.mock_exam_id, 'title', me.title,
        'attempts', COUNT(*), 'avg_score', ROUND(AVG(ea.score)::NUMERIC, 1)
      )), '[]'::jsonb)
      FROM mock_exam_attempts ea
      JOIN mock_exams me ON me.id = ea.mock_exam_id
      WHERE ea.started_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY ea.mock_exam_id, me.title
    )
  ) INTO v_result
  FROM mock_exam_attempts
  WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL;
  RETURN v_result;
END;
$$;

-- 2c. Content Quality Issues
-- NOTE: This function is defined in 04b_admin_functions.sql as admin_get_content_quality_issues()
-- with no parameters. Do NOT create an overloaded version here — PostgREST cannot disambiguate.
-- The parameterized version was removed to fix the RPC overloading error.

-- 2d. Subject Analytics Summary
CREATE OR REPLACE FUNCTION admin_get_subject_analytics_summary()
RETURNS TABLE (
  subject_id UUID, subject_name TEXT, total_questions BIGINT,
  total_attempts BIGINT, avg_accuracy NUMERIC, avg_time_seconds NUMERIC,
  active_students BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    s.id,
    s.name_en,
    COUNT(DISTINCT q.id) AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ) AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds,
    COUNT(DISTINCT ca.user_id) AS active_students
  FROM subjects s
  LEFT JOIN questions q ON q.subject_id = s.id
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  GROUP BY s.id, s.name_en
  ORDER BY s.name_en;
END;
$$;

-- 2e. Topic Performance
CREATE OR REPLACE FUNCTION admin_get_topic_performance(p_subject_id UUID)
RETURNS TABLE (
  topic_name TEXT, total_questions BIGINT, total_attempts BIGINT,
  avg_accuracy NUMERIC, avg_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    q.topic,
    COUNT(DISTINCT q.id) AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ) AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds
  FROM questions q
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  WHERE q.subject_id = p_subject_id
  GROUP BY q.topic
  ORDER BY q.topic;
END;
$$;

-- 2f. Subtopic Performance (Stage 7 — subtopic-level analytics)
CREATE OR REPLACE FUNCTION admin_get_subtopic_performance(p_subject_id UUID)
RETURNS TABLE (
  topic_name TEXT, subtopic_id UUID, subtopic_name TEXT,
  total_questions BIGINT, total_attempts BIGINT,
  avg_accuracy NUMERIC, avg_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    q.topic                                                                    AS topic_name,
    ss.id                                                                      AS subtopic_id,
    ss.subtopic_name,
    COUNT(DISTINCT q.id)                                                       AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE)                AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    )                                                                          AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds
  FROM subject_subtopics ss
  JOIN questions q         ON q.subtopic_id  = ss.id
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  WHERE ss.subject_id = p_subject_id
    AND ss.is_active   = true
  GROUP BY q.topic, ss.id, ss.subtopic_name
  ORDER BY q.topic, ss.subtopic_name;
END;
$$;

-- Grant content analytics permissions
-- GRANT removed: admin_get_question_performance overload was removed above
GRANT EXECUTE ON FUNCTION admin_get_subject_analytics_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_exam_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_content_quality_issues TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_subject_analytics_summary TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_topic_performance TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_subtopic_performance TO authenticated;

-- ============================================
-- SECTION 3: SYSTEM ANALYTICS (S5/03)
-- ============================================

-- 3a. System Metrics
CREATE OR REPLACE FUNCTION admin_get_system_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'total_students', (SELECT COUNT(*) FROM profiles WHERE user_type = 'student'),
    'total_questions', (SELECT COUNT(*) FROM questions),
    'total_exams', (SELECT COUNT(*) FROM mock_exams),
    'total_practice_sessions', (SELECT COUNT(*) FROM practice_sessions),
    'total_mock_exam_attempts', (SELECT COUNT(*) FROM mock_exam_attempts),
    'total_answers', (SELECT COUNT(*) FROM student_answers WHERE practice_session_id IS NOT NULL),
    'storage_usage', (
      SELECT jsonb_build_object(
        'questions', pg_size_pretty(pg_total_relation_size('questions')),
        'student_answers', pg_size_pretty(pg_total_relation_size('student_answers')),
        'daily_stats', pg_size_pretty(pg_total_relation_size('daily_stats'))
      )
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 3b. Usage Patterns (heatmap data)
CREATE OR REPLACE FUNCTION admin_get_usage_patterns(p_days INTEGER DEFAULT 7)
RETURNS TABLE (day_of_week INTEGER, hour_of_day INTEGER, session_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT EXTRACT(DOW FROM started_at)::INTEGER as day_of_week,
    EXTRACT(HOUR FROM started_at)::INTEGER as hour_of_day,
    COUNT(*) as session_count
  FROM practice_sessions
  WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY EXTRACT(DOW FROM started_at), EXTRACT(HOUR FROM started_at)
  ORDER BY day_of_week, hour_of_day;
END;
$$;

-- 3c. Database Stats
CREATE OR REPLACE FUNCTION admin_get_database_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'tables', (
      SELECT jsonb_agg(jsonb_build_object(
        'table_name', relname,
        'row_count', n_live_tup,
        'size', pg_size_pretty(pg_total_relation_size(relid))
      ))
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 3d. Performance Trends
CREATE OR REPLACE FUNCTION admin_get_performance_trends(p_days INTEGER DEFAULT 30)
RETURNS TABLE (date DATE, avg_accuracy NUMERIC, total_sessions BIGINT, total_answers BIGINT, unique_users BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ds.date,
    ROUND(AVG(ds.accuracy)::NUMERIC, 1) as avg_accuracy,
    COUNT(DISTINCT ps.id) as total_sessions,
    SUM(ds.questions_answered)::BIGINT as total_answers,
    COUNT(DISTINCT ds.user_id) as unique_users
  FROM daily_stats ds
  LEFT JOIN practice_sessions ps ON ps.user_id = ds.user_id AND ps.started_at::DATE = ds.date
  WHERE ds.date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY ds.date
  ORDER BY ds.date;
END;
$$;

-- 3e. Feature Usage
CREATE OR REPLACE FUNCTION admin_get_feature_usage(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'practice', jsonb_build_object(
      'sessions', (SELECT COUNT(*) FROM practice_sessions WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL),
      'unique_users', (SELECT COUNT(DISTINCT user_id) FROM practice_sessions WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL)
    ),
    'exams', jsonb_build_object(
      'attempts', (SELECT COUNT(*) FROM mock_exam_attempts WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL),
      'unique_users', (SELECT COUNT(DISTINCT user_id) FROM mock_exam_attempts WHERE started_at >= NOW() - (p_days || ' days')::INTERVAL)
    ),
    'competitive', jsonb_build_object(
      'matches', (SELECT COUNT(*) FROM competitive_matches WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL),
      'unique_users', (SELECT COUNT(DISTINCT player1_id) + COUNT(DISTINCT player2_id) FROM competitive_matches WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Grant system analytics permissions
GRANT EXECUTE ON FUNCTION admin_get_system_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_usage_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_database_stats TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_trends TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_feature_usage TO authenticated;

-- ============================================
-- SECTION 4: AI ANALYTICS FUNCTIONS (S5.5/03 - Fixed signatures)
-- ============================================

-- 4a. AI Usage Overview (Fixed: uses p_start_date/p_end_date/p_feature_type/p_provider as admin panel expects)
CREATE OR REPLACE FUNCTION get_ai_usage_overview(
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_feature_type TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_requests INTEGER;
  v_total_tokens BIGINT;
  v_total_cost NUMERIC;
  v_avg_latency NUMERIC;
  v_success_rate NUMERIC;
  v_by_feature JSONB;
  v_by_provider JSONB;
  v_by_status JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(total_tokens), 0),
    COALESCE(SUM(cost_usd), 0),
    ROUND(AVG(latency_ms)::NUMERIC, 2),
    ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2)
  INTO v_total_requests, v_total_tokens, v_total_cost, v_avg_latency, v_success_rate
  FROM ai_usage_logs
  WHERE created_at BETWEEN p_start_date AND p_end_date
    AND (p_feature_type IS NULL OR feature_type = p_feature_type)
    AND (p_provider IS NULL OR provider = p_provider);

  SELECT jsonb_agg(jsonb_build_object(
    'feature', feature_type, 'requests', count,
    'tokens', tokens, 'cost', cost, 'avg_quality', avg_quality
  ))
  INTO v_by_feature
  FROM (
    SELECT feature_type, COUNT(*)::INTEGER as count,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost_usd), 0)::NUMERIC, 2) as cost,
      ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_provider IS NULL OR provider = p_provider)
    GROUP BY feature_type ORDER BY count DESC
  ) sub;

  SELECT jsonb_agg(jsonb_build_object(
    'provider', provider, 'requests', count,
    'tokens', tokens, 'cost', cost, 'avg_latency', avg_latency
  ))
  INTO v_by_provider
  FROM (
    SELECT provider, COUNT(*)::INTEGER as count,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost_usd), 0)::NUMERIC, 2) as cost,
      ROUND(AVG(latency_ms)::NUMERIC, 2) as avg_latency
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_feature_type IS NULL OR feature_type = p_feature_type)
    GROUP BY provider ORDER BY count DESC
  ) sub;

  SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count, 'percentage', percentage))
  INTO v_by_status
  FROM (
    SELECT status, COUNT(*)::INTEGER as count,
      ROUND((COUNT(*)::NUMERIC / NULLIF(v_total_requests, 0) * 100), 2) as percentage
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_feature_type IS NULL OR feature_type = p_feature_type)
      AND (p_provider IS NULL OR provider = p_provider)
    GROUP BY status ORDER BY count DESC
  ) sub;

  v_result := jsonb_build_object(
    'total_requests', COALESCE(v_total_requests, 0),
    'total_tokens', COALESCE(v_total_tokens, 0),
    'total_cost', COALESCE(v_total_cost, 0),
    'avg_latency_ms', COALESCE(v_avg_latency, 0),
    'success_rate', COALESCE(v_success_rate, 0),
    'by_feature', COALESCE(v_by_feature, '[]'::jsonb),
    'by_provider', COALESCE(v_by_provider, '[]'::jsonb),
    'by_status', COALESCE(v_by_status, '[]'::jsonb),
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'timestamp', NOW()
  );
  RETURN v_result;
END;
$$;

-- 4b. AI Cost Trends (Fixed: uses p_period TEXT + p_days INTEGER as admin panel expects)
CREATE OR REPLACE FUNCTION get_ai_cost_trends(
  p_period TEXT DEFAULT 'daily',
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  period_date TIMESTAMPTZ, requests INTEGER, tokens BIGINT,
  cost NUMERIC, avg_cost_per_request NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_trunc_unit TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_trunc_unit := CASE p_period
    WHEN 'hourly' THEN 'hour'
    WHEN 'daily' THEN 'day'
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    ELSE 'day'
  END;

  RETURN QUERY EXECUTE format('
    SELECT
      date_trunc(%L, created_at) as period_date,
      COUNT(*)::INTEGER as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost_usd), 0)::NUMERIC, 2) as cost,
      ROUND(COALESCE(SUM(cost_usd) / NULLIF(COUNT(*), 0), 0)::NUMERIC, 4) as avg_cost_per_request
    FROM ai_usage_logs
    WHERE created_at >= NOW() - interval %L
    GROUP BY date_trunc(%L, created_at)
    ORDER BY period_date DESC
  ', v_trunc_unit, p_days || ' days', v_trunc_unit);
END;
$$;

-- 4c. AI Budget Status (Fixed: uses p_budget_id parameter as S5.5 expects)
CREATE OR REPLACE FUNCTION get_ai_budget_status(p_budget_id UUID DEFAULT NULL)
RETURNS TABLE(
  budget_id UUID, budget_name TEXT, period_type TEXT,
  period_start DATE, period_end DATE,
  budget_amount NUMERIC, current_spend NUMERIC, remaining NUMERIC,
  percent_used NUMERIC, days_remaining INTEGER, projected_spend NUMERIC,
  alert_threshold NUMERIC, is_over_threshold BOOLEAN, is_over_budget BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    b.id as budget_id, b.name as budget_name, b.period_type,
    b.period_start, b.period_end,
    b.budget_usd as budget_amount,
    b.current_spend_usd as current_spend,
    (b.budget_usd - b.current_spend_usd) as remaining,
    ROUND((b.current_spend_usd / NULLIF(b.budget_usd, 0) * 100)::NUMERIC, 2) as percent_used,
    (b.period_end - CURRENT_DATE)::INTEGER as days_remaining,
    ROUND(
      CASE
        WHEN (b.period_end - b.period_start) > 0 THEN
          b.current_spend_usd / NULLIF((CURRENT_DATE - b.period_start)::NUMERIC, 0) * (b.period_end - b.period_start)
        ELSE b.current_spend_usd
      END::NUMERIC, 2
    ) as projected_spend,
    ROUND((b.budget_usd * b.alert_threshold_percent / 100)::NUMERIC, 2) as alert_threshold,
    (b.current_spend_usd >= b.budget_usd * b.alert_threshold_percent / 100) as is_over_threshold,
    (b.current_spend_usd >= b.budget_usd) as is_over_budget,
    CASE
      WHEN b.current_spend_usd >= b.budget_usd THEN 'over_budget'
      WHEN b.current_spend_usd >= b.budget_usd * b.alert_threshold_percent / 100 THEN 'warning'
      ELSE 'normal'
    END as status
  FROM ai_budgets b
  WHERE b.is_active = TRUE
    AND CURRENT_DATE BETWEEN b.period_start AND b.period_end
    AND (p_budget_id IS NULL OR b.id = p_budget_id)
  ORDER BY b.period_start DESC;
END;
$$;

-- 4d. AI Quality Metrics (Fixed: uses p_start_date/p_end_date/p_feature_type as S5.5 expects)
CREATE OR REPLACE FUNCTION get_ai_quality_metrics(
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_feature_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_avg_quality NUMERIC;
  v_total_reviewed INTEGER;
  v_approval_rate NUMERIC;
  v_flagged_count INTEGER;
  v_common_issues JSONB;
  v_trends JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT
    ROUND(AVG(quality_score)::NUMERIC, 2),
    COUNT(*)::INTEGER,
    ROUND((COUNT(*) FILTER (WHERE review_status = 'approved')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2),
    COUNT(*) FILTER (WHERE flagged_for_review = TRUE)::INTEGER
  INTO v_avg_quality, v_total_reviewed, v_approval_rate, v_flagged_count
  FROM ai_usage_logs
  WHERE created_at BETWEEN p_start_date AND p_end_date
    AND quality_score IS NOT NULL
    AND (p_feature_type IS NULL OR feature_type = p_feature_type);

  SELECT jsonb_agg(jsonb_build_object('issue', issue, 'count', count))
  INTO v_common_issues
  FROM (
    SELECT jsonb_array_elements_text(qr.issues) as issue, COUNT(*)::INTEGER as count
    FROM ai_quality_reviews qr
    JOIN ai_usage_logs ul ON qr.usage_log_id = ul.id
    WHERE ul.created_at BETWEEN p_start_date AND p_end_date
      AND (p_feature_type IS NULL OR ul.feature_type = p_feature_type)
    GROUP BY issue ORDER BY count DESC LIMIT 10
  ) sub;

  SELECT jsonb_agg(jsonb_build_object('date', date, 'avg_score', avg_score, 'count', count))
  INTO v_trends
  FROM (
    SELECT DATE(created_at) as date,
      ROUND(AVG(quality_score)::NUMERIC, 2) as avg_score,
      COUNT(*)::INTEGER as count
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND quality_score IS NOT NULL
      AND (p_feature_type IS NULL OR feature_type = p_feature_type)
    GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
  ) sub;

  v_result := jsonb_build_object(
    'avg_quality_score', COALESCE(v_avg_quality, 0),
    'total_reviewed', COALESCE(v_total_reviewed, 0),
    'approval_rate', COALESCE(v_approval_rate, 0),
    'flagged_count', COALESCE(v_flagged_count, 0),
    'common_issues', COALESCE(v_common_issues, '[]'::jsonb),
    'trends', COALESCE(v_trends, '[]'::jsonb),
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'timestamp', NOW()
  );
  RETURN v_result;
END;
$$;

-- 4e. AI Review Queue (Fixed: matches S5.5 signature)
CREATE OR REPLACE FUNCTION get_ai_review_queue(
  p_status TEXT DEFAULT 'pending',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  log_id UUID, request_id TEXT, feature_type TEXT,
  provider TEXT, model TEXT, quality_score NUMERIC,
  flagged_reason TEXT, created_at TIMESTAMPTZ, priority INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
      RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    ul.id as log_id, ul.request_id, ul.feature_type,
    ul.provider, ul.model, ul.quality_score,
    CASE
      WHEN ul.quality_score < 0.3 THEN 'Very Low Quality'
      WHEN ul.quality_score < 0.5 THEN 'Low Quality'
      WHEN ul.status = 'error' THEN 'Error Occurred'
      ELSE 'Manual Review Requested'
    END as flagged_reason,
    ul.created_at,
    CASE
      WHEN ul.quality_score < 0.3 THEN 1
      WHEN ul.quality_score < 0.5 THEN 2
      WHEN ul.status = 'error' THEN 3
      ELSE 4
    END as priority
  FROM ai_usage_logs ul
  WHERE ul.flagged_for_review = TRUE
    AND (p_status = 'all' OR ul.review_status = p_status
      OR (p_status = 'pending' AND (ul.review_status IS NULL OR ul.review_status = 'pending')))
  ORDER BY priority ASC, ul.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant AI analytics permissions
GRANT EXECUTE ON FUNCTION get_ai_usage_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_cost_trends(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_budget_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_quality_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_review_queue(TEXT, INTEGER) TO authenticated;

-- ============================================
-- SECTION 5: BUDGET ALERTS SYSTEM (S5.5/08)
-- ============================================

-- 5a. Extend ai_budgets with alert columns
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS alert_email TEXT;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS alert_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS alert_threshold_1 INTEGER DEFAULT 80;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS alert_threshold_2 INTEGER DEFAULT 95;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS alert_threshold_3 INTEGER DEFAULT 100;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS last_alert_sent TIMESTAMPTZ;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS last_alert_type VARCHAR;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS hard_limit_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_budgets ADD COLUMN IF NOT EXISTS grace_period_hours INTEGER DEFAULT 24;

-- 5b. Budget Alerts History Table
CREATE TABLE IF NOT EXISTS ai_budget_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID REFERENCES ai_budgets(id) ON DELETE CASCADE,
  alert_type VARCHAR NOT NULL,
  threshold_percentage INTEGER NOT NULL,
  current_spend DECIMAL(10,4) NOT NULL,
  budget_limit DECIMAL(10,4) NOT NULL,
  percentage_used DECIMAL(5,2) NOT NULL,
  alert_message TEXT,
  email_sent BOOLEAN DEFAULT false,
  email_error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget_id ON ai_budget_alerts(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_sent_at ON ai_budget_alerts(sent_at DESC);

ALTER TABLE ai_budget_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view budget alerts" ON ai_budget_alerts;
CREATE POLICY "Admins can view budget alerts" ON ai_budget_alerts FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "System can insert budget alerts" ON ai_budget_alerts;
CREATE POLICY "System can insert budget alerts" ON ai_budget_alerts FOR INSERT
  WITH CHECK (true);

-- 5c. Check Budget Alerts
CREATE OR REPLACE FUNCTION check_budget_alerts()
RETURNS TABLE (
  budget_id UUID, budget_name VARCHAR, alert_type VARCHAR,
  current_spend DECIMAL, budget_limit DECIMAL,
  percentage_used DECIMAL, should_alert BOOLEAN, alert_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_budget RECORD; v_current_spend DECIMAL; v_percentage DECIMAL;
  v_last_alert_type VARCHAR; v_should_alert BOOLEAN;
  v_alert_type VARCHAR; v_alert_message TEXT;
BEGIN
  FOR v_budget IN
    SELECT b.id, b.name, b.budget_usd as limit_amount, b.period_start, b.period_end,
      b.alert_enabled, b.alert_threshold_1, b.alert_threshold_2, b.alert_threshold_3,
      b.last_alert_sent, b.last_alert_type, b.hard_limit_enabled
    FROM ai_budgets b WHERE b.is_active = true AND b.alert_enabled = true
  LOOP
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_current_spend
    FROM ai_usage_logs WHERE created_at >= v_budget.period_start AND created_at <= v_budget.period_end;
    
    v_percentage := (v_current_spend / NULLIF(v_budget.limit_amount, 0)) * 100;
    v_should_alert := false; v_alert_type := NULL; v_alert_message := NULL;
    v_last_alert_type := v_budget.last_alert_type;
    
    IF v_percentage >= v_budget.alert_threshold_3 AND v_last_alert_type != 'threshold_100' THEN
      v_should_alert := true; v_alert_type := 'threshold_100';
      v_alert_message := format('CRITICAL: Budget "%s" at %s%% ($%s/$%s)', v_budget.name, ROUND(v_percentage,1), ROUND(v_current_spend,2), ROUND(v_budget.limit_amount,2));
    ELSIF v_percentage >= v_budget.alert_threshold_2 AND v_last_alert_type NOT IN ('threshold_95', 'threshold_100') THEN
      v_should_alert := true; v_alert_type := 'threshold_95';
      v_alert_message := format('WARNING: Budget "%s" at %s%% ($%s/$%s)', v_budget.name, ROUND(v_percentage,1), ROUND(v_current_spend,2), ROUND(v_budget.limit_amount,2));
    ELSIF v_percentage >= v_budget.alert_threshold_1 AND v_last_alert_type IS NULL THEN
      v_should_alert := true; v_alert_type := 'threshold_80';
      v_alert_message := format('NOTICE: Budget "%s" at %s%% ($%s/$%s)', v_budget.name, ROUND(v_percentage,1), ROUND(v_current_spend,2), ROUND(v_budget.limit_amount,2));
    END IF;
    
    RETURN QUERY SELECT v_budget.id, v_budget.name, v_alert_type, v_current_spend,
      v_budget.limit_amount, v_percentage, v_should_alert, v_alert_message;
  END LOOP;
END;
$$;

-- 5d. Record Budget Alert
CREATE OR REPLACE FUNCTION record_budget_alert(
  p_budget_id UUID, p_alert_type VARCHAR, p_threshold_percentage INTEGER,
  p_current_spend DECIMAL, p_budget_limit DECIMAL, p_percentage_used DECIMAL,
  p_alert_message TEXT, p_email_sent BOOLEAN DEFAULT false, p_email_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_alert_id UUID;
BEGIN
  INSERT INTO ai_budget_alerts (budget_id, alert_type, threshold_percentage, current_spend, budget_limit, percentage_used, alert_message, email_sent, email_error)
  VALUES (p_budget_id, p_alert_type, p_threshold_percentage, p_current_spend, p_budget_limit, p_percentage_used, p_alert_message, p_email_sent, p_email_error)
  RETURNING id INTO v_alert_id;
  
  UPDATE ai_budgets SET last_alert_sent = NOW(), last_alert_type = p_alert_type WHERE id = p_budget_id;
  RETURN v_alert_id;
END;
$$;

-- 5e. Get Budget Alert History
CREATE OR REPLACE FUNCTION get_budget_alert_history(p_budget_id UUID DEFAULT NULL, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID, budget_id UUID, budget_name TEXT, alert_type TEXT,
  threshold_percentage INTEGER, current_spend DECIMAL, budget_limit DECIMAL,
  percentage_used DECIMAL, alert_message TEXT, sent_at TIMESTAMP,
  email_sent BOOLEAN, email_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;
  
  RETURN QUERY
  SELECT a.id, a.budget_id, b.name::TEXT, a.alert_type::TEXT, a.threshold_percentage,
    a.current_spend, a.budget_limit, a.percentage_used, a.alert_message,
    a.sent_at, a.email_sent, a.email_error
  FROM ai_budget_alerts a
  JOIN ai_budgets b ON a.budget_id = b.id
  WHERE (p_budget_id IS NULL OR a.budget_id = p_budget_id)
    AND a.sent_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY a.sent_at DESC;
END;
$$;

-- 5f. Check Hard Limit
CREATE OR REPLACE FUNCTION check_hard_limit(p_user_id UUID)
RETURNS TABLE (
  is_blocked BOOLEAN, budget_name VARCHAR, current_spend DECIMAL,
  budget_limit DECIMAL, grace_period_ends TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_budget RECORD; v_current_spend DECIMAL; v_percentage DECIMAL; v_grace_period_ends TIMESTAMP;
BEGIN
  FOR v_budget IN
    SELECT b.id, b.name, b.budget_usd as limit_amount, b.period_start, b.period_end,
      b.hard_limit_enabled, b.grace_period_hours, b.last_alert_sent, b.last_alert_type
    FROM ai_budgets b WHERE b.created_by = p_user_id AND b.is_active = true AND b.hard_limit_enabled = true
  LOOP
    SELECT COALESCE(SUM(cost_usd), 0) INTO v_current_spend
    FROM ai_usage_logs WHERE user_id = p_user_id AND created_at >= v_budget.period_start AND created_at <= v_budget.period_end;
    
    v_percentage := (v_current_spend / NULLIF(v_budget.limit_amount, 0)) * 100;
    
    IF v_percentage >= 100 THEN
      v_grace_period_ends := v_budget.last_alert_sent + (v_budget.grace_period_hours || ' hours')::INTERVAL;
      IF NOW() > v_grace_period_ends THEN
        RETURN QUERY SELECT true, v_budget.name, v_current_spend, v_budget.limit_amount, v_grace_period_ends;
        RETURN;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT false, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::TIMESTAMP;
END;
$$;

-- Grant budget alert permissions
GRANT EXECUTE ON FUNCTION check_budget_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION record_budget_alert TO authenticated;
GRANT EXECUTE ON FUNCTION get_budget_alert_history TO authenticated;
GRANT EXECUTE ON FUNCTION check_hard_limit TO authenticated;

-- ============================================
-- SECTION 6: COST OPTIMIZATION ANALYZER (S5.5/11)
-- ============================================

CREATE OR REPLACE FUNCTION get_cost_optimization_insights(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  feature_type VARCHAR, total_requests INTEGER, total_tokens BIGINT,
  total_cost NUMERIC, avg_tokens_per_request NUMERIC, avg_cost_per_request NUMERIC,
  max_cost_request NUMERIC, min_cost_request NUMERIC, cost_trend VARCHAR,
  optimization_score INTEGER, optimization_potential NUMERIC,
  primary_suggestion TEXT, detailed_suggestions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_total_cost NUMERIC; v_prev_period_cost NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH feature_stats AS (
    SELECT l.feature_type, COUNT(*)::INTEGER as request_count,
      COALESCE(SUM(l.total_tokens), 0) as token_sum,
      ROUND(COALESCE(SUM(l.cost_usd), 0)::NUMERIC, 4) as cost_sum,
      ROUND(COALESCE(AVG(l.total_tokens), 0)::NUMERIC, 2) as avg_tokens,
      ROUND(COALESCE(AVG(l.cost_usd), 0)::NUMERIC, 4) as avg_cost,
      ROUND(COALESCE(MAX(l.cost_usd), 0)::NUMERIC, 4) as max_cost,
      ROUND(COALESCE(MIN(l.cost_usd), 0)::NUMERIC, 4) as min_cost,
      CASE WHEN SUM(l.total_tokens) > 0 THEN ROUND((SUM(l.cost_usd) / (SUM(l.total_tokens) / 1000.0))::NUMERIC, 4) ELSE 0 END as cost_per_1k_tokens
    FROM ai_usage_logs l
    WHERE l.created_at >= NOW() - (p_days || ' days')::INTERVAL AND l.status = 'success'
    GROUP BY l.feature_type
  ),
  feature_trends AS (
    SELECT l.feature_type,
      CASE 
        WHEN SUM(CASE WHEN l.created_at >= NOW() - INTERVAL '7 days' THEN l.cost_usd ELSE 0 END) >
             SUM(CASE WHEN l.created_at >= NOW() - INTERVAL '14 days' AND l.created_at < NOW() - INTERVAL '7 days' THEN l.cost_usd ELSE 0 END) * 1.1
        THEN 'increasing'
        WHEN SUM(CASE WHEN l.created_at >= NOW() - INTERVAL '7 days' THEN l.cost_usd ELSE 0 END) <
             SUM(CASE WHEN l.created_at >= NOW() - INTERVAL '14 days' AND l.created_at < NOW() - INTERVAL '7 days' THEN l.cost_usd ELSE 0 END) * 0.9
        THEN 'decreasing'
        ELSE 'stable'
      END as trend
    FROM ai_usage_logs l
    WHERE l.created_at >= NOW() - INTERVAL '14 days' AND l.status = 'success'
    GROUP BY l.feature_type
  )
  SELECT fs.feature_type::VARCHAR, fs.request_count, fs.token_sum, fs.cost_sum,
    fs.avg_tokens, fs.avg_cost, fs.max_cost, fs.min_cost,
    COALESCE(ft.trend, 'stable')::VARCHAR,
    CASE WHEN fs.cost_per_1k_tokens <= 0.01 THEN 95 WHEN fs.cost_per_1k_tokens <= 0.02 THEN 85
      WHEN fs.cost_per_1k_tokens <= 0.05 THEN 70 WHEN fs.cost_per_1k_tokens <= 0.10 THEN 50 ELSE 30
    END::INTEGER,
    ROUND(CASE WHEN fs.cost_per_1k_tokens > 0.05 THEN fs.cost_sum * 0.3
      WHEN fs.cost_per_1k_tokens > 0.02 THEN fs.cost_sum * 0.15 ELSE fs.cost_sum * 0.05
    END::NUMERIC, 2),
    CASE WHEN fs.avg_tokens > 4000 THEN 'Reduce prompt size or use streaming'
      WHEN fs.cost_per_1k_tokens > 0.10 THEN 'Consider switching to a more cost-effective model'
      WHEN fs.max_cost > fs.avg_cost * 10 THEN 'Investigate high-cost outlier requests'
      WHEN COALESCE(ft.trend, 'stable') = 'increasing' THEN 'Usage trending up - review necessity of requests'
      ELSE 'Usage is optimized - maintain current practices'
    END::TEXT,
    jsonb_build_object(
      'model_optimization', CASE WHEN fs.cost_per_1k_tokens > 0.05 THEN 'Consider using GPT-3.5 or Claude Haiku for simpler tasks' ELSE 'Current model selection is cost-effective' END,
      'token_optimization', CASE WHEN fs.avg_tokens > 4000 THEN 'Average token usage is high. Consider: shorter prompts, response limits, or streaming'
        WHEN fs.avg_tokens > 2000 THEN 'Token usage is moderate. Monitor for opportunities to reduce' ELSE 'Token usage is efficient' END,
      'caching_opportunity', CASE WHEN fs.request_count > 100 THEN 'High request volume - implement caching for repeated queries' ELSE 'Request volume does not warrant caching yet' END
    )
  FROM feature_stats fs
  LEFT JOIN feature_trends ft ON fs.feature_type = ft.feature_type
  ORDER BY fs.cost_sum DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cost_optimization_insights TO authenticated;

-- ============================================
-- SECTION 7: AUDIT FUNCTIONS (S8 - Fixed)
-- Uses admin_audit_log (singular) with action_type, table_name, record_id columns
-- ============================================

-- 7a. Get Audit Logs (Fixed: correct table + columns from S8)
CREATE OR REPLACE FUNCTION admin_get_audit_logs(
  p_admin_id UUID,
  p_filter_admin_id UUID DEFAULT NULL,
  p_action_type TEXT DEFAULT NULL,
  p_table_name TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  log_id UUID, admin_id UUID, admin_email TEXT, admin_name TEXT,
  action_type TEXT, table_name TEXT, record_id UUID,
  old_values JSONB, new_values JSONB,
  ip_address TEXT, user_agent TEXT, log_timestamp TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_total BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM admin_audit_log aal
  WHERE
    (p_filter_admin_id IS NULL OR aal.admin_id = p_filter_admin_id)
    AND (p_action_type IS NULL OR aal.action_type = p_action_type)
    AND (p_table_name IS NULL OR aal.table_name = p_table_name)
    AND (p_start_date IS NULL OR aal.timestamp >= p_start_date)
    AND (p_end_date IS NULL OR aal.timestamp <= p_end_date)
    AND (p_search IS NULL OR (
      aal.action_type ILIKE '%' || p_search || '%'
      OR aal.table_name ILIKE '%' || p_search || '%'
      OR aal.record_id::TEXT ILIKE '%' || p_search || '%'
    ));

  RETURN QUERY
  SELECT
    aal.id as log_id, aal.admin_id,
    COALESCE(pr.full_name, aal.admin_id::TEXT) as admin_email,
    pr.full_name as admin_name,
    aal.action_type, aal.table_name, aal.record_id,
    aal.old_values, aal.new_values,
    aal.ip_address, aal.user_agent,
    aal.timestamp as log_timestamp, v_total as total_count
  FROM admin_audit_log aal
  LEFT JOIN profiles pr ON aal.admin_id = pr.id
  WHERE
    (p_filter_admin_id IS NULL OR aal.admin_id = p_filter_admin_id)
    AND (p_action_type IS NULL OR aal.action_type = p_action_type)
    AND (p_table_name IS NULL OR aal.table_name = p_table_name)
    AND (p_start_date IS NULL OR aal.timestamp >= p_start_date)
    AND (p_end_date IS NULL OR aal.timestamp <= p_end_date)
    AND (p_search IS NULL OR (
      aal.action_type ILIKE '%' || p_search || '%'
      OR aal.table_name ILIKE '%' || p_search || '%'
      OR aal.record_id::TEXT ILIKE '%' || p_search || '%'
    ))
  ORDER BY aal.timestamp DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 7b. Get Audit Stats (Fixed: correct table + columns from S8)
CREATE OR REPLACE FUNCTION admin_get_audit_stats(p_admin_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM admin_audit_log),
    'logs_today', (SELECT COUNT(*) FROM admin_audit_log WHERE admin_audit_log.timestamp >= CURRENT_DATE),
    'logs_this_week', (SELECT COUNT(*) FROM admin_audit_log WHERE admin_audit_log.timestamp >= CURRENT_DATE - INTERVAL '7 days'),
    'logs_this_month', (SELECT COUNT(*) FROM admin_audit_log WHERE admin_audit_log.timestamp >= CURRENT_DATE - INTERVAL '30 days'),
    'by_action_type', (
      SELECT COALESCE(json_object_agg(action_type, cnt), '{}'::json)
      FROM (SELECT action_type, COUNT(*) as cnt FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL GROUP BY action_type) sub
    ),
    'by_table', (
      SELECT COALESCE(json_object_agg(COALESCE(tbl_name, 'unknown'), cnt), '{}'::json)
      FROM (SELECT table_name as tbl_name, COUNT(*) as cnt FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY table_name ORDER BY cnt DESC LIMIT 10) sub
    ),
    'by_admin', (
      SELECT COALESCE(json_agg(json_build_object('admin_id', adm_id, 'admin_name', adm_name, 'count', cnt)), '[]'::json)
      FROM (SELECT aal.admin_id as adm_id, pr.full_name as adm_name, COUNT(*) as cnt
        FROM admin_audit_log aal LEFT JOIN profiles pr ON aal.admin_id = pr.id
        WHERE aal.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY aal.admin_id, pr.full_name ORDER BY cnt DESC LIMIT 10) sub
    ),
    'daily_activity', (
      SELECT COALESCE(json_agg(json_build_object('date', dt, 'count', cnt) ORDER BY dt), '[]'::json)
      FROM (SELECT DATE(admin_audit_log.timestamp) as dt, COUNT(*) as cnt FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY DATE(admin_audit_log.timestamp)) sub
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 7c. Get Audit Log Detail (Fixed: correct table + columns from S8)
CREATE OR REPLACE FUNCTION admin_get_audit_log_detail(p_admin_id UUID, p_log_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'log_id', aal.id, 'admin_id', aal.admin_id,
    'admin_email', COALESCE(pr.full_name, aal.admin_id::TEXT),
    'admin_name', pr.full_name,
    'action_type', aal.action_type, 'table_name', aal.table_name,
    'record_id', aal.record_id, 'old_values', aal.old_values,
    'new_values', aal.new_values, 'ip_address', aal.ip_address,
    'user_agent', aal.user_agent, 'log_timestamp', aal.timestamp,
    'changes', (
      SELECT json_agg(json_build_object('field', k, 'old_value', aal.old_values->k, 'new_value', aal.new_values->k))
      FROM jsonb_object_keys(COALESCE(aal.new_values, '{}'::jsonb)) as k
      WHERE aal.old_values->k IS DISTINCT FROM aal.new_values->k
    )
  ) INTO v_result
  FROM admin_audit_log aal
  LEFT JOIN profiles pr ON aal.admin_id = pr.id
  WHERE aal.id = p_log_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'Audit log not found'; END IF;
  RETURN v_result;
END;
$$;

-- 7d. Get Audit Filter Options (Fixed: correct table from S8)
CREATE OR REPLACE FUNCTION admin_get_audit_filter_options(p_admin_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'action_types', (
      SELECT COALESCE(json_agg(DISTINCT action_type ORDER BY action_type), '[]'::json)
      FROM admin_audit_log WHERE action_type IS NOT NULL
    ),
    'table_names', (
      SELECT COALESCE(json_agg(DISTINCT table_name ORDER BY table_name), '[]'::json)
      FROM admin_audit_log WHERE table_name IS NOT NULL
    ),
    'admins', (
      SELECT COALESCE(json_agg(json_build_object('id', pr.id, 'name', pr.full_name, 'email', pr.full_name)), '[]'::json)
      FROM profiles pr WHERE pr.user_type = 'admin'
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Grant audit permissions
GRANT EXECUTE ON FUNCTION admin_get_audit_logs(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_stats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_log_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_filter_options(UUID) TO authenticated;

-- ============================================
-- SECTION 8: AI CONFIGURATION FUNCTIONS (S5.5/17)
-- ============================================

-- 8a. Get AI Configuration by Key
CREATE OR REPLACE FUNCTION get_ai_config(p_config_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_config JSONB;
BEGIN
  SELECT config_value INTO v_config FROM ai_configuration
  WHERE config_key = p_config_key AND is_active = TRUE;
  RETURN COALESCE(v_config, '{}'::jsonb);
END;
$$;

-- 8b. Update AI Configuration
CREATE OR REPLACE FUNCTION update_ai_config(
  p_config_key TEXT, p_config_value JSONB, p_updated_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_configuration SET config_value = p_config_value, updated_by = p_updated_by
  WHERE config_key = p_config_key;
  RETURN FOUND;
END;
$$;

-- 8c. Check if AI Feature is Enabled
CREATE OR REPLACE FUNCTION is_feature_enabled(p_feature_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_flags JSONB; v_enabled BOOLEAN;
BEGIN
  IF (get_ai_config('emergency_controls')->>'emergency_mode')::BOOLEAN THEN
    RETURN FALSE;
  END IF;
  v_flags := get_ai_config('feature_flags');
  v_enabled := (v_flags->p_feature_name->>'enabled')::BOOLEAN;
  RETURN COALESCE(v_enabled, FALSE);
END;
$$;

-- 8d. Check AI Rate Limit
CREATE OR REPLACE FUNCTION check_rate_limit(p_feature_type TEXT, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_limits JSONB; v_enabled BOOLEAN; v_count INTEGER; v_limit INTEGER;
BEGIN
  v_limits := get_ai_config('rate_limits');
  v_enabled := (v_limits->>'enabled')::BOOLEAN;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'rate_limiting_disabled');
  END IF;

  -- Check per-feature limit (last minute)
  v_limit := (v_limits->'per_feature'->p_feature_type->>'requests_per_minute')::INTEGER;
  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM ai_usage_logs
    WHERE feature_type = p_feature_type AND created_at > NOW() - INTERVAL '1 minute';
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'feature_rate_limit_exceeded',
        'limit', v_limit, 'current', v_count, 'retry_after_seconds', 60);
    END IF;
  END IF;

  -- Check per-user limit if user_id provided
  IF p_user_id IS NOT NULL THEN
    v_limit := (v_limits->'per_user'->>'requests_per_minute')::INTEGER;
    SELECT COUNT(*) INTO v_count FROM ai_usage_logs
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '1 minute';
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'user_rate_limit_exceeded',
        'limit', v_limit, 'current', v_count, 'retry_after_seconds', 60);
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Grant AI config permissions
GRANT EXECUTE ON FUNCTION get_ai_config(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_config(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_ai_config(TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION is_feature_enabled(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_feature_enabled(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, UUID) TO service_role;

-- ============================================
-- SECTION 9: STUDENT PREDICTION EVIDENCE
-- ============================================

DROP FUNCTION IF EXISTS get_score_prediction_evidence(UUID, UUID[]);

CREATE OR REPLACE FUNCTION get_score_prediction_evidence(
  p_student_id UUID,
  p_subject_ids UUID[]
)
RETURNS TABLE (
  subject_id UUID,
  questions_attempted INTEGER,
  questions_correct INTEGER,
  weighted_attempted NUMERIC,
  weighted_correct NUMERIC,
  official_attempted INTEGER,
  official_correct INTEGER,
  quiz_attempted INTEGER,
  quiz_correct INTEGER,
  practice_attempted INTEGER,
  practice_correct INTEGER,
  coverage_topics INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT s.user_id
  INTO v_user_id
  FROM students s
  WHERE s.id = p_student_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_user_id
     AND NOT EXISTS (
       SELECT 1
       FROM admins a
       WHERE a.user_id = auth.uid()
         AND a.is_active = TRUE
     ) THEN
    RAISE EXCEPTION 'Not allowed to read prediction evidence for this student';
  END IF;

  RETURN QUERY
  WITH requested_subjects AS (
    SELECT DISTINCT UNNEST(COALESCE(p_subject_ids, ARRAY[]::UUID[])) AS subject_id
  ),
  source_candidates AS (
    SELECT
      q.subject_id,
      ea.question_id,
      CASE
        WHEN ea.selected_answer IS NOT NULL THEN ea.selected_answer = q.correct_answer
        WHEN ea.final_score IS NOT NULL THEN ea.final_score >= 70
        ELSE FALSE
      END AS is_correct,
      'official'::TEXT AS source_kind,
      1.0::NUMERIC AS source_weight,
      3 AS source_priority,
      COALESCE(ea.answered_at, mea.completed_at, mea.updated_at, mea.started_at) AS answered_at,
      q.topic
    FROM exam_answers ea
    JOIN mock_exam_attempts mea ON mea.id = ea.attempt_id
    JOIN mock_exams me ON me.id = mea.mock_exam_id
    JOIN questions q ON q.id = ea.question_id
    JOIN requested_subjects rs ON rs.subject_id = q.subject_id
    WHERE mea.user_id = v_user_id
      AND mea.status = 'completed'
      AND me.is_official = TRUE
      AND me.uses_teacher_questions = FALSE
      AND me.created_by_teacher IS NULL
      AND ea.question_id IS NOT NULL
      AND (
        ea.selected_answer IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(ea.text_answer, '')), '') IS NOT NULL
        OR ea.final_score IS NOT NULL
      )

    UNION ALL

    SELECT
      q.subject_id,
      sa.question_id,
      COALESCE(sa.is_correct, FALSE) AS is_correct,
      ps.mode::TEXT AS source_kind,
      CASE WHEN ps.mode = 'quiz' THEN 0.70 ELSE 0.45 END::NUMERIC AS source_weight,
      CASE WHEN ps.mode = 'quiz' THEN 2 ELSE 1 END AS source_priority,
      COALESCE(sa.answered_at, sa.created_at, ps.completed_at, ps.started_at) AS answered_at,
      q.topic
    FROM student_answers sa
    JOIN practice_sessions ps ON ps.id = sa.practice_session_id
    JOIN questions q ON q.id = sa.question_id
    JOIN requested_subjects rs ON rs.subject_id = q.subject_id
    WHERE sa.user_id = v_user_id
      AND ps.user_id = v_user_id
      AND ps.completed = TRUE
      AND COALESCE(sa.was_skipped, FALSE) = FALSE
  ),
  chosen_question_evidence AS (
    SELECT DISTINCT ON (sc.subject_id, sc.question_id)
      sc.subject_id,
      sc.question_id,
      sc.is_correct,
      sc.source_kind,
      sc.source_weight,
      sc.topic
    FROM source_candidates sc
    ORDER BY
      sc.subject_id,
      sc.question_id,
      sc.source_priority DESC,
      sc.answered_at DESC NULLS LAST
  ),
  aggregated AS (
    SELECT
      cqe.subject_id,
      COUNT(*)::INTEGER AS questions_attempted,
      COUNT(*) FILTER (WHERE cqe.is_correct)::INTEGER AS questions_correct,
      ROUND(COALESCE(SUM(cqe.source_weight), 0), 2) AS weighted_attempted,
      ROUND(COALESCE(SUM(cqe.source_weight) FILTER (WHERE cqe.is_correct), 0), 2) AS weighted_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'official')::INTEGER AS official_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'official' AND cqe.is_correct)::INTEGER AS official_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'quiz')::INTEGER AS quiz_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'quiz' AND cqe.is_correct)::INTEGER AS quiz_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'practice')::INTEGER AS practice_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'practice' AND cqe.is_correct)::INTEGER AS practice_correct,
      COUNT(DISTINCT cqe.topic) FILTER (WHERE cqe.topic IS NOT NULL)::INTEGER AS coverage_topics
    FROM chosen_question_evidence cqe
    GROUP BY cqe.subject_id
  )
  SELECT
    rs.subject_id,
    COALESCE(a.questions_attempted, 0)::INTEGER,
    COALESCE(a.questions_correct, 0)::INTEGER,
    COALESCE(a.weighted_attempted, 0)::NUMERIC,
    COALESCE(a.weighted_correct, 0)::NUMERIC,
    COALESCE(a.official_attempted, 0)::INTEGER,
    COALESCE(a.official_correct, 0)::INTEGER,
    COALESCE(a.quiz_attempted, 0)::INTEGER,
    COALESCE(a.quiz_correct, 0)::INTEGER,
    COALESCE(a.practice_attempted, 0)::INTEGER,
    COALESCE(a.practice_correct, 0)::INTEGER,
    COALESCE(a.coverage_topics, 0)::INTEGER
  FROM requested_subjects rs
  LEFT JOIN aggregated a ON a.subject_id = rs.subject_id;
END;
$$;

COMMENT ON FUNCTION get_score_prediction_evidence(UUID, UUID[]) IS
  'Returns distinct-question, source-weighted evidence for predicted exam score. Official exams outrank quiz, quiz outranks practice, and repeated question attempts count once.';

GRANT EXECUTE ON FUNCTION get_score_prediction_evidence(UUID, UUID[]) TO authenticated;

-- ============================================
-- DONE: Analytics, AI Management & Configuration Functions
-- Total: ~30 functions + 1 table (ai_budget_alerts)
-- ============================================
