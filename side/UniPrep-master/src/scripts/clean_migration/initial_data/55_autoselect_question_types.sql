-- Hotfix 55: Add p_question_types parameter to auto_select_questions_for_exam
-- Allows auto-selecting MCQ and/or Short Answer (codable_open) questions.
-- Written open (essay) groups are always excluded from auto-select and preserved on run.
-- Run on live DB after hotfix 54.

-- Drop old 4-param signature first to avoid "function not unique" errors
DROP FUNCTION IF EXISTS auto_select_questions_for_exam(UUID, JSONB, TEXT, JSONB);

-- Also clean up any 5-param version if partially applied
DROP FUNCTION IF EXISTS auto_select_questions_for_exam(UUID, JSONB, TEXT, JSONB, TEXT[]);

CREATE OR REPLACE FUNCTION auto_select_questions_for_exam(
  p_exam_id        UUID,
  p_distribution   JSONB,
  p_exam_stage     TEXT    DEFAULT NULL,
  p_topic_config   JSONB   DEFAULT NULL,
  p_question_types TEXT[]  DEFAULT ARRAY['mcq']
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
  -- Remove only questions of the selected types; preserve all others (incl. written_open)
  DELETE FROM mock_exam_questions meq
  USING questions q
  WHERE meq.mock_exam_id = p_exam_id
    AND meq.question_id  = q.id
    AND q.question_type  = ANY(p_question_types);

  FOR v_subject_name, v_difficulty_dist IN
    SELECT * FROM jsonb_each(p_distribution)
  LOOP
    v_subject_config := p_topic_config -> v_subject_name;

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
              AND q.question_type = ANY(p_question_types)
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
                AND q.question_type = ANY(p_question_types)
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
              AND q.question_type = ANY(p_question_types)
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

GRANT EXECUTE ON FUNCTION auto_select_questions_for_exam(UUID, JSONB, TEXT, JSONB, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
