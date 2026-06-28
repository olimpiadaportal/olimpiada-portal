-- ============================================================================
-- FIX: Missing analytics functions + missing questions table columns
-- Run this on EXISTING databases that were set up before these fixes
-- were integrated into the main migration files.
-- ============================================================================
-- Fixes:
--   1. Add missing open question columns to questions table (Admin S10)
--   2. Create missing analytics functions (Admin S5)
--   3. Fix search_questions function (column q.expected_answer does not exist)
-- ============================================================================

-- ============================================================================
-- PART 1: Add missing columns to questions table
-- ============================================================================

-- Open question fields (Admin S10)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer_keywords TEXT[];
ALTER TABLE questions ADD COLUMN IF NOT EXISTS max_points INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS grading_rubric JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sample_answer TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS exclude_from_practice BOOLEAN DEFAULT false NOT NULL;

-- Group fields (Admin S10 - situasiya questions)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS group_order INTEGER;

-- Admin metadata
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add FK from questions.group_id -> question_groups (if question_groups exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'question_groups') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'questions_group_id_fkey' AND table_name = 'questions'
    ) THEN
      ALTER TABLE questions ADD CONSTRAINT questions_group_id_fkey
        FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add group_order constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'valid_group_order' AND table_name = 'questions'
  ) THEN
    ALTER TABLE questions ADD CONSTRAINT valid_group_order
      CHECK (group_order IS NULL OR (group_order >= 1 AND group_order <= 3));
  END IF;
END $$;

-- ============================================================================
-- PART 2: Recreate search_questions function (now columns exist)
-- ============================================================================

DROP FUNCTION IF EXISTS search_questions(uuid,text,text,text,text[],boolean,integer,integer);

CREATE OR REPLACE FUNCTION search_questions(
  p_subject_id UUID DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL,
  p_exam_stage TEXT DEFAULT NULL,
  p_search_text TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  subject_id UUID,
  subject_name TEXT,
  topic TEXT,
  question_type question_type,
  question_text TEXT,
  question_image_url TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  option_e TEXT,
  correct_answer TEXT,
  expected_answer TEXT,
  answer_keywords TEXT[],
  max_points INTEGER,
  grading_rubric JSONB,
  sample_answer TEXT,
  explanation TEXT,
  difficulty TEXT,
  tags TEXT[],
  source TEXT,
  year INTEGER,
  is_active BOOLEAN,
  exclude_from_practice BOOLEAN,
  group_id UUID,
  group_order INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id, q.subject_id, s.name_en AS subject_name, q.topic, q.question_type,
    q.question_text, q.question_image_url,
    q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.correct_answer,
    q.expected_answer, q.answer_keywords, q.max_points, q.grading_rubric, q.sample_answer,
    q.explanation, q.difficulty, q.tags, q.source, q.year, q.is_active,
    q.exclude_from_practice, q.group_id, q.group_order, q.created_by, q.created_at
  FROM questions q
  LEFT JOIN subjects s ON q.subject_id = s.id
  WHERE 
    (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    AND (p_is_active IS NULL OR q.is_active = p_is_active)
    AND (p_search_text IS NULL OR q.question_text ILIKE '%' || p_search_text || '%')
    AND (p_tags IS NULL OR q.tags && p_tags)
  ORDER BY q.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_questions(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- PART 3: Create missing analytics functions (Admin S5)
-- Drop old versions first (return type may have changed)
-- ============================================================================

DROP FUNCTION IF EXISTS admin_get_engagement_metrics(DATE, DATE);
DROP FUNCTION IF EXISTS admin_get_performance_metrics(DATE, DATE, UUID);
DROP FUNCTION IF EXISTS admin_get_student_segments();
DROP FUNCTION IF EXISTS admin_get_cohort_analysis(TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS admin_get_question_performance(UUID, TEXT, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS admin_get_exam_analytics(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS admin_get_content_quality_issues();
DROP FUNCTION IF EXISTS admin_get_database_stats();
DROP FUNCTION IF EXISTS admin_get_feature_usage(DATE, DATE);
DROP FUNCTION IF EXISTS admin_get_performance_trends(DATE, DATE);
DROP FUNCTION IF EXISTS admin_get_user_emails(UUID[]);

-- 3a. Engagement Metrics
CREATE OR REPLACE FUNCTION admin_get_engagement_metrics(
  p_start_date DATE, p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON; v_dau INTEGER; v_wau INTEGER; v_mau INTEGER;
  v_avg_session_duration NUMERIC; v_total_sessions INTEGER; v_trend_data JSON;
BEGIN
  SELECT COUNT(DISTINCT student_id) INTO v_dau FROM daily_stats
  WHERE date BETWEEN p_start_date AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COUNT(DISTINCT student_id) INTO v_wau FROM daily_stats
  WHERE date BETWEEN (p_end_date - INTERVAL '7 days')::DATE AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COUNT(DISTINCT student_id) INTO v_mau FROM daily_stats
  WHERE date BETWEEN (p_end_date - INTERVAL '30 days')::DATE AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT COALESCE(AVG(study_time_minutes), 0), COUNT(*)
  INTO v_avg_session_duration, v_total_sessions FROM daily_stats
  WHERE date BETWEEN p_start_date AND p_end_date
    AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0);

  SELECT json_agg(json_build_object('date', date, 'activeUsers', active_users) ORDER BY date)
  INTO v_trend_data FROM (
    SELECT date, COUNT(DISTINCT student_id) as active_users FROM daily_stats
    WHERE date BETWEEN p_start_date AND p_end_date
      AND (questions_attempted > 0 OR practice_sessions > 0 OR exams_taken > 0)
    GROUP BY date
  ) daily_data;

  v_result := json_build_object(
    'dau', COALESCE(v_dau, 0), 'wau', COALESCE(v_wau, 0), 'mau', COALESCE(v_mau, 0),
    'avgSessionDuration', ROUND(COALESCE(v_avg_session_duration, 0), 2),
    'totalSessions', COALESCE(v_total_sessions, 0),
    'avgSessionsPerUser', CASE WHEN v_dau > 0 THEN ROUND(v_total_sessions::NUMERIC / v_dau, 2) ELSE 0 END,
    'retentionRates', json_build_object('day1', 0, 'day7', 0, 'day30', 0),
    'trends', COALESCE(v_trend_data, '[]'::json)
  );
  RETURN v_result;
END;
$$;

-- 3b. Performance Metrics
CREATE OR REPLACE FUNCTION admin_get_performance_metrics(
  p_start_date DATE, p_end_date DATE, p_subject_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON; v_avg_accuracy NUMERIC;
  v_total_questions INTEGER; v_total_correct INTEGER; v_total_study_time INTEGER;
  v_subject_performance JSON;
BEGIN
  SELECT COALESCE(SUM(questions_attempted), 0), COALESCE(SUM(questions_correct), 0), COALESCE(SUM(study_time_minutes), 0)
  INTO v_total_questions, v_total_correct, v_total_study_time FROM daily_stats
  WHERE date BETWEEN p_start_date AND p_end_date AND is_active = TRUE;

  v_avg_accuracy := CASE WHEN v_total_questions > 0
    THEN (v_total_correct::NUMERIC / v_total_questions * 100) ELSE 0 END;

  SELECT json_agg(subject_data ORDER BY total_attempted DESC) INTO v_subject_performance
  FROM (
    SELECT SUM(sp.questions_attempted) as total_attempted,
      json_build_object(
        'subjectId', s.id, 'subjectName', s.name_en,
        'accuracy', ROUND(CASE WHEN SUM(sp.questions_attempted) > 0
          THEN (SUM(sp.questions_correct)::NUMERIC / SUM(sp.questions_attempted) * 100) ELSE 0 END, 2),
        'questionsAttempted', COALESCE(SUM(sp.questions_attempted), 0),
        'avgScore', ROUND(CASE WHEN SUM(sp.questions_attempted) > 0
          THEN (SUM(sp.questions_correct)::NUMERIC / SUM(sp.questions_attempted) * 100) ELSE 0 END, 2),
        'studyTime', COALESCE(SUM(sp.study_time), 0)
      ) as subject_data
    FROM subjects s LEFT JOIN study_progress sp ON s.id = sp.subject_id
    WHERE (p_subject_id IS NULL OR s.id = p_subject_id)
    GROUP BY s.id, s.name_en
  ) subquery;

  v_result := json_build_object(
    'avgAccuracy', ROUND(v_avg_accuracy, 2), 'avgScore', ROUND(v_avg_accuracy, 2),
    'improvementRate', 0, 'totalQuestionsAttempted', v_total_questions,
    'totalStudyTime', v_total_study_time,
    'subjectPerformance', COALESCE(v_subject_performance, '[]'::json)
  );
  RETURN v_result;
END;
$$;

-- 3c. Student Segments
CREATE OR REPLACE FUNCTION admin_get_student_segments()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON; v_high_performers INTEGER; v_struggling INTEGER;
  v_inactive INTEGER; v_power_users INTEGER; v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM students;

  SELECT COUNT(DISTINCT student_id) INTO v_high_performers FROM daily_stats
  WHERE date >= CURRENT_DATE - INTERVAL '30 days' AND is_active = TRUE
    AND questions_attempted > 0 AND (questions_correct::NUMERIC / questions_attempted * 100) > 80;

  SELECT COUNT(DISTINCT student_id) INTO v_struggling FROM daily_stats
  WHERE date >= CURRENT_DATE - INTERVAL '30 days' AND is_active = TRUE
    AND questions_attempted > 0 AND (questions_correct::NUMERIC / questions_attempted * 100) < 50;

  SELECT COUNT(*) INTO v_inactive FROM students s
  WHERE NOT EXISTS (
    SELECT 1 FROM daily_stats ds WHERE ds.student_id = s.id
      AND ds.date >= CURRENT_DATE - INTERVAL '7 days' AND ds.is_active = TRUE
  );

  SELECT COUNT(DISTINCT student_id) INTO v_power_users FROM (
    SELECT student_id FROM daily_stats
    WHERE date >= CURRENT_DATE - INTERVAL '7 days' AND is_active = TRUE
    GROUP BY student_id HAVING COUNT(DISTINCT date) >= 5
  ) power;

  v_result := json_build_object(
    'highPerformers', COALESCE(v_high_performers, 0), 'struggling', COALESCE(v_struggling, 0),
    'inactive', COALESCE(v_inactive, 0), 'powerUsers', COALESCE(v_power_users, 0),
    'atRisk', 0, 'total', COALESCE(v_total, 0)
  );
  RETURN v_result;
END;
$$;

-- 3d. Question Performance
CREATE OR REPLACE FUNCTION admin_get_question_performance(
  p_subject_id UUID DEFAULT NULL, p_difficulty TEXT DEFAULT NULL,
  p_needs_review BOOLEAN DEFAULT NULL, p_limit INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_agg(question_data) INTO v_result FROM (
    SELECT json_build_object(
      'questionId', q.id,
      'questionText', LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName', s.name_en, 'difficulty', q.difficulty,
      'accuracy', ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts', COALESCE(stats.attempts, 0), 'skipRate', 0,
      'avgTimeToAnswer', ROUND(COALESCE(stats.avg_time, 0), 0),
      'needsReview', (COALESCE(stats.accuracy, 100) < 30 OR COALESCE(stats.accuracy, 0) > 95)
    ) as question_data
    FROM questions q JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as attempts,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END) as accuracy,
        AVG(COALESCE(sa.time_spent_seconds, 0)) as avg_time
      FROM student_answers sa WHERE sa.question_id = q.id
    ) stats ON true
    WHERE (p_subject_id IS NULL OR q.subject_id = p_subject_id)
      AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    ORDER BY stats.attempts DESC NULLS LAST
    LIMIT p_limit
  ) questions;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 3e. Exam Analytics
CREATE OR REPLACE FUNCTION admin_get_exam_analytics(
  p_exam_id UUID DEFAULT NULL, p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_agg(exam_data ORDER BY total_attempts DESC) INTO v_result FROM (
    SELECT json_build_object(
      'examId', me.id, 'examName', me.title, 'examType', me.exam_type,
      'targetGroup', me.target_group,
      'totalAttempts', COALESCE(stats.total_attempts, 0),
      'completionRate', ROUND(COALESCE(stats.completion_rate, 0), 2),
      'avgScore', ROUND(COALESCE(stats.avg_score, 0), 2),
      'avgDuration', ROUND(COALESCE(stats.avg_duration, 0), 0),
      'passRate', ROUND(COALESCE(stats.pass_rate, 0), 2)
    ) as exam_data, COALESCE(stats.total_attempts, 0) as total_attempts
    FROM mock_exams me
    LEFT JOIN LATERAL (
      SELECT COUNT(mea.id) as total_attempts,
        AVG(CASE WHEN mea.status = 'completed' THEN 100.0 ELSE 0.0 END) as completion_rate,
        AVG(mea.percentage) as avg_score,
        AVG(EXTRACT(EPOCH FROM (mea.completed_at - mea.started_at)) / 60) as avg_duration,
        AVG(CASE WHEN mea.percentage >= 60 THEN 100.0 ELSE 0.0 END) as pass_rate
      FROM mock_exam_attempts mea WHERE mea.mock_exam_id = me.id
        AND (p_start_date IS NULL OR mea.started_at::DATE >= p_start_date)
        AND (p_end_date IS NULL OR mea.started_at::DATE <= p_end_date)
    ) stats ON true
    WHERE (p_exam_id IS NULL OR me.id = p_exam_id)
    LIMIT 50
  ) subquery;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 3f. Content Quality Issues
CREATE OR REPLACE FUNCTION admin_get_content_quality_issues()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_agg(quality_data ORDER BY attempts DESC) INTO v_result FROM (
    SELECT json_build_object(
      'questionId', q.id,
      'questionText', LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName', s.name_en, 'difficulty', q.difficulty,
      'accuracy', ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts', COALESCE(stats.attempts, 0), 'skipRate', 0, 'needsReview', true
    ) as quality_data, COALESCE(stats.attempts, 0) as attempts
    FROM questions q JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as attempts,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END) as accuracy
      FROM student_answers sa WHERE sa.question_id = q.id
      HAVING COUNT(*) >= 20
    ) stats ON true
    WHERE (stats.accuracy < 20 OR stats.accuracy > 95)
    LIMIT 100
  ) subquery;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 3g. Database Stats
CREATE OR REPLACE FUNCTION admin_get_database_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON; v_db_size TEXT;
  v_total_students INTEGER; v_total_questions INTEGER;
  v_total_exams INTEGER; v_total_sessions INTEGER;
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

-- 3h. Cohort Analysis
CREATE OR REPLACE FUNCTION admin_get_cohort_analysis(
  p_cohort_type TEXT, p_start_date DATE, p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  IF p_cohort_type = 'registration_date' THEN
    SELECT json_agg(cohort_data ORDER BY cohort_month DESC) INTO v_result FROM (
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
    SELECT json_agg(cohort_data ORDER BY total_students DESC) INTO v_result FROM (
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
    SELECT json_agg(cohort_data ORDER BY total_students DESC) INTO v_result FROM (
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

-- 3i. Feature Usage
CREATE OR REPLACE FUNCTION admin_get_feature_usage(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- 3j. Performance Trends
CREATE OR REPLACE FUNCTION admin_get_performance_trends(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'date', date, 'activeUsers', active_users, 'totalSessions', total_sessions,
    'avgAccuracy', avg_accuracy, 'totalQuestions', total_questions
  ) ORDER BY date) INTO v_result FROM (
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

-- 3k. User Emails Helper
CREATE OR REPLACE FUNCTION admin_get_user_emails(user_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_object_agg(id, email) INTO v_result
  FROM auth.users WHERE id = ANY(user_ids);
  RETURN COALESCE(v_result, '{}'::json);
END;
$$;

-- ============================================================================
-- PART 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION search_questions(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_engagement_metrics(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_metrics(DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_student_segments() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_cohort_analysis(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_question_performance(UUID, TEXT, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_exam_analytics(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_content_quality_issues() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_database_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_feature_usage(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_performance_trends(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_emails(UUID[]) TO authenticated;

-- ============================================================================
-- PART 5: Verify
-- ============================================================================

SELECT 
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'expected_answer') AS has_expected_answer,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'exclude_from_practice') AS has_exclude_from_practice,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'group_id') AS has_group_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'created_by') AS has_created_by,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_engagement_metrics') AS has_engagement_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_performance_metrics') AS has_performance_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_question_performance') AS has_question_perf_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'search_questions') AS has_search_questions_fn;
-- Expected: all true
