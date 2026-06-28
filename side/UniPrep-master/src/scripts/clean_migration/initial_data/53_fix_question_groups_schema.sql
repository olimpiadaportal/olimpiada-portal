-- ===========================================================================
-- Hotfix 53: Fix question_groups schema
-- ===========================================================================
-- PROBLEM:
--   The question_groups table was created with an early placeholder schema:
--     title (NOT NULL), description, passage_text, passage_image_url, question_type
--
--   The TypeScript service (questionGroupService.ts) was written against a
--   different, expanded schema and tries to INSERT:
--     subject_id, topic, context_text, context_image_url, difficulty,
--     tags, source, year, created_by
--
--   This caused: "Could not find the 'context_image_url' column of
--   'question_groups' in the schema cache" (400 error on group upload).
--
-- FIX:
--   1. Make `title` nullable (TS never provides it; it was NOT NULL)
--   2. Add all missing columns with IF NOT EXISTS guards (idempotent / safe)
--   3. Old columns (passage_text, passage_image_url, description, question_type)
--      are kept for backward compatibility — they are simply unused by TS code.
--
-- SAFE TO RUN: on any DB state (empty or with existing rows).
-- Backported to: 01_base_schema.sql (question_groups CREATE TABLE block).
-- ===========================================================================

-- Step 1: Relax `title` — TS never provides this field
ALTER TABLE question_groups ALTER COLUMN title SET DEFAULT '';
ALTER TABLE question_groups ALTER COLUMN title DROP NOT NULL;

-- Step 2: Add all columns expected by questionGroupService.ts
ALTER TABLE question_groups
  ADD COLUMN IF NOT EXISTS topic              TEXT,
  ADD COLUMN IF NOT EXISTS context_text      TEXT,
  ADD COLUMN IF NOT EXISTS context_image_url TEXT,
  ADD COLUMN IF NOT EXISTS difficulty        TEXT DEFAULT 'medium'
    CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS tags              TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source            TEXT,
  ADD COLUMN IF NOT EXISTS year              INTEGER
    CHECK (year IS NULL OR (year >= 1990 AND year <= 2100)),
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS exclude_from_practice BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by        UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 3: Refresh the PostgREST schema cache so the new columns are visible
-- (Supabase does this automatically, but sending NOTIFY is a safe no-op)
NOTIFY pgrst, 'reload schema';

-- Verification
DO $$
DECLARE
  col_count  INTEGER;
  col_names  TEXT;
BEGIN
  SELECT COUNT(*), string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO col_count, col_names
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'question_groups';

  RAISE NOTICE 'question_groups now has % columns: %', col_count, col_names;

  -- Assert the critical columns now exist
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'question_groups'
            AND column_name IN ('context_text','context_image_url','difficulty',
                                'is_active','tags','source','year','created_by',
                                'topic','exclude_from_practice')) = 10,
    'ERROR: One or more required columns are still missing from question_groups!';

  RAISE NOTICE 'All required columns present — hotfix 53 applied successfully.';
END $$;