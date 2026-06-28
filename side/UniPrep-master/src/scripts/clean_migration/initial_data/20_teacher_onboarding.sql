-- ============================================================================
-- Phase 2B: Teacher Onboarding Personalization
-- File: 20_teacher_onboarding.sql
-- Purpose: Add onboarding tracking column to teachers table
-- Created: February 15, 2026
-- ============================================================================
-- NOTE: The teachers table already has specializations, experience_years,
--   available_groups, hourly_rate, monthly_rate, and bio columns.
--   This migration only adds the onboarding_completed tracking column.
-- For EXISTING databases, run this file to add the column.
-- For NEW database setups, the column is also added to 01_base_schema.sql.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Add onboarding tracking column to teachers
-- ============================================================================
-- For EXISTING teachers, default to TRUE (they already filled in their data)
-- For NEW teachers, the app will check if specializations are empty

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Set existing teachers as already onboarded (they filled data during old signup flow)
UPDATE teachers SET onboarding_completed = TRUE
WHERE onboarding_completed = FALSE
  AND created_at < NOW() - INTERVAL '1 minute';

-- ============================================================================
-- Index for quickly finding teachers who haven't completed onboarding
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_teachers_onboarding
  ON teachers(user_id) WHERE onboarding_completed = FALSE;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 2B: Teacher Onboarding';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns added to teachers:';
  RAISE NOTICE '  ✓ onboarding_completed BOOLEAN';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  ✓ idx_teachers_onboarding (partial)';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Existing teachers auto-set to onboarding_completed=TRUE';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 2B: COMPLETE ✓';
  RAISE NOTICE '========================================';
END $$;
