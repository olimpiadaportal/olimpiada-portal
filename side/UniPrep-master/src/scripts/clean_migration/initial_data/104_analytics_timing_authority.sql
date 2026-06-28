-- Hotfix 104: Analytics timing authority and canonical practice answers
-- Purpose:
--   - Add an ownership-checked RPC for online practice answer timing upserts.
--   - Prevent new duplicate practice answer rows for the same session/question.
--   - Expose student-scoped timing performance over canonical student_answers.
--   - Move admin practice/content analytics from legacy practice_answers to student_answers.

CREATE OR REPLACE FUNCTION upsert_practice_answer_with_timing(
  p_practice_session_id UUID,
  p_question_id UUID,
  p_selected_answer TEXT DEFAULT NULL,
  p_text_answer TEXT DEFAULT NULL,
  p_is_correct BOOLEAN DEFAULT NULL,
  p_time_spent_seconds INTEGER DEFAULT 0,
  p_was_skipped BOOLEAN DEFAULT FALSE,
  p_answered_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_user_id UUID;
  v_session_subject_id UUID;
  v_session_question_ids UUID[];
  v_question_subject_id UUID;
  v_question_type TEXT;
  v_correct_answer TEXT;
  v_selected_answer TEXT;
  v_text_answer TEXT;
  v_has_answer BOOLEAN;
  v_was_skipped BOOLEAN;
  v_is_correct BOOLEAN;
  v_time_spent INTEGER;
  v_answered_at TIMESTAMPTZ;
  v_answer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_practice_session_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'Practice session and question are required';
  END IF;

  SELECT ps.user_id, ps.subject_id, COALESCE(ps.question_ids, '{}'::UUID[])
  INTO v_session_user_id, v_session_subject_id, v_session_question_ids
  FROM practice_sessions ps
  WHERE ps.id = p_practice_session_id;

  IF v_session_user_id IS NULL OR v_session_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Practice session not found';
  END IF;

  SELECT q.subject_id, COALESCE(q.question_type, 'mcq'), q.correct_answer
  INTO v_question_subject_id, v_question_type, v_correct_answer
  FROM questions q
  WHERE q.id = p_question_id
    AND q.is_active = TRUE;

  IF v_question_subject_id IS NULL THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF v_question_subject_id <> v_session_subject_id THEN
    RAISE EXCEPTION 'Question does not belong to this practice session subject';
  END IF;

  IF array_length(v_session_question_ids, 1) > 0
     AND NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'Question does not belong to this practice session';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::TEXT || ':' || p_practice_session_id::TEXT || ':' || p_question_id::TEXT,
      0
    )
  );

  v_selected_answer := CASE
    WHEN NULLIF(BTRIM(COALESCE(p_selected_answer, '')), '') IN ('A', 'B', 'C', 'D', 'E')
      THEN NULLIF(BTRIM(p_selected_answer), '')
    ELSE NULL
  END;
  v_text_answer := NULLIF(BTRIM(COALESCE(
    p_text_answer,
    CASE WHEN v_selected_answer IS NULL THEN p_selected_answer ELSE NULL END,
    ''
  )), '');
  v_has_answer := v_selected_answer IS NOT NULL OR v_text_answer IS NOT NULL;
  v_was_skipped := COALESCE(p_was_skipped, FALSE) OR NOT v_has_answer;
  v_time_spent := LEAST(GREATEST(COALESCE(p_time_spent_seconds, 0), 0), 1800);
  v_answered_at := COALESCE(p_answered_at, NOW());

  IF v_was_skipped THEN
    v_is_correct := FALSE;
    v_selected_answer := NULL;
    v_text_answer := NULL;
  ELSIF p_is_correct IS NOT NULL THEN
    v_is_correct := p_is_correct;
  ELSIF v_question_type = 'codable_open' THEN
    v_is_correct := LOWER(BTRIM(COALESCE(v_text_answer, ''))) = LOWER(BTRIM(COALESCE(v_correct_answer, '')));
  ELSE
    v_is_correct := COALESCE(v_selected_answer, '') = COALESCE(v_correct_answer, '');
  END IF;

  SELECT sa.id
  INTO v_answer_id
  FROM student_answers sa
  WHERE sa.user_id = v_user_id
    AND sa.practice_session_id = p_practice_session_id
    AND sa.question_id = p_question_id
  ORDER BY sa.answered_at DESC NULLS LAST, sa.created_at DESC NULLS LAST, sa.id DESC
  LIMIT 1;

  IF v_answer_id IS NULL THEN
    INSERT INTO student_answers (
      user_id,
      question_id,
      practice_session_id,
      selected_answer,
      text_answer,
      is_correct,
      time_spent_seconds,
      was_skipped,
      answered_at
    ) VALUES (
      v_user_id,
      p_question_id,
      p_practice_session_id,
      v_selected_answer,
      v_text_answer,
      v_is_correct,
      v_time_spent,
      v_was_skipped,
      v_answered_at
    )
    RETURNING id INTO v_answer_id;
  ELSE
    UPDATE student_answers
    SET
      selected_answer = v_selected_answer,
      text_answer = v_text_answer,
      is_correct = v_is_correct,
      was_skipped = v_was_skipped,
      time_spent_seconds = GREATEST(COALESCE(student_answers.time_spent_seconds, 0), v_time_spent),
      answered_at = GREATEST(COALESCE(student_answers.answered_at, v_answered_at), v_answered_at)
    WHERE id = v_answer_id;
  END IF;

  RETURN v_answer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_practice_answer_with_timing(
  UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, BOOLEAN, TIMESTAMPTZ
) TO authenticated;

COMMENT ON FUNCTION upsert_practice_answer_with_timing IS
  'Ownership-checked practice answer upsert that stores cumulative per-question timing in student_answers.';

CREATE OR REPLACE FUNCTION get_student_timing_performance(
  p_student_id UUID,
  p_period_days INTEGER DEFAULT 30,
  p_subject_id UUID DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
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
        WHEN 'easy' THEN 45
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
  GROUP BY s.id, s.name_en, ac.topic, ss.id, ss.subtopic_name
  HAVING COUNT(*) > 0
  ORDER BY s.name_en, ac.topic NULLS LAST, ss.subtopic_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_timing_performance(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION get_student_timing_performance IS
  'Student/admin scoped timing analytics over deduplicated canonical practice answers.';

CREATE OR REPLACE FUNCTION admin_get_performance_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_subject_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_avg_accuracy NUMERIC;
  v_total_questions INTEGER;
  v_total_correct INTEGER;
  v_total_study_time INTEGER;
  v_subject_performance JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_subject_id IS NULL THEN
    SELECT
      COALESCE(SUM(questions_attempted), 0),
      COALESCE(SUM(questions_correct), 0),
      COALESCE(SUM(study_time_minutes), 0)
    INTO v_total_questions, v_total_correct, v_total_study_time
    FROM daily_stats
    WHERE date BETWEEN p_start_date AND p_end_date
      AND is_active = TRUE;
  ELSE
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
      JOIN questions q ON q.id = sa.question_id
      WHERE ps.completed = TRUE
        AND q.subject_id = p_subject_id
        AND COALESCE(sa.answered_at, sa.created_at)::DATE BETWEEN p_start_date AND p_end_date
      ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
        COALESCE(sa.answered_at, sa.created_at) DESC,
        sa.created_at DESC,
        sa.id DESC
    )
    SELECT
      (COUNT(*) FILTER (WHERE was_skipped = FALSE))::INTEGER,
      (COUNT(*) FILTER (WHERE was_skipped = FALSE AND is_correct = TRUE))::INTEGER,
      ROUND(COALESCE(SUM(time_spent_seconds) FILTER (WHERE was_skipped = FALSE), 0)::NUMERIC / 60)::INTEGER
    INTO v_total_questions, v_total_correct, v_total_study_time
    FROM canonical_answers;
  END IF;

  v_avg_accuracy := CASE WHEN v_total_questions > 0
    THEN (v_total_correct::NUMERIC / v_total_questions * 100) ELSE 0 END;

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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at)::DATE BETWEEN p_start_date AND p_end_date
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT json_agg(subject_data ORDER BY total_attempted DESC)
  INTO v_subject_performance
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempted,
      json_build_object(
        'subjectId', s.id,
        'subjectName', s.name_en,
        'accuracy', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
          2
        ),
        'questionsAttempted', COUNT(*) FILTER (WHERE ca.was_skipped = FALSE),
        'avgScore', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
          2
        ),
        'studyTime', COALESCE(SUM(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE), 0),
        'avgTimeSeconds', ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1),
        'skipRate', ROUND(
          COUNT(*) FILTER (WHERE ca.was_skipped = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        )
      ) AS subject_data
    FROM subjects s
    LEFT JOIN questions q ON q.subject_id = s.id
    LEFT JOIN canonical_answers ca ON ca.question_id = q.id
    WHERE p_subject_id IS NULL OR s.id = p_subject_id
    GROUP BY s.id, s.name_en
    HAVING COUNT(ca.question_id) > 0
  ) subquery;

  v_result := json_build_object(
    'avgAccuracy', ROUND(v_avg_accuracy, 2),
    'avgScore', ROUND(v_avg_accuracy, 2),
    'improvementRate', 0,
    'totalQuestionsAttempted', COALESCE(v_total_questions, 0),
    'totalStudyTime', COALESCE(v_total_study_time, 0),
    'subjectPerformance', COALESCE(v_subject_performance, '[]'::json)
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_performance_metrics(DATE, DATE, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_performance_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT jsonb_build_object(
    'overall_accuracy', COALESCE(ROUND(
      COUNT(*) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ), 0),
    'total_answers', COUNT(*) FILTER (WHERE ca.was_skipped = FALSE),
    'total_skipped', COUNT(*) FILTER (WHERE ca.was_skipped = TRUE),
    'total_practice_sessions', (
      SELECT COUNT(*) FROM practice_sessions
      WHERE started_at >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
    ),
    'avg_study_time_minutes', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::NUMERIC, 1), 0)
      FROM practice_sessions
      WHERE started_at >= NOW() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::INTERVAL
        AND ended_at IS NOT NULL
    ),
    'subject_performance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'subject_id', s.id,
        'subject_name', s.name_en,
        'accuracy', COALESCE(ROUND(
          COUNT(*) FILTER (WHERE c2.was_skipped = FALSE AND c2.is_correct = TRUE)::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE c2.was_skipped = FALSE), 0) * 100,
          1
        ), 0),
        'total_answers', COUNT(*) FILTER (WHERE c2.was_skipped = FALSE),
        'avg_time_seconds', ROUND((AVG(c2.time_spent_seconds) FILTER (WHERE c2.was_skipped = FALSE))::NUMERIC, 1),
        'skip_rate', COALESCE(ROUND(
          COUNT(*) FILTER (WHERE c2.was_skipped = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        ), 0)
      )), '[]'::jsonb)
      FROM subjects s
      JOIN questions q ON q.subject_id = s.id
      JOIN canonical_answers c2 ON c2.question_id = q.id
      GROUP BY s.id, s.name_en
    )
  ) INTO v_result
  FROM canonical_answers ca;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_performance_metrics(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_subject_analytics_summary()
RETURNS TABLE (
  subject_id UUID, subject_name TEXT, total_questions BIGINT,
  total_attempts BIGINT, avg_accuracy NUMERIC, avg_time_seconds NUMERIC,
  active_students BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    s.id,
    s.name_en,
    COUNT(DISTINCT q.id) AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ) AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds,
    COUNT(DISTINCT ca.user_id) AS active_students
  FROM subjects s
  LEFT JOIN questions q ON q.subject_id = s.id
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  GROUP BY s.id, s.name_en
  ORDER BY s.name_en;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_subject_analytics_summary() TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_topic_performance(p_subject_id UUID)
RETURNS TABLE (
  topic_name TEXT, total_questions BIGINT, total_attempts BIGINT,
  avg_accuracy NUMERIC, avg_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    q.topic,
    COUNT(DISTINCT q.id) AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ) AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds
  FROM questions q
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  WHERE q.subject_id = p_subject_id
  GROUP BY q.topic
  ORDER BY q.topic;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_topic_performance(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_subtopic_performance(p_subject_id UUID)
RETURNS TABLE (
  topic_name TEXT, subtopic_id UUID, subtopic_name TEXT,
  total_questions BIGINT, total_attempts BIGINT,
  avg_accuracy NUMERIC, avg_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
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
    WHERE ps.completed = TRUE
      AND COALESCE(sa.answered_at, sa.created_at) >= NOW() - INTERVAL '30 days'
    ORDER BY sa.user_id, sa.practice_session_id, sa.question_id,
      COALESCE(sa.answered_at, sa.created_at) DESC,
      sa.created_at DESC,
      sa.id DESC
  )
  SELECT
    q.topic AS topic_name,
    ss.id AS subtopic_id,
    ss.subtopic_name,
    COUNT(DISTINCT q.id) AS total_questions,
    COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE) AS total_attempts,
    ROUND(
      COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE AND ca.is_correct = TRUE)::NUMERIC
      / NULLIF(COUNT(ca.question_id) FILTER (WHERE ca.was_skipped = FALSE), 0) * 100,
      1
    ) AS avg_accuracy,
    ROUND((AVG(ca.time_spent_seconds) FILTER (WHERE ca.was_skipped = FALSE))::NUMERIC, 1) AS avg_time_seconds
  FROM subject_subtopics ss
  JOIN questions q ON q.subtopic_id = ss.id
  LEFT JOIN canonical_answers ca ON ca.question_id = q.id
  WHERE ss.subject_id = p_subject_id
    AND ss.is_active = TRUE
  GROUP BY q.topic, ss.id, ss.subtopic_name
  ORDER BY q.topic, ss.subtopic_name;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_subtopic_performance(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_system_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'total_students', (SELECT COUNT(*) FROM profiles WHERE user_type = 'student'),
    'total_questions', (SELECT COUNT(*) FROM questions),
    'total_exams', (SELECT COUNT(*) FROM mock_exams),
    'total_practice_sessions', (SELECT COUNT(*) FROM practice_sessions),
    'total_mock_exam_attempts', (SELECT COUNT(*) FROM mock_exam_attempts),
    'total_answers', (SELECT COUNT(*) FROM student_answers WHERE practice_session_id IS NOT NULL),
    'storage_usage', (
      SELECT jsonb_build_object(
        'questions', pg_size_pretty(pg_total_relation_size('questions')),
        'student_answers', pg_size_pretty(pg_total_relation_size('student_answers')),
        'daily_stats', pg_size_pretty(pg_total_relation_size('daily_stats'))
      )
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_system_metrics() TO authenticated;
