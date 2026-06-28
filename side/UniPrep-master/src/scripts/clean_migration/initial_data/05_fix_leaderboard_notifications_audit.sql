-- ============================================================================
-- FIX: Missing leaderboard functions + notification ambiguous ID + audit wrong table
-- Run this on EXISTING databases that were set up before these fixes
-- were integrated into the main migration files.
-- ============================================================================
-- Fixes:
--   1. Missing get_active_season() and get_scoring_config() functions (Leaderboard)
--   2. admin_get_notifications ambiguous 'id' column reference (Notifications)
--   3. Audit functions referencing wrong table/columns (Audit Logs)
-- ============================================================================

-- ============================================================================
-- PART 1: Missing leaderboard functions (Admin S3)
-- ============================================================================

DROP FUNCTION IF EXISTS get_active_season();
DROP FUNCTION IF EXISTS get_scoring_config();

-- 1a. Get Active Season
CREATE OR REPLACE FUNCTION get_active_season()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_season JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id, 'name', name, 'description', description,
    'start_date', start_date, 'end_date', end_date,
    'reset_type', reset_type, 'created_at', created_at
  ) INTO v_season
  FROM leaderboard_seasons
  WHERE is_active = true
  LIMIT 1;
  RETURN v_season;
END;
$$;

-- 1b. Get Scoring Config
CREATE OR REPLACE FUNCTION get_scoring_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_config JSONB;
BEGIN
  SELECT jsonb_object_agg(config_key, config_value) INTO v_config FROM scoring_config;
  RETURN v_config;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_season() TO authenticated;
GRANT EXECUTE ON FUNCTION get_scoring_config() TO authenticated;

-- ============================================================================
-- PART 2: Fix admin_get_notifications ambiguous 'id' (Admin S7 fix)
-- ============================================================================

DROP FUNCTION IF EXISTS admin_get_notifications(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION admin_get_notifications(
  p_admin_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  notification_id UUID,
  notification_title TEXT,
  notification_body TEXT,
  notification_channels TEXT[],
  notification_target_type TEXT,
  notification_target_filter JSONB,
  notification_status TEXT,
  notification_total_recipients INTEGER,
  notification_delivered_count INTEGER,
  notification_opened_count INTEGER,
  notification_failed_count INTEGER,
  notification_sent_at TIMESTAMPTZ,
  notification_scheduled_at TIMESTAMPTZ,
  notification_created_at TIMESTAMPTZ,
  admin_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND profiles.user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    n.id AS notification_id,
    n.title AS notification_title,
    n.body AS notification_body,
    n.channels AS notification_channels,
    n.target_type AS notification_target_type,
    n.target_filter AS notification_target_filter,
    n.status AS notification_status,
    n.total_recipients AS notification_total_recipients,
    n.delivered_count AS notification_delivered_count,
    n.opened_count AS notification_opened_count,
    n.failed_count AS notification_failed_count,
    n.sent_at AS notification_sent_at,
    n.scheduled_at AS notification_scheduled_at,
    n.created_at AS notification_created_at,
    p.full_name AS admin_name
  FROM admin_notifications n
  LEFT JOIN profiles p ON p.id = n.admin_id
  WHERE (p_status IS NULL OR n.status = p_status)
  ORDER BY n.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Add RLS policies for users to manage their own notifications (S7 fix)
DROP POLICY IF EXISTS "Users can update own notification status" ON notification_recipients;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notification_recipients;

CREATE POLICY "Users can update own notification status"
  ON notification_recipients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON notification_recipients FOR DELETE
  USING (user_id = auth.uid());

GRANT EXECUTE ON FUNCTION admin_get_notifications(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- PART 3: Fix audit functions - use admin_audit_log (singular) with correct columns
-- ============================================================================

-- Drop old versions (may have different signatures/return types)
DROP FUNCTION IF EXISTS admin_get_audit_logs(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS admin_get_audit_logs(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS admin_get_audit_stats(UUID, INTEGER);
DROP FUNCTION IF EXISTS admin_get_audit_log_detail(UUID, UUID);
DROP FUNCTION IF EXISTS admin_get_audit_filter_options(UUID);

-- 3a. Get Audit Logs (Fixed: uses admin_audit_log with action_type, table_name, record_id)
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
  log_id UUID,
  admin_id UUID,
  admin_email TEXT,
  admin_name TEXT,
  action_type TEXT,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  log_timestamp TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND user_type = 'admin'
  ) THEN
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
    aal.id as log_id,
    aal.admin_id,
    COALESCE(pr.full_name, aal.admin_id::TEXT) as admin_email,
    pr.full_name as admin_name,
    aal.action_type,
    aal.table_name,
    aal.record_id,
    aal.old_values,
    aal.new_values,
    aal.ip_address,
    aal.user_agent,
    aal.timestamp as log_timestamp,
    v_total as total_count
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
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3b. Get Audit Stats (Fixed: uses admin_audit_log with correct columns)
CREATE OR REPLACE FUNCTION admin_get_audit_stats(
  p_admin_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM admin_audit_log),
    'logs_today', (
      SELECT COUNT(*) FROM admin_audit_log
      WHERE admin_audit_log.timestamp >= CURRENT_DATE
    ),
    'logs_this_week', (
      SELECT COUNT(*) FROM admin_audit_log
      WHERE admin_audit_log.timestamp >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'logs_this_month', (
      SELECT COUNT(*) FROM admin_audit_log
      WHERE admin_audit_log.timestamp >= CURRENT_DATE - INTERVAL '30 days'
    ),
    'by_action_type', (
      SELECT COALESCE(json_object_agg(action_type, cnt), '{}'::json)
      FROM (
        SELECT action_type, COUNT(*) as cnt
        FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY action_type
      ) sub
    ),
    'by_table', (
      SELECT COALESCE(json_object_agg(COALESCE(tbl_name, 'unknown'), cnt), '{}'::json)
      FROM (
        SELECT table_name as tbl_name, COUNT(*) as cnt
        FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY table_name
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    ),
    'by_admin', (
      SELECT COALESCE(json_agg(json_build_object(
        'admin_id', adm_id,
        'admin_name', adm_name,
        'count', cnt
      )), '[]'::json)
      FROM (
        SELECT
          aal.admin_id as adm_id,
          pr.full_name as adm_name,
          COUNT(*) as cnt
        FROM admin_audit_log aal
        LEFT JOIN profiles pr ON aal.admin_id = pr.id
        WHERE aal.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY aal.admin_id, pr.full_name
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    ),
    'daily_activity', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', dt,
        'count', cnt
      ) ORDER BY dt), '[]'::json)
      FROM (
        SELECT
          DATE(admin_audit_log.timestamp) as dt,
          COUNT(*) as cnt
        FROM admin_audit_log
        WHERE admin_audit_log.timestamp >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY DATE(admin_audit_log.timestamp)
      ) sub
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 3c. Get Audit Log Detail (Fixed)
CREATE OR REPLACE FUNCTION admin_get_audit_log_detail(
  p_admin_id UUID,
  p_log_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'log_id', aal.id,
    'admin_id', aal.admin_id,
    'admin_email', COALESCE(pr.full_name, aal.admin_id::TEXT),
    'admin_name', pr.full_name,
    'action_type', aal.action_type,
    'table_name', aal.table_name,
    'record_id', aal.record_id,
    'old_values', aal.old_values,
    'new_values', aal.new_values,
    'ip_address', aal.ip_address,
    'user_agent', aal.user_agent,
    'log_timestamp', aal.timestamp,
    'changes', (
      SELECT json_agg(json_build_object(
        'field', k,
        'old_value', aal.old_values->k,
        'new_value', aal.new_values->k
      ))
      FROM jsonb_object_keys(COALESCE(aal.new_values, '{}'::jsonb)) as k
      WHERE aal.old_values->k IS DISTINCT FROM aal.new_values->k
    )
  )
  INTO v_result
  FROM admin_audit_log aal
  LEFT JOIN profiles pr ON aal.admin_id = pr.id
  WHERE aal.id = p_log_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Audit log not found';
  END IF;

  RETURN v_result;
END;
$$;

-- 3d. Get Audit Filter Options (Fixed)
CREATE OR REPLACE FUNCTION admin_get_audit_filter_options(
  p_admin_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_admin_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'action_types', (
      SELECT COALESCE(json_agg(DISTINCT action_type ORDER BY action_type), '[]'::json)
      FROM admin_audit_log
      WHERE action_type IS NOT NULL
    ),
    'table_names', (
      SELECT COALESCE(json_agg(DISTINCT table_name ORDER BY table_name), '[]'::json)
      FROM admin_audit_log
      WHERE table_name IS NOT NULL
    ),
    'admins', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', pr.id,
        'name', pr.full_name,
        'email', pr.full_name
      )), '[]'::json)
      FROM profiles pr
      WHERE pr.user_type = 'admin'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION admin_get_audit_logs(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_stats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_log_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_filter_options(UUID) TO authenticated;

-- ============================================================================
-- PART 5: Verify
-- ============================================================================

SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_active_season') AS has_get_active_season,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_scoring_config') AS has_get_scoring_config,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_notifications') AS has_notifications_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_audit_logs') AS has_audit_logs_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_audit_stats') AS has_audit_stats_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_audit_log_detail') AS has_audit_detail_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_audit_filter_options') AS has_audit_filter_fn;
-- Expected: all true
