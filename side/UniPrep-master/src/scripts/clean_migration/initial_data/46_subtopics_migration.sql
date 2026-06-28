-- ============================================================================
-- 46_subtopics_migration.sql
-- Elmly — Subtopics Layer Migration (hotfix for existing databases)
-- ============================================================================
-- Purpose:  Introduce the Subjects → Topics → Subtopics → Questions hierarchy.
--           Safe to run on any DB that has already applied hotfixes 01–45.
--           All operations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so
--           re-running this file is idempotent.
-- Date:     2026-04-03
-- Stage:    1 of SUBTOPICS_MIGRATION_PLAN.md
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create subject_subtopics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS subject_subtopics (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id         UUID        NOT NULL REFERENCES subject_topics(id) ON DELETE CASCADE,
  subject_id       UUID        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  subtopic_name    TEXT        NOT NULL,
  description      TEXT,
  difficulty_level TEXT        CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  display_order    INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic_id, subtopic_name)
);

-- ============================================================================
-- STEP 2: Add subtopic_id FK column to questions (nullable, backward-safe)
-- ============================================================================

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subtopic_id UUID REFERENCES subject_subtopics(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 3: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subject_subtopics_topic_id   ON subject_subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subject_subtopics_subject_id ON subject_subtopics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_subtopics_active     ON subject_subtopics(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_subtopic_id        ON questions(subtopic_id);

-- ============================================================================
-- STEP 4: Row Level Security
-- ============================================================================

ALTER TABLE subject_subtopics ENABLE ROW LEVEL SECURITY;

-- Public read (active subtopics only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subject_subtopics'
      AND policyname = 'Anyone can view active subject subtopics'
  ) THEN
    CREATE POLICY "Anyone can view active subject subtopics"
      ON subject_subtopics FOR SELECT USING (is_active = true);
  END IF;
END$$;

-- Admin write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subject_subtopics'
      AND policyname = 'Admin/super_admin can insert subject_subtopics'
  ) THEN
    CREATE POLICY "Admin/super_admin can insert subject_subtopics" ON subject_subtopics
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subject_subtopics'
      AND policyname = 'Admin/super_admin can update subject_subtopics'
  ) THEN
    CREATE POLICY "Admin/super_admin can update subject_subtopics" ON subject_subtopics
      FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subject_subtopics'
      AND policyname = 'Admin/super_admin can delete subject_subtopics'
  ) THEN
    CREATE POLICY "Admin/super_admin can delete subject_subtopics" ON subject_subtopics
      FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
      );
  END IF;
END$$;

-- ============================================================================
-- STEP 5: Update get_topics_by_subject to include subtopic_count
-- ============================================================================

-- Must DROP first — PostgreSQL forbids CREATE OR REPLACE when the return type changes
DROP FUNCTION IF EXISTS get_topics_by_subject(UUID);

CREATE OR REPLACE FUNCTION get_topics_by_subject(p_subject_id UUID)
RETURNS TABLE (
  id UUID, subject_id UUID, topic_name TEXT, topic_name_az TEXT, topic_name_ru TEXT,
  description TEXT, difficulty_level TEXT, display_order INTEGER, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, question_count BIGINT, subtopic_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id, st.subject_id, st.topic_name,
    st.topic_name AS topic_name_az, st.topic_name AS topic_name_ru,
    st.description, st.difficulty_level, st.display_order, st.is_active,
    st.created_at, st.updated_at,
    (SELECT COUNT(*) FROM questions q WHERE q.subject_id = st.subject_id AND q.topic = st.topic_name)::BIGINT AS question_count,
    (SELECT COUNT(*) FROM subject_subtopics ss WHERE ss.topic_id = st.id)::BIGINT AS subtopic_count
  FROM subject_topics st
  WHERE st.subject_id = p_subject_id
  ORDER BY st.display_order, st.topic_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_topics_by_subject TO authenticated;

-- ============================================================================
-- STEP 6: Update admin_delete_topic to block deletion when subtopics exist
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_delete_topic(p_topic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT; v_question_count INTEGER; v_subtopic_count INTEGER;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  SELECT COUNT(*) INTO v_subtopic_count FROM subject_subtopics WHERE topic_id = p_topic_id;
  IF v_subtopic_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete topic with % subtopics — delete subtopics first', v_subtopic_count;
  END IF;

  SELECT COUNT(*) INTO v_question_count FROM questions q
  WHERE q.topic = (SELECT topic_name FROM subject_topics WHERE id = p_topic_id);
  IF v_question_count > 0 THEN RAISE EXCEPTION 'Cannot delete topic with % questions', v_question_count; END IF;

  DELETE FROM subject_topics WHERE id = p_topic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_topic TO authenticated;

-- ============================================================================
-- STEP 7: New subtopic CRUD functions
-- ============================================================================

-- 7a. Get subtopics for a specific topic (used by admin topic detail page)
CREATE OR REPLACE FUNCTION get_subtopics_by_topic(p_topic_id UUID)
RETURNS TABLE (
  id UUID, topic_id UUID, subject_id UUID, subtopic_name TEXT,
  description TEXT, difficulty_level TEXT, display_order INTEGER, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, question_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id, ss.topic_id, ss.subject_id, ss.subtopic_name,
    ss.description, ss.difficulty_level, ss.display_order, ss.is_active,
    ss.created_at, ss.updated_at,
    (SELECT COUNT(*) FROM questions q WHERE q.subtopic_id = ss.id)::BIGINT AS question_count
  FROM subject_subtopics ss
  WHERE ss.topic_id = p_topic_id
  ORDER BY ss.display_order, ss.subtopic_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subtopics_by_topic TO authenticated;

-- 7b. Get all subtopics for a subject (flat list — used in question add/edit dropdowns)
CREATE OR REPLACE FUNCTION get_subtopics_by_subject(p_subject_id UUID)
RETURNS TABLE (
  id UUID, topic_id UUID, subject_id UUID, subtopic_name TEXT,
  description TEXT, difficulty_level TEXT, display_order INTEGER, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, question_count BIGINT,
  topic_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id, ss.topic_id, ss.subject_id, ss.subtopic_name,
    ss.description, ss.difficulty_level, ss.display_order, ss.is_active,
    ss.created_at, ss.updated_at,
    (SELECT COUNT(*) FROM questions q WHERE q.subtopic_id = ss.id)::BIGINT AS question_count,
    st.topic_name
  FROM subject_subtopics ss
  JOIN subject_topics st ON st.id = ss.topic_id
  WHERE ss.subject_id = p_subject_id
  ORDER BY st.display_order, st.topic_name, ss.display_order, ss.subtopic_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subtopics_by_subject TO authenticated;

-- 7c. Create subtopic
CREATE OR REPLACE FUNCTION admin_create_subtopic(
  p_topic_id       UUID,
  p_subtopic_name  TEXT,
  p_description    TEXT    DEFAULT NULL,
  p_difficulty_level TEXT  DEFAULT 'intermediate',
  p_display_order  INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subtopic_id UUID;
  v_user_role   TEXT;
  v_subject_id  UUID;
  v_max_order   INTEGER;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  IF p_difficulty_level NOT IN ('beginner', 'intermediate', 'advanced') THEN
    RAISE EXCEPTION 'Invalid difficulty level: %', p_difficulty_level;
  END IF;

  SELECT subject_id INTO v_subject_id FROM subject_topics WHERE id = p_topic_id;
  IF v_subject_id IS NULL THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF;

  IF p_display_order = 0 THEN
    SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order
    FROM subject_subtopics WHERE topic_id = p_topic_id;
    p_display_order := v_max_order;
  END IF;

  INSERT INTO subject_subtopics (topic_id, subject_id, subtopic_name, description, difficulty_level, display_order, is_active, created_at, updated_at)
  VALUES (p_topic_id, v_subject_id, p_subtopic_name, p_description, p_difficulty_level, p_display_order, true, NOW(), NOW())
  RETURNING id INTO v_subtopic_id;

  RETURN v_subtopic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_subtopic TO authenticated;

-- 7d. Update subtopic
CREATE OR REPLACE FUNCTION admin_update_subtopic(
  p_subtopic_id    UUID,
  p_subtopic_name  TEXT    DEFAULT NULL,
  p_description    TEXT    DEFAULT NULL,
  p_difficulty_level TEXT  DEFAULT NULL,
  p_display_order  INTEGER DEFAULT NULL,
  p_is_active      BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  IF p_difficulty_level IS NOT NULL AND p_difficulty_level NOT IN ('beginner', 'intermediate', 'advanced') THEN
    RAISE EXCEPTION 'Invalid difficulty level: %', p_difficulty_level;
  END IF;

  UPDATE subject_subtopics SET
    subtopic_name    = COALESCE(p_subtopic_name,    subtopic_name),
    description      = COALESCE(p_description,      description),
    difficulty_level = COALESCE(p_difficulty_level, difficulty_level),
    display_order    = COALESCE(p_display_order,    display_order),
    is_active        = COALESCE(p_is_active,        is_active),
    updated_at       = NOW()
  WHERE id = p_subtopic_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Subtopic not found: %', p_subtopic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_subtopic TO authenticated;

-- 7e. Delete subtopic (blocked if questions are assigned)
CREATE OR REPLACE FUNCTION admin_delete_subtopic(p_subtopic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT; v_question_count INTEGER;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  SELECT COUNT(*) INTO v_question_count FROM questions WHERE subtopic_id = p_subtopic_id;
  IF v_question_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete subtopic with % assigned questions — reassign or clear subtopic from those questions first', v_question_count;
  END IF;

  DELETE FROM subject_subtopics WHERE id = p_subtopic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subtopic not found: %', p_subtopic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_subtopic TO authenticated;

-- 7f. Reorder subtopics
CREATE OR REPLACE FUNCTION admin_reorder_subtopics(p_subtopic_orders JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT; v_item JSONB;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_subtopic_orders)
  LOOP
    UPDATE subject_subtopics
    SET display_order = (v_item->>'display_order')::INTEGER, updated_at = NOW()
    WHERE id = (v_item->>'id')::UUID;
  END LOOP;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reorder_subtopics TO authenticated;

-- 7g. Toggle subtopic active status
CREATE OR REPLACE FUNCTION admin_toggle_subtopic_status(p_subtopic_id UUID, p_is_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  UPDATE subject_subtopics SET is_active = p_is_active, updated_at = NOW() WHERE id = p_subtopic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subtopic not found: %', p_subtopic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_toggle_subtopic_status TO authenticated;

-- ============================================================================
-- STEP 8: updated_at auto-trigger for subject_subtopics
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_subject_subtopics ON subject_subtopics;
CREATE TRIGGER set_updated_at_subject_subtopics
  BEFORE UPDATE ON subject_subtopics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Done
-- ============================================================================
-- Summary of changes applied to existing database:
--   ✓ subject_subtopics table created
--   ✓ questions.subtopic_id FK column added (nullable)
--   ✓ 4 indexes created
--   ✓ RLS enabled + 4 policies created on subject_subtopics
--   ✓ get_topics_by_subject updated (now returns subtopic_count)
--   ✓ admin_delete_topic updated (blocks if subtopics exist)
--   ✓ 7 new functions: get_subtopics_by_topic, get_subtopics_by_subject,
--     admin_create_subtopic, admin_update_subtopic, admin_delete_subtopic,
--     admin_reorder_subtopics, admin_toggle_subtopic_status
-- ============================================================================

COMMIT;
