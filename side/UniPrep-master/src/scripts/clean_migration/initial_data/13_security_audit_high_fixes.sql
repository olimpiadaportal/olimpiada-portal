-- ============================================================================
-- 13_security_audit_high_fixes.sql
-- Elmly Database - Security Audit HIGH Severity Remediation
-- ============================================================================
-- Purpose: Fix HIGH-03, HIGH-04, HIGH-05 findings from the February 2026
-- security audit.
--
-- HIGH-03:  push_tokens RLS blocks token registration during signup
-- HIGH-04:  settings_history unrestricted INSERT — restrict to admin
-- HIGH-05:  notification_analytics + snapshots unrestricted INSERT — restrict
--
-- Run order: After 12_security_audit_critical_fixes.sql
-- Created: February 9, 2026
-- ============================================================================

-- ============================================================================
-- HIGH-03 FIX: Add upsert_push_token to clean migration with time-bound auth
--
-- The push_tokens RLS policy requires user_id = auth.uid(), which fails
-- during signup when the user has no session yet. The upsert_push_token
-- SECURITY DEFINER function bypasses RLS but was only granted to
-- authenticated. We add time-bound validation (same pattern as
-- create_student_record) and grant to both authenticated and anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_user_id UUID,
  p_token TEXT,
  p_platform TEXT DEFAULT 'unknown',
  p_device_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'User ID and token cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot register token for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  -- Upsert the push token
  INSERT INTO public.push_tokens (
    user_id, token, platform, device_name, updated_at
  ) VALUES (
    p_user_id, p_token, p_platform, p_device_name, NOW()
  )
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error upserting push token for user %: %', p_user_id, SQLERRM;
    RETURN FALSE;
END;
$$;

-- Grant to both authenticated and anon (needed for signup flow)
GRANT EXECUTE ON FUNCTION public.upsert_push_token(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_push_token(UUID, TEXT, TEXT, TEXT) TO anon;

COMMENT ON FUNCTION public.upsert_push_token(UUID, TEXT, TEXT, TEXT) IS
'Securely upserts a push notification token. Uses time-bound validation for anon callers (signup flow). Security audit HIGH-03 fix.';

-- ============================================================================
-- HIGH-04 FIX: Restrict settings_history INSERT to admin users only
--
-- Previously: WITH CHECK (TRUE) — any authenticated user could insert
-- Now: Only active admins can insert settings history records
-- ============================================================================

DROP POLICY IF EXISTS settings_history_system_insert ON settings_history;

CREATE POLICY settings_history_admin_insert ON settings_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- ============================================================================
-- HIGH-05 FIX: Restrict notification_analytics and
-- notification_performance_snapshots INSERT to admin users only
--
-- Previously: WITH CHECK (TRUE) — any authenticated user could insert
-- Now: Only active admins can insert analytics/snapshot records
-- ============================================================================

-- Fix notification_analytics
DROP POLICY IF EXISTS "System can insert analytics" ON notification_analytics;

CREATE POLICY "Admin can insert analytics"
  ON notification_analytics FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Fix notification_performance_snapshots
DROP POLICY IF EXISTS "System can insert performance snapshots" ON notification_performance_snapshots;

CREATE POLICY "Admin can insert performance snapshots"
  ON notification_performance_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- ============================================================================
-- VERIFICATION QUERIES (run manually to confirm fixes)
-- ============================================================================
-- 1. Verify upsert_push_token has anon grant:
--    SELECT grantee, routine_name FROM information_schema.routine_privileges
--    WHERE routine_name = 'upsert_push_token';
--    Expected: rows for both 'anon' and 'authenticated'
--
-- 2. Verify settings_history policy changed:
--    SELECT policyname, cmd, qual, with_check FROM pg_policies
--    WHERE tablename = 'settings_history' AND cmd = 'INSERT';
--    Expected: settings_history_admin_insert with admins check
--
-- 3. Verify notification_analytics policy changed:
--    SELECT policyname, cmd, with_check FROM pg_policies
--    WHERE tablename = 'notification_analytics' AND cmd = 'INSERT';
--    Expected: "Admin can insert analytics" with admins check
--
-- 4. Verify notification_performance_snapshots policy changed:
--    SELECT policyname, cmd, with_check FROM pg_policies
--    WHERE tablename = 'notification_performance_snapshots' AND cmd = 'INSERT';
--    Expected: "Admin can insert performance snapshots" with admins check
-- ============================================================================
