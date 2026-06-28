-- ============================================================================
-- HOTFIX 06: Fix AI Analytics Signatures + Exam Groups + Topic Functions
-- ============================================================================
-- Run this on EXISTING databases that were set up with the clean migration
-- but are missing:
--   1. Correct AI analytics function signatures (get_ai_usage_overview etc.)
--   2. Exam groups seed data (Groups I-V)
--   3. Subject topics seed data
--   4. get_weak_topics / get_strong_topics / get_exam_group_config functions
--
-- Safe to re-run (uses CREATE OR REPLACE, ON CONFLICT, IF NOT EXISTS)
-- ============================================================================

-- ============================================================================
-- PART 1: FIX AI ANALYTICS FUNCTION SIGNATURES
-- The old versions used (p_days INTEGER) but admin panel expects
-- (p_start_date, p_end_date, p_feature_type, p_provider)
-- ============================================================================

-- Drop old signatures first to avoid overload conflicts
DROP FUNCTION IF EXISTS get_ai_usage_overview(INTEGER);
DROP FUNCTION IF EXISTS get_ai_usage_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_ai_cost_trends(INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_ai_cost_trends(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_ai_budget_status();
DROP FUNCTION IF EXISTS get_ai_budget_status(UUID);
DROP FUNCTION IF EXISTS get_ai_quality_metrics(INTEGER);
DROP FUNCTION IF EXISTS get_ai_quality_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS get_ai_review_queue(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_ai_review_queue(TEXT, INTEGER);

-- 1a. AI Usage Overview (correct signature for admin panel)
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

-- 1b. AI Cost Trends (correct signature)
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

-- 1c. AI Budget Status (correct signature)
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

-- 1d. AI Quality Metrics (correct signature)
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

-- 1e. AI Review Queue (correct signature)
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

-- ============================================================================
-- PART 2: EXAM GROUPS SEED DATA
-- ============================================================================

INSERT INTO exam_groups (code, name_en, name_az, description, first_stage_max_points, second_stage_max_points, has_second_stage)
VALUES 
  ('I', 'Group I', 'I Qrup', 'Engineering, Technical - Stage II: Mathematics, Physics, Chemistry', 300, 400, true),
  ('II', 'Group II', 'II Qrup', 'Economics, Management - Stage II: Mathematics, Geography, History', 300, 400, true),
  ('III', 'Group III', 'III Qrup', 'Humanities, Law - Stage II: Native Language, History, Literature', 300, 400, true),
  ('IV', 'Group IV', 'IV Qrup', 'Medicine, Biology - Stage II: Biology, Chemistry, Physics', 300, 400, true),
  ('V', 'Group V', 'V Qrup', 'Special Aptitude, Arts, PE - First Stage Only (no Stage II)', 300, 0, false)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_az = EXCLUDED.name_az,
  description = EXCLUDED.description,
  first_stage_max_points = EXCLUDED.first_stage_max_points,
  second_stage_max_points = EXCLUDED.second_stage_max_points,
  has_second_stage = EXCLUDED.has_second_stage,
  updated_at = NOW();

-- ============================================================================
-- PART 3: SUBJECT TOPICS SEED DATA
-- ============================================================================

-- Add topic column to questions if not exists
ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT;
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_subject_topic ON questions(subject_id, topic);

-- Mathematics Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Algebra', 'beginner', 1 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Geometry', 'intermediate', 2 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Trigonometry', 'intermediate', 3 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Calculus', 'advanced', 4 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Statistics', 'intermediate', 5 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Physics Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Mechanics', 'beginner', 1 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Thermodynamics', 'intermediate', 2 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Optics', 'intermediate', 3 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Electricity', 'advanced', 4 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Magnetism', 'advanced', 5 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Waves', 'intermediate', 6 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Chemistry Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Organic Chemistry', 'advanced', 1 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Inorganic Chemistry', 'intermediate', 2 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physical Chemistry', 'advanced', 3 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Analytical Chemistry', 'intermediate', 4 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Biochemistry', 'advanced', 5 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Biology Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Cell Biology', 'beginner', 1 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Genetics', 'intermediate', 2 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Ecology', 'intermediate', 3 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Evolution', 'advanced', 4 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Anatomy', 'intermediate', 5 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physiology', 'advanced', 6 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- English Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Grammar', 'beginner', 1 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Vocabulary', 'beginner', 2 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Reading Comprehension', 'intermediate', 3 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Writing', 'intermediate', 4 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Literature', 'advanced', 5 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Azerbaijani Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Grammar', 'beginner', 1 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Literature', 'intermediate', 2 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Composition', 'intermediate', 3 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Poetry', 'advanced', 4 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- History Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Ancient History', 'beginner', 1 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Medieval History', 'intermediate', 2 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Modern History', 'intermediate', 3 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'World History', 'advanced', 4 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Azerbaijan History', 'intermediate', 5 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Geography Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physical Geography', 'beginner', 1 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Human Geography', 'intermediate', 2 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Cartography', 'intermediate', 3 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Economic Geography', 'advanced', 4 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- ============================================================================
-- PART 4: TOPIC ANALYSIS FUNCTIONS (get_weak_topics, get_strong_topics)
-- ============================================================================

-- Drop old versions if they exist
DROP FUNCTION IF EXISTS get_weak_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS get_strong_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS get_exam_group_config(TEXT, TEXT);

-- 4a. Get Weak Topics (used by Competitive Mode in mobile app)
CREATE OR REPLACE FUNCTION get_weak_topics(
  p_student_id UUID,
  p_subject_id UUID,
  p_min_questions INTEGER DEFAULT 5,
  p_weak_threshold NUMERIC DEFAULT 70.0,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  topic TEXT,
  questions_attempted BIGINT,
  questions_correct BIGINT,
  accuracy_percentage NUMERIC,
  last_practiced TIMESTAMPTZ,
  confidence_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    stp.topic,
    stp.questions_attempted,
    stp.questions_correct,
    stp.accuracy_percentage,
    stp.last_practiced,
    CASE 
      WHEN stp.questions_attempted < 5 THEN 'low'
      WHEN stp.questions_attempted < 15 THEN 'medium'
      ELSE 'high'
    END AS confidence_level
  FROM student_topic_performance stp
  WHERE stp.student_id = p_student_id
    AND stp.subject_id = p_subject_id
    AND stp.questions_attempted >= p_min_questions
    AND stp.accuracy_percentage < p_weak_threshold
  ORDER BY 
    CASE 
      WHEN stp.questions_attempted >= 15 THEN 3
      WHEN stp.questions_attempted >= 5 THEN 2
      ELSE 1
    END DESC,
    stp.accuracy_percentage ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_weak_topics IS 'Returns weak topics for a student in a subject based on performance thresholds';

-- 4b. Get Strong Topics
CREATE OR REPLACE FUNCTION get_strong_topics(
  p_student_id UUID,
  p_subject_id UUID,
  p_min_questions INTEGER DEFAULT 5,
  p_strong_threshold NUMERIC DEFAULT 85.0,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  topic TEXT,
  questions_attempted BIGINT,
  questions_correct BIGINT,
  accuracy_percentage NUMERIC,
  last_practiced TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    stp.topic,
    stp.questions_attempted,
    stp.questions_correct,
    stp.accuracy_percentage,
    stp.last_practiced
  FROM student_topic_performance stp
  WHERE stp.student_id = p_student_id
    AND stp.subject_id = p_subject_id
    AND stp.questions_attempted >= p_min_questions
    AND stp.accuracy_percentage >= p_strong_threshold
  ORDER BY stp.accuracy_percentage DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_strong_topics IS 'Returns strong topics for a student in a subject';

-- 4c. Get Exam Group Config
CREATE OR REPLACE FUNCTION get_exam_group_config(p_group_code TEXT, p_exam_type TEXT DEFAULT 'first_stage')
RETURNS TABLE(
  group_code TEXT, group_name TEXT, max_points INTEGER,
  subject_id UUID, subject_name TEXT, coefficient DECIMAL,
  questions_count INTEGER, subject_max_points INTEGER
) AS $$
DECLARE
  v_group_id UUID;
  v_max_points INTEGER;
  v_total_coefficient DECIMAL;
BEGIN
  SELECT eg.id, eg.max_points
  INTO v_group_id, v_max_points
  FROM exam_groups eg
  WHERE eg.code = p_group_code AND eg.is_active = true;

  IF v_group_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(egs.coefficient), 0)
  INTO v_total_coefficient
  FROM exam_group_subjects egs
  WHERE egs.exam_group_id = v_group_id;

  RETURN QUERY
  SELECT
    p_group_code, eg.name, v_max_points,
    s.id, s.name_en, egs.coefficient,
    egs.question_count,
    ROUND((egs.coefficient / NULLIF(v_total_coefficient, 0)) * v_max_points)::INTEGER
  FROM exam_group_subjects egs
  JOIN exam_groups eg ON eg.id = egs.exam_group_id
  JOIN subjects s ON s.id = egs.subject_id
  WHERE egs.exam_group_id = v_group_id
  ORDER BY egs.coefficient DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_weak_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_strong_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_exam_group_config(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Hotfix 06 applied successfully' AS status;

SELECT 
  (SELECT COUNT(*) FROM exam_groups) AS exam_groups_count,
  (SELECT COUNT(*) FROM subject_topics) AS subject_topics_count;

-- Verify functions exist
SELECT proname, pronargs 
FROM pg_proc 
WHERE proname IN (
  'get_ai_usage_overview', 'get_ai_cost_trends', 'get_ai_budget_status',
  'get_ai_quality_metrics', 'get_ai_review_queue',
  'get_weak_topics', 'get_strong_topics', 'get_exam_group_config'
)
ORDER BY proname;
