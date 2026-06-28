-- ============================================================================
-- Hotfix 67: Feedback abuse prevention + admin_get_student_list RPC
-- ============================================================================
-- CHANGES:
-- 1. Add UNIQUE(user_id, question_id) to question_feedback to prevent duplicates
-- 2. Add admin_get_student_list RPC with aggregated daily_stats in single query
--    (replaces N+1 client loop; bypasses RLS via SECURITY DEFINER)
-- ============================================================================

-- 1. UNIQUE constraint — one report per user per question
ALTER TABLE question_feedback
  DROP CONSTRAINT IF EXISTS question_feedback_user_question_unique;

ALTER TABLE question_feedback
  ADD CONSTRAINT question_feedback_user_question_unique
  UNIQUE (user_id, question_id);

-- 2. Efficient student list with aggregated stats
CREATE OR REPLACE FUNCTION admin_get_student_list(
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL,
  p_limit      INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_data ORDER BY total_questions DESC NULLS LAST)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'id',                s.id,
      'userId',            s.user_id,
      'name',              COALESCE(p.full_name, 'Unknown'),
      'city',              COALESCE(s.city, 'Unknown'),
      'targetGroup',       COALESCE(s.target_group, 'Unknown'),
      'currentStreak',     COALESCE(s.current_streak, 0),
      'lastActive',        s.last_active_date,
      'questionsAttempted', COALESCE(stats.total_questions, 0),
      'accuracy',          COALESCE(ROUND(
                             CASE WHEN stats.total_questions > 0
                               THEN stats.total_correct::NUMERIC / stats.total_questions * 100
                             ELSE 0 END, 1
                           ), 0),
      'studyTime',         COALESCE(stats.total_study_time, 0)
    ) as row_data,
    COALESCE(stats.total_questions, 0) as total_questions
    FROM students s
    -- profiles.id = auth.users.id (profiles has no separate user_id column)
    LEFT JOIN profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(ds.questions_attempted)  AS total_questions,
        SUM(ds.questions_correct)    AS total_correct,
        SUM(ds.study_time_minutes)   AS total_study_time
      FROM daily_stats ds
      WHERE ds.student_id = s.id
        AND (p_start_date IS NULL OR ds.date >= p_start_date)
        AND (p_end_date   IS NULL OR ds.date <= p_end_date)
    ) stats ON true
    -- Exclude admin/teacher profiles from the student list
    WHERE (p.user_type IS NULL OR p.user_type = 'student')
    ORDER BY COALESCE(stats.total_questions, 0) DESC NULLS LAST
    LIMIT p_limit
  ) subquery;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_student_list(DATE, DATE, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_student_list(DATE, DATE, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
