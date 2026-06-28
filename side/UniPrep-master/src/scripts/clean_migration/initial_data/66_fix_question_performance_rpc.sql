-- ============================================================================
-- Hotfix 66: Fix admin_get_question_performance (real skip rate + date filter)
-- and admin_get_content_quality_issues (real skip rate)
-- ============================================================================
-- PROBLEMS:
-- 1. 'skipRate' hardcoded as 0 in both functions
-- 2. admin_get_question_performance had no date range params
-- 3. Date picker in admin analytics/content page had zero effect
-- 4. p_needs_review filter was declared but never applied in WHERE
-- ============================================================================

-- Drop any overloaded versions from 04d that conflict
DROP FUNCTION IF EXISTS admin_get_question_performance(UUID, INTEGER);
DROP FUNCTION IF EXISTS admin_get_question_performance(UUID, TEXT, BOOLEAN, INTEGER);

-- 1. Rewrite admin_get_question_performance with skip rate + date filtering
CREATE OR REPLACE FUNCTION admin_get_question_performance(
  p_subject_id   UUID    DEFAULT NULL,
  p_difficulty   TEXT    DEFAULT NULL,
  p_needs_review BOOLEAN DEFAULT NULL,
  p_limit        INTEGER DEFAULT 100,
  p_start_date   DATE    DEFAULT NULL,
  p_end_date     DATE    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(question_data ORDER BY total_attempts DESC NULLS LAST)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'questionId',      q.id,
      'questionText',    LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName',     s.name_en,
      'difficulty',      q.difficulty,
      'accuracy',        ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts',        COALESCE(stats.total_answers, 0),
      'skipRate',        ROUND(COALESCE(stats.skip_rate, 0), 1),
      'avgTimeToAnswer', ROUND(COALESCE(stats.avg_time, 0), 0),
      'needsReview',     (
        COALESCE(stats.accuracy, 100) < 30
        OR COALESCE(stats.accuracy, 0) > 95
        OR COALESCE(stats.skip_rate, 0) > 40
      )
    ) as question_data,
    COALESCE(stats.total_answers, 0) as total_attempts
    FROM questions q
    JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                                  AS total_answers,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END)                    AS accuracy,
        AVG(COALESCE(sa.time_spent_seconds, 0))                                  AS avg_time,
        ROUND(
          COUNT(*) FILTER (WHERE sa.was_skipped = TRUE)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
          1
        )                                                                         AS skip_rate
      FROM student_answers sa
      WHERE sa.question_id = q.id
        AND (p_start_date IS NULL OR sa.answered_at::DATE >= p_start_date)
        AND (p_end_date   IS NULL OR sa.answered_at::DATE <= p_end_date)
    ) stats ON true
    WHERE q.is_active = TRUE
      AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
      AND (p_difficulty IS NULL OR q.difficulty  = p_difficulty)
      AND (
        p_needs_review IS NULL
        OR p_needs_review = FALSE
        OR (
          COALESCE(stats.accuracy, 100) < 30
          OR COALESCE(stats.accuracy, 0) > 95
          OR COALESCE(stats.skip_rate, 0) > 40
        )
      )
    ORDER BY COALESCE(stats.total_answers, 0) DESC NULLS LAST
    LIMIT p_limit
  ) subquery;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_question_performance(UUID, TEXT, BOOLEAN, INTEGER, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_question_performance(UUID, TEXT, BOOLEAN, INTEGER, DATE, DATE) TO authenticated;

-- 2. Rewrite admin_get_content_quality_issues with real skip rate
CREATE OR REPLACE FUNCTION admin_get_content_quality_issues()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(quality_data ORDER BY total_attempts DESC)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'questionId',  q.id,
      'questionText', LEFT(q.question_text, 100) || CASE WHEN LENGTH(q.question_text) > 100 THEN '...' ELSE '' END,
      'subjectName', s.name_en,
      'difficulty',  q.difficulty,
      'accuracy',    ROUND(COALESCE(stats.accuracy, 0), 2),
      'attempts',    COALESCE(stats.total_answers, 0),
      'skipRate',    ROUND(COALESCE(stats.skip_rate, 0), 1),
      'needsReview', TRUE
    ) as quality_data,
    COALESCE(stats.total_answers, 0) as total_attempts
    FROM questions q
    JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                                  AS total_answers,
        AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END)                    AS accuracy,
        ROUND(
          COUNT(*) FILTER (WHERE sa.was_skipped = TRUE)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
          1
        )                                                                         AS skip_rate
      FROM student_answers sa
      WHERE sa.question_id = q.id
      HAVING COUNT(*) >= 20
    ) stats ON true
    WHERE q.is_active = TRUE
      AND (
        stats.accuracy < 20
        OR stats.accuracy > 95
        OR stats.skip_rate > 40
      )
    LIMIT 100
  ) subquery;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_content_quality_issues() TO service_role;

NOTIFY pgrst, 'reload schema';
