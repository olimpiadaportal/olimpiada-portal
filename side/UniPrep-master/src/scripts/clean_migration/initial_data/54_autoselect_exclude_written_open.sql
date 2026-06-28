-- ===========================================================================
-- Hotfix 54: Auto-select excludes written_open questions
-- ===========================================================================
-- PROBLEM:
--   1. auto_select_questions_for_exam() was deleting ALL questions from an exam
--      on each run, including written_open sub-questions that must be added
--      manually and cannot be auto-selected.
--   2. All three SELECT paths (Pass 1 prioritized, Pass 2 backfill, no-
--      prioritization) had no question_type filter, so written_open sub-
--      questions were individually eligible for auto-selection — causing a
--      single written_open group of 3 questions to count as 3 separate
--      selectable questions.
--   3. getQuestionCountsByDifficulty() in the admin service returned inflated
--      "Hard max" counts in AutoSelectModal because written_open sub-questions
--      were included.  (Fixed in TS — no SQL change needed here.)
--
-- FIX (SQL side — 4 changes to auto_select_questions_for_exam):
--   1. DELETE only non-written_open questions so existing written-open groups
--      in the exam survive an auto-select run.
--   2. Pass 1 (prioritized topics): AND q.question_type != 'written_open'
--   3. Pass 2 (backfill):           AND q.question_type != 'written_open'
--   4. No-prioritization path:      AND q.question_type != 'written_open'
--
-- SAFE TO RUN: idempotent (CREATE OR REPLACE FUNCTION).
-- Backported to: 04c_question_exam_functions.sql (auto_select block).
-- ===========================================================================

CREATE OR REPLACE FUNCTION auto_select_questions_for_exam(
  p_exam_id       UUID,
  p_distribution  JSONB,
  p_exam_stage    TEXT  DEFAULT NULL,
  p_topic_config  JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subject_name      TEXT;
  v_difficulty_dist   JSONB;
  v_difficulty        TEXT;
  v_count             INTEGER;
  v_selected_ids      UUID[];
  v_backfill_ids      UUID[];
  v_total_added       INTEGER := 0;
  v_subject_config    JSONB;
  v_exclude_topics    TEXT[];
  v_prioritize_topics TEXT[];
  v_max_per_topic     INTEGER;
  v_remaining         INTEGER;
BEGIN
  -- Remove only non-written_open questions so existing written-open groups are preserved
  DELETE FROM mock_exam_questions meq
  USING questions q
  WHERE meq.mock_exam_id = p_exam_id
    AND meq.question_id  = q.id
    AND q.question_type != 'written_open';

  FOR v_subject_name, v_difficulty_dist IN
    SELECT * FROM jsonb_each(p_distribution)
  LOOP
    v_subject_config    := p_topic_config -> v_subject_name;

    v_exclude_topics := CASE
      WHEN v_subject_config IS NOT NULL AND v_subject_config ? 'exclude'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_subject_config->'exclude'))
      ELSE NULL
    END;

    v_prioritize_topics := CASE
      WHEN v_subject_config IS NOT NULL AND v_subject_config ? 'prioritize'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_subject_config->'prioritize'))
      ELSE NULL
    END;

    v_max_per_topic := (v_subject_config->>'max_per_topic')::INTEGER;

    FOR v_difficulty, v_count IN
      SELECT * FROM jsonb_each_text(v_difficulty_dist)
    LOOP
      CONTINUE WHEN v_count::INTEGER = 0;
      v_selected_ids := NULL;

      IF v_prioritize_topics IS NOT NULL AND array_length(v_prioritize_topics, 1) > 0 THEN
        -- Pass 1: prioritized topics first
        SELECT array_agg(q_id) INTO v_selected_ids FROM (
          SELECT inner_q.id AS q_id
          FROM (
            SELECT q.id,
              ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.name_en = v_subject_name
              AND q.difficulty = v_difficulty
              AND q.is_active  = true
              AND q.question_type != 'written_open'
              AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
              AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
              AND q.topic = ANY(v_prioritize_topics)
          ) inner_q
          WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
          ORDER BY RANDOM()
          LIMIT v_count::INTEGER
        ) t;

        -- Pass 2: backfill from remaining topics
        v_remaining := v_count::INTEGER - COALESCE(array_length(v_selected_ids, 1), 0);
        IF v_remaining > 0 THEN
          SELECT array_agg(q_id) INTO v_backfill_ids FROM (
            SELECT inner_q.id AS q_id
            FROM (
              SELECT q.id,
                ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
              FROM questions q
              JOIN subjects s ON s.id = q.subject_id
              WHERE s.name_en = v_subject_name
                AND q.difficulty = v_difficulty
                AND q.is_active  = true
                AND q.question_type != 'written_open'
                AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
                AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
                AND (q.topic IS NULL OR NOT (q.topic = ANY(v_prioritize_topics)))
                AND (v_selected_ids IS NULL OR NOT (q.id = ANY(v_selected_ids)))
            ) inner_q
            WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
            ORDER BY RANDOM()
            LIMIT v_remaining
          ) t;
          IF v_backfill_ids IS NOT NULL THEN
            v_selected_ids := COALESCE(v_selected_ids, ARRAY[]::UUID[]) || v_backfill_ids;
          END IF;
        END IF;

      ELSE
        -- No prioritization: exclusion + per-topic cap only
        SELECT array_agg(q_id) INTO v_selected_ids FROM (
          SELECT inner_q.id AS q_id
          FROM (
            SELECT q.id,
              ROW_NUMBER() OVER (PARTITION BY COALESCE(q.topic,'') ORDER BY RANDOM()) AS rn
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.name_en = v_subject_name
              AND q.difficulty = v_difficulty
              AND q.is_active  = true
              AND q.question_type != 'written_open'
              AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
              AND (v_exclude_topics IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
          ) inner_q
          WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
          ORDER BY RANDOM()
          LIMIT v_count::INTEGER
        ) t;
      END IF;

      IF v_selected_ids IS NOT NULL THEN
        v_total_added := v_total_added + add_questions_to_mock_exam(p_exam_id, v_selected_ids);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_total_added;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_select_questions_for_exam(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Hotfix 54 applied: auto_select_questions_for_exam now excludes written_open questions from selection and preserves existing written_open groups on auto-select runs.';
END $$;
