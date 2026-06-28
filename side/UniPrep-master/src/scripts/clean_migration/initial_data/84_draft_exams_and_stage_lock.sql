-- Hotfix 84: Draft exam support + stage exam total_questions lock
--
-- Changes:
-- 1. Add is_draft BOOLEAN to mock_exams — saves incomplete exams without triggering admin review.
--    Existing pending exams retain is_draft=FALSE (already submitted for review).
-- 2. Update get_my_teacher_exams RPC to return is_draft field.
-- 3. Update admin_get_teacher_submissions RPC to exclude draft exams from review queue.

-- ── 1. Schema ─────────────────────────────────────────────────────────────────

ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. get_my_teacher_exams — include is_draft ────────────────────────────────

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
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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

-- ── 3. admin_get_teacher_submissions — exclude drafts ─────────────────────────

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
