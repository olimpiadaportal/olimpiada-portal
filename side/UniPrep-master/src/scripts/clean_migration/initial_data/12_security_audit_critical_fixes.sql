-- ============================================================================
-- 12_security_audit_critical_fixes.sql
-- Elmly Database - Security Audit Critical Remediation
-- ============================================================================
-- Purpose: Fix CRITICAL-01, CRITICAL-02, CRITICAL-03, and HIGH-01 findings
-- from the February 2026 security audit.
-- 
-- CRITICAL-01: verify_user_password allows brute-force of any user's password
-- CRITICAL-02: check_email_exists granted to anon (user enumeration)
-- CRITICAL-03: create_student_record/create_teacher_record need auth validation
-- HIGH-01:     create_default_user_settings(UUID) needs auth validation
--
-- IMPORTANT: These functions keep anon grants because the mobile signup flow
-- calls them BEFORE email confirmation (no session = anon role). Security is
-- enforced inside the function body with time-bound validation: the p_user_id
-- must match auth.uid() OR (if auth.uid() is NULL) the user must have been
-- created in auth.users within the last 5 minutes.
--
-- Run order: After all previous initial_data scripts (01-11)
-- Created: February 8, 2026
-- Updated: February 8, 2026 (v2 - fix signup flow compatibility)
-- ============================================================================

-- ============================================================================
-- CRITICAL-01 FIX: Replace verify_user_password
-- 
-- OLD: verify_user_password(user_email TEXT, password_attempt TEXT)
--   -> Any authenticated user could verify ANY user's password by email
--
-- NEW: verify_user_password(password_attempt TEXT)
--   -> Only verifies the CALLING user's own password via auth.uid()
-- ============================================================================

-- Drop the old two-parameter version
DROP FUNCTION IF EXISTS verify_user_password(text, text);

-- Drop the new single-parameter version if it exists (idempotent)
DROP FUNCTION IF EXISTS verify_user_password(text);

-- Create the secure version scoped to auth.uid()
CREATE OR REPLACE FUNCTION verify_user_password(password_attempt text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  stored_password_hash text;
BEGIN
  -- Only look up the currently authenticated user's password
  SELECT encrypted_password
  INTO stored_password_hash
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user or user not found, return false
  IF stored_password_hash IS NULL THEN
    RETURN false;
  END IF;

  -- Verify password using crypt function from extensions schema
  RETURN (stored_password_hash = extensions.crypt(password_attempt, stored_password_hash));
END;
$$;

-- Grant only to authenticated users (not anon)
GRANT EXECUTE ON FUNCTION verify_user_password(text) TO authenticated;

COMMENT ON FUNCTION verify_user_password(text) IS 
'Securely verifies the calling user''s current password using auth.uid(). Used for password change operations. Security audit fix: scoped to own user only.';

-- ============================================================================
-- CRITICAL-02 FIX: Revoke anon access to check_email_exists
--
-- This function queries auth.users and was callable by unauthenticated clients,
-- enabling user enumeration attacks. The mobile app has a fallback that checks
-- the profiles table instead, so this does not break signup.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION check_email_exists(text) FROM anon;

-- ============================================================================
-- CRITICAL-03 FIX: Add time-bound auth validation to create_student_record
-- and create_teacher_record
--
-- These SECURITY DEFINER functions bypass RLS. Previously any anon client
-- could create records for arbitrary UUIDs. Now:
--   1. If auth.uid() is set, p_user_id must match (authenticated path)
--   2. If auth.uid() is NULL (signup before email confirmation), p_user_id
--      must exist in auth.users and have been created within 5 minutes
--
-- Anon grants are KEPT because the mobile signup flow calls these RPCs
-- before the user has confirmed their email (no session = anon role).
-- ============================================================================

-- Recreate create_student_record with time-bound validation
CREATE OR REPLACE FUNCTION public.create_student_record(
  p_user_id UUID,
  p_city TEXT,
  p_target_group TEXT DEFAULT NULL,
  p_target_university TEXT DEFAULT NULL,
  p_graduation_year INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  -- (auth.uid() is NULL when email not yet confirmed, so verify user was just created)
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create record for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  INSERT INTO public.students (
    user_id, city, target_group, target_university, graduation_year
  ) VALUES (
    p_user_id, p_city, p_target_group, p_target_university, p_graduation_year
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    target_group = EXCLUDED.target_group,
    target_university = EXCLUDED.target_university,
    graduation_year = EXCLUDED.graduation_year,
    updated_at = NOW()
  RETURNING id INTO v_student_id;

  RETURN v_student_id;
END;
$$;

-- Drop old 7-param version to avoid ambiguity (p_available_groups was missing)
DROP FUNCTION IF EXISTS public.create_teacher_record(UUID, TEXT, TEXT, TEXT[], INTEGER, DECIMAL, DECIMAL);

-- Recreate create_teacher_record with time-bound validation
CREATE OR REPLACE FUNCTION public.create_teacher_record(
  p_user_id UUID,
  p_city TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_specializations TEXT[] DEFAULT NULL,
  p_experience_years INTEGER DEFAULT NULL,
  p_hourly_rate DECIMAL DEFAULT NULL,
  p_monthly_rate DECIMAL DEFAULT NULL,
  p_available_groups TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create record for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  INSERT INTO public.teachers (
    user_id, city, bio, specializations, experience_years, hourly_rate, monthly_rate, available_groups
  ) VALUES (
    p_user_id, p_city, p_bio, p_specializations, p_experience_years, p_hourly_rate, p_monthly_rate, p_available_groups
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    bio = EXCLUDED.bio,
    specializations = EXCLUDED.specializations,
    experience_years = EXCLUDED.experience_years,
    hourly_rate = EXCLUDED.hourly_rate,
    monthly_rate = EXCLUDED.monthly_rate,
    available_groups = EXCLUDED.available_groups,
    updated_at = NOW()
  RETURNING id INTO v_teacher_id;

  RETURN v_teacher_id;
END;
$$;

-- Ensure anon grants exist (needed for signup flow)
GRANT EXECUTE ON FUNCTION create_student_record TO anon;
GRANT EXECUTE ON FUNCTION create_student_record TO authenticated;
GRANT EXECUTE ON FUNCTION create_teacher_record TO anon;
GRANT EXECUTE ON FUNCTION create_teacher_record TO authenticated;

-- ============================================================================
-- HIGH-01 FIX: Add time-bound auth validation to create_default_user_settings
-- Same pattern as CRITICAL-03: anon grant kept for signup, time-bound check added
-- ============================================================================

-- Recreate with time-bound validation
CREATE OR REPLACE FUNCTION public.create_default_user_settings(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Security: allow if authenticated user matches, OR if called during signup
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create settings for another user';
  END IF;
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND created_at > (NOW() - INTERVAL '5 minutes')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: invalid or expired signup context';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = p_user_id) THEN
    RETURN TRUE;
  END IF;
  INSERT INTO public.user_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN RETURN TRUE;
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating default settings for user %: %', p_user_id, SQLERRM;
    RETURN FALSE;
END;
$$;

-- Ensure anon grant exists (needed for signup flow)
GRANT EXECUTE ON FUNCTION create_default_user_settings(UUID) TO anon;
GRANT EXECUTE ON FUNCTION create_default_user_settings(UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to confirm fixes)
-- ============================================================================
-- 1. Verify verify_user_password now has single-parameter signature:
--    SELECT proname, pronargs FROM pg_proc WHERE proname = 'verify_user_password';
--    Expected: 1 row with pronargs = 1
--
-- 2. Verify check_email_exists anon grant is revoked:
--    SELECT grantee, routine_name FROM information_schema.routine_privileges
--    WHERE routine_name = 'check_email_exists' AND grantee = 'anon';
--    Expected: 0 rows
--
-- 3. Verify signup functions still have anon grants (needed for signup):
--    SELECT grantee, routine_name FROM information_schema.routine_privileges
--    WHERE routine_name IN ('create_student_record', 'create_teacher_record',
--                           'create_default_user_settings')
--    AND grantee = 'anon';
--    Expected: 3 rows (one per function)
--
-- 4. Test verify_user_password works for authenticated user:
--    SELECT verify_user_password('your-actual-password');
--    Expected: true
-- ============================================================================
