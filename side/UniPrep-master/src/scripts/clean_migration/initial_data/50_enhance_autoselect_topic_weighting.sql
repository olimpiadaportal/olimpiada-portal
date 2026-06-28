-- ============================================================
-- Enhancement: auto_select_questions_for_exam — full topic weighting
--
-- Builds on hotfix 48 (which added p_topic_config to signature).
-- Implements the topic weight logic that the AutoSelectModal UI
-- was already collecting but the SQL body was ignoring.
--
-- p_topic_config JSON shape:
-- {
--   "Azerbaijani Language": {
--     "exclude":      ["Fonetika", "Leksika"],   -- never pick from these
--     "prioritize":   ["Sintaksis"],              -- fill from these first
--     "max_per_topic": 5                          -- at most N per topic
--   }
-- }
--
-- Algorithm per (subject, difficulty):
--   1. Exclude topics are always filtered out.
--   2. max_per_topic cap: use ROW_NUMBER() OVER (PARTITION BY topic)
--      before the outer LIMIT so no single topic dominates.
--   3. If prioritize topics provided: fill from those first,
--      then backfill from remaining topics to reach target count.
--   4. p_exam_stage: NULL = no restriction, otherwise filters
--      questions to matching stage (or those with NULL exam_stage).
--
-- Run in the Supabase SQL editor on the live DB.
-- Back-ported into: 04c_question_exam_functions.sql
-- ============================================================

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
  DELETE FROM mock_exam_questions WHERE mock_exam_id = p_exam_id;

  FOR v_subject_name, v_difficulty_dist IN
    SELECT * FROM jsonb_each(p_distribution)
  LOOP
    -- Extract per-subject topic config (null-safe)
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

        -- ── Pass 1: prioritized topics ───────────────────────────
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
              AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
              AND (v_exclude_topics    IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
              AND q.topic = ANY(v_prioritize_topics)
          ) inner_q
          WHERE v_max_per_topic IS NULL OR inner_q.rn <= v_max_per_topic
          ORDER BY RANDOM()
          LIMIT v_count::INTEGER
        ) t;

        -- ── Pass 2: backfill from remaining topics if needed ─────
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
                AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
                AND (v_exclude_topics    IS NULL OR q.topic IS NULL OR NOT (q.topic = ANY(v_exclude_topics)))
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
        -- ── No prioritization: select with exclusion + per-topic cap ──
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
