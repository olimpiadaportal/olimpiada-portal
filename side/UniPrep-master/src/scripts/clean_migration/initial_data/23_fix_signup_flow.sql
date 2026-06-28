-- ============================================================================
-- HOTFIX 23: Fix Signup Flow Issues
-- Created: February 2026
-- ============================================================================
-- Fixes two signup issues:
--
-- 1. handle_new_user trigger: Changed ON CONFLICT DO NOTHING → DO UPDATE so
--    profile is always up-to-date. Also improved error logging with user ID context.
--
-- 2. create_student_record / create_teacher_record: Added profile upsert guard
--    before inserting into students/teachers. This handles the race condition
--    where the trigger may have silently failed, causing FK violation on
--    students_user_id_fkey_profiles (students.user_id → profiles.id).
--
-- Root cause of FK error:
--   students.user_id has TWO FK constraints:
--     - students_user_id_fkey       → auth.users(id)
--     - students_user_id_fkey_profiles → profiles(id)
--   The trigger's EXCEPTION block was silently swallowing profile INSERT errors,
--   leaving no profiles row. create_student_record then failed the _profiles FK.
--
-- Root cause of email verification "expired":
--   Fixed in mobile app code (supabase.ts / authService.ts) by using a separate
--   non-PKCE Supabase client for signUp. PKCE sends a `code` in email links
--   requiring the original code verifier (stored in mobile AsyncStorage).
--   When user opens link in browser, verifier is missing → exchange fails.
--   Non-PKCE (implicit) flow sends token_hash OTP links instead, which
--   UniPrep-Auth handles correctly via verifyOtp({ token_hash }).
-- ============================================================================

-- ============================================================================
-- FIX 1: Improved handle_new_user trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := CASE
    WHEN NEW.raw_user_meta_data->>'user_type' IN ('student', 'teacher')
    THEN NEW.raw_user_meta_data->>'user_type'
    ELSE 'student'
  END;

  -- Step 1: Create profile record (required for ALL users)
  -- ON CONFLICT DO UPDATE ensures profile is always current even on re-signup
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    v_user_type,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    phone      = COALESCE(EXCLUDED.phone, profiles.phone),
    user_type  = EXCLUDED.user_type,
    updated_at = NOW();

  -- Step 2: Create student record if user_type is 'student'
  IF v_user_type = 'student' THEN
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
  IF v_user_type = 'teacher' THEN
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
    -- Log with full context so the error is visible in Supabase DB logs
    RAISE LOG 'handle_new_user error for user %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX 2: create_student_record - ensure profile exists before insert
-- ============================================================================
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
  v_user_meta JSONB;
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

  -- Ensure profile exists before inserting student (handles trigger race condition).
  -- The handle_new_user trigger should have created it, but if it failed silently
  -- (e.g. RLS timing issue) this guarantees the FK constraint is satisfied.
  SELECT raw_user_meta_data INTO v_user_meta FROM auth.users WHERE id = p_user_id;
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_user_meta->>'full_name', v_user_meta->>'email', p_user_id::TEXT),
    v_user_meta->>'first_name',
    v_user_meta->>'last_name',
    v_user_meta->>'phone',
    'student',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

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

-- ============================================================================
-- FIX 3: create_teacher_record - ensure profile exists before insert
-- ============================================================================
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
  v_user_meta JSONB;
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

  -- Ensure profile exists before inserting teacher (handles trigger race condition).
  SELECT raw_user_meta_data INTO v_user_meta FROM auth.users WHERE id = p_user_id;
  INSERT INTO public.profiles (id, full_name, first_name, last_name, phone, user_type, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_user_meta->>'full_name', v_user_meta->>'email', p_user_id::TEXT),
    v_user_meta->>'first_name',
    v_user_meta->>'last_name',
    v_user_meta->>'phone',
    'teacher',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

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

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') AS trigger_fn_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'create_student_record') AS student_fn_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'create_teacher_record') AS teacher_fn_exists;
-- Expected: true, true, true
