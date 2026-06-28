-- Hotfix 98: Source-weighted prediction evidence
-- Purpose:
--   Replace predicted-score reliance on mutable study_progress aggregates with
--   distinct-question evidence from official exams, quizzes, and practice.
--   The mobile app can use raw distinct counts for display and weighted counts
--   for prediction math.

-- ---------------------------------------------------------------------------
-- Prediction evidence indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_student_answers_prediction
  ON student_answers(user_id, question_id, answered_at DESC)
  WHERE was_skipped = FALSE;

CREATE INDEX IF NOT EXISTS idx_practice_sessions_prediction
  ON practice_sessions(user_id, completed, mode, id);

CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_prediction
  ON mock_exam_attempts(user_id, status, mock_exam_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_answers_prediction
  ON exam_answers(attempt_id, question_id)
  WHERE question_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- get_score_prediction_evidence
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS get_score_prediction_evidence(UUID, UUID[]);

CREATE OR REPLACE FUNCTION get_score_prediction_evidence(
  p_student_id UUID,
  p_subject_ids UUID[]
)
RETURNS TABLE (
  subject_id UUID,
  questions_attempted INTEGER,
  questions_correct INTEGER,
  weighted_attempted NUMERIC,
  weighted_correct NUMERIC,
  official_attempted INTEGER,
  official_correct INTEGER,
  quiz_attempted INTEGER,
  quiz_correct INTEGER,
  practice_attempted INTEGER,
  practice_correct INTEGER,
  coverage_topics INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT s.user_id
  INTO v_user_id
  FROM students s
  WHERE s.id = p_student_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_user_id
     AND NOT EXISTS (
       SELECT 1
       FROM admins a
       WHERE a.user_id = auth.uid()
         AND a.is_active = TRUE
     ) THEN
    RAISE EXCEPTION 'Not allowed to read prediction evidence for this student';
  END IF;

  RETURN QUERY
  WITH requested_subjects AS (
    SELECT DISTINCT UNNEST(COALESCE(p_subject_ids, ARRAY[]::UUID[])) AS subject_id
  ),
  source_candidates AS (
    -- Official Elmly exams are the strongest signal. Teacher exams are excluded.
    SELECT
      q.subject_id,
      ea.question_id,
      CASE
        WHEN ea.selected_answer IS NOT NULL THEN ea.selected_answer = q.correct_answer
        WHEN ea.final_score IS NOT NULL THEN ea.final_score >= 70
        ELSE FALSE
      END AS is_correct,
      'official'::TEXT AS source_kind,
      1.0::NUMERIC AS source_weight,
      3 AS source_priority,
      COALESCE(ea.answered_at, mea.completed_at, mea.updated_at, mea.started_at) AS answered_at,
      q.topic
    FROM exam_answers ea
    JOIN mock_exam_attempts mea ON mea.id = ea.attempt_id
    JOIN mock_exams me ON me.id = mea.mock_exam_id
    JOIN questions q ON q.id = ea.question_id
    JOIN requested_subjects rs ON rs.subject_id = q.subject_id
    WHERE mea.user_id = v_user_id
      AND mea.status = 'completed'
      AND me.is_official = TRUE
      AND me.uses_teacher_questions = FALSE
      AND me.created_by_teacher IS NULL
      AND ea.question_id IS NOT NULL
      AND (
        ea.selected_answer IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(ea.text_answer, '')), '') IS NOT NULL
        OR ea.final_score IS NOT NULL
      )

    UNION ALL

    -- Quiz and practice are useful, but less comparable than official exams.
    SELECT
      q.subject_id,
      sa.question_id,
      COALESCE(sa.is_correct, FALSE) AS is_correct,
      ps.mode::TEXT AS source_kind,
      CASE WHEN ps.mode = 'quiz' THEN 0.70 ELSE 0.45 END::NUMERIC AS source_weight,
      CASE WHEN ps.mode = 'quiz' THEN 2 ELSE 1 END AS source_priority,
      COALESCE(sa.answered_at, sa.created_at, ps.completed_at, ps.started_at) AS answered_at,
      q.topic
    FROM student_answers sa
    JOIN practice_sessions ps ON ps.id = sa.practice_session_id
    JOIN questions q ON q.id = sa.question_id
    JOIN requested_subjects rs ON rs.subject_id = q.subject_id
    WHERE sa.user_id = v_user_id
      AND ps.user_id = v_user_id
      AND ps.completed = TRUE
      AND COALESCE(sa.was_skipped, FALSE) = FALSE
  ),
  chosen_question_evidence AS (
    SELECT DISTINCT ON (sc.subject_id, sc.question_id)
      sc.subject_id,
      sc.question_id,
      sc.is_correct,
      sc.source_kind,
      sc.source_weight,
      sc.topic
    FROM source_candidates sc
    ORDER BY
      sc.subject_id,
      sc.question_id,
      sc.source_priority DESC,
      sc.answered_at DESC NULLS LAST
  ),
  aggregated AS (
    SELECT
      cqe.subject_id,
      COUNT(*)::INTEGER AS questions_attempted,
      COUNT(*) FILTER (WHERE cqe.is_correct)::INTEGER AS questions_correct,
      ROUND(COALESCE(SUM(cqe.source_weight), 0), 2) AS weighted_attempted,
      ROUND(COALESCE(SUM(cqe.source_weight) FILTER (WHERE cqe.is_correct), 0), 2) AS weighted_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'official')::INTEGER AS official_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'official' AND cqe.is_correct)::INTEGER AS official_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'quiz')::INTEGER AS quiz_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'quiz' AND cqe.is_correct)::INTEGER AS quiz_correct,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'practice')::INTEGER AS practice_attempted,
      COUNT(*) FILTER (WHERE cqe.source_kind = 'practice' AND cqe.is_correct)::INTEGER AS practice_correct,
      COUNT(DISTINCT cqe.topic) FILTER (WHERE cqe.topic IS NOT NULL)::INTEGER AS coverage_topics
    FROM chosen_question_evidence cqe
    GROUP BY cqe.subject_id
  )
  SELECT
    rs.subject_id,
    COALESCE(a.questions_attempted, 0)::INTEGER,
    COALESCE(a.questions_correct, 0)::INTEGER,
    COALESCE(a.weighted_attempted, 0)::NUMERIC,
    COALESCE(a.weighted_correct, 0)::NUMERIC,
    COALESCE(a.official_attempted, 0)::INTEGER,
    COALESCE(a.official_correct, 0)::INTEGER,
    COALESCE(a.quiz_attempted, 0)::INTEGER,
    COALESCE(a.quiz_correct, 0)::INTEGER,
    COALESCE(a.practice_attempted, 0)::INTEGER,
    COALESCE(a.practice_correct, 0)::INTEGER,
    COALESCE(a.coverage_topics, 0)::INTEGER
  FROM requested_subjects rs
  LEFT JOIN aggregated a ON a.subject_id = rs.subject_id;
END;
$$;

COMMENT ON FUNCTION get_score_prediction_evidence(UUID, UUID[]) IS
  'Returns distinct-question, source-weighted evidence for predicted exam score. Official exams outrank quiz, quiz outranks practice, and repeated question attempts count once.';

GRANT EXECUTE ON FUNCTION get_score_prediction_evidence(UUID, UUID[]) TO authenticated;

