-- ============================================================================
-- 08_security_hardening.sql
-- Elmly Database - Security Hardening, Views & Additional Policies
-- ============================================================================
-- Purpose: Create security-invoker views, mobile compatibility layer,
--          additional RLS policies for tables missed in 03_rls_policies.sql,
--          and grant permissions for views
-- Depends on: 01_base_schema.sql, 03_rls_policies.sql, 04_functions_triggers.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from Admin sql_VULNS_FIXES/01_security_vulnerability_fixes.sql
-- ============================================================================

-- ============================================================================
-- SECTION 1: NOTIFICATION ANALYTICS VIEWS (SECURITY INVOKER)
-- ============================================================================

-- 1.1 Overall notification statistics
DROP VIEW IF EXISTS notification_stats_overview CASCADE;
CREATE VIEW notification_stats_overview 
WITH (security_invoker = true) AS
SELECT 
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
  COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count,
  ROUND(
    (COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as delivery_rate_percentage,
  COUNT(DISTINCT user_id) as unique_recipients,
  MIN(created_at) as first_notification,
  MAX(created_at) as last_notification
FROM notification_queue;

-- 1.2 Notification statistics by type
DROP VIEW IF EXISTS notification_stats_by_type CASCADE;
CREATE VIEW notification_stats_by_type 
WITH (security_invoker = true) AS
SELECT 
  notification_type,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  ROUND(
    (COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds,
  COUNT(DISTINCT user_id) as unique_recipients
FROM notification_queue
GROUP BY notification_type
ORDER BY total_count DESC;

-- 1.3 Notification statistics by channel
DROP VIEW IF EXISTS notification_stats_by_channel CASCADE;
CREATE VIEW notification_stats_by_channel 
WITH (security_invoker = true) AS
WITH channel_stats AS (
  SELECT 
    UNNEST(channels) as channel,
    notification_type,
    status,
    created_at,
    processed_at
  FROM notification_queue
)
SELECT 
  channel,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  ROUND(
    (COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate,
  COUNT(DISTINCT notification_type) as notification_types_count
FROM channel_stats
GROUP BY channel
ORDER BY total_count DESC;

-- 1.4 Daily notification trends
DROP VIEW IF EXISTS notification_daily_trends CASCADE;
CREATE VIEW notification_daily_trends 
WITH (security_invoker = true) AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT notification_type) as notification_types,
  ROUND(
    (COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate
FROM notification_queue
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 1.5 Hourly notification distribution
DROP VIEW IF EXISTS notification_hourly_distribution CASCADE;
CREATE VIEW notification_hourly_distribution 
WITH (security_invoker = true) AS
SELECT 
  EXTRACT(HOUR FROM created_at) as hour_of_day,
  COUNT(*) as notification_count,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))) as avg_processing_seconds
FROM notification_queue
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour_of_day;

-- ============================================================================
-- SECTION 2: USER ENGAGEMENT VIEWS
-- ============================================================================

-- 2.1 User notification engagement summary
DROP VIEW IF EXISTS top_engaged_users CASCADE;
DROP VIEW IF EXISTS low_engagement_users CASCADE;
DROP VIEW IF EXISTS user_notification_engagement CASCADE;

CREATE VIEW user_notification_engagement 
WITH (security_invoker = true) AS
SELECT 
  nq.user_id,
  p.full_name,
  p.user_type,
  COUNT(*) as total_notifications_received,
  COUNT(CASE WHEN nq.status = 'sent' THEN 1 END) as successfully_delivered,
  COUNT(CASE WHEN nq.status = 'failed' THEN 1 END) as failed_deliveries,
  COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END) as notifications_read,
  ROUND(
    (COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END)::DECIMAL / 
     NULLIF(COUNT(CASE WHEN nq.status = 'sent' THEN 1 END), 0)) * 100,
    2
  ) as read_rate_percentage,
  MAX(nq.created_at) as last_notification_at,
  COUNT(DISTINCT nq.notification_type) as notification_types_received
FROM notification_queue nq
LEFT JOIN profiles p ON nq.user_id = p.id
LEFT JOIN notification_analytics na ON nq.user_id = na.user_id 
  AND DATE(nq.created_at) = DATE(na.created_at)
GROUP BY nq.user_id, p.full_name, p.user_type
ORDER BY total_notifications_received DESC;

-- 2.2 Top engaged users
CREATE VIEW top_engaged_users 
WITH (security_invoker = true) AS
SELECT 
  user_id, full_name, user_type,
  total_notifications_received, notifications_read, read_rate_percentage
FROM user_notification_engagement
WHERE total_notifications_received >= 5
ORDER BY read_rate_percentage DESC, notifications_read DESC
LIMIT 50;

-- 2.3 Users with low engagement
CREATE VIEW low_engagement_users 
WITH (security_invoker = true) AS
SELECT 
  user_id, full_name, user_type,
  total_notifications_received, notifications_read,
  read_rate_percentage, last_notification_at
FROM user_notification_engagement
WHERE total_notifications_received >= 5
  AND read_rate_percentage < 30
ORDER BY read_rate_percentage ASC, total_notifications_received DESC
LIMIT 50;

-- ============================================================================
-- SECTION 3: FAILURE ANALYTICS VIEWS
-- ============================================================================

-- 3.1 Notification failures by reason
DROP VIEW IF EXISTS notification_failure_analysis CASCADE;
CREATE VIEW notification_failure_analysis 
WITH (security_invoker = true) AS
SELECT 
  notification_type,
  error_message,
  COUNT(*) as failure_count,
  COUNT(DISTINCT user_id) as affected_users,
  MAX(created_at) as last_occurrence,
  ROUND(AVG(retry_count)) as avg_retry_attempts
FROM notification_queue
WHERE status = 'failed'
GROUP BY notification_type, error_message
ORDER BY failure_count DESC;

-- 3.2 Users with frequent notification failures
DROP VIEW IF EXISTS users_with_notification_issues CASCADE;
CREATE VIEW users_with_notification_issues 
WITH (security_invoker = true) AS
SELECT 
  nq.user_id,
  p.full_name,
  COUNT(*) as total_failures,
  COUNT(DISTINCT nq.notification_type) as failed_notification_types,
  ARRAY_AGG(DISTINCT nq.error_message) as error_messages,
  MAX(nq.created_at) as last_failure_at
FROM notification_queue nq
LEFT JOIN profiles p ON nq.user_id = p.id
WHERE nq.status = 'failed'
GROUP BY nq.user_id, p.full_name
HAVING COUNT(*) >= 3
ORDER BY total_failures DESC;

-- ============================================================================
-- SECTION 4: EMAIL ANALYTICS VIEWS
-- ============================================================================

-- 4.1 Email delivery statistics
DROP VIEW IF EXISTS email_notification_stats CASCADE;
CREATE VIEW email_notification_stats 
WITH (security_invoker = true) AS
SELECT 
  DATE_TRUNC('day', na.created_at) as date,
  COUNT(*) as total_sent,
  COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END) as total_opened,
  COUNT(CASE WHEN na.event_type = 'clicked' THEN 1 END) as total_clicked,
  ROUND(
    (COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
  ) as open_rate,
  ROUND(
    (COUNT(CASE WHEN na.event_type = 'clicked' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
  ) as click_rate
FROM notification_analytics na
WHERE na.channel = 'email'
GROUP BY DATE_TRUNC('day', na.created_at)
ORDER BY date DESC;

-- 4.2 Email performance by notification type
DROP VIEW IF EXISTS email_performance_by_type CASCADE;
CREATE VIEW email_performance_by_type 
WITH (security_invoker = true) AS
SELECT 
  nq.notification_type,
  COUNT(*) as total_sent,
  COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END) as total_opened,
  COUNT(CASE WHEN na.event_type = 'clicked' THEN 1 END) as total_clicked,
  ROUND(
    (COUNT(CASE WHEN na.event_type = 'opened' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
  ) as open_rate,
  ROUND(
    (COUNT(CASE WHEN na.event_type = 'clicked' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
  ) as click_rate
FROM notification_queue nq
JOIN notification_analytics na ON na.notification_id = nq.id
WHERE na.channel = 'email'
GROUP BY nq.notification_type
ORDER BY total_sent DESC;

-- ============================================================================
-- SECTION 5: USER PREFERENCES VIEWS
-- ============================================================================

-- 5.1 User preference summary
DROP VIEW IF EXISTS user_notification_preferences_summary CASCADE;
CREATE VIEW user_notification_preferences_summary 
WITH (security_invoker = true) AS
SELECT 
  p.id as user_id,
  p.full_name,
  p.user_type,
  COUNT(uns.id) as preferences_set,
  COUNT(CASE WHEN uns.enabled = true THEN 1 END) as enabled_types,
  COUNT(CASE WHEN uns.enabled = false THEN 1 END) as disabled_types,
  COUNT(CASE WHEN uns.quiet_hours_enabled = true THEN 1 END) as quiet_hours_active,
  BOOL_OR(uns.quiet_hours_enabled) as has_quiet_hours
FROM profiles p
LEFT JOIN user_notification_settings uns ON p.id = uns.user_id
GROUP BY p.id, p.full_name, p.user_type;

-- 5.2 Popular notification preferences
DROP VIEW IF EXISTS popular_notification_preferences CASCADE;
CREATE VIEW popular_notification_preferences 
WITH (security_invoker = true) AS
SELECT 
  notification_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN enabled = true THEN 1 END) as enabled_count,
  COUNT(CASE WHEN enabled = false THEN 1 END) as disabled_count,
  ROUND(
    (COUNT(CASE WHEN enabled = true THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
  ) as enabled_percentage,
  ARRAY_AGG(DISTINCT channels) as common_channel_combinations
FROM user_notification_settings
GROUP BY notification_type
ORDER BY total_users DESC;

-- ============================================================================
-- SECTION 6: MOBILE COMPATIBILITY VIEW & FUNCTION
-- ============================================================================

-- 6.1 AI Usage Logs Mobile compatibility view
-- Maps S5.5 column names to old mobile column names for backward compatibility.
-- S5.5 columns: feature_type, model, total_tokens, latency_ms, status
-- Mobile expects: request_type, model_used, tokens_used, processing_time_ms, success
DROP VIEW IF EXISTS ai_usage_logs_mobile CASCADE;
CREATE VIEW ai_usage_logs_mobile 
WITH (security_invoker = true) AS
SELECT 
  id,
  student_id,
  feature_type AS request_type,
  model AS model_used,
  total_tokens AS tokens_used,
  cost_usd,
  latency_ms AS processing_time_ms,
  (status = 'success') AS success,
  error_message,
  created_at
FROM ai_usage_logs;

COMMENT ON VIEW ai_usage_logs_mobile IS 'Compatibility view for mobile app - maps S5.5 columns to old mobile column names';

-- ============================================================================
-- SECTION 7: STUDENT TOPIC PERFORMANCE VIEW
-- ============================================================================

DROP VIEW IF EXISTS student_topic_performance CASCADE;
CREATE VIEW student_topic_performance 
WITH (security_invoker = true) AS
SELECT 
  sa.user_id AS student_id,
  q.subject_id,
  s.name_en AS subject_name,
  q.topic,
  COUNT(DISTINCT q.id) AS questions_attempted,
  COUNT(DISTINCT CASE WHEN sa.is_correct THEN q.id END) AS questions_correct,
  ROUND(
    (COUNT(DISTINCT CASE WHEN sa.is_correct THEN q.id END)::DECIMAL / 
     NULLIF(COUNT(DISTINCT q.id), 0)) * 100, 2
  ) AS accuracy_percentage,
  MAX(sa.answered_at) AS last_practiced,
  MIN(sa.answered_at) AS first_practiced,
  ROUND(AVG(CASE WHEN sa.is_correct THEN 1 ELSE 0 END) * 100, 2) AS overall_accuracy,
  ROUND(STDDEV(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::NUMERIC, 3) AS consistency_score,
  ROUND(
    AVG(CASE WHEN sa.is_correct THEN 1 ELSE 0 END) 
    FILTER (WHERE sa.answered_at >= NOW() - INTERVAL '30 days') * 100, 2
  ) AS recent_accuracy
FROM student_answers sa
JOIN questions q ON sa.question_id = q.id
JOIN subjects s ON q.subject_id = s.id
WHERE q.topic IS NOT NULL
GROUP BY sa.user_id, q.subject_id, s.name_en, q.topic;

COMMENT ON VIEW student_topic_performance IS 'Analytics view for student performance per topic';

-- ============================================================================
-- SECTION 8: MONTHLY DECAY HISTORY VIEW
-- ============================================================================

DROP VIEW IF EXISTS monthly_decay_history CASCADE;
CREATE VIEW monthly_decay_history 
WITH (security_invoker = true) AS
SELECT 
  DATE_TRUNC('month', created_at) AS decay_month,
  COUNT(*) AS students_affected,
  SUM(ABS(elo_change)) AS total_elo_reduced,
  AVG(ABS(elo_change)) AS avg_elo_reduction,
  MIN(created_at) AS executed_at
FROM score_transactions
WHERE transaction_type = 'monthly_decay'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY decay_month DESC;

-- ============================================================================
-- SECTION 9: ADDITIONAL RLS FOR TABLES MISSED IN 03_rls_policies.sql
-- ============================================================================

-- 9.1 question_groups table
ALTER TABLE IF EXISTS question_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_groups_select_policy" ON question_groups;
CREATE POLICY "question_groups_select_policy" ON question_groups
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "question_groups_admin_policy" ON question_groups;
CREATE POLICY "question_groups_admin_policy" ON question_groups
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ));

-- 9.2 notification_performance_snapshots table
ALTER TABLE IF EXISTS notification_performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_performance_snapshots_admin_policy" ON notification_performance_snapshots;
CREATE POLICY "notification_performance_snapshots_admin_policy" ON notification_performance_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ));

-- 9.4 notification_rate_limits table
ALTER TABLE IF EXISTS notification_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_rate_limits_user_policy" ON notification_rate_limits;
CREATE POLICY "notification_rate_limits_user_policy" ON notification_rate_limits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_rate_limits_admin_policy" ON notification_rate_limits;
CREATE POLICY "notification_rate_limits_admin_policy" ON notification_rate_limits
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ));

-- 9.5 notification_deduplication table
ALTER TABLE IF EXISTS notification_deduplication ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_deduplication_user_policy" ON notification_deduplication;
CREATE POLICY "notification_deduplication_user_policy" ON notification_deduplication
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_deduplication_admin_policy" ON notification_deduplication;
CREATE POLICY "notification_deduplication_admin_policy" ON notification_deduplication
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'
  ));

-- ============================================================================
-- SECTION 10: GRANT PERMISSIONS FOR VIEWS
-- ============================================================================

GRANT SELECT ON notification_stats_overview TO authenticated;
GRANT SELECT ON notification_stats_by_type TO authenticated;
GRANT SELECT ON notification_stats_by_channel TO authenticated;
GRANT SELECT ON notification_daily_trends TO authenticated;
GRANT SELECT ON notification_hourly_distribution TO authenticated;
GRANT SELECT ON user_notification_engagement TO authenticated;
GRANT SELECT ON top_engaged_users TO authenticated;
GRANT SELECT ON low_engagement_users TO authenticated;
GRANT SELECT ON notification_failure_analysis TO authenticated;
GRANT SELECT ON users_with_notification_issues TO authenticated;
GRANT SELECT ON email_notification_stats TO authenticated;
GRANT SELECT ON email_performance_by_type TO authenticated;
GRANT SELECT ON user_notification_preferences_summary TO authenticated;
GRANT SELECT ON popular_notification_preferences TO authenticated;
GRANT SELECT ON ai_usage_logs_mobile TO authenticated;
GRANT SELECT ON student_topic_performance TO authenticated;
GRANT SELECT ON monthly_decay_history TO authenticated;

-- ============================================================================
-- DONE - Security hardening complete
-- ============================================================================
-- Views: 17 views with SECURITY INVOKER
-- Additional RLS: 5 tables with new policies
-- Mobile compatibility: ai_usage_logs_mobile passthrough view
-- ============================================================================
