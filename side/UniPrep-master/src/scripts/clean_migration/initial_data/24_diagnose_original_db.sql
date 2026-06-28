-- ============================================================================
-- DIAGNOSTIC 24: Investigate original DB email verification issue
-- Run this in the ORIGINAL DB Supabase SQL Editor
-- ============================================================================
-- This script checks everything that could cause "link expired" despite
-- identical email templates. Compare results with consolidated DB.
-- ============================================================================

-- ============================================================================
-- CHECK 1: Verify handle_new_user trigger is the FIXED version
-- (should NOT have RAISE EXCEPTION, only RAISE LOG)
-- ============================================================================
SELECT 
  'handle_new_user function body' AS check_name,
  prosrc LIKE '%RAISE EXCEPTION%' AS has_raise_exception,  -- Should be FALSE
  prosrc LIKE '%RAISE LOG%' AS has_raise_log,              -- Should be TRUE
  prosrc LIKE '%ON CONFLICT (id) DO UPDATE%' AS has_upsert -- Should be TRUE
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- ============================================================================
-- CHECK 2: Verify the trigger exists and fires AFTER INSERT
-- ============================================================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- ============================================================================
-- CHECK 3: Check if profiles table uses TEXT or ENUM for user_type
-- (ENUM type can cause silent failures if value doesn't match exactly)
-- ============================================================================
SELECT 
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name = 'user_type';

-- ============================================================================
-- CHECK 4: Check if profiles table has first_name / last_name columns
-- (Missing columns cause trigger INSERT to fail → profile not created)
-- ============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- ============================================================================
-- CHECK 5: Check students table FK constraints
-- (Both FKs must exist for create_student_record to work)
-- ============================================================================
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('students', 'teachers')
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- CHECK 6: Check RLS policies on profiles table
-- (Missing INSERT policy for anon/authenticated can block trigger)
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- ============================================================================
-- CHECK 7: Check RLS policies on students table
-- (anon INSERT policy needed during signup before email confirmation)
-- ============================================================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'students'
ORDER BY cmd, policyname;

-- ============================================================================
-- CHECK 8: Check if there are any recent failed auth.users insertions
-- (Look for users created but with no corresponding profile)
-- ============================================================================
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.email_confirmed_at,
  au.raw_user_meta_data->>'user_type' AS user_type,
  p.id IS NOT NULL AS has_profile,
  s.id IS NOT NULL AS has_student_record
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
LEFT JOIN public.students s ON s.user_id = au.id
ORDER BY au.created_at DESC
LIMIT 10;

-- ============================================================================
-- CHECK 9: Check create_student_record function signature
-- (Must accept p_available_groups parameter)
-- ============================================================================
SELECT 
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('create_student_record', 'create_teacher_record')
ORDER BY proname;

-- ============================================================================
-- CHECK 10: Check GRANTS on RPC functions
-- (anon role must have EXECUTE permission during signup)
-- ============================================================================
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name IN ('create_student_record', 'create_teacher_record', 'handle_new_user')
ORDER BY routine_name, grantee;

-- ============================================================================
-- SUMMARY: What to look for
-- ============================================================================
-- CHECK 1: has_raise_exception should be FALSE, has_upsert should be TRUE
-- CHECK 2: trigger should exist, AFTER INSERT, FOR EACH ROW
-- CHECK 3: user_type data_type should be 'text' (NOT 'USER-DEFINED' enum)
-- CHECK 4: profiles should have first_name, last_name columns
-- CHECK 5: students should have BOTH auth.users FK AND profiles FK
-- CHECK 6: profiles should have INSERT policy for authenticated (trigger uses SECURITY DEFINER so RLS bypassed, but check anyway)
-- CHECK 7: students should have INSERT policy for anon role
-- CHECK 8: Recent users should all have has_profile=true, has_student_record=true
-- CHECK 9: create_teacher_record should have p_available_groups parameter
-- CHECK 10: anon role should have EXECUTE on create_student_record / create_teacher_record
-- ============================================================================
