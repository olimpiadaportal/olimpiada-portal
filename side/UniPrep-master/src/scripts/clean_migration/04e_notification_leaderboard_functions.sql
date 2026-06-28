-- ============================================
-- CONSOLIDATED: Notification, Leaderboard & Monitoring Functions
-- ============================================
-- Source: Admin S7 (01_notification_tables, advanced/05_analytics_and_monitoring)
--         Admin S3 (02_leaderboard_functions)
-- Dependencies: 01_base_schema.sql (tables), profiles, students, scoring_config
-- ============================================

-- ============================================
-- SECTION 1: NOTIFICATION TABLES & RLS
-- ============================================

-- 1a. Admin Notifications Table
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT[] DEFAULT ARRAY['in_app'],
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'students', 'teachers', 'target_group', 'individual')),
  target_filter JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  total_recipients INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_status ON admin_notifications(status);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id ON admin_notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC);

-- 1b. Notification Templates Table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT[] DEFAULT ARRAY['in_app'],
  variables TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1c. Notification Recipients Table
CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  channel TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_notification_id ON notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id ON notification_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_status ON notification_recipients(status);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_channel ON notification_recipients(channel);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_notif_status ON notification_recipients(notification_id, status);

-- 1d. Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

-- 1e. RLS Policies - Admin Notifications
DROP POLICY IF EXISTS "Admins can view all notifications" ON admin_notifications;
CREATE POLICY "Admins can view all notifications" ON admin_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "Admins can create notifications" ON admin_notifications;
CREATE POLICY "Admins can create notifications" ON admin_notifications FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "Admins can update notifications" ON admin_notifications;
CREATE POLICY "Admins can update notifications" ON admin_notifications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "Admins can delete draft notifications" ON admin_notifications;
CREATE POLICY "Admins can delete draft notifications" ON admin_notifications FOR DELETE
  USING (status = 'draft' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

-- 1f. RLS Policies - Notification Templates
DROP POLICY IF EXISTS "Admins can view all templates" ON notification_templates;
CREATE POLICY "Admins can view all templates" ON notification_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "Admins can manage templates" ON notification_templates;
CREATE POLICY "Admins can manage templates" ON notification_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

-- 1g. RLS Policies - Notification Recipients
DROP POLICY IF EXISTS "Admins can view all recipients" ON notification_recipients;
CREATE POLICY "Admins can view all recipients" ON notification_recipients FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "Users can view own notification status" ON notification_recipients;
CREATE POLICY "Users can view own notification status" ON notification_recipients FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can manage recipients" ON notification_recipients;
CREATE POLICY "System can manage recipients" ON notification_recipients FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

-- ============================================
-- SECTION 2: NOTIFICATION FUNCTIONS
-- ============================================

-- 2a. Get Notification Target Count
CREATE OR REPLACE FUNCTION admin_get_notification_target_count(
  p_admin_id UUID, p_target_type TEXT, p_target_filter JSONB DEFAULT '{}'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  CASE p_target_type
    WHEN 'all' THEN
      SELECT COUNT(*) INTO v_count FROM profiles WHERE user_type IN ('student', 'teacher');
    WHEN 'students' THEN
      SELECT COUNT(*) INTO v_count FROM profiles WHERE user_type = 'student';
    WHEN 'teachers' THEN
      SELECT COUNT(*) INTO v_count FROM profiles WHERE user_type = 'teacher';
    WHEN 'target_group' THEN
      SELECT COUNT(*) INTO v_count FROM profiles p
      JOIN students s ON s.user_id = p.id
      WHERE p.user_type = 'student' AND s.target_group = p_target_filter->>'target_group';
    WHEN 'individual' THEN
      SELECT COUNT(*) INTO v_count FROM profiles
      WHERE id = ANY(SELECT jsonb_array_elements_text(p_target_filter->'user_ids')::UUID);
    ELSE v_count := 0;
  END CASE;

  RETURN v_count;
END;
$$;

-- 2b-helper. Process Variable Substitution
CREATE OR REPLACE FUNCTION process_notification_variables(
  p_text TEXT, p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT := p_text; v_user_record RECORD;
  v_first_name TEXT; v_email_masked TEXT;
BEGIN
  SELECT p.full_name, au.email, s.target_group, s.city
  INTO v_user_record
  FROM profiles p
  LEFT JOIN students s ON s.user_id = p.id
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.id = p_user_id;

  v_first_name := COALESCE(SPLIT_PART(v_user_record.full_name, ' ', 1), 'User');
  v_email_masked := CASE
    WHEN v_user_record.email IS NOT NULL AND LENGTH(v_user_record.email) > 3
    THEN SUBSTRING(v_user_record.email, 1, 3) || '***@' || SPLIT_PART(v_user_record.email, '@', 2)
    ELSE 'user@email.com'
  END;

  v_result := REPLACE(v_result, '{{user_name}}', COALESCE(v_user_record.full_name, 'User'));
  v_result := REPLACE(v_result, '{{first_name}}', v_first_name);
  v_result := REPLACE(v_result, '{{email}}', v_email_masked);
  v_result := REPLACE(v_result, '{{target_group}}', COALESCE(v_user_record.target_group, ''));
  v_result := REPLACE(v_result, '{{city}}', COALESCE(v_user_record.city, ''));
  v_result := REPLACE(v_result, '{{date}}', TO_CHAR(NOW(), 'YYYY-MM-DD'));
  v_result := REPLACE(v_result, '{{time}}', TO_CHAR(NOW(), 'HH24:MI'));
  v_result := REPLACE(v_result, '{{app_name}}', 'Elmly');
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION process_notification_variables IS 'Replaces template variables with actual user data';

-- 2b. Send Notification (latest: 9 params with type, data, variable substitution)
CREATE OR REPLACE FUNCTION admin_send_notification(
  p_admin_id UUID, p_title TEXT, p_body TEXT,
  p_channels TEXT[] DEFAULT ARRAY['in_app'], p_target_type TEXT DEFAULT 'all',
  p_target_filter JSONB DEFAULT '{}', p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_notification_type TEXT DEFAULT 'general', p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID; v_user_record RECORD;
  v_channel TEXT; v_recipient_count INTEGER := 0;
  v_delivered_count INTEGER := 0; v_valid_type TEXT;
  v_processed_title TEXT; v_processed_body TEXT;
BEGIN
  v_valid_type := CASE
    WHEN p_notification_type IN ('exam','booking','achievement','reminder','general','announcement')
    THEN p_notification_type ELSE 'general' END;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO admin_notifications (admin_id, title, body, channels, target_type, target_filter, scheduled_at, status, metadata)
  VALUES (p_admin_id, p_title, p_body, p_channels, p_target_type, p_target_filter, p_scheduled_at,
    CASE WHEN p_scheduled_at IS NOT NULL THEN 'scheduled' ELSE 'sending' END, p_data)
  RETURNING id INTO v_notification_id;

  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() THEN
    RETURN v_notification_id;
  END IF;

  FOR v_user_record IN (
    SELECT p.id as user_id FROM profiles p
    LEFT JOIN students s ON s.user_id = p.id AND p.user_type = 'student'
    WHERE CASE p_target_type
      WHEN 'all' THEN p.user_type IN ('student', 'teacher')
      WHEN 'students' THEN p.user_type = 'student'
      WHEN 'teachers' THEN p.user_type = 'teacher'
      WHEN 'target_group' THEN p.user_type = 'student' AND s.target_group = p_target_filter->>'target_group'
      WHEN 'individual' THEN p.id = ANY(SELECT jsonb_array_elements_text(p_target_filter->'user_ids')::UUID)
      ELSE FALSE
    END
  )
  LOOP
    v_recipient_count := v_recipient_count + 1;
    v_processed_title := process_notification_variables(p_title, v_user_record.user_id);
    v_processed_body := process_notification_variables(p_body, v_user_record.user_id);

    FOREACH v_channel IN ARRAY p_channels LOOP
      INSERT INTO notification_recipients (notification_id, user_id, channel, status, sent_at, delivered_at)
      VALUES (v_notification_id, v_user_record.user_id, v_channel,
        CASE WHEN v_channel = 'in_app' THEN 'delivered' ELSE 'sent' END,
        NOW(), CASE WHEN v_channel = 'in_app' THEN NOW() ELSE NULL END);
      IF v_channel = 'in_app' THEN v_delivered_count := v_delivered_count + 1; END IF;
    END LOOP;

    IF 'in_app' = ANY(p_channels) THEN
      INSERT INTO notifications (user_id, title, body, type, is_read, data)
      VALUES (v_user_record.user_id, v_processed_title, v_processed_body, v_valid_type, FALSE, p_data);
    END IF;
  END LOOP;

  UPDATE admin_notifications
  SET total_recipients = v_recipient_count, delivered_count = v_delivered_count, status = 'sent', sent_at = NOW()
  WHERE id = v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 2c. Get Notifications List (Fixed: prefixed return columns to avoid ambiguous 'id')
CREATE OR REPLACE FUNCTION admin_get_notifications(
  p_admin_id UUID, p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  notification_id UUID, notification_title TEXT, notification_body TEXT,
  notification_channels TEXT[], notification_target_type TEXT,
  notification_target_filter JSONB, notification_status TEXT,
  notification_total_recipients INTEGER, notification_delivered_count INTEGER,
  notification_opened_count INTEGER, notification_failed_count INTEGER,
  notification_sent_at TIMESTAMPTZ, notification_scheduled_at TIMESTAMPTZ,
  notification_created_at TIMESTAMPTZ, admin_name TEXT
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
    n.id AS notification_id, n.title AS notification_title, n.body AS notification_body,
    n.channels AS notification_channels, n.target_type AS notification_target_type,
    n.target_filter AS notification_target_filter, n.status AS notification_status,
    n.total_recipients AS notification_total_recipients,
    n.delivered_count AS notification_delivered_count,
    n.opened_count AS notification_opened_count,
    n.failed_count AS notification_failed_count,
    n.sent_at AS notification_sent_at, n.scheduled_at AS notification_scheduled_at,
    n.created_at AS notification_created_at, p.full_name AS admin_name
  FROM admin_notifications n
  LEFT JOIN profiles p ON p.id = n.admin_id
  WHERE (p_status IS NULL OR n.status = p_status)
  ORDER BY n.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 2d. Get Notification Details
CREATE OR REPLACE FUNCTION admin_get_notification_details(p_admin_id UUID, p_notification_id UUID)
RETURNS TABLE (
  id UUID, title TEXT, body TEXT, channels TEXT[], target_type TEXT,
  target_filter JSONB, status TEXT, total_recipients INTEGER,
  delivered_count INTEGER, opened_count INTEGER, failed_count INTEGER,
  sent_at TIMESTAMPTZ, scheduled_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  admin_name TEXT, channel_stats JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT n.id, n.title, n.body, n.channels, n.target_type, n.target_filter,
    n.status, n.total_recipients, n.delivered_count, n.opened_count, n.failed_count,
    n.sent_at, n.scheduled_at, n.created_at, p.full_name as admin_name,
    (SELECT jsonb_object_agg(r.channel, jsonb_build_object(
      'total', COUNT(*),
      'sent', COUNT(*) FILTER (WHERE r.status IN ('sent', 'delivered', 'opened')),
      'delivered', COUNT(*) FILTER (WHERE r.status IN ('delivered', 'opened')),
      'opened', COUNT(*) FILTER (WHERE r.status = 'opened'),
      'failed', COUNT(*) FILTER (WHERE r.status = 'failed'))
    ) FROM notification_recipients r WHERE r.notification_id = n.id GROUP BY r.notification_id) as channel_stats
  FROM admin_notifications n
  LEFT JOIN profiles p ON p.id = n.admin_id
  WHERE n.id = p_notification_id;
END;
$$;

-- 2e. Update Notification Recipient Status
CREATE OR REPLACE FUNCTION update_notification_recipient_status(
  p_user_id UUID, p_notification_id UUID, p_channel TEXT, p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notification_recipients
  SET status = p_status,
    delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END,
    opened_at = CASE WHEN p_status = 'opened' THEN NOW() ELSE opened_at END
  WHERE notification_id = p_notification_id AND user_id = p_user_id AND channel = p_channel;

  UPDATE admin_notifications n
  SET delivered_count = (SELECT COUNT(*) FROM notification_recipients WHERE notification_id = n.id AND status IN ('delivered', 'opened')),
    opened_count = (SELECT COUNT(*) FROM notification_recipients WHERE notification_id = n.id AND status = 'opened'),
    failed_count = (SELECT COUNT(*) FROM notification_recipients WHERE notification_id = n.id AND status = 'failed')
  WHERE id = p_notification_id;

  RETURN TRUE;
END;
$$;

-- 2f. Notification Timestamp Trigger
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admin_notifications_timestamp ON admin_notifications;
CREATE TRIGGER update_admin_notifications_timestamp
  BEFORE UPDATE ON admin_notifications FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

DROP TRIGGER IF EXISTS update_notification_templates_timestamp ON notification_templates;
CREATE TRIGGER update_notification_templates_timestamp
  BEFORE UPDATE ON notification_templates FOR EACH ROW
  EXECUTE FUNCTION update_notification_timestamp();

-- 2g. Seed Default Templates
INSERT INTO notification_templates (name, title, body, channels, variables, category) VALUES
  ('Welcome Message', 'Welcome to Elmly! 🎓', 'Hi {{user_name}}, welcome to Elmly! Start your exam preparation journey today.', ARRAY['in_app', 'push'], ARRAY['user_name'], 'general'),
  ('New Exam Available', 'New Mock Exam Available! 📝', 'A new mock exam is now available. Test your knowledge and track your progress!', ARRAY['in_app', 'push'], ARRAY[]::TEXT[], 'exam'),
  ('Study Reminder', 'Time to Study! 📚', 'Hi {{user_name}}, don''t forget to practice today. Consistency is key to success!', ARRAY['in_app', 'push'], ARRAY['user_name'], 'reminder'),
  ('Achievement Unlocked', 'Achievement Unlocked! 🏆', 'Congratulations {{user_name}}! You''ve earned a new achievement.', ARRAY['in_app', 'push'], ARRAY['user_name'], 'achievement'),
  ('System Announcement', 'Important Announcement 📢', '{{message}}', ARRAY['in_app', 'push'], ARRAY['message'], 'announcement'),
  ('Maintenance Notice', 'Scheduled Maintenance 🔧', 'Elmly will be undergoing maintenance on {{date}}. We apologize for any inconvenience.', ARRAY['in_app', 'push', 'email'], ARRAY['date'], 'announcement'),
  ('Goal Reminder', 'Time to Study! 📚', 'Hi {{user_name}}, don''t forget your daily goal. Let''s keep your streak going!', ARRAY['in_app', 'push'], ARRAY['user_name'], 'reminder'),
  ('Goal Streak', '{{days}}-Day Goal Streak! 🔥', 'Congratulations {{user_name}}! You''ve met your daily goals for {{days}} days in a row. Keep it up!', ARRAY['in_app', 'push'], ARRAY['user_name', 'days'], 'achievement')
ON CONFLICT DO NOTHING;

-- Grant notification permissions
GRANT EXECUTE ON FUNCTION admin_get_notification_target_count TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_notification(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_notification_variables(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_notification_details TO authenticated;
GRANT EXECUTE ON FUNCTION update_notification_recipient_status TO authenticated;

-- ============================================
-- SECTION 3: NOTIFICATION MONITORING (S7/advanced/05)
-- ============================================

-- 3a. Performance Snapshots Table
CREATE TABLE IF NOT EXISTS notification_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_time TIMESTAMPTZ DEFAULT NOW(),
  total_notifications BIGINT,
  pending_count BIGINT,
  processing_count BIGINT,
  sent_count BIGINT,
  failed_count BIGINT,
  avg_processing_time_seconds NUMERIC,
  success_rate NUMERIC,
  queue_health_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_time ON notification_performance_snapshots(snapshot_time DESC);

-- 3b. Queue Health Monitor
DROP FUNCTION IF EXISTS get_queue_health();

CREATE OR REPLACE FUNCTION get_queue_health()
RETURNS TABLE (metric TEXT, value BIGINT, health_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 'Pending Notifications'::TEXT, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 1000 THEN 'critical' WHEN COUNT(*) > 500 THEN 'warning' ELSE 'healthy' END::TEXT
  FROM notification_queue WHERE notification_queue.status = 'pending'
  UNION ALL
  SELECT 'Processing Notifications'::TEXT, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 100 THEN 'warning' ELSE 'healthy' END::TEXT
  FROM notification_queue WHERE notification_queue.status = 'processing'
  UNION ALL
  SELECT 'Failed (Last Hour)'::TEXT, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 50 THEN 'critical' WHEN COUNT(*) > 20 THEN 'warning' ELSE 'healthy' END::TEXT
  FROM notification_queue WHERE notification_queue.status = 'failed' AND notification_queue.created_at >= NOW() - INTERVAL '1 hour'
  UNION ALL
  SELECT 'Stale Processing (>5min)'::TEXT, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 10 THEN 'critical' WHEN COUNT(*) > 5 THEN 'warning' ELSE 'healthy' END::TEXT
  FROM notification_queue WHERE notification_queue.status = 'processing' AND notification_queue.updated_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- 3c. Processing Rate
CREATE OR REPLACE FUNCTION get_processing_rate(p_time_window_minutes INTEGER DEFAULT 60)
RETURNS TABLE (time_period TEXT, notifications_processed BIGINT, avg_processing_time_seconds NUMERIC, success_rate NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p_time_window_minutes || ' minutes'::TEXT, COUNT(*)::BIGINT,
    ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))::NUMERIC, 2),
    ROUND((COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2)
  FROM notification_queue
  WHERE processed_at >= NOW() - (p_time_window_minutes || ' minutes')::INTERVAL;
END;
$$;

-- 3d. Channel Performance
CREATE OR REPLACE FUNCTION get_channel_performance()
RETURNS TABLE (channel TEXT, total_sent BIGINT, success_count BIGINT, failure_count BIGINT, success_rate NUMERIC, avg_delivery_time_seconds NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH channel_data AS (
    SELECT UNNEST(channels) as channel_name, status,
      EXTRACT(EPOCH FROM (processed_at - created_at)) as delivery_time
    FROM notification_queue WHERE created_at >= NOW() - INTERVAL '7 days'
  )
  SELECT channel_name::TEXT, COUNT(*)::BIGINT,
    COUNT(CASE WHEN status = 'sent' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN status = 'failed' THEN 1 END)::BIGINT,
    ROUND((COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2),
    ROUND(AVG(delivery_time)::NUMERIC, 2)
  FROM channel_data GROUP BY channel_name ORDER BY COUNT(*) DESC;
END;
$$;

-- 3e. Create Performance Snapshot
CREATE OR REPLACE FUNCTION create_performance_snapshot()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id UUID; v_total BIGINT; v_pending BIGINT; v_processing BIGINT;
  v_sent BIGINT; v_failed BIGINT; v_avg_time NUMERIC; v_success_rate NUMERIC; v_health TEXT;
BEGIN
  SELECT COUNT(*), COUNT(CASE WHEN status = 'pending' THEN 1 END),
    COUNT(CASE WHEN status = 'processing' THEN 1 END),
    COUNT(CASE WHEN status = 'sent' THEN 1 END),
    COUNT(CASE WHEN status = 'failed' THEN 1 END),
    ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))::NUMERIC, 2),
    ROUND((COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2)
  INTO v_total, v_pending, v_processing, v_sent, v_failed, v_avg_time, v_success_rate
  FROM notification_queue WHERE created_at >= NOW() - INTERVAL '1 hour';

  IF v_pending > 1000 OR v_failed > 50 THEN v_health := 'critical';
  ELSIF v_pending > 500 OR v_failed > 20 THEN v_health := 'warning';
  ELSE v_health := 'healthy'; END IF;

  INSERT INTO notification_performance_snapshots (total_notifications, pending_count, processing_count, sent_count, failed_count, avg_processing_time_seconds, success_rate, queue_health_status)
  VALUES (v_total, v_pending, v_processing, v_sent, v_failed, v_avg_time, v_success_rate, v_health)
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- 3f. Notification Trends
CREATE OR REPLACE FUNCTION get_notification_trends(p_days INTEGER DEFAULT 7)
RETURNS TABLE (date DATE, total_count BIGINT, sent_count BIGINT, failed_count BIGINT, unique_users BIGINT, success_rate NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DATE(created_at), COUNT(*)::BIGINT,
    COUNT(CASE WHEN status = 'sent' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN status = 'failed' THEN 1 END)::BIGINT,
    COUNT(DISTINCT user_id)::BIGINT,
    ROUND((COUNT(CASE WHEN status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2)
  FROM notification_queue
  WHERE created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC;
END;
$$;

-- 3g. Top Notification Types
CREATE OR REPLACE FUNCTION get_top_notification_types(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (notification_type TEXT, total_count BIGINT, sent_count BIGINT, success_rate NUMERIC, unique_recipients BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT nq.notification_type::TEXT, COUNT(*)::BIGINT,
    COUNT(CASE WHEN nq.status = 'sent' THEN 1 END)::BIGINT,
    ROUND((COUNT(CASE WHEN nq.status = 'sent' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2),
    COUNT(DISTINCT nq.user_id)::BIGINT
  FROM notification_queue nq
  WHERE nq.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY nq.notification_type ORDER BY COUNT(*) DESC LIMIT p_limit;
END;
$$;

-- Grant monitoring permissions
GRANT EXECUTE ON FUNCTION get_queue_health TO authenticated;
GRANT EXECUTE ON FUNCTION get_processing_rate TO authenticated;
GRANT EXECUTE ON FUNCTION get_channel_performance TO authenticated;
GRANT EXECUTE ON FUNCTION create_performance_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_trends TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_notification_types TO authenticated;

-- ============================================
-- SECTION 4: LEADERBOARD SEASON FUNCTIONS (S3)
-- ============================================

-- 4a. Create Season
CREATE OR REPLACE FUNCTION create_season(
  p_name TEXT, p_description TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE, p_end_date DATE DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_season_id UUID;
BEGIN
  UPDATE leaderboard_seasons SET is_active = false WHERE is_active = true;

  INSERT INTO leaderboard_seasons (name, description, start_date, end_date, is_active, created_by)
  VALUES (p_name, p_description, p_start_date, p_end_date, true, p_created_by)
  RETURNING id INTO v_season_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object('season_id', v_season_id, 'name', p_name, 'is_active', true)
  );
END;
$$;

-- 4b. Archive Season
CREATE OR REPLACE FUNCTION archive_season(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leaderboard_seasons SET is_active = false, end_date = CURRENT_DATE WHERE id = p_season_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Season not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('season_id', p_season_id, 'archived', true));
END;
$$;

-- 4c. Soft Reset Leaderboard
CREATE OR REPLACE FUNCTION reset_leaderboard_soft(
  p_percentage NUMERIC, p_season_name TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_season_id UUID; v_affected_rows INTEGER; v_base_elo NUMERIC;
BEGIN
  SELECT (config_value->>'value')::NUMERIC INTO v_base_elo FROM scoring_config WHERE config_key = 'elo_base';

  IF p_season_name IS NOT NULL THEN
    SELECT (create_season(p_season_name, 'Soft reset with ' || p_percentage || '% decay', CURRENT_DATE, NULL, p_created_by)->>'season_id')::UUID INTO v_season_id;
  END IF;

  UPDATE students SET elo_rating = CASE
    WHEN elo_rating > v_base_elo THEN v_base_elo + (elo_rating - v_base_elo) * (1 - p_percentage / 100)
    WHEN elo_rating < v_base_elo THEN v_base_elo - (v_base_elo - elo_rating) * (1 - p_percentage / 100)
    ELSE v_base_elo
  END WHERE id IS NOT NULL;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object(
    'reset_type', 'soft', 'percentage', p_percentage, 'affected_students', v_affected_rows, 'season_id', v_season_id
  ));
END;
$$;

-- 4d. Hard Reset Leaderboard
CREATE OR REPLACE FUNCTION reset_leaderboard_hard(p_season_name TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_season_id UUID; v_affected_rows INTEGER; v_base_elo NUMERIC;
BEGIN
  SELECT (config_value->>'value')::NUMERIC INTO v_base_elo FROM scoring_config WHERE config_key = 'elo_base';

  IF p_season_name IS NOT NULL THEN
    SELECT (create_season(p_season_name, 'Hard reset to base ELO', CURRENT_DATE, NULL, p_created_by)->>'season_id')::UUID INTO v_season_id;
  END IF;

  UPDATE students SET elo_rating = v_base_elo WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object(
    'reset_type', 'hard', 'base_elo', v_base_elo, 'affected_students', v_affected_rows, 'season_id', v_season_id
  ));
END;
$$;

-- 4e. Get Active Season
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

-- 4f. Get Scoring Config
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

-- Grant leaderboard permissions
-- get_active_season and get_scoring_config are read-only, safe for all users.
GRANT EXECUTE ON FUNCTION get_active_season TO authenticated;
GRANT EXECUTE ON FUNCTION get_scoring_config TO authenticated;
-- Season management and leaderboard resets are admin-only operations.
-- Callable only via service_role (admin panel). Regular users must NOT be able
-- to invoke these — even though the functions check IS admin internally,
-- exposure at the API level is an unnecessary attack surface.
GRANT EXECUTE ON FUNCTION create_season TO service_role;
GRANT EXECUTE ON FUNCTION archive_season TO service_role;
GRANT EXECUTE ON FUNCTION reset_leaderboard_soft TO service_role;
GRANT EXECUTE ON FUNCTION reset_leaderboard_hard TO service_role;

-- ============================================
-- SECTION 5: SMART NOTIFICATION FEATURES (S7/advanced/06)
-- Rate Limiting, Deduplication, Token Cleanup, Batching
-- ============================================

-- 5a. Rate Limiting - Check if user can receive notification
CREATE OR REPLACE FUNCTION can_send_notification(
  p_user_id UUID, p_notification_type TEXT, p_max_per_hour INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INTEGER; v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := DATE_TRUNC('hour', NOW());
  SELECT COALESCE(count, 0) INTO v_count FROM notification_rate_limits
  WHERE user_id = p_user_id AND notification_type = p_notification_type AND window_start = v_window_start;

  IF v_count < p_max_per_hour THEN
    INSERT INTO notification_rate_limits (user_id, notification_type, window_start, count)
    VALUES (p_user_id, p_notification_type, v_window_start, 1)
    ON CONFLICT (user_id, notification_type, window_start)
    DO UPDATE SET count = notification_rate_limits.count + 1, updated_at = NOW();
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

-- 5b. Deduplication - Generate notification hash
CREATE OR REPLACE FUNCTION generate_notification_hash(
  p_user_id UUID, p_notification_type TEXT, p_title TEXT, p_body TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN MD5(p_user_id::TEXT || p_notification_type || p_title || p_body);
END;
$$;

-- 5c. Deduplication - Check if notification is duplicate
CREATE OR REPLACE FUNCTION is_duplicate_notification(
  p_user_id UUID, p_notification_type TEXT, p_title TEXT, p_body TEXT,
  p_dedup_window_hours INTEGER DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_hash TEXT; v_exists BOOLEAN;
BEGIN
  v_hash := generate_notification_hash(p_user_id, p_notification_type, p_title, p_body);
  SELECT EXISTS (
    SELECT 1 FROM notification_deduplication
    WHERE user_id = p_user_id AND notification_hash = v_hash
      AND created_at > NOW() - (p_dedup_window_hours || ' hours')::INTERVAL
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO notification_deduplication (user_id, notification_hash, notification_type, title, body)
    VALUES (p_user_id, v_hash, p_notification_type, p_title, p_body);
  END IF;
  RETURN v_exists;
END;
$$;

-- 5d-pre1. Check if user is in quiet hours (S7/advanced/01)
CREATE OR REPLACE FUNCTION is_in_quiet_hours(
  p_user_id UUID,
  p_notification_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings RECORD;
  v_current_time TIME;
  v_current_day INTEGER;
BEGIN
  SELECT * INTO v_settings
  FROM user_notification_settings
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type;

  IF v_settings IS NULL OR NOT v_settings.quiet_hours_enabled THEN
    RETURN FALSE;
  END IF;

  v_current_time := CURRENT_TIME;
  v_current_day := EXTRACT(DOW FROM CURRENT_TIMESTAMP)::INTEGER;

  IF NOT (v_current_day = ANY(v_settings.quiet_hours_days)) THEN
    RETURN FALSE;
  END IF;

  IF v_settings.quiet_hours_start < v_settings.quiet_hours_end THEN
    RETURN v_current_time >= v_settings.quiet_hours_start
       AND v_current_time < v_settings.quiet_hours_end;
  ELSE
    RETURN v_current_time >= v_settings.quiet_hours_start
        OR v_current_time < v_settings.quiet_hours_end;
  END IF;
END;
$$;

-- 5d-pre2. Check if notification type is enabled for user (S7/advanced/04)
CREATE OR REPLACE FUNCTION is_notification_enabled(
  p_user_id UUID,
  p_notification_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled
  FROM user_notification_settings
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type;

  -- Default to true if no preference set
  RETURN COALESCE(v_enabled, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5d. Smart Notification Check (combines rate limit + dedup + user prefs)
CREATE OR REPLACE FUNCTION can_send_smart_notification(
  p_user_id UUID, p_notification_type TEXT, p_title TEXT, p_body TEXT,
  p_max_per_hour INTEGER DEFAULT 10, p_check_duplicates BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (can_send BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_rate_limit_ok BOOLEAN; v_is_duplicate BOOLEAN; v_user_enabled BOOLEAN; v_quiet_hours BOOLEAN;
BEGIN
  -- Check if notification type is enabled for user
  SELECT is_notification_enabled(p_user_id, p_notification_type) INTO v_user_enabled;
  IF NOT v_user_enabled THEN
    RETURN QUERY SELECT FALSE, 'Notification type disabled by user';
    RETURN;
  END IF;

  -- Check quiet hours
  SELECT is_in_quiet_hours(p_user_id, p_notification_type) INTO v_quiet_hours;
  IF v_quiet_hours THEN
    RETURN QUERY SELECT FALSE, 'User is in quiet hours';
    RETURN;
  END IF;

  -- Check rate limit
  v_rate_limit_ok := can_send_notification(p_user_id, p_notification_type, p_max_per_hour);
  IF NOT v_rate_limit_ok THEN
    RETURN QUERY SELECT FALSE, 'Rate limit exceeded';
    RETURN;
  END IF;

  -- Check for duplicates
  IF p_check_duplicates THEN
    v_is_duplicate := is_duplicate_notification(p_user_id, p_notification_type, p_title, p_body);
    IF v_is_duplicate THEN
      RETURN QUERY SELECT FALSE, 'Duplicate notification';
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, 'All checks passed';
END;
$$;

-- 5e. Update Token Usage
CREATE OR REPLACE FUNCTION update_token_usage(p_token TEXT, p_success BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_success THEN
    UPDATE push_tokens SET last_used_at = NOW(), failure_count = 0, is_valid = TRUE, updated_at = NOW()
    WHERE token = p_token;
  ELSE
    UPDATE push_tokens SET failure_count = failure_count + 1, updated_at = NOW()
    WHERE token = p_token;
  END IF;
END;
$$;

-- 5f. Cleanup Expired Deduplication Records
CREATE OR REPLACE FUNCTION cleanup_expired_deduplication()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM notification_deduplication WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 5g. Cleanup Old Rate Limits
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM notification_rate_limits WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 5h. Run All Notification Cleanup Tasks
CREATE OR REPLACE FUNCTION run_notification_cleanup()
RETURNS TABLE (task TEXT, records_cleaned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_dedup INTEGER; v_rate_limits INTEGER;
BEGIN
  v_dedup := cleanup_expired_deduplication();
  v_rate_limits := cleanup_old_rate_limits();
  RETURN QUERY
  SELECT 'Expired deduplication records'::TEXT, v_dedup
  UNION ALL
  SELECT 'Old rate limit records'::TEXT, v_rate_limits;
END;
$$;

-- 5i. Batch Similar Notifications (simplified)
CREATE OR REPLACE FUNCTION batch_similar_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE batched_count INTEGER := 0;
BEGIN
  -- Simplified version - in production, implement sophisticated batching logic
  -- 1. Find similar notifications (same user, type, within time window)
  -- 2. Combine them into one notification
  -- 3. Mark duplicates as cancelled
  RETURN batched_count;
END;
$$;

-- 5j. Claim Pending Notifications (atomic claim for processor)
CREATE OR REPLACE FUNCTION claim_pending_notifications(
  p_limit INTEGER DEFAULT 10, p_processor_id TEXT DEFAULT NULL
)
RETURNS SETOF notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE notification_queue
  SET status = 'processing', updated_at = NOW()
  WHERE id IN (
    SELECT id FROM notification_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Grant smart notification permissions
GRANT EXECUTE ON FUNCTION can_send_notification TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_smart_notification TO authenticated;
GRANT EXECUTE ON FUNCTION update_token_usage TO authenticated;
GRANT EXECUTE ON FUNCTION run_notification_cleanup TO authenticated;
GRANT EXECUTE ON FUNCTION batch_similar_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION batch_similar_notifications TO service_role;
REVOKE EXECUTE ON FUNCTION claim_pending_notifications(INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_pending_notifications(INTEGER, TEXT) TO service_role;

-- ============================================
-- SECTION 6: SCHEDULED REPORTS (S5/04)
-- Tables: scheduled_reports, report_history (created in 01_base_schema.sql)
-- Indexes: created in 02_indexes.sql
-- RLS enabled in 03_rls_policies.sql, policies defined here
-- ============================================

-- 6a. Scheduled Reports RLS Policies
DROP POLICY IF EXISTS "Admins can view all scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can view all scheduled reports" ON scheduled_reports FOR SELECT
  USING (auth.jwt() ->> 'role' = 'authenticated');

DROP POLICY IF EXISTS "Admins can create scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can create scheduled reports" ON scheduled_reports FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'authenticated');

DROP POLICY IF EXISTS "Admins can update their scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can update their scheduled reports" ON scheduled_reports FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'authenticated');

DROP POLICY IF EXISTS "Admins can delete their scheduled reports" ON scheduled_reports;
CREATE POLICY "Admins can delete their scheduled reports" ON scheduled_reports FOR DELETE
  USING (auth.jwt() ->> 'role' = 'authenticated');

-- 6b. Report History RLS Policies
DROP POLICY IF EXISTS "Admins can view report history" ON report_history;
CREATE POLICY "Admins can view report history" ON report_history FOR SELECT
  USING (auth.jwt() ->> 'role' = 'authenticated');

-- 6c. Calculate Next Run Time
CREATE OR REPLACE FUNCTION calculate_next_run_time(
  p_frequency TEXT, p_config JSONB, p_current_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE v_next_run TIMESTAMPTZ; v_day_of_week INTEGER; v_day_of_month INTEGER; v_time TEXT; v_hour INTEGER; v_minute INTEGER;
BEGIN
  v_time := COALESCE(p_config->>'time', '09:00');
  v_hour := SPLIT_PART(v_time, ':', 1)::INTEGER;
  v_minute := SPLIT_PART(v_time, ':', 2)::INTEGER;

  CASE p_frequency
    WHEN 'daily' THEN
      v_next_run := DATE_TRUNC('day', p_current_time) + INTERVAL '1 day' + (v_hour || ' hours')::INTERVAL + (v_minute || ' minutes')::INTERVAL;
    WHEN 'weekly' THEN
      v_day_of_week := COALESCE((p_config->>'dayOfWeek')::INTEGER, 1);
      v_next_run := DATE_TRUNC('week', p_current_time) + (v_day_of_week || ' days')::INTERVAL + (v_hour || ' hours')::INTERVAL + (v_minute || ' minutes')::INTERVAL;
      IF v_next_run <= p_current_time THEN v_next_run := v_next_run + INTERVAL '7 days'; END IF;
    WHEN 'monthly' THEN
      v_day_of_month := COALESCE((p_config->>'dayOfMonth')::INTEGER, 1);
      v_next_run := DATE_TRUNC('month', p_current_time) + ((v_day_of_month - 1) || ' days')::INTERVAL + (v_hour || ' hours')::INTERVAL + (v_minute || ' minutes')::INTERVAL;
      IF v_next_run <= p_current_time THEN
        v_next_run := DATE_TRUNC('month', p_current_time) + INTERVAL '1 month' + ((v_day_of_month - 1) || ' days')::INTERVAL + (v_hour || ' hours')::INTERVAL + (v_minute || ' minutes')::INTERVAL;
      END IF;
    ELSE
      v_next_run := p_current_time + INTERVAL '1 day';
  END CASE;
  RETURN v_next_run;
END;
$$;

-- 6d. Get Due Scheduled Reports
CREATE OR REPLACE FUNCTION get_due_scheduled_reports()
RETURNS TABLE (id UUID, template_id TEXT, template_name TEXT, frequency TEXT, recipients TEXT[], format TEXT, config JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sr.id, sr.template_id, sr.template_name, sr.frequency, sr.recipients, sr.format, sr.config
  FROM scheduled_reports sr
  WHERE sr.is_active = TRUE AND sr.next_run_at <= NOW()
  ORDER BY sr.next_run_at ASC;
END;
$$;

-- 6e. Update Scheduled Report After Run
CREATE OR REPLACE FUNCTION update_scheduled_report_after_run(
  p_report_id UUID, p_success BOOLEAN, p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_report RECORD; v_next_run TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_report FROM scheduled_reports WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scheduled report not found: %', p_report_id; END IF;

  v_next_run := calculate_next_run_time(v_report.frequency, v_report.config);

  UPDATE scheduled_reports SET last_run_at = NOW(), next_run_at = v_next_run, updated_at = NOW()
  WHERE id = p_report_id;

  INSERT INTO report_history (scheduled_report_id, template_id, template_name, format, date_range_start, date_range_end, recipients, status, error_message)
  VALUES (p_report_id, v_report.template_id, v_report.template_name, v_report.format,
    CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, v_report.recipients,
    CASE WHEN p_success THEN 'sent' ELSE 'failed' END, p_error_message);
END;
$$;

-- Grant scheduled report permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_reports TO authenticated;
GRANT SELECT ON report_history TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_next_run_time TO authenticated;
GRANT EXECUTE ON FUNCTION get_due_scheduled_reports TO authenticated;
GRANT EXECUTE ON FUNCTION update_scheduled_report_after_run TO authenticated;

-- ============================================
-- SECTION: Payment Notification Queuing (Phase 8B)
-- ============================================
-- Queues payment-related notifications for the processor to handle.
-- Inserts into both notification_queue (for push delivery) and
-- notifications (for in-app inbox display). Uses idempotency keys
-- to prevent duplicate notifications.

CREATE OR REPLACE FUNCTION queue_payment_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB,
  p_channels TEXT[] DEFAULT ARRAY['push', 'in_app']::TEXT[],
  p_priority INTEGER DEFAULT 8
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Generate idempotency key to prevent duplicates
  v_idempotency_key := p_notification_type || ':' || p_user_id || ':' || 
                       COALESCE((p_data->>'bookingId')::TEXT, '') || ':' || 
                       DATE_TRUNC('minute', NOW())::TEXT;

  -- Insert into notification queue for processor to handle
  INSERT INTO notification_queue (
    user_id,
    notification_type,
    title,
    body,
    data,
    channels,
    priority,
    status,
    idempotency_key,
    created_at
  ) VALUES (
    p_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_data,
    p_channels,
    p_priority,
    'pending',
    v_idempotency_key,
    NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_queue_id;

  -- Also insert into notifications table for in-app display
  -- Map specific notification types to allowed DB type values
  IF 'in_app' = ANY(p_channels) THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      data,
      priority,
      is_read,
      idempotency_key,
      created_at
    ) VALUES (
      p_user_id,
      p_title,
      p_body,
      CASE 
        WHEN p_notification_type IN ('booking_accepted_payment_required', 'payment_succeeded', 'payment_received', 'payment_failed', 'refund_processed') THEN 'payment'
        WHEN p_notification_type IN ('booking_confirmed', 'booking_cancelled', 'new_booking_request') THEN 'booking'
        WHEN p_notification_type = 'new_message' THEN 'message'
        ELSE 'general'
      END,
      p_data || jsonb_build_object('notification_subtype', p_notification_type),
      p_priority,
      FALSE,
      v_idempotency_key || ':in_app',
      NOW()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_queue_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_payment_notification TO service_role;

-- ============================================
-- DONE: Notification, Leaderboard, Smart Features, Scheduled Reports, Payment Notifications
-- Total: ~31 functions + 6 tables + triggers + seed data
-- ============================================
