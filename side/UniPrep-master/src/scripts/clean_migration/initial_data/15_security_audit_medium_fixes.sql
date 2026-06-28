-- ============================================================================
-- 15_security_audit_medium_fixes.sql
-- Elmly Database - Security Audit MEDIUM Severity Remediation
-- ============================================================================
-- Purpose: Fix MEDIUM-03, MEDIUM-04, MEDIUM-05, MEDIUM-12 findings from the
-- February 2026 security audit.
--
-- MEDIUM-03:  Profiles publicly readable (anon can see PII)
-- MEDIUM-04:  Students anon SELECT policy
-- MEDIUM-05:  Admin RLS checks use profiles.user_type instead of admins table
-- MEDIUM-12:  handle_new_user() trigger doesn't validate user_type
--
-- Run order: After 14_fix_admin_send_notification.sql
-- Created: February 10, 2026
-- ============================================================================

-- ============================================================================
-- MEDIUM-03 FIX: Restrict profiles SELECT to authenticated users only
--
-- Previously: FOR SELECT USING (true) — any user including anonymous could
-- read all profile data (full_name, email, phone, city, avatar_url).
-- Now: Only authenticated users can view profiles.
-- ============================================================================

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- MEDIUM-04 FIX: Remove anonymous SELECT on students table
--
-- Previously: anon could read all student records.
-- The create_student_record SECURITY DEFINER function handles signup
-- without needing anon SELECT access.
-- ============================================================================

DROP POLICY IF EXISTS "Public can view students" ON students;

-- ============================================================================
-- MEDIUM-05 FIX: Update admin RLS policies to check admins table
--
-- Previously: Many policies checked profiles.user_type = 'admin'
-- Problem: If an admin is deactivated in the admins table but their
-- profiles.user_type still says 'admin', they retain access.
-- Now: All admin policies check admins.is_active = true
--
-- NOTE: All policy operations are wrapped in safe DO blocks that check
-- if the table exists first, so this hotfix works on any database state.
-- ============================================================================

-- Helper: safe policy replacement (skips if table doesn't exist)
CREATE OR REPLACE FUNCTION _temp_safe_replace_policy(
  p_table TEXT,
  p_old_name TEXT,
  p_new_sql TEXT
) RETURNS VOID AS $$
BEGIN
  -- Only proceed if the table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = p_table) THEN
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_old_name, p_table);
    EXECUTE p_new_sql;
  ELSE
    RAISE NOTICE 'Skipping policy on %.% — table does not exist', 'public', p_table;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Questions (only if moderator-restricted versions don't already exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'questions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can insert questions" ON questions';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can update questions" ON questions';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete questions" ON questions';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'Admin/super_admin can insert questions') THEN
      EXECUTE 'CREATE POLICY "Admins can insert questions" ON questions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'Admin/super_admin can update questions') THEN
      EXECUTE 'CREATE POLICY "Admins can update questions" ON questions FOR UPDATE USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'Admin/super_admin can delete questions') THEN
      EXECUTE 'CREATE POLICY "Admins can delete questions" ON questions FOR DELETE USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))';
    END IF;
  END IF;
END $$;

-- Practice Answers
SELECT _temp_safe_replace_policy('practice_answers', 'Admins can view all practice answers',
  'CREATE POLICY "Admins can view all practice answers" ON practice_answers FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Competitive Matches
SELECT _temp_safe_replace_policy('competitive_matches', 'Admins can view all matches',
  'CREATE POLICY "Admins can view all matches" ON competitive_matches FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Leaderboard Settings
SELECT _temp_safe_replace_policy('leaderboard_settings', 'Only admins can update leaderboard settings',
  'CREATE POLICY "Only admins can update leaderboard settings" ON leaderboard_settings FOR UPDATE USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- System Settings
SELECT _temp_safe_replace_policy('system_settings', 'system_settings_admin_all',
  'CREATE POLICY system_settings_admin_all ON system_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)) WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Feature Flags
SELECT _temp_safe_replace_policy('feature_flags', 'feature_flags_admin_all',
  'CREATE POLICY feature_flags_admin_all ON feature_flags FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)) WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Security Policies
SELECT _temp_safe_replace_policy('security_policies', 'security_policies_admin_all',
  'CREATE POLICY security_policies_admin_all ON security_policies FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)) WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Settings History (read)
SELECT _temp_safe_replace_policy('settings_history', 'settings_history_admin_read',
  'CREATE POLICY settings_history_admin_read ON settings_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Settings Audit Log
SELECT _temp_safe_replace_policy('settings_audit_log', 'settings_audit_log_admin_read',
  'CREATE POLICY settings_audit_log_admin_read ON settings_audit_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('settings_audit_log', 'settings_audit_log_admin_insert',
  'CREATE POLICY settings_audit_log_admin_insert ON settings_audit_log FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Admin Notifications
SELECT _temp_safe_replace_policy('admin_notifications', 'Admins can view all notifications',
  'CREATE POLICY "Admins can view all notifications" ON admin_notifications FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('admin_notifications', 'Admins can create notifications',
  'CREATE POLICY "Admins can create notifications" ON admin_notifications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('admin_notifications', 'Admins can update notifications',
  'CREATE POLICY "Admins can update notifications" ON admin_notifications FOR UPDATE USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('admin_notifications', 'Admins can delete draft notifications',
  'CREATE POLICY "Admins can delete draft notifications" ON admin_notifications FOR DELETE USING (status = ''draft'' AND EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Templates
SELECT _temp_safe_replace_policy('notification_templates', 'Admins can view all templates',
  'CREATE POLICY "Admins can view all templates" ON notification_templates FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('notification_templates', 'Admins can manage templates',
  'CREATE POLICY "Admins can manage templates" ON notification_templates FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Recipients
SELECT _temp_safe_replace_policy('notification_recipients', 'Admins can view all recipients',
  'CREATE POLICY "Admins can view all recipients" ON notification_recipients FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('notification_recipients', 'System can manage recipients',
  'CREATE POLICY "System can manage recipients" ON notification_recipients FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Queue
SELECT _temp_safe_replace_policy('notification_queue', 'Admins can view all queued notifications',
  'CREATE POLICY "Admins can view all queued notifications" ON notification_queue FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('notification_queue', 'System can manage notification queue',
  'CREATE POLICY "System can manage notification queue" ON notification_queue FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Events
SELECT _temp_safe_replace_policy('notification_events', 'Admins can manage notification events',
  'CREATE POLICY "Admins can manage notification events" ON notification_events FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- User Notification Settings (admin view)
SELECT _temp_safe_replace_policy('user_notification_settings', 'Admins can view all notification settings',
  'CREATE POLICY "Admins can view all notification settings" ON user_notification_settings FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Analytics (admin view)
SELECT _temp_safe_replace_policy('notification_analytics', 'Admins can view all analytics',
  'CREATE POLICY "Admins can view all analytics" ON notification_analytics FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Failures
SELECT _temp_safe_replace_policy('notification_failures', 'Admins can view all failures',
  'CREATE POLICY "Admins can view all failures" ON notification_failures FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');
SELECT _temp_safe_replace_policy('notification_failures', 'System can manage failures',
  'CREATE POLICY "System can manage failures" ON notification_failures FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Rate Limits
SELECT _temp_safe_replace_policy('notification_rate_limits', 'Admins can manage rate limits',
  'CREATE POLICY "Admins can manage rate limits" ON notification_rate_limits FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Deduplication
SELECT _temp_safe_replace_policy('notification_deduplication', 'Admins can manage deduplication',
  'CREATE POLICY "Admins can manage deduplication" ON notification_deduplication FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Notification Performance Snapshots (admin view)
SELECT _temp_safe_replace_policy('notification_performance_snapshots', 'Admins can view performance snapshots',
  'CREATE POLICY "Admins can view performance snapshots" ON notification_performance_snapshots FOR SELECT USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))');

-- Clean up helper function
DROP FUNCTION IF EXISTS _temp_safe_replace_policy(TEXT, TEXT, TEXT);

-- ============================================================================
-- MEDIUM-12 FIX: Validate user_type in handle_new_user() trigger
--
-- Previously: COALESCE(NEW.raw_user_meta_data->>'user_type', 'student')
-- An attacker could set user_type = 'admin' during signup.
-- Now: Only 'student' or 'teacher' are allowed; everything else defaults to 'student'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Step 1: Create profile record (required for ALL users)
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    CASE
      WHEN NEW.raw_user_meta_data->>'user_type' IN ('student', 'teacher')
      THEN NEW.raw_user_meta_data->>'user_type'
      ELSE 'student'
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Step 2: Create student record if user_type is 'student'
  IF COALESCE(NEW.raw_user_meta_data->>'user_type', 'student') = 'student' THEN
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
  IF NEW.raw_user_meta_data->>'user_type' = 'teacher' THEN
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
    RAISE LOG 'handle_new_user error: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to confirm fixes)
-- ============================================================================
-- 1. Verify profiles policy changed:
--    SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT';
--    Expected: "Profiles are viewable by authenticated users" with roles = {authenticated}
--
-- 2. Verify students anon policy removed:
--    SELECT policyname, roles FROM pg_policies WHERE tablename = 'students' AND 'anon' = ANY(roles);
--    Expected: 0 rows
--
-- 3. Verify admin policies use admins table (spot check):
--    SELECT policyname, qual FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'system_settings_admin_all';
--    Expected: qual should reference 'admins' not 'profiles'
--
-- 4. Verify handle_new_user validates user_type:
--    SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--    Expected: Should contain "IN ('student', 'teacher')" check
--
