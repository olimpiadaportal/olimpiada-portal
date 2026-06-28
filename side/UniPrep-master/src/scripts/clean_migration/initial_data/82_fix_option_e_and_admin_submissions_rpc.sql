-- ============================================================================
-- Hotfix 82: Fix option_e for Elmly questions in teacher exams + admin RPC
-- 1. Fix get_teacher_exam_questions: option_e was only reading tq.option_e
--    (teacher questions). Elmly questions have option_e on the questions table.
--    Fix: COALESCE(q.option_e, tq.option_e) so Elmly questions also return E.
-- 2. Add admin_get_teacher_submissions SECURITY DEFINER RPC so the admin panel
--    can read teacher_exam_questions counts without RLS blocking.
--    Root cause: PostgREST embedding of teacher_exam_questions(count) is blocked
--    by RLS (admin user ≠ exam owner). SECURITY DEFINER bypasses RLS.
-- ============================================================================


-- ─── Part 1: Fix option_e for Elmly questions in get_teacher_exam_questions ──

-- Must DROP first — RETURNS TABLE signature changed (option_e column now included via COALESCE)
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
  RETURN QUERY
    SELECT
      teq.id,
      teq.question_order,
      COALESCE(teq.question_id, teq.teacher_question_id)     AS question_id,
      COALESCE(q.question_text, tq.question_text)::TEXT       AS question_text,
      COALESCE(q.question_type::TEXT, tq.question_type)       AS question_type,
      COALESCE(q.option_a, tq.option_a)::TEXT                 AS option_a,
      COALESCE(q.option_b, tq.option_b)::TEXT                 AS option_b,
      COALESCE(q.option_c, tq.option_c)::TEXT                 AS option_c,
      COALESCE(q.option_d, tq.option_d)::TEXT                 AS option_d,
      COALESCE(q.option_e, tq.option_e)::TEXT                 AS option_e,   -- fixed: was tq.option_e only
      COALESCE(q.correct_answer, tq.correct_answer)::TEXT     AS correct_answer,
      COALESCE(q.explanation, tq.explanation)::TEXT           AS explanation,
      COALESCE(
        q.difficulty::TEXT,
        CASE tq.difficulty
          WHEN 1 THEN 'easy' WHEN 2 THEN 'easy'
          WHEN 3 THEN 'medium'
          WHEN 4 THEN 'hard' WHEN 5 THEN 'hard'
        END
      )                                                       AS difficulty,
      COALESCE(q.subject_id, tq.subject_id)                   AS subject_id,
      s.name_en::TEXT                                         AS subject_name,
      CASE WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher' ELSE 'elmly' END AS source
    FROM teacher_exam_questions teq
    LEFT JOIN questions q         ON q.id  = teq.question_id
    LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
    LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
    WHERE teq.exam_id = p_exam_id
    ORDER BY teq.question_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_questions(UUID) TO authenticated;


-- ─── Part 2: admin_get_teacher_submissions SECURITY DEFINER RPC ───────────────
-- Returns all teacher exam submissions with teacher profile info and actual
-- question count from teacher_exam_questions. SECURITY DEFINER allows counting
-- across RLS boundary (admin user can't see teacher-owned rows normally).

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
    AND (
      p_status IS NULL
      OR (p_status = 'pending'  AND me.is_approved = FALSE)
      OR (p_status = 'approved' AND me.is_approved = TRUE)
    )
  ORDER BY me.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_teacher_submissions(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
