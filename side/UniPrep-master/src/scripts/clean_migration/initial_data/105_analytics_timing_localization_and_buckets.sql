-- ============================================================================
-- Migration 105: Analytics timing localization and difficulty metadata
-- ============================================================================
-- Purpose:
-- - Return localized subject labels for mobile analytics timing cards.
-- - Keep timing buckets difficulty-adjusted and expose the benchmark context.
-- - Preserve owner/admin access checks from migration 104.
--
-- Owner applies this file manually in Supabase SQL Editor.

DROP FUNCTION IF EXISTS get_student_timing_performance(UUID, INTEGER, UUID);

CREATE OR REPLACE FUNCTION get_student_timing_performance(
  p_student_id UUID,
  p_period_days INTEGER DEFAULT 30,
  p_subject_id UUID DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  subject_name_en TEXT,
  subject_name_az TEXT,
  topic_name TEXT,
  subtopic_id UUID,
  subtopic_name TEXT,
  total_attempts INTEGER,
  answered_attempts INTEGER,
  skipped_attempts INTEGER,
  correct_attempts INTEGER,
  accuracy NUMERIC,
  avg_time_seconds NUMERIC,
  median_time_seconds NUMERIC,
  p95_time_seconds NUMERIC,
  avg_expected_seconds NUMERIC,
  easy_attempts INTEGER,
  medium_attempts INTEGER,
  hard_attempts INTEGER,
  fast_count INTEGER,
  normal_count INTEGER,
  slow_count INTEGER,
  very_slow_count INTEGER,
  last_attempted TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_student_user_id UUID;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT s.user_id INTO v_student_user_id
  FROM students s
  WHERE s.id = p_student_id;

  IF v_student_user_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM admins a
    WHERE a.user_id = v_user_id
      AND a.is_active = TRUE
  ) INTO v_is_admin;

  IF v_student_user_id <> v_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH canonical_answers AS (
    SELECT DISTINCT ON (sa.user_id, sa.practice_session_id, sa.question_id)
      sa.user_id,
      sa.practice_session_id,
      sa.question_id,
      COALESCE(sa.is_correct, FALSE) AS is_correct,
      COALESCE(sa.was_skipped, FALSE) AS was_skipped,
      LEAST(GREATEST(COALESCE(sa.time_spent_seconds, 0), 0), 1800) AS time_spent_seconds,
      COALESCE(sa.answered_at, sa.created_at) AS answered_at
    FROM student_answers sa
    JOIN practice_sessions ps ON ps.id = sa.practice_session_id
    WHERE ps.user_id = v_student_user_id
      AND ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - (GREATEST(COALESCE(p_period_days, 30), 1) || ' days')::INTERVAL
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  ),
  answer_context AS (
    SELECT
      ca.*,
      q.subject_id,
      q.topic,
      q.subtopic_id,
      LOWER(COALESCE(q.difficulty, 'medium')) AS difficulty,
      CASE LOWER(COALESCE(q.difficulty, 'medium'))
        WHEN 'easy' THEN 35
        WHEN 'hard' THEN 120
        ELSE 75
      END AS expected_seconds
    FROM canonical_answers ca
    JOIN questions q ON q.id = ca.question_id
    WHERE p_subject_id IS NULL OR q.subject_id = p_subject_id
  )
  SELECT
    s.id AS subject_id,
    s.name_en AS subject_name,
    s.name_en AS subject_name_en,
    s.name_az AS subject_name_az,
    ac.topic AS topic_name,
    ss.id AS subtopic_id,
    ss.subtopic_name,
    COUNT(*)::INTEGER AS total_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE))::INTEGER AS answered_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = TRUE))::INTEGER AS skipped_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.is_correct = TRUE))::INTEGER AS correct_attempts,
    ROUND(
      COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE ac.was_skipped = FALSE), 0) * 100,
      2
    ) AS accuracy,
    ROUND((AVG(ac.time_spent_seconds) FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds,
    (percentile_disc(0.5) WITHIN GROUP (ORDER BY ac.time_spent_seconds)
      FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC AS median_time_seconds,
    (percentile_disc(0.95) WITHIN GROUP (ORDER BY ac.time_spent_seconds)
      FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC AS p95_time_seconds,
    ROUND((AVG(ac.expected_seconds) FILTER (WHERE ac.was_skipped = FALSE))::NUMERIC, 1) AS avg_expected_seconds,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'easy'))::INTEGER AS easy_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'medium'))::INTEGER AS medium_attempts,
    (COUNT(*) FILTER (WHERE ac.was_skipped = FALSE AND ac.difficulty = 'hard'))::INTEGER AS hard_attempts,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE AND ac.time_spent_seconds <= ac.expected_seconds * 0.6
    ))::INTEGER AS fast_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE
        AND ac.time_spent_seconds > ac.expected_seconds * 0.6
        AND ac.time_spent_seconds <= ac.expected_seconds * 1.2
    ))::INTEGER AS normal_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE
        AND ac.time_spent_seconds > ac.expected_seconds * 1.2
        AND ac.time_spent_seconds <= ac.expected_seconds * 2.0
    ))::INTEGER AS slow_count,
    (COUNT(*) FILTER (
      WHERE ac.was_skipped = FALSE AND ac.time_spent_seconds > ac.expected_seconds * 2.0
    ))::INTEGER AS very_slow_count,
    MAX(ac.answered_at) AS last_attempted
  FROM answer_context ac
  JOIN subjects s ON s.id = ac.subject_id
  LEFT JOIN subject_subtopics ss ON ss.id = ac.subtopic_id
  GROUP BY s.id, s.name_en, s.name_az, ac.topic, ss.id, ss.subtopic_name
  HAVING COUNT(*) > 0
  ORDER BY s.name_en, ac.topic NULLS LAST, ss.subtopic_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_timing_performance(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION get_student_timing_performance IS
  'Student/admin scoped timing analytics over deduplicated canonical practice answers with localized subject names and difficulty-adjusted bucket context.';
