-- ============================================================================
-- Hotfix 86: Fix ambiguous "id" column reference in get_my_teacher_exams
--
-- Bug: PostgreSQL error 42702 "column reference 'id' is ambiguous"
-- Root cause: The RETURNS TABLE clause declares a column named 'id UUID'.
-- Inside the function body, the anti-spoofing check used unqualified 'id'
-- in "WHERE id = p_teacher_id", which PostgreSQL could not resolve between
-- the return-table's 'id' column and the 'teachers.id' column.
-- Fix: Qualify both columns with the table alias 't'.
-- ============================================================================

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

NOTIFY pgrst, 'reload schema';
