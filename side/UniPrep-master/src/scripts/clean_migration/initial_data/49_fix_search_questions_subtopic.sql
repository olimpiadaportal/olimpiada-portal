-- ============================================================
-- Fix: search_questions — add subtopic_id and subtopic_name
--
-- The search_questions RPC was missing subtopic_id and subtopic_name
-- from its RETURNS TABLE and SELECT, so client-side subtopic
-- filtering in the admin questions page always returned empty
-- (q.subtopic_id was undefined on every row).
--
-- Also: p_exam_stage was in the signature but unused in the WHERE.
-- Now applied as a filter (NULL = no restriction).
--
-- Run this in the Supabase SQL editor on the live DB.
-- Back-ported into: 04c_question_exam_functions.sql
-- ============================================================

-- Must DROP first because changing RETURNS TABLE columns requires it
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
AS $$
BEGIN
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
    AND (p_search_text IS NULL OR q.question_text ILIKE '%' || p_search_text || '%')
    AND (p_tags        IS NULL OR q.tags && p_tags)
  ORDER BY q.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_questions TO authenticated;
