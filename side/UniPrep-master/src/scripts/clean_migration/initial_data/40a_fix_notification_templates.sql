-- ============================================================================
-- 40a_fix_notification_templates.sql
-- Prerequisite fix for 40_waitlist_security_improvements.sql
-- ============================================================================
-- Root cause: The original notification_templates table was created for the
-- in-app / push notification system (S7) with columns: name, title, body,
-- channels, category, variables, is_active.
-- The email template columns (template_name, template_type, subject, language)
-- were added to the consolidated clean_migration/01_base_schema.sql but never
-- applied to databases that were bootstrapped from the original pre-migration
-- files. This file adds those missing columns safely before running file 40.
--
-- Also fixes: old schema had name TEXT NOT NULL. Consolidated schema has it
-- nullable. File 40's INSERTs supply template_name but not name, causing:
--   ERROR: 23502: null value in column "name" violates not-null constraint
--
-- Safe to run multiple times (all operations use IF NOT EXISTS / idempotent checks).
-- ============================================================================

-- 0. Drop NOT NULL from 'name' to match consolidated schema
--    (old DB had name TEXT NOT NULL; consolidated schema has it nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notification_templates'
      AND column_name  = 'name'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE notification_templates ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;

-- 1. template_name TEXT UNIQUE — used by file 40 INSERT + ON CONFLICT clause
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notification_templates'
      AND column_name  = 'template_name'
  ) THEN
    ALTER TABLE notification_templates ADD COLUMN template_name TEXT;
    -- Copy existing name -> template_name for any rows created before this fix
    UPDATE notification_templates SET template_name = name WHERE template_name IS NULL AND name IS NOT NULL;
    -- Add unique constraint (only if no duplicates exist)
    ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_template_name_key UNIQUE (template_name);
  END IF;
END $$;

-- 2. template_type TEXT — email / push / in_app / sms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notification_templates'
      AND column_name  = 'template_type'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN template_type TEXT
      CHECK (template_type IN ('email', 'push', 'in_app', 'sms'));
  END IF;
END $$;

-- 3. subject TEXT — email subject line
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notification_templates'
      AND column_name  = 'subject'
  ) THEN
    ALTER TABLE notification_templates ADD COLUMN subject TEXT;
  END IF;
END $$;

-- 4. language TEXT — az / en / ru
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notification_templates'
      AND column_name  = 'language'
  ) THEN
    ALTER TABLE notification_templates
      ADD COLUMN language TEXT
      CHECK (language IN ('az', 'en', 'ru'));
  END IF;
END $$;

-- ============================================================================
-- Done. You can now run 40_waitlist_security_improvements.sql safely.
-- Summary:
--   ✓ notification_templates.name — NOT NULL constraint dropped (if applicable)
--   ✓ template_name TEXT UNIQUE column added
--   ✓ template_type TEXT CHECK column added
--   ✓ subject TEXT column added
--   ✓ language TEXT CHECK column added
-- ============================================================================
