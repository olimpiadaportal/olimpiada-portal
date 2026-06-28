-- ============================================================================
-- Hotfix 70: Fix admin_get_question_feedback_grouped — UUID MIN() not supported
--
-- PostgreSQL has no built-in MIN() aggregate for UUID type.
-- Replace MIN(qf.id) with array_agg + index to get the earliest row's ID.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_question_feedback_grouped()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      (array_agg(qf.id ORDER BY qf.created_at))[1] AS id,
      qf.question_id,
      MAX(q.question_text)                          AS question_text,
      MAX(s.name_en)                                AS subject_name,
      MAX(q.difficulty)                             AS difficulty,
      MAX(q.topic)                                  AS topic,
      qf.feedback_type,
      -- Worst-case status: if any row in the group is pending → show pending
      CASE
        WHEN bool_or(qf.status = 'pending')   THEN 'pending'
        WHEN bool_or(qf.status = 'reviewed')  THEN 'reviewed'
        WHEN bool_or(qf.status = 'resolved')  THEN 'resolved'
        ELSE 'dismissed'
      END                                           AS status,
      -- Admin notes from the most recently updated row in this group
      (
        SELECT qf2.admin_notes
        FROM   question_feedback qf2
        WHERE  qf2.question_id    = qf.question_id
          AND  qf2.feedback_type  = qf.feedback_type
          AND  qf2.admin_notes   IS NOT NULL
        ORDER BY qf2.updated_at DESC
        LIMIT 1
      )                                             AS admin_notes,
      MIN(qf.created_at)                            AS created_at,
      COUNT(*)::INT                                 AS total_reports,
      -- Aggregated reporters list
      json_agg(
        json_build_object(
          'user_id',    qf.user_id,
          'name',       COALESCE(u.raw_user_meta_data->>'full_name', 'Anonymous'),
          'created_at', qf.created_at,
          'comment',    qf.comment
        )
        ORDER BY qf.created_at DESC
      )                                             AS reporters
    FROM  question_feedback qf
    JOIN  questions  q ON q.id = qf.question_id
    JOIN  subjects   s ON s.id = q.subject_id
    JOIN  auth.users u ON u.id = qf.user_id
    GROUP BY qf.question_id, qf.feedback_type
    ORDER BY
      CASE
        WHEN bool_or(qf.status = 'pending')   THEN 0
        WHEN bool_or(qf.status = 'reviewed')  THEN 1
        WHEN bool_or(qf.status = 'resolved')  THEN 2
        ELSE 3
      END,
      MIN(qf.created_at) DESC
    LIMIT 200
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_question_feedback_grouped() TO service_role;

NOTIFY pgrst, 'reload schema';
