-- ============================================================================
-- 42a_fix_notification_templates_category.sql
-- Prerequisite fix for 42_payment_notification_events.sql
-- ============================================================================
-- Root cause: The original notification_templates table was created with a
-- category CHECK constraint that did NOT include 'payment'.
-- File 42's INSERTs supply category = 'payment', causing:
--   ERROR: 23514: new row for relation "notification_templates" violates
--   check constraint "notification_templates_category_check"
--   DETAIL: Failing row contains (..., payment, ...).
--
-- This file expands the category CHECK constraint to include 'payment'
-- before file 42 runs.
--
-- Safe to run multiple times (idempotent — existing constraint is dropped
-- only if it does not already allow 'payment').
-- ============================================================================

-- Expand (or ensure) the category CHECK constraint on notification_templates
-- to include 'payment' and 'message' in addition to the original values.
--
-- Strategy: drop the old constraint unconditionally (DROP CONSTRAINT IF EXISTS),
-- then re-add it with the full set of valid categories. This is safe because
-- the constraint is purely a validation guard — no data depends on it.
DO $$
BEGIN
  -- Drop the old constraint (pre-payment schema). IF NOT EXISTS prevents errors
  -- on fresh DBs where the constraint already has the right definition.
  ALTER TABLE notification_templates
    DROP CONSTRAINT IF EXISTS notification_templates_category_check;

  -- Recreate with full category list (matches consolidated 01_base_schema.sql)
  ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_category_check
    CHECK (category IN (
      'booking',
      'exam',
      'achievement',
      'reminder',
      'general',
      'announcement',
      'payment',
      'message'
    ));
END $$;

-- ============================================================================
-- Done. You can now run 42_payment_notification_events.sql safely.
-- Summary:
--   ✓ notification_templates_category_check constraint expanded to include
--     'payment' and 'message' (idempotent — old constraint dropped first)
-- ============================================================================
