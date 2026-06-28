-- Hotfix 102: Offline practice sync contract hardening
-- Purpose:
--   - Align offline practice sync with canonical practice_sessions/student_answers/daily_stats schema.
--   - Add an idempotent offline_session_id to practice_sessions.
--   - Provide a single ownership-checked RPC for syncing complete offline practice sessions.
--   - Repair the legacy upsert_offline_session_stats RPC to use daily_stats instead of stale daily_statistics.

ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS offline_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_sessions_offline_session_id
  ON practice_sessions(user_id, offline_session_id)
  WHERE offline_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_offline_practice_session(
  p_offline_session_id TEXT,
  p_subject_id UUID,
  p_mode TEXT DEFAULT 'practice',
  p_total_questions INTEGER DEFAULT 0,
  p_correct_answers INTEGER DEFAULT 0,
  p_total_time_seconds INTEGER DEFAULT 0,
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_completed_at TIMESTAMPTZ DEFAULT NOW(),
  p_question_ids UUID[] DEFAULT '{}'::UUID[],
  p_answers JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_student_id UUID;
  v_session_id UUID;
  v_answer JSONB;
  v_question_id UUID;
  v_selected_answer TEXT;
  v_answered_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(BTRIM(p_offline_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'Offline session id is required';
  END IF;

  IF p_mode NOT IN ('practice', 'quiz') THEN
    RAISE EXCEPTION 'Invalid practice mode';
  END IF;

  SELECT id INTO v_student_id
  FROM students
  WHERE user_id = v_user_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM subjects WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'Subject not found';
  END IF;

  SELECT id INTO v_session_id
  FROM practice_sessions
  WHERE user_id = v_user_id
    AND offline_session_id = p_offline_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  INSERT INTO practice_sessions (
    user_id,
    subject_id,
    mode,
    total_questions,
    correct_answers,
    total_time_seconds,
    completed,
    started_at,
    completed_at,
    question_ids,
    offline_session_id
  ) VALUES (
    v_user_id,
    p_subject_id,
    p_mode,
    GREATEST(COALESCE(p_total_questions, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(COALESCE(p_total_time_seconds, 0), 0),
    TRUE,
    COALESCE(p_started_at, NOW()),
    COALESCE(p_completed_at, NOW()),
    COALESCE(p_question_ids, '{}'::UUID[]),
    p_offline_session_id
  )
  RETURNING id INTO v_session_id;

  IF jsonb_typeof(COALESCE(p_answers, '[]'::JSONB)) = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(COALESCE(p_answers, '[]'::JSONB))
    LOOP
      v_question_id := NULLIF(v_answer ->> 'question_id', '')::UUID;
      v_selected_answer := NULLIF(v_answer ->> 'selected_answer', '');
      v_answered_at := COALESCE(NULLIF(v_answer ->> 'answered_at', '')::TIMESTAMPTZ, COALESCE(p_completed_at, NOW()));

      IF v_question_id IS NOT NULL AND v_selected_answer IN ('A', 'B', 'C', 'D', 'E') THEN
        INSERT INTO student_answers (
          user_id,
          question_id,
          practice_session_id,
          selected_answer,
          is_correct,
          time_spent_seconds,
          was_skipped,
          answered_at
        )
        SELECT
          v_user_id,
          v_question_id,
          v_session_id,
          v_selected_answer,
          COALESCE((v_answer ->> 'is_correct')::BOOLEAN, FALSE),
          GREATEST(COALESCE((v_answer ->> 'time_spent_seconds')::INTEGER, 0), 0),
          FALSE,
          v_answered_at
        WHERE NOT EXISTS (
          SELECT 1
          FROM student_answers
          WHERE user_id = v_user_id
            AND practice_session_id = v_session_id
            AND question_id = v_question_id
        );
      END IF;
    END LOOP;
  END IF;

  PERFORM update_daily_stats(
    v_student_id,
    COALESCE(p_completed_at::DATE, CURRENT_DATE),
    GREATEST(COALESCE(p_total_questions, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(ROUND(COALESCE(p_total_time_seconds, 0)::NUMERIC / 60)::INTEGER, 0),
    0,
    0,
    1
  );

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_offline_practice_session(
  TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], JSONB
) TO authenticated;

COMMENT ON FUNCTION sync_offline_practice_session IS
  'Idempotently syncs a complete offline practice/quiz session owned by auth.uid() into practice_sessions, student_answers, and daily_stats.';

CREATE OR REPLACE FUNCTION upsert_offline_session_stats(
  p_user_id UUID,
  p_session_date DATE,
  p_questions_answered INTEGER,
  p_correct_answers INTEGER,
  p_study_time_minutes INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot update offline stats for another user';
  END IF;

  SELECT id INTO v_student_id
  FROM students
  WHERE user_id = p_user_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  PERFORM update_daily_stats(
    v_student_id,
    COALESCE(p_session_date, CURRENT_DATE),
    GREATEST(COALESCE(p_questions_answered, 0), 0),
    GREATEST(COALESCE(p_correct_answers, 0), 0),
    GREATEST(COALESCE(p_study_time_minutes, 0), 0),
    0,
    0,
    1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_offline_session_stats(UUID, DATE, INTEGER, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION upsert_offline_session_stats IS
  'Legacy helper for crediting offline practice stats to daily_stats on the original session date.';
