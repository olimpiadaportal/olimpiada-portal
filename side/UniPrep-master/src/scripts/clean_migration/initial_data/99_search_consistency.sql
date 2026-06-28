-- Hotfix 99: Search consistency and indexed full-text alignment
-- Purpose:
--   Align canonical question/forum search with the full-text indexes that exist
--   in the clean migration flow, while preserving substring fallback behavior
--   for partial user queries.

-- ---------------------------------------------------------------------------
-- Official question-bank search
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_questions_search_text
  ON questions USING GIN(to_tsvector('simple', question_text));

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
    s.name_en AS subject_name,
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
  LEFT JOIN subjects s ON s.id = q.subject_id
  LEFT JOIN subject_subtopics ss ON ss.id = q.subtopic_id
  WHERE
    (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
    AND (p_is_active IS NULL OR q.is_active = p_is_active)
    AND (
      v_search_text IS NULL
      OR to_tsvector('simple', q.question_text) @@ v_search_query
      OR q.question_text ILIKE '%' || v_search_text || '%'
    )
    AND (p_tags IS NULL OR q.tags && p_tags)
  ORDER BY
    CASE
      WHEN v_search_query IS NULL THEN 0
      ELSE ts_rank(to_tsvector('simple', q.question_text), v_search_query)
    END DESC,
    q.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

COMMENT ON FUNCTION search_questions(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, INTEGER) IS
  'Searches official question-bank questions using indexed simple full-text search with substring fallback and bounded pagination.';

GRANT EXECUTE ON FUNCTION search_questions(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Forum search
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_forum_questions_search;
CREATE INDEX idx_forum_questions_search ON forum_questions
  USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(body_plain, '')));

CREATE OR REPLACE FUNCTION search_forum_question_ids(
    p_query TEXT,
    p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_query TEXT := NULLIF(TRIM(p_query), '');
    v_tsquery TSQUERY;
BEGIN
    IF v_query IS NULL THEN
        RETURN;
    END IF;

    v_tsquery := websearch_to_tsquery('simple', v_query);

    RETURN QUERY
    SELECT fq.id
    FROM forum_questions fq
    WHERE fq.is_deleted = FALSE
      AND (
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, ''))
          @@ v_tsquery
        OR fq.title ILIKE '%' || v_query || '%'
        OR fq.body_plain ILIKE '%' || v_query || '%'
      )
    ORDER BY
      ts_rank(
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, '')),
        v_tsquery
      ) DESC,
      fq.upvotes DESC,
      fq.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
END;
$$;

COMMENT ON FUNCTION search_forum_question_ids(TEXT, INTEGER) IS
  'Returns forum question IDs using simple full-text search with substring fallback. Used to avoid string-built PostgREST OR filters.';

GRANT EXECUTE ON FUNCTION search_forum_question_ids(TEXT, INTEGER) TO anon, authenticated;
