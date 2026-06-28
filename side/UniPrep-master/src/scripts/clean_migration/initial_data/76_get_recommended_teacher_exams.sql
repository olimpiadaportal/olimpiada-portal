-- Hotfix 76: get_recommended_teacher_exams RPC
-- Returns teachers who have >= 1 approved exam, ranked by group match,
-- location proximity, and exam count for the ExamsHubScreen teacher cards grid.
-- DROP first because PostgreSQL cannot change RETURNS TABLE signature via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id      UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  subjects        TEXT[],
  exam_count      BIGINT,
  avg_rating      NUMERIC,
  score           NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_group TEXT;
BEGIN
  -- Get student's target group for matching
  SELECT s.target_group INTO v_target_group
  FROM students s WHERE s.user_id = p_student_id;

  RETURN QUERY
    SELECT
      t.id                          AS teacher_id,
      u.full_name,
      u.avatar_url,
      t.specializations             AS subjects,
      COUNT(DISTINCT me.id)         AS exam_count,
      ROUND(AVG(tr.rating), 1)      AS avg_rating,
      -- Scoring formula:
      --   +30 group match (student's target group is in teacher's available_groups)
      --   +0–50 exam count (5 pts per approved exam, capped at 50)
      --   +0–20 rating (avg_rating × 4, defaulting to 3.0 if no reviews)
      (
        CASE
          WHEN v_target_group IS NOT NULL
               AND v_target_group = ANY(t.available_groups::TEXT[])
          THEN 30.0
          ELSE 0.0
        END
        + LEAST(COUNT(DISTINCT me.id)::NUMERIC * 5.0, 50.0)
        + COALESCE(AVG(tr.rating), 3.0) * 4.0
      )                             AS score
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    JOIN mock_exams me
      ON me.created_by_teacher = t.id
     AND me.is_approved = TRUE
    LEFT JOIN teacher_reviews tr ON tr.teacher_id = t.id
    WHERE t.is_verified = TRUE
    GROUP BY t.id, u.full_name, u.avatar_url, t.specializations, t.available_groups
    HAVING COUNT(DISTINCT me.id) >= 1
    ORDER BY score DESC
    LIMIT 50;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
