-- ============================================
-- CONSOLIDATED: Question, Exam & Subject/Topic Management Functions
-- ============================================
-- Source: Admin S3 (04_question_bank, 05_exam_management, 07_fix_exam_harmonization, 03_helper_functions)
--         Admin S4 (01_subject_topic_management)
--         Admin S10 (09_fix_search_questions, 10_reorder_exam_questions, 20_final_bulk_insert_fix)
-- Authoritative: S10 fixes override S3 originals where applicable
-- Dependencies: 01_base_schema.sql (tables), 00_prerequisites.sql (enums)
-- ============================================

-- ============================================
-- SECTION 1: QUESTION BANK FUNCTIONS
-- ============================================

-- 1a. question_imports table (tracking bulk uploads)
CREATE TABLE IF NOT EXISTS question_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  successful_imports INTEGER DEFAULT 0,
  failed_imports INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  imported_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_question_imports_created_at ON question_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_imports_imported_by ON question_imports(imported_by);

ALTER TABLE question_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_imports_select_policy ON question_imports;
DROP POLICY IF EXISTS question_imports_insert_policy ON question_imports;

CREATE POLICY question_imports_select_policy ON question_imports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

CREATE POLICY question_imports_insert_policy ON question_imports
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- 1b. Search Questions (AUTHORITATIVE: S10 + subtopic_id/subtopic_name, exam_stage filter)
DROP FUNCTION IF EXISTS search_questions(uuid,text,text,text,text[],boolean,integer,integer);

CREATE OR REPLACE FUNCTION search_questions(
  p_subject_id  UUID    DEFAULT NULL,
  p_difficulty  TEXT    DEFAULT NULL,
  p_exam_stage  TEXT    DEFAULT NULL,
  p_search_text TEXT    DEFAULT NULL,
  p_tags        TEXT[]  DEFAULT NULL,
  p_is_active   BOOLEAN DEFAULT NULL,
  p_limit       INTEGER DEFAULT 50,
  p_offset      INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                    UUID,
  subject_id            UUID,
  subject_name          TEXT,
  topic                 TEXT,
  subtopic_id           UUID,
  subtopic_name         TEXT,
  question_type         question_type,
  question_text         TEXT,
  question_image_url    TEXT,
  option_a              TEXT,
  option_b              TEXT,
  option_c              TEXT,
  option_d              TEXT,
  option_e              TEXT,
  correct_answer        TEXT,
  expected_answer       TEXT,
  answer_keywords       TEXT[],
  max_points            INTEGER,
  grading_rubric        JSONB,
  sample_answer         TEXT,
  explanation           TEXT,
  difficulty            TEXT,
  tags                  TEXT[],
  source                TEXT,
  year                  INTEGER,
  is_active             BOOLEAN,
  exclude_from_practice BOOLEAN,
  group_id              UUID,
  group_order           INTEGER,
  created_by            UUID,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_search_text TEXT := NULLIF(TRIM(p_search_text), '');
  v_search_query TSQUERY;
BEGIN
  IF v_search_text IS NOT NULL THEN
    v_search_query := websearch_to_tsquery('simple', v_search_text);
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.subject_id,
    s.name_en        AS subject_name,
    q.topic,
    q.subtopic_id,
    ss.subtopic_name,
    q.question_type,
    q.question_text,
    q.question_image_url,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.option_e,
    q.correct_answer,
    q.expected_answer,
    q.answer_keywords,
    q.max_points,
    q.grading_rubric,
    q.sample_answer,
    q.explanation,
    q.difficulty,
    q.tags,
    q.source,
    q.year,
    q.is_active,
    q.exclude_from_practice,
    q.group_id,
    q.group_order,
    q.created_by,
    q.created_at
  FROM questions q
  LEFT JOIN subjects          s  ON s.id  = q.subject_id
  LEFT JOIN subject_subtopics ss ON ss.id = q.subtopic_id
  WHERE
    (p_subject_id  IS NULL OR q.subject_id = p_subject_id)
    AND (p_difficulty  IS NULL OR q.difficulty  = p_difficulty)
    AND (p_exam_stage  IS NULL OR q.exam_stage  = p_exam_stage OR q.exam_stage IS NULL)
    AND (p_is_active   IS NULL OR q.is_active   = p_is_active)
    AND (
      v_search_text IS NULL
      OR to_tsvector('simple', q.question_text) @@ v_search_query
      OR q.question_text ILIKE '%' || v_search_text || '%'
    )
    AND (p_tags        IS NULL OR q.tags && p_tags)
  ORDER BY
    CASE
      WHEN v_search_query IS NULL THEN 0
      ELSE ts_rank(to_tsvector('simple', q.question_text), v_search_query)
    END DESC,
    q.created_at DESC
  LIMIT  LEAST(GREATEST(COALESCE(p_limit, 50), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION search_questions TO authenticated;

-- 1c. Get Question Statistics
CREATE OR REPLACE FUNCTION get_question_statistics(p_subject_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_by_subject JSONB;
BEGIN
  SELECT jsonb_object_agg(s.name_en, COALESCE(q.count, 0))
  INTO v_by_subject
  FROM subjects s
  LEFT JOIN (
    SELECT subject_id, COUNT(*) as count
    FROM questions
    WHERE p_subject_id IS NULL OR subject_id = p_subject_id
    GROUP BY subject_id
  ) q ON s.id = q.subject_id
  WHERE p_subject_id IS NULL OR s.id = p_subject_id;

  SELECT jsonb_build_object(
    'total_questions', COUNT(*),
    'active_questions', COUNT(*) FILTER (WHERE is_active = true),
    'inactive_questions', COUNT(*) FILTER (WHERE is_active = false),
    'by_difficulty', jsonb_build_object(
      'easy', COUNT(*) FILTER (WHERE difficulty = 'easy'),
      'medium', COUNT(*) FILTER (WHERE difficulty = 'medium'),
      'hard', COUNT(*) FILTER (WHERE difficulty = 'hard')
    ),
    'by_subject', COALESCE(v_by_subject, '{}'::jsonb)
  ) INTO v_result
  FROM questions
  WHERE p_subject_id IS NULL OR subject_id = p_subject_id;
  
  RETURN COALESCE(v_result, jsonb_build_object(
    'total_questions', 0, 'active_questions', 0, 'inactive_questions', 0,
    'by_difficulty', jsonb_build_object('easy', 0, 'medium', 0, 'hard', 0),
    'by_subject', '{}'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_question_statistics TO authenticated;

-- 1d. Bulk Insert Questions (AUTHORITATIVE: S10 version with question_type support)
DROP FUNCTION IF EXISTS bulk_insert_questions(JSONB, UUID, UUID);
DROP FUNCTION IF EXISTS bulk_insert_questions(JSONB, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION bulk_insert_questions(
  p_questions   JSONB,
  p_subject_id  UUID,
  p_imported_by UUID  DEFAULT NULL,
  p_filename    TEXT  DEFAULT 'Bulk Import'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_import_id UUID;
  v_question JSONB;
  v_total INTEGER := 0;
  v_successful INTEGER := 0;
  v_failed INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_question_id UUID;
  v_question_type TEXT;
  v_correct_answer TEXT;
BEGIN
  INSERT INTO question_imports (filename, total_questions, imported_by)
  VALUES (COALESCE(NULLIF(TRIM(p_filename), ''), 'Bulk Import'), jsonb_array_length(p_questions), p_imported_by)
  RETURNING id INTO v_import_id;

  v_total := jsonb_array_length(p_questions);

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    BEGIN
      v_question_type := COALESCE(v_question->>'question_type', 'mcq');
      
      IF v_question_type = 'mcq' THEN
        v_correct_answer := v_question->>'correct_answer';
      ELSE
        v_correct_answer := COALESCE(v_question->>'correct_answer', v_question->>'expected_answer');
      END IF;
      
      INSERT INTO questions (
        subject_id, topic, subtopic_id, question_type, question_text, question_image_url,
        option_a, option_b, option_c, option_d, option_e,
        correct_answer, explanation, difficulty, tags, source, year,
        created_by, is_active, exclude_from_practice
      ) VALUES (
        p_subject_id,
        v_question->>'topic',
        CASE
          WHEN v_question->>'subtopic_id' IS NOT NULL AND v_question->>'subtopic_id' != ''
          THEN (v_question->>'subtopic_id')::UUID
          ELSE NULL
        END,
        v_question_type::question_type,
        v_question->>'question_text',
        v_question->>'question_image_url',
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_a' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_b' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_c' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_d' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_e' ELSE '' END,
        v_correct_answer,
        v_question->>'explanation',
        COALESCE(v_question->>'difficulty', 'medium'),
        CASE 
          WHEN v_question->'tags' IS NOT NULL THEN 
            ARRAY(SELECT jsonb_array_elements_text(v_question->'tags'))
          ELSE '{}'::TEXT[]
        END,
        v_question->>'source',
        CASE 
          WHEN v_question->>'year' IS NOT NULL AND v_question->>'year' != '' 
          THEN (v_question->>'year')::INTEGER 
          ELSE NULL 
        END,
        p_imported_by,
        COALESCE((v_question->>'is_active')::BOOLEAN, TRUE),
        CASE 
          WHEN v_question_type = 'written_open' THEN TRUE 
          ELSE COALESCE((v_question->>'exclude_from_practice')::BOOLEAN, FALSE) 
        END
      ) RETURNING id INTO v_question_id;

      v_successful := v_successful + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'question_text', COALESCE(v_question->>'question_text', 'Unknown'),
        'question_type', v_question_type,
        'error', SQLERRM,
        'detail', SQLSTATE
      );
    END;
  END LOOP;

  UPDATE question_imports
  SET successful_imports = v_successful, failed_imports = v_failed, errors = v_errors
  WHERE id = v_import_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'import_id', v_import_id, 'total', v_total,
      'successful', v_successful, 'failed', v_failed, 'errors', v_errors
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_insert_questions(JSONB, UUID, UUID, TEXT) TO authenticated;

-- 1e. Bulk Delete Questions
CREATE OR REPLACE FUNCTION bulk_delete_questions(p_question_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM questions WHERE id = ANY(p_question_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('deleted_count', v_deleted));
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_delete_questions TO authenticated;

-- 1f. Toggle Question Active Status
CREATE OR REPLACE FUNCTION toggle_question_status(p_question_id UUID, p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE questions SET is_active = p_is_active WHERE id = p_question_id;
  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('question_id', p_question_id, 'is_active', p_is_active));
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_question_status TO authenticated;

-- ============================================
-- SECTION 2: SUBJECT MANAGEMENT FUNCTIONS (S4)
-- ============================================

-- 2a. Get Subjects with Stats
DROP FUNCTION IF EXISTS get_subjects_with_stats();

CREATE OR REPLACE FUNCTION get_subjects_with_stats()
RETURNS TABLE (
  id UUID, name_en TEXT, name_az TEXT, category TEXT,
  coefficient NUMERIC, max_points INTEGER, display_order INTEGER,
  is_active BOOLEAN, created_at TIMESTAMPTZ,
  topic_count BIGINT, question_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id, s.name_en, s.name_az, s.category, s.coefficient, s.max_points,
    0 as display_order, true as is_active, s.created_at,
    (SELECT COUNT(*) FROM subject_topics st WHERE st.subject_id = s.id)::BIGINT as topic_count,
    (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id)::BIGINT as question_count
  FROM subjects s
  ORDER BY s.category, s.name_en;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subjects_with_stats TO authenticated;

-- 2b. Create Subject
CREATE OR REPLACE FUNCTION admin_create_subject(
  p_name_en TEXT, p_name_az TEXT,
  p_category TEXT DEFAULT 'first_stage',
  p_coefficient NUMERIC DEFAULT 1.0,
  p_max_points INTEGER DEFAULT 100
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subject_id UUID;
  v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;
  IF p_category NOT IN ('first_stage', 'second_stage') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF p_coefficient NOT IN (1.0, 1.5) THEN RAISE EXCEPTION 'Invalid coefficient'; END IF;

  INSERT INTO subjects (name_en, name_az, category, coefficient, max_points, created_at)
  VALUES (p_name_en, p_name_az, p_category, p_coefficient, p_max_points, NOW())
  RETURNING id INTO v_subject_id;

  RETURN v_subject_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_subject TO authenticated;

-- 2c. Update Subject
CREATE OR REPLACE FUNCTION admin_update_subject(
  p_subject_id UUID, p_name_en TEXT DEFAULT NULL, p_name_az TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL, p_coefficient NUMERIC DEFAULT NULL, p_max_points INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;
  IF p_category IS NOT NULL AND p_category NOT IN ('first_stage', 'second_stage') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF p_coefficient IS NOT NULL AND p_coefficient NOT IN (1.0, 1.5) THEN RAISE EXCEPTION 'Invalid coefficient'; END IF;

  UPDATE subjects SET
    name_en = COALESCE(p_name_en, name_en), name_az = COALESCE(p_name_az, name_az),
    category = COALESCE(p_category, category), coefficient = COALESCE(p_coefficient, coefficient),
    max_points = COALESCE(p_max_points, max_points)
  WHERE id = p_subject_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Subject not found: %', p_subject_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_subject TO authenticated;

-- 2d. Delete Subject
CREATE OR REPLACE FUNCTION admin_delete_subject(p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT; v_question_count INTEGER; v_topic_count INTEGER;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  SELECT COUNT(*) INTO v_question_count FROM questions WHERE subject_id = p_subject_id;
  IF v_question_count > 0 THEN RAISE EXCEPTION 'Cannot delete subject with % questions', v_question_count; END IF;

  SELECT COUNT(*) INTO v_topic_count FROM subject_topics WHERE subject_id = p_subject_id;
  IF v_topic_count > 0 THEN RAISE EXCEPTION 'Cannot delete subject with % topics', v_topic_count; END IF;

  DELETE FROM subjects WHERE id = p_subject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subject not found: %', p_subject_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_subject TO authenticated;

-- ============================================
-- SECTION 3: TOPIC MANAGEMENT FUNCTIONS (S4)
-- ============================================

-- 3a. Get Topics by Subject
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

-- 3b. Create Topic
CREATE OR REPLACE FUNCTION admin_create_topic(
  p_subject_id UUID, p_topic_name TEXT,
  p_topic_name_az TEXT DEFAULT NULL, p_topic_name_ru TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL, p_difficulty_level TEXT DEFAULT 'intermediate',
  p_display_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_topic_id UUID; v_user_role TEXT; v_max_order INTEGER;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;
  IF p_difficulty_level NOT IN ('beginner', 'intermediate', 'advanced') THEN RAISE EXCEPTION 'Invalid difficulty level'; END IF;

  IF p_display_order = 0 THEN
    SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM subject_topics WHERE subject_id = p_subject_id;
    p_display_order := v_max_order;
  END IF;

  INSERT INTO subject_topics (subject_id, topic_name, description, difficulty_level, display_order, is_active, created_at, updated_at)
  VALUES (p_subject_id, p_topic_name, p_description, p_difficulty_level, p_display_order, true, NOW(), NOW())
  RETURNING id INTO v_topic_id;

  RETURN v_topic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_topic TO authenticated;

-- 3c. Update Topic
CREATE OR REPLACE FUNCTION admin_update_topic(
  p_topic_id UUID, p_topic_name TEXT DEFAULT NULL,
  p_topic_name_az TEXT DEFAULT NULL, p_topic_name_ru TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL, p_difficulty_level TEXT DEFAULT NULL,
  p_display_order INTEGER DEFAULT NULL, p_is_active BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;
  IF p_difficulty_level IS NOT NULL AND p_difficulty_level NOT IN ('beginner', 'intermediate', 'advanced') THEN RAISE EXCEPTION 'Invalid difficulty level'; END IF;

  UPDATE subject_topics SET
    topic_name = COALESCE(p_topic_name, topic_name),
    description = COALESCE(p_description, description),
    difficulty_level = COALESCE(p_difficulty_level, difficulty_level),
    display_order = COALESCE(p_display_order, display_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = NOW()
  WHERE id = p_topic_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_topic TO authenticated;

-- 3d. Delete Topic
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
  IF v_subtopic_count > 0 THEN RAISE EXCEPTION 'Cannot delete topic with % subtopics — delete subtopics first', v_subtopic_count; END IF;

  SELECT COUNT(*) INTO v_question_count FROM questions q
  WHERE q.topic = (SELECT topic_name FROM subject_topics WHERE id = p_topic_id);
  IF v_question_count > 0 THEN RAISE EXCEPTION 'Cannot delete topic with % questions', v_question_count; END IF;

  DELETE FROM subject_topics WHERE id = p_topic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_topic TO authenticated;

-- 3e. Reorder Topics
CREATE OR REPLACE FUNCTION admin_reorder_topics(p_topic_orders JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT; v_topic JSONB;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  FOR v_topic IN SELECT * FROM jsonb_array_elements(p_topic_orders)
  LOOP
    UPDATE subject_topics
    SET display_order = (v_topic->>'display_order')::INTEGER, updated_at = NOW()
    WHERE id = (v_topic->>'id')::UUID;
  END LOOP;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reorder_topics TO authenticated;

-- 3f. Toggle Topic Status
CREATE OR REPLACE FUNCTION admin_toggle_topic_status(p_topic_id UUID, p_is_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_role TEXT;
BEGIN
  SELECT user_type INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'admin' THEN RAISE EXCEPTION 'Admin privileges required'; END IF;

  UPDATE subject_topics SET is_active = p_is_active, updated_at = NOW() WHERE id = p_topic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_toggle_topic_status TO authenticated;

-- ============================================================================
-- SECTION 3b: SUBTOPIC MANAGEMENT FUNCTIONS
-- ============================================================================

-- 3b-a. Get Subtopics by Topic
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

-- 3b-b. Get All Subtopics by Subject (flat list — used in question forms to populate dropdown)
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

-- 3b-c. Create Subtopic
CREATE OR REPLACE FUNCTION admin_create_subtopic(
  p_topic_id UUID,
  p_subtopic_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_difficulty_level TEXT DEFAULT 'intermediate',
  p_display_order INTEGER DEFAULT 0
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

  -- Resolve subject_id from the parent topic
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

-- 3b-d. Update Subtopic
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

-- 3b-e. Delete Subtopic (blocked if questions are assigned)
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

-- 3b-f. Reorder Subtopics
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

-- 3b-g. Toggle Subtopic Status
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

-- ============================================
-- SECTION 4: EXAM MANAGEMENT FUNCTIONS (S3/S10)
-- ============================================

-- 4a. Create Mock Exam
-- Admin-created exams are always Official Elmly exams (is_official=TRUE, is_approved=TRUE)
CREATE OR REPLACE FUNCTION create_mock_exam(
  p_title TEXT, p_exam_type TEXT, p_target_group TEXT,
  p_duration_minutes INTEGER, p_total_questions INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exam_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO mock_exams (
    title, exam_type, target_group, duration_minutes, total_questions,
    is_official, is_approved
  )
  VALUES (
    p_title, p_exam_type, p_target_group, p_duration_minutes, p_total_questions,
    TRUE, TRUE
  )
  RETURNING id INTO v_exam_id;
  RETURN v_exam_id;
END;
$$;

-- 4b. Update Mock Exam
CREATE OR REPLACE FUNCTION update_mock_exam(
  p_exam_id UUID, p_title TEXT DEFAULT NULL, p_exam_type TEXT DEFAULT NULL,
  p_target_group TEXT DEFAULT NULL, p_duration_minutes INTEGER DEFAULT NULL,
  p_total_questions INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mock_exams SET
    title = COALESCE(p_title, title), exam_type = COALESCE(p_exam_type, exam_type),
    target_group = COALESCE(p_target_group, target_group),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    total_questions = COALESCE(p_total_questions, total_questions)
  WHERE id = p_exam_id;
  RETURN FOUND;
END;
$$;

-- 4c. Delete Mock Exam
CREATE OR REPLACE FUNCTION delete_mock_exam(p_exam_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM mock_exams WHERE id = p_exam_id;
  RETURN FOUND;
END;
$$;

-- 4d. Search Mock Exams (admin-only)
-- hotfix 81: use subqueries to count from correct table (teacher_exam_questions vs mock_exam_questions)
-- hotfix 85: added admin authorization check — prevents non-admins from enumerating all exams
DROP FUNCTION IF EXISTS search_mock_exams(TEXT, TEXT, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_mock_exams(
  p_exam_type    TEXT    DEFAULT NULL,
  p_target_group TEXT    DEFAULT NULL,
  p_search_text  TEXT    DEFAULT NULL,
  p_limit        INTEGER DEFAULT 50,
  p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                     UUID,
  title                  TEXT,
  exam_type              TEXT,
  target_group           TEXT,
  duration_minutes       INTEGER,
  total_questions        INTEGER,
  created_at             TIMESTAMPTZ,
  question_count         BIGINT,
  -- Teacher exam columns
  is_official            BOOLEAN,
  created_by_teacher     UUID,
  is_approved            BOOLEAN,
  uses_teacher_questions BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only: reject non-admin callers
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    CASE
      WHEN me.uses_teacher_questions THEN
        (SELECT COUNT(*) FROM teacher_exam_questions teq WHERE teq.exam_id = me.id)
      ELSE
        (SELECT COUNT(*) FROM mock_exam_questions meq WHERE meq.mock_exam_id = me.id)
    END                                  AS question_count,
    me.is_official,
    me.created_by_teacher,
    me.is_approved,
    me.uses_teacher_questions
  FROM mock_exams me
  WHERE (p_exam_type   IS NULL OR me.exam_type   = p_exam_type)
    AND (p_target_group IS NULL OR me.target_group = p_target_group)
    AND (p_search_text  IS NULL OR me.title ILIKE '%' || p_search_text || '%')
  ORDER BY me.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 4e. Get Mock Exam Details (AUTHORITATIVE: S10 version)
CREATE OR REPLACE FUNCTION get_mock_exam_details(p_exam_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'exam', row_to_json(me.*),
    'questions', COALESCE(
      (SELECT json_agg(
        json_build_object(
          'id', meq.id, 'question_id', meq.question_id,
          'question_order', meq.question_order, 'question_text', q.question_text,
          'question_type', q.question_type, 'group_id', q.group_id,
          'group_order', q.group_order, 'context_text', qg.context_text,
          'subject_id', q.subject_id, 'subject_name', s.name_en, 'difficulty', q.difficulty
        ) ORDER BY meq.question_order
      )
      FROM mock_exam_questions meq
      JOIN questions q ON q.id = meq.question_id
      JOIN subjects s ON s.id = q.subject_id
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      WHERE meq.mock_exam_id = me.id),
      '[]'::json
    )
  ) INTO v_result
  FROM mock_exams me WHERE me.id = p_exam_id;
  RETURN v_result;
END;
$$;

-- 4f. Add Questions to Mock Exam
CREATE OR REPLACE FUNCTION add_questions_to_mock_exam(p_exam_id UUID, p_question_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INTEGER := 0; v_question_id UUID; v_max_order INTEGER;
BEGIN
  SELECT COALESCE(MAX(question_order), 0) INTO v_max_order
  FROM mock_exam_questions WHERE mock_exam_id = p_exam_id;
  
  FOREACH v_question_id IN ARRAY p_question_ids
  LOOP
    INSERT INTO mock_exam_questions (mock_exam_id, question_id, question_order)
    VALUES (p_exam_id, v_question_id, v_max_order + v_count + 1)
    ON CONFLICT (mock_exam_id, question_id) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- 4g. Remove Questions from Mock Exam
CREATE OR REPLACE FUNCTION remove_questions_from_mock_exam(p_exam_id UUID, p_question_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM mock_exam_questions
  WHERE mock_exam_id = p_exam_id AND question_id = ANY(p_question_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  WITH ordered_questions AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY question_order) as new_order
    FROM mock_exam_questions WHERE mock_exam_id = p_exam_id
  )
  UPDATE mock_exam_questions meq
  SET question_order = oq.new_order
  FROM ordered_questions oq WHERE meq.id = oq.id;
  
  RETURN v_count;
END;
$$;

-- 4h. Auto-select Questions for Exam (topic weighting + exam_stage filter)
CREATE OR REPLACE FUNCTION auto_select_questions_for_exam(
  p_exam_id       UUID,
  p_distribution  JSONB,
  p_exam_stage    TEXT  DEFAULT NULL,
  p_topic_config  JSONB DEFAULT NULL,
  p_question_types TEXT[] DEFAULT ARRAY['mcq']
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subject_name      TEXT;
  v_difficulty_dist   JSONB;
  v_difficulty        TEXT;
  v_count             INTEGER;
  v_selected_ids      UUID[];
  v_backfill_ids      UUID[];
  v_total_added       INTEGER := 0;
  v_subject_config    JSONB;
  v_exclude_topics    TEXT[];
  v_prioritize_topics TEXT[];
  v_max_per_topic     INTEGER;
  v_remaining         INTEGER;
BEGIN
  -- Remove only questions of the selected types; preserve all others (incl. written_open)
  DELETE FROM mock_exam_questions meq
  USING questions q
  WHERE meq.mock_exam_id = p_exam_id
    AND meq.question_id  = q.id
    AND q.question_type = ANY(p_question_types);

  FOR v_subject_name, v_difficulty_dist IN
    SELECT * FROM jsonb_each(p_distribution)
  LOOP
    v_subject_config    := p_topic_config -> v_subject_name;

    v_exclude_topics := CASE
      WHEN v_subject_config IS NOT NULL AND v_subject_config ? 'exclude'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_subject_config->'exclude'))
      ELSE NULL
    END;

    v_prioritize_topics := CASE
      WHEN v_subject_config IS NOT NULL AND v_subject_config ? 'prioritize'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_subject_config->'prioritize'))
      ELSE NULL
    END;

    v_max_per_topic := (v_subject_config->>'max_per_topic')::INTEGER;

    FOR v_difficulty, v_count IN
      SELECT * FROM jsonb_each_text(v_difficulty_dist)
    LOOP
      CONTINUE WHEN v_count::INTEGER = 0;
      v_selected_ids := NULL;

      IF v_prioritize_topics IS NOT NULL AND array_length(v_prioritize_topics, 1) > 0 THEN
        -- Pass 1: prioritized topics first
        SELECT array_agg(q_id) INTO v_selected_ids FROM (
          SELECT inner_q.id AS q_id
          FROM (
            SELECT q.id,
              ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.name_en = v_subject_name
              AND q.difficulty = v_difficulty
              AND q.is_active  = true
              AND q.question_type = ANY(p_question_types)
              AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
              AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
              AND q.topic = ANY(v_prioritize_topics)
          ) inner_q
          WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
          ORDER BY RANDOM()
          LIMIT v_count::INTEGER
        ) t;

        -- Pass 2: backfill from remaining topics
        v_remaining := v_count::INTEGER - COALESCE(array_length(v_selected_ids, 1), 0);
        IF v_remaining > 0 THEN
          SELECT array_agg(q_id) INTO v_backfill_ids FROM (
            SELECT inner_q.id AS q_id
            FROM (
              SELECT q.id,
                ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
              FROM questions q
              JOIN subjects s ON s.id = q.subject_id
              WHERE s.name_en = v_subject_name
                AND q.difficulty = v_difficulty
                AND q.is_active  = true
                AND q.question_type = ANY(p_question_types)
                AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
                AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
                AND (q.topic IS NULL OR NOT (q.topic = ANY(v_prioritize_topics)))
                AND (v_selected_ids IS NULL OR NOT (q.id = ANY(v_selected_ids)))
            ) inner_q
            WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
            ORDER BY RANDOM()
            LIMIT v_remaining
          ) t;
          IF v_backfill_ids IS NOT NULL THEN
            v_selected_ids := COALESCE(v_selected_ids, ARRAY[]::UUID[]) || v_backfill_ids;
          END IF;
        END IF;

      ELSE
        -- No prioritization: exclusion + per-topic cap only
        SELECT array_agg(q_id) INTO v_selected_ids FROM (
          SELECT inner_q.id AS q_id
          FROM (
            SELECT q.id,
              ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.name_en = v_subject_name
              AND q.difficulty = v_difficulty
              AND q.is_active  = true
              AND q.question_type = ANY(p_question_types)
              AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
              AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
          ) inner_q
          WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
          ORDER BY RANDOM()
          LIMIT v_count::INTEGER
        ) t;
      END IF;

      IF v_selected_ids IS NOT NULL THEN
        v_total_added := v_total_added + add_questions_to_mock_exam(p_exam_id, v_selected_ids);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_total_added;
END;
$$;

-- 4i. Reorder Exam Questions by Type (S10)
CREATE OR REPLACE FUNCTION reorder_exam_questions_by_type(p_exam_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_question RECORD; v_new_order INTEGER := 1;
BEGIN
  FOR v_question IN
    SELECT meq.id as exam_question_id
    FROM mock_exam_questions meq
    JOIN questions q ON q.id = meq.question_id
    WHERE meq.mock_exam_id = p_exam_id
    ORDER BY q.subject_id,
      CASE WHEN q.question_type = 'mcq' THEN 1 WHEN q.question_type = 'codable_open' THEN 2 WHEN q.question_type = 'written_open' THEN 3 END,
      q.group_id NULLS FIRST, q.group_order NULLS FIRST, meq.question_order
  LOOP
    UPDATE mock_exam_questions SET question_order = v_new_order WHERE id = v_question.exam_question_id;
    v_new_order := v_new_order + 1;
  END LOOP;
  RETURN v_new_order - 1;
END;
$$;

-- Grant exam function permissions
GRANT EXECUTE ON FUNCTION create_mock_exam TO authenticated;
GRANT EXECUTE ON FUNCTION update_mock_exam TO authenticated;
GRANT EXECUTE ON FUNCTION delete_mock_exam TO authenticated;
GRANT EXECUTE ON FUNCTION search_mock_exams TO authenticated;
GRANT EXECUTE ON FUNCTION get_mock_exam_details TO authenticated;
GRANT EXECUTE ON FUNCTION add_questions_to_mock_exam TO authenticated;
GRANT EXECUTE ON FUNCTION remove_questions_from_mock_exam TO authenticated;
GRANT EXECUTE ON FUNCTION auto_select_questions_for_exam(UUID, JSONB, TEXT, JSONB, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_exam_questions_by_type TO authenticated;

-- ============================================
-- SECTION 5: HELPER FUNCTIONS (S3)
-- ============================================

-- 5a. Search Students by Name (helper for leaderboard/admin)
DROP FUNCTION IF EXISTS search_students_by_name(TEXT, INTEGER);
DROP FUNCTION IF EXISTS search_students_by_name(TEXT);

CREATE OR REPLACE FUNCTION search_students_by_name(
  search_query TEXT, result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  student_id UUID, user_id UUID, full_name TEXT, email TEXT, elo_rating INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT s.id AS student_id, s.user_id,
    COALESCE(p.full_name, au.email, 'Unknown') AS full_name,
    au.email, COALESCE(s.elo_rating, 1000) AS elo_rating
  FROM students s
  INNER JOIN profiles p ON s.user_id = p.id
  LEFT JOIN auth.users au ON s.user_id = au.id
  WHERE p.full_name ILIKE '%' || search_query || '%'
    OR au.email ILIKE '%' || search_query || '%'
  ORDER BY p.full_name NULLS LAST
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION search_students_by_name(TEXT, INTEGER) TO authenticated;

-- ============================================
-- SECTION 6: TOPIC ANALYSIS FUNCTIONS (S9.5)
-- ============================================

-- 6a. Get Weak Topics (used by Competitive Mode in mobile app)
CREATE OR REPLACE FUNCTION get_weak_topics(
  p_student_id UUID,
  p_subject_id UUID,
  p_min_questions INTEGER DEFAULT 5,
  p_weak_threshold NUMERIC DEFAULT 70.0,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  topic TEXT,
  questions_attempted BIGINT,
  questions_correct BIGINT,
  accuracy_percentage NUMERIC,
  last_practiced TIMESTAMPTZ,
  confidence_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    stp.topic,
    stp.questions_attempted,
    stp.questions_correct,
    stp.accuracy_percentage,
    stp.last_practiced,
    CASE 
      WHEN stp.questions_attempted < 5 THEN 'low'
      WHEN stp.questions_attempted < 15 THEN 'medium'
      ELSE 'high'
    END AS confidence_level
  FROM student_topic_performance stp
  WHERE stp.student_id = p_student_id
    AND stp.subject_id = p_subject_id
    AND stp.questions_attempted >= p_min_questions
    AND stp.accuracy_percentage < p_weak_threshold
  ORDER BY 
    CASE 
      WHEN stp.questions_attempted >= 15 THEN 3
      WHEN stp.questions_attempted >= 5 THEN 2
      ELSE 1
    END DESC,
    stp.accuracy_percentage ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_weak_topics IS 'Returns weak topics for a student in a subject based on performance thresholds';

-- 6b. Get Strong Topics
CREATE OR REPLACE FUNCTION get_strong_topics(
  p_student_id UUID,
  p_subject_id UUID,
  p_min_questions INTEGER DEFAULT 5,
  p_strong_threshold NUMERIC DEFAULT 85.0,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  topic TEXT,
  questions_attempted BIGINT,
  questions_correct BIGINT,
  accuracy_percentage NUMERIC,
  last_practiced TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    stp.topic,
    stp.questions_attempted,
    stp.questions_correct,
    stp.accuracy_percentage,
    stp.last_practiced
  FROM student_topic_performance stp
  WHERE stp.student_id = p_student_id
    AND stp.subject_id = p_subject_id
    AND stp.questions_attempted >= p_min_questions
    AND stp.accuracy_percentage >= p_strong_threshold
  ORDER BY stp.accuracy_percentage DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_strong_topics IS 'Returns strong topics for a student in a subject';

-- 6c. Get Exam Group Config (Admin S9.1)
CREATE OR REPLACE FUNCTION get_exam_group_config(p_group_code TEXT, p_exam_type TEXT DEFAULT 'first_stage')
RETURNS TABLE(
  group_code TEXT, group_name TEXT, max_points INTEGER,
  subject_id UUID, subject_name TEXT, coefficient DECIMAL,
  questions_count INTEGER, subject_max_points INTEGER
) AS $$
DECLARE
  v_group_id UUID;
  v_max_points INTEGER;
  v_total_coefficient DECIMAL;
BEGIN
  SELECT eg.id,
    CASE WHEN p_exam_type = 'first_stage' THEN eg.max_points ELSE eg.max_points END
  INTO v_group_id, v_max_points
  FROM exam_groups eg
  WHERE eg.code = p_group_code AND eg.is_active = true;

  IF v_group_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(egs.coefficient), 0)
  INTO v_total_coefficient
  FROM exam_group_subjects egs
  WHERE egs.exam_group_id = v_group_id;

  RETURN QUERY
  SELECT
    p_group_code, eg.name, v_max_points,
    s.id, s.name_en, egs.coefficient,
    egs.question_count,
    ROUND((egs.coefficient / NULLIF(v_total_coefficient, 0)) * v_max_points)::INTEGER
  FROM exam_group_subjects egs
  JOIN exam_groups eg ON eg.id = egs.exam_group_id
  JOIN subjects s ON s.id = egs.subject_id
  WHERE egs.exam_group_id = v_group_id
  ORDER BY egs.coefficient DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_weak_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_strong_topics(UUID, UUID, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_exam_group_config(TEXT, TEXT) TO authenticated;

-- ============================================
-- TEACHER EXAM FUNCTIONS (hotfix 73/76/78)
-- ============================================

-- get_teacher_exam_questions: Returns questions for a teacher exam (called by mobile app)
-- Combines teacher_questions + Elmly questions from teacher_exam_questions table.
-- Access gate: approved exams → any authenticated user; unapproved → owning teacher only.
DROP FUNCTION IF EXISTS get_teacher_exam_questions(UUID);
CREATE OR REPLACE FUNCTION get_teacher_exam_questions(p_exam_id UUID)
RETURNS TABLE (
  id              UUID,
  question_order  INTEGER,
  question_id     UUID,
  question_text   TEXT,
  question_type   TEXT,
  option_a        TEXT,
  option_b        TEXT,
  option_c        TEXT,
  option_d        TEXT,
  option_e        TEXT,
  correct_answer  TEXT,
  explanation     TEXT,
  difficulty      TEXT,
  subject_id      UUID,
  subject_name    TEXT,
  source          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Access gate: approved exams are public; unapproved only visible to owning teacher.
  IF NOT EXISTS (
    SELECT 1 FROM mock_exams me
    WHERE me.id = p_exam_id
      AND me.created_by_teacher IS NOT NULL
      AND (
        me.is_approved = TRUE
        OR EXISTS (
          SELECT 1 FROM teachers t
          WHERE t.id = me.created_by_teacher AND t.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Exam not found, not a teacher exam, or not yet approved';
  END IF;

  RETURN QUERY
    SELECT
      teq.id,
      teq.question_order,
      COALESCE(teq.question_id, teq.teacher_question_id) AS question_id,
      COALESCE(q.question_text, tq.question_text)::TEXT   AS question_text,
      COALESCE(q.question_type::TEXT, tq.question_type)   AS question_type,
      COALESCE(q.option_a, tq.option_a)::TEXT             AS option_a,
      COALESCE(q.option_b, tq.option_b)::TEXT             AS option_b,
      COALESCE(q.option_c, tq.option_c)::TEXT             AS option_c,
      COALESCE(q.option_d, tq.option_d)::TEXT             AS option_d,
      COALESCE(q.option_e, tq.option_e)::TEXT             AS option_e,
      COALESCE(q.correct_answer, tq.correct_answer)::TEXT AS correct_answer,
      COALESCE(q.explanation, tq.explanation)::TEXT       AS explanation,
      COALESCE(
        q.difficulty::TEXT,
        CASE tq.difficulty
          WHEN 1 THEN 'easy' WHEN 2 THEN 'easy'
          WHEN 3 THEN 'medium'
          WHEN 4 THEN 'hard' WHEN 5 THEN 'hard'
        END
      )                                                   AS difficulty,
      COALESCE(q.subject_id, tq.subject_id)               AS subject_id,
      s.name_en::TEXT                                     AS subject_name,
      CASE WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher' ELSE 'elmly' END AS source
    FROM teacher_exam_questions teq
    LEFT JOIN questions q        ON q.id  = teq.question_id
    LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
    LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
    WHERE teq.exam_id = p_exam_id
    ORDER BY teq.question_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_questions(UUID) TO authenticated;

-- get_recommended_teacher_exams: Returns teachers with approved exams, ranked for a student
-- Profile table is 'profiles' (not 'users') — see base_schema.sql
-- hotfix 80: subjects changed from TEXT[] (raw specializations) to JSONB [{id,name_az,name_en}]
-- hotfix 85: anti-spoofing — caller can only request recommendations for themselves
-- hotfix 87: avg_rating combines teacher_reviews + teacher_exam_ratings
DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id      UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  subjects        JSONB,   -- [{id, name_az, name_en}]
  exam_count      BIGINT,
  avg_rating      NUMERIC,
  score           NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_group TEXT;
BEGIN
  -- Anti-spoof: caller must be the student they're requesting for
  IF p_student_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.target_group INTO v_target_group
  FROM students s WHERE s.user_id = p_student_id;

  RETURN QUERY
    SELECT
      t.id                          AS teacher_id,
      p.full_name,
      p.avatar_url,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id',      s.id::text,
            'name_az', s.name_az,
            'name_en', COALESCE(s.name_en, s.name_az)
          )
        )::jsonb
        FROM subjects s
        WHERE s.name_az = ANY(t.specializations)
           OR s.name_en = ANY(t.specializations)
        ),
        '[]'::jsonb
      )                             AS subjects,
      COUNT(DISTINCT me.id)         AS exam_count,
      -- avg_rating combines booking reviews + exam-specific ratings
      ROUND(
        (SELECT AVG(rating) FROM (
          SELECT tr.rating FROM teacher_reviews tr WHERE tr.teacher_id = t.id
          UNION ALL
          SELECT ter.rating FROM teacher_exam_ratings ter
            JOIN mock_exams me2 ON me2.id = ter.exam_id
            WHERE me2.created_by_teacher = t.id
        ) all_ratings),
        1
      )                             AS avg_rating,
      (
        CASE
          WHEN v_target_group IS NOT NULL
               AND v_target_group = ANY(t.available_groups::TEXT[])
          THEN 30.0 ELSE 0.0
        END
        + LEAST(COUNT(DISTINCT me.id)::NUMERIC * 5.0, 50.0)
        + COALESCE(
            (SELECT AVG(rating) FROM (
              SELECT tr2.rating FROM teacher_reviews tr2 WHERE tr2.teacher_id = t.id
              UNION ALL
              SELECT ter.rating::numeric FROM teacher_exam_ratings ter
                JOIN mock_exams me3 ON me3.id = ter.exam_id
                WHERE me3.created_by_teacher = t.id
            ) all_ratings2),
            3.0
          ) * 4.0
      ) AS score
    FROM teachers t
    JOIN profiles p ON p.id = t.user_id
    JOIN mock_exams me
      ON me.created_by_teacher = t.id AND me.is_approved = TRUE
    WHERE t.is_verified = TRUE
    GROUP BY t.id, p.full_name, p.avatar_url, t.specializations, t.available_groups
    HAVING COUNT(DISTINCT me.id) >= 1
    ORDER BY score DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

-- get_my_teacher_exams: Returns teacher's own exams with accurate question counts (hotfix 80)
-- Uses SECURITY DEFINER + direct JOIN to bypass RLS evaluation order issues on nested selects.
-- hotfix 85: anti-spoofing — caller must own the teacher record they are querying.
DROP FUNCTION IF EXISTS get_my_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_my_teacher_exams(p_teacher_id UUID)
RETURNS TABLE (
  id                    UUID,
  title                 TEXT,
  exam_type             TEXT,
  target_group          TEXT,
  duration_minutes      INTEGER,
  total_questions       INTEGER,
  is_approved           BOOLEAN,
  is_draft              BOOLEAN,
  uses_teacher_questions BOOLEAN,
  created_at            TIMESTAMPTZ,
  question_count        BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-spoofing: caller must own the teacher record they are querying.
  -- Use explicit table alias to avoid ambiguity with the RETURNS TABLE 'id' column.
  IF NOT EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: teacher record does not belong to caller';
  END IF;

  RETURN QUERY
    SELECT
      me.id,
      me.title,
      me.exam_type,
      me.target_group,
      me.duration_minutes,
      me.total_questions,
      me.is_approved,
      me.is_draft,
      me.uses_teacher_questions,
      me.created_at,
      COUNT(teq.id) AS question_count
    FROM mock_exams me
    LEFT JOIN teacher_exam_questions teq ON teq.exam_id = me.id
    WHERE me.created_by_teacher = p_teacher_id
    GROUP BY me.id
    ORDER BY me.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_teacher_exams(UUID) TO authenticated;

-- get_teacher_exam_group_subjects: Returns subjects for a group+stage from exam_group_subjects (hotfix 80)
-- Used by TeacherBuildExamScreen to show required subjects for first/second stage exams.
DROP FUNCTION IF EXISTS get_teacher_exam_group_subjects(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_teacher_exam_group_subjects(
  p_group_code TEXT,
  p_stage      TEXT  -- 'first' or 'second'
)
RETURNS TABLE (
  group_id          UUID,
  subject_id        UUID,
  subject_name_az   TEXT,
  subject_name_en   TEXT,
  coefficient       DECIMAL,
  questions_count   INTEGER,
  subject_max_points INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_group_id         UUID;
  v_max_points       INTEGER;
  v_total_coefficient DECIMAL;
BEGIN
  -- Resolve group
  SELECT
    eg.id,
    CASE WHEN p_stage = 'first' THEN eg.first_stage_max_points
         ELSE eg.second_stage_max_points
    END
  INTO v_group_id, v_max_points
  FROM exam_groups eg
  WHERE eg.code = p_group_code AND eg.is_active = true;

  IF v_group_id IS NULL THEN RETURN; END IF;

  -- Sum of coefficients for this stage (to compute weighted max_points per subject)
  SELECT COALESCE(SUM(egs.coefficient), 0)
  INTO v_total_coefficient
  FROM exam_group_subjects egs
  WHERE egs.exam_group_id = v_group_id
    AND egs.stage = p_stage
    AND egs.is_active = true;

  RETURN QUERY
    SELECT
      v_group_id                                                            AS group_id,
      s.id                                                                  AS subject_id,
      s.name_az                                                             AS subject_name_az,
      COALESCE(s.name_en, s.name_az)                                        AS subject_name_en,
      egs.coefficient,
      egs.questions_count,
      ROUND((egs.coefficient / NULLIF(v_total_coefficient, 0)) * v_max_points)::INTEGER
        AS subject_max_points
    FROM exam_group_subjects egs
    JOIN subjects s ON s.id = egs.subject_id
    WHERE egs.exam_group_id = v_group_id
      AND egs.stage = p_stage
      AND egs.is_active = true
    ORDER BY egs.display_order ASC, egs.coefficient DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_group_subjects(TEXT, TEXT) TO authenticated;

-- Updated get_mock_exam_details: handles both official exams and teacher exams
CREATE OR REPLACE FUNCTION get_mock_exam_details(p_exam_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON;
  v_uses_teacher_questions BOOLEAN;
BEGIN
  SELECT uses_teacher_questions INTO v_uses_teacher_questions
  FROM mock_exams WHERE id = p_exam_id;

  IF v_uses_teacher_questions = TRUE THEN
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(json_build_object(
            'id', teq.id,
            'question_id', COALESCE(teq.question_id::text, teq.teacher_question_id::text),
            'question_order', teq.question_order,
            'question_text',  COALESCE(q.question_text, tq.question_text),
            'question_type',  COALESCE(q.question_type::text, tq.question_type),
            'group_id', q.group_id, 'group_order', q.group_order, 'context_text', NULL,
            'subject_id', COALESCE(q.subject_id, tq.subject_id),
            'subject_name', s.name_en,
            'difficulty', COALESCE(q.difficulty::text,
              CASE tq.difficulty WHEN 1 THEN 'easy' WHEN 2 THEN 'easy'
                WHEN 3 THEN 'medium' WHEN 4 THEN 'hard' WHEN 5 THEN 'hard' END),
            'correct_answer', COALESCE(q.correct_answer, tq.correct_answer),
            'source', CASE WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher' ELSE 'elmly' END
          ) ORDER BY teq.question_order)
         FROM teacher_exam_questions teq
         LEFT JOIN questions q ON q.id = teq.question_id
         LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
         LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
         WHERE teq.exam_id = me.id), '[]'::json)
    ) INTO v_result FROM mock_exams me WHERE me.id = p_exam_id;
  ELSE
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(json_build_object(
            'id', meq.id, 'question_id', meq.question_id,
            'question_order', meq.question_order, 'question_text', q.question_text,
            'question_type', q.question_type, 'group_id', q.group_id,
            'group_order', q.group_order, 'context_text', qg.context_text,
            'subject_id', q.subject_id, 'subject_name', s.name_en, 'difficulty', q.difficulty,
            'correct_answer', q.correct_answer
          ) ORDER BY meq.question_order)
         FROM mock_exam_questions meq
         JOIN questions q ON q.id = meq.question_id
         JOIN subjects s ON s.id = q.subject_id
         LEFT JOIN question_groups qg ON qg.id = q.group_id
         WHERE meq.mock_exam_id = me.id), '[]'::json)
    ) INTO v_result FROM mock_exams me WHERE me.id = p_exam_id;
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================
-- admin_get_teacher_submissions: Admin RPC to get teacher exam submissions
-- SECURITY DEFINER to bypass RLS on teacher_exam_questions (admin user ≠ owner)
-- (hotfix 82 + hotfix 85: added admin auth check)

DROP FUNCTION IF EXISTS admin_get_teacher_submissions(TEXT);

CREATE OR REPLACE FUNCTION admin_get_teacher_submissions(
  p_status TEXT DEFAULT NULL   -- 'pending' | 'approved' | NULL (all)
)
RETURNS TABLE (
  id                     UUID,
  title                  TEXT,
  exam_type              TEXT,
  target_group           TEXT,
  duration_minutes       INTEGER,
  total_questions        INTEGER,
  created_at             TIMESTAMPTZ,
  is_official            BOOLEAN,
  created_by_teacher     UUID,
  is_approved            BOOLEAN,
  uses_teacher_questions BOOLEAN,
  teacher_name           TEXT,
  teacher_avatar_url     TEXT,
  question_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only: reject non-admin callers
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    me.is_official,
    me.created_by_teacher,
    me.is_approved,
    me.uses_teacher_questions,
    pr.full_name                                              AS teacher_name,
    pr.avatar_url                                             AS teacher_avatar_url,
    (SELECT COUNT(*) FROM teacher_exam_questions teq
     WHERE teq.exam_id = me.id)                              AS question_count
  FROM mock_exams me
  JOIN teachers t  ON t.id  = me.created_by_teacher
  JOIN profiles pr ON pr.id = t.user_id
  WHERE me.created_by_teacher IS NOT NULL
    AND me.is_draft = FALSE             -- drafts never appear in admin review queue
    AND (
      p_status IS NULL
      OR (p_status = 'pending'  AND me.is_approved = FALSE)
      OR (p_status = 'approved' AND me.is_approved = TRUE)
    )
  ORDER BY me.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_teacher_submissions(TEXT) TO authenticated;

-- ============================================
-- DONE: Question, Exam & Subject/Topic Management Functions
-- Total: ~34 functions
-- ============================================
