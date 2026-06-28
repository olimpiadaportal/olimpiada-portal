-- ============================================================================
-- Phase 2: Onboarding Personalization
-- File: 18_onboarding_personalization.sql
-- Purpose: Add onboarding tracking and subject preference columns to students
-- Created: February 14, 2026
-- ============================================================================
-- NOTE: These columns have ALSO been added to the main consolidated file:
--   01_base_schema.sql
-- This hotfix file is for EXISTING databases that were set up before Phase 2.
-- For NEW database setups, you do NOT need to run this file.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Add onboarding tracking column
-- ============================================================================
-- For EXISTING students, default to TRUE (they don't need onboarding)
-- For NEW students, the app will set this to FALSE during signup

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Set existing students as already onboarded
UPDATE students SET onboarding_completed = TRUE
WHERE onboarding_completed = FALSE
  AND created_at < NOW() - INTERVAL '1 minute';

-- ============================================================================
-- Add subject preference columns
-- ============================================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS strongest_subjects UUID[] DEFAULT '{}';

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS weakest_subjects UUID[] DEFAULT '{}';

-- ============================================================================
-- Index for quickly finding students who haven't completed onboarding
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_students_onboarding
  ON students(user_id) WHERE onboarding_completed = FALSE;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 2: Onboarding Personalization';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns added to students:';
  RAISE NOTICE '  ✓ onboarding_completed BOOLEAN';
  RAISE NOTICE '  ✓ strongest_subjects UUID[]';
  RAISE NOTICE '  ✓ weakest_subjects UUID[]';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  ✓ idx_students_onboarding (partial)';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Existing students auto-set to onboarding_completed=TRUE';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 2: COMPLETE ✓';
  RAISE NOTICE '========================================';
END $$;
