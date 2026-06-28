-- ============================================================================
-- Hotfix 74: Fix search_mock_exams + create_mock_exam RPCs
-- ============================================================================
-- Problem 1: search_mock_exams did not return is_official, created_by_teacher,
--            is_approved, uses_teacher_questions — the admin filter tab was broken.
-- Problem 2: create_mock_exam did not set is_official = TRUE — admin-created exams
--            were not being stamped as official by default.
-- ============================================================================

-- Fix search_mock_exams to include new columns
-- Must DROP first because return type changed (new columns added)
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
  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    COUNT(meq.id)          AS question_count,
    me.is_official,
    me.created_by_teacher,
    me.is_approved,
    me.uses_teacher_questions
  FROM mock_exams me
  LEFT JOIN mock_exam_questions meq ON me.id = meq.mock_exam_id
  WHERE (p_exam_type   IS NULL OR me.exam_type   = p_exam_type)
    AND (p_target_group IS NULL OR me.target_group = p_target_group)
    AND (p_search_text  IS NULL OR me.title ILIKE '%' || p_search_text || '%')
  GROUP BY me.id
  ORDER BY me.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_mock_exams(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Fix create_mock_exam: admin-created exams are always Official Elmly exams
CREATE OR REPLACE FUNCTION create_mock_exam(
  p_title            TEXT,
  p_exam_type        TEXT,
  p_target_group     TEXT,
  p_duration_minutes INTEGER,
  p_total_questions  INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id UUID;
BEGIN
  -- Anti-spoofing: only admins can create exams via this RPC
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO mock_exams (
    title, exam_type, target_group, duration_minutes, total_questions,
    is_official, is_approved     -- admin-created = official + pre-approved
  )
  VALUES (
    p_title, p_exam_type, p_target_group, p_duration_minutes, p_total_questions,
    TRUE, TRUE
  )
  RETURNING id INTO v_exam_id;

  RETURN v_exam_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_mock_exam(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
