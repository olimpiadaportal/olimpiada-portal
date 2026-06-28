-- ============================================================================
-- 37_forum_bookmarks_hotfix.sql
-- Hotfix for forum_bookmarks RLS policies
-- Run this if you're getting 406 errors on forum_bookmarks
-- ============================================================================
-- Applied: March 2026
-- Updated: March 8, 2026 - Added FORCE RLS and explicit grants
-- Purpose: Fix 406 (Not Acceptable) error when saving/bookmarking questions
-- Root cause: RLS policies may not be properly configured for authenticated users
-- ============================================================================

-- Step 1: Ensure the table exists with correct structure
CREATE TABLE IF NOT EXISTS forum_bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES forum_questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, question_id)
);

-- Step 2: Enable RLS (FORCE ensures even table owner must follow policies)
ALTER TABLE forum_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_bookmarks FORCE ROW LEVEL SECURITY;

-- Step 3: Drop ALL existing policies to ensure clean state
DROP POLICY IF EXISTS "Users can view own bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Users can create bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Anyone can view bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "forum_bookmarks_select_policy" ON forum_bookmarks;
DROP POLICY IF EXISTS "forum_bookmarks_insert_policy" ON forum_bookmarks;
DROP POLICY IF EXISTS "forum_bookmarks_delete_policy" ON forum_bookmarks;

-- Step 4: Recreate policies with proper permissions
CREATE POLICY "Users can view own bookmarks"
    ON forum_bookmarks FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create bookmarks"
    ON forum_bookmarks FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks"
    ON forum_bookmarks FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Step 5: Revoke all and re-grant to ensure clean permissions
REVOKE ALL ON forum_bookmarks FROM anon;
REVOKE ALL ON forum_bookmarks FROM authenticated;

GRANT SELECT, INSERT, DELETE ON forum_bookmarks TO authenticated;
GRANT ALL ON forum_bookmarks TO service_role;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user ON forum_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_question ON forum_bookmarks(question_id);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user_question ON forum_bookmarks(user_id, question_id);

-- ============================================================================
-- Verify the fix - Run these queries to check:
-- ============================================================================
-- 1. Check RLS is enabled:
-- SELECT relname, relrowsecurity, relforcerowsecurity 
-- FROM pg_class WHERE relname = 'forum_bookmarks';
-- Expected: relrowsecurity = true, relforcerowsecurity = true

-- 2. Check policies exist:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'forum_bookmarks';
-- Expected: 3 policies (SELECT, INSERT, DELETE) for {authenticated}

-- 3. Check grants:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges 
-- WHERE table_name = 'forum_bookmarks';
-- Expected: authenticated has SELECT, INSERT, DELETE
-- ============================================================================
