-- ============================================================================
-- 14_fix_admin_send_notification.sql
-- Elmly Database - Upgrade admin_send_notification to latest version
-- ============================================================================
-- Purpose: The clean migration had the original 7-param version of
-- admin_send_notification, but the compose route calls the 9-param version
-- (with p_notification_type + p_data) from sql_STAGE_7/05_add_notification_data_column.sql.
--
-- This hotfix:
-- 1. Adds missing 'metadata' column to admin_notifications
-- 2. Adds missing 'data' column to notifications
-- 3. Creates process_notification_variables helper function
-- 4. Replaces admin_send_notification with the latest 9-param version
--    (variable substitution, delivery tracking, notification type, data)
--
-- Run order: After 13_security_audit_high_fixes.sql
-- ============================================================================

-- 1. Add metadata column to admin_notifications if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE admin_notifications ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- 2. Add data column to notifications if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'data'
  ) THEN
    ALTER TABLE notifications ADD COLUMN data JSONB DEFAULT '{}';
  END IF;
END $$;

COMMENT ON COLUMN notifications.data IS 'Additional data: action_url, deep_link, etc.';

-- 3. Drop old function versions to avoid signature conflicts
DROP FUNCTION IF EXISTS admin_send_notification(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS admin_send_notification(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS admin_send_notification(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB, TIMESTAMPTZ, TEXT, JSONB);

-- 4. Create process_notification_variables helper
CREATE OR REPLACE FUNCTION process_notification_variables(
  p_text TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT := p_text;
  v_user_record RECORD;
  v_first_name TEXT;
  v_email_masked TEXT;
BEGIN
  SELECT
    p.full_name,
    au.email,
    s.target_group,
    s.city
  INTO v_user_record
  FROM profiles p
  LEFT JOIN students s ON s.user_id = p.id
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.id = p_user_id;

  v_first_name := COALESCE(
    SPLIT_PART(v_user_record.full_name, ' ', 1),
    'User'
  );

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

COMMENT ON FUNCTION process_notification_variables IS 'Replaces template variables ({{user_name}}, {{first_name}}, etc.) with actual user data';

-- 5. Create latest admin_send_notification (9 params)
CREATE OR REPLACE FUNCTION admin_send_notification(
  p_admin_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_channels TEXT[] DEFAULT ARRAY['in_app'],
  p_target_type TEXT DEFAULT 'all',
  p_target_filter JSONB DEFAULT '{}',
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_notification_type TEXT DEFAULT 'general',
  p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_user_record RECORD;
  v_channel TEXT;
  v_recipient_count INTEGER := 0;
  v_delivered_count INTEGER := 0;
  v_valid_type TEXT;
  v_processed_title TEXT;
  v_processed_body TEXT;
BEGIN
  -- Validate notification type
  v_valid_type := CASE
    WHEN p_notification_type IN ('exam', 'booking', 'achievement', 'reminder', 'general', 'announcement')
    THEN p_notification_type
    ELSE 'general'
  END;

  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Create notification record
  INSERT INTO admin_notifications (
    admin_id, title, body, channels, target_type, target_filter,
    scheduled_at, status, metadata
  ) VALUES (
    p_admin_id, p_title, p_body, p_channels, p_target_type, p_target_filter,
    p_scheduled_at,
    CASE WHEN p_scheduled_at IS NOT NULL THEN 'scheduled' ELSE 'sending' END,
    p_data
  )
  RETURNING id INTO v_notification_id;

  -- If scheduled for later, just return the ID
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() THEN
    RETURN v_notification_id;
  END IF;

  -- Create recipient records based on target type
  FOR v_user_record IN (
    SELECT p.id as user_id
    FROM profiles p
    LEFT JOIN students s ON s.user_id = p.id AND p.user_type = 'student'
    WHERE
      CASE p_target_type
        WHEN 'all' THEN p.user_type IN ('student', 'teacher')
        WHEN 'students' THEN p.user_type = 'student'
        WHEN 'teachers' THEN p.user_type = 'teacher'
        WHEN 'target_group' THEN p.user_type = 'student' AND s.target_group = p_target_filter->>'target_group'
        WHEN 'individual' THEN p.id = ANY(
          SELECT jsonb_array_elements_text(p_target_filter->'user_ids')::UUID
        )
        ELSE FALSE
      END
  ) LOOP
    v_recipient_count := v_recipient_count + 1;

    -- Process variable substitution for this user
    v_processed_title := process_notification_variables(p_title, v_user_record.user_id);
    v_processed_body := process_notification_variables(p_body, v_user_record.user_id);

    -- Create recipient records for each channel
    FOREACH v_channel IN ARRAY p_channels LOOP
      INSERT INTO notification_recipients (
        notification_id, user_id, channel, status, sent_at, delivered_at
      ) VALUES (
        v_notification_id, v_user_record.user_id, v_channel,
        CASE WHEN v_channel = 'in_app' THEN 'delivered' ELSE 'sent' END,
        NOW(),
        CASE WHEN v_channel = 'in_app' THEN NOW() ELSE NULL END
      );

      IF v_channel = 'in_app' THEN
        v_delivered_count := v_delivered_count + 1;
      END IF;
    END LOOP;

    -- Create in-app notification with processed title/body and data
    IF 'in_app' = ANY(p_channels) THEN
      INSERT INTO notifications (user_id, title, body, type, is_read, data)
      VALUES (v_user_record.user_id, v_processed_title, v_processed_body, v_valid_type, FALSE, p_data);
    END IF;
  END LOOP;

  -- Update notification stats
  UPDATE admin_notifications
  SET
    total_recipients = v_recipient_count,
    delivered_count = v_delivered_count,
    status = 'sent',
    sent_at = NOW()
  WHERE id = v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_send_notification(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_notification_variables(TEXT, UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run: SELECT proname, pronargs FROM pg_proc WHERE proname = 'admin_send_notification';
-- Expected: admin_send_notification with 9 args
--
-- Run: SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'admin_notifications' AND column_name = 'metadata';
-- Expected: 1 row
--
-- Run: SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'notifications' AND column_name = 'data';
-- Expected: 1 row
