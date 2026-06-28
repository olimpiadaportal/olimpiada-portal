-- ============================================================================
-- Hotfix 81: Fix exam_answers ON CONFLICT + search_mock_exams question count
-- 1. Replace partial unique index on exam_answers with non-partial to fix 42P10
--    error in PostgREST upsert (partial indexes require matching WHERE clause)
-- 2. Update search_mock_exams to count from teacher_exam_questions for teacher
--    exams (fixes 0/30 display in admin Exam Management list)
-- ============================================================================


-- ─── Part 1: Fix exam_answers ON CONFLICT 42P10 ──────────────────────────────
-- Root cause: hotfix 80 replaced UNIQUE(attempt_id, question_id) with two
-- partial unique indexes. PostgREST's onConflict: 'attempt_id,question_id'
-- generates SQL: ON CONFLICT (attempt_id, question_id) DO UPDATE ...
-- PostgreSQL requires a non-partial index for this syntax.
-- Fix: drop the partial index on question_id, add a non-partial unique index.
-- NULLs are treated as distinct in PostgreSQL unique indexes, so multiple rows
-- with question_id=NULL are allowed (used for rows where teacher_question_id
-- is the identifier instead).

DROP INDEX IF EXISTS exam_answers_attempt_elmly_q;

CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_attempt_question_ukey
  ON exam_answers (attempt_id, question_id);

-- Keep exam_answers_attempt_teacher_q for rows using teacher_question_id as primary key


-- ─── Part 2: Fix search_mock_exams to count teacher_exam_questions ────────────
-- Root cause: search_mock_exams LEFT JOINs mock_exam_questions for question_count.
-- Teacher exams store questions in teacher_exam_questions, so they always show 0.
-- Fix: use per-row subqueries to count from the correct table based on exam type.

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
  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    -- Count from correct table based on exam source
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
  WHERE (p_exam_type    IS NULL OR me.exam_type    = p_exam_type)
    AND (p_target_group IS NULL OR me.target_group = p_target_group)
    AND (p_search_text  IS NULL OR me.title ILIKE '%' || p_search_text || '%')
  ORDER BY me.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_mock_exams(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
