-- ============================================================================
-- Fix Duplicate Foreign Key Constraints
-- File: 22_fix_duplicate_fk_constraints.sql
-- Purpose: Remove duplicate FK constraints that cause PGRST201 errors
-- Created: February 16, 2026
-- ============================================================================
-- The original database has duplicate foreign key constraints:
--   - students_user_id_fkey AND students_user_id_fkey_profiles
--   - teachers_user_id_fkey AND teachers_user_id_fkey_profiles
-- 
-- This causes PostgREST to fail with PGRST201 error:
--   "Could not embed because more than one relationship was found"
--
-- Solution: Remove the duplicate *_profiles constraints, keeping the original ones.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Remove duplicate students FK constraint
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'students_user_id_fkey_profiles'
    AND table_name = 'students'
  ) THEN
    ALTER TABLE students DROP CONSTRAINT students_user_id_fkey_profiles;
    RAISE NOTICE 'Dropped duplicate constraint: students_user_id_fkey_profiles';
  ELSE
    RAISE NOTICE 'Constraint students_user_id_fkey_profiles does not exist (already clean)';
  END IF;
END $$;

-- ============================================================================
-- Remove duplicate teachers FK constraint
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'teachers_user_id_fkey_profiles'
    AND table_name = 'teachers'
  ) THEN
    ALTER TABLE teachers DROP CONSTRAINT teachers_user_id_fkey_profiles;
    RAISE NOTICE 'Dropped duplicate constraint: teachers_user_id_fkey_profiles';
  ELSE
    RAISE NOTICE 'Constraint teachers_user_id_fkey_profiles does not exist (already clean)';
  END IF;
END $$;

-- ============================================================================
-- Verify the fix
-- ============================================================================
DO $$
DECLARE
  student_fk_count INTEGER;
  teacher_fk_count INTEGER;
BEGIN
  -- Count FK constraints for students.user_id
  SELECT COUNT(*) INTO student_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'students' 
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id';
    
  -- Count FK constraints for teachers.user_id
  SELECT COUNT(*) INTO teacher_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'teachers' 
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id';

  RAISE NOTICE 'students.user_id FK count: % (should be 1)', student_fk_count;
  RAISE NOTICE 'teachers.user_id FK count: % (should be 1)', teacher_fk_count;
  
  IF student_fk_count > 1 THEN
    RAISE WARNING 'students table still has multiple FK constraints on user_id!';
  END IF;
  
  IF teacher_fk_count > 1 THEN
    RAISE WARNING 'teachers table still has multiple FK constraints on user_id!';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- IMPORTANT: After running this migration, the app code has also been updated
-- to use explicit relationship hints in queries:
--   - profiles!teachers_user_id_fkey (for teachers)
--   - profiles!students_user_id_fkey (for students)
-- 
-- This ensures compatibility with both:
--   1. Original databases (after running this migration)
--   2. Clean migration databases (which never had duplicates)
-- ============================================================================
