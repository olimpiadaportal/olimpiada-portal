-- ============================================================
-- Fix: auto_select_questions_for_exam
-- 1. Adds p_topic_config JSONB DEFAULT NULL (was crashing because
--    client always sends this 4th param but function only had 3)
-- 2. Properly uses p_exam_stage to restrict question selection
--    (was accepted but silently ignored before)
-- Run this in the Supabase SQL editor on the live DB.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_select_questions_for_exam(
  p_exam_id       UUID,
  p_distribution  JSONB,
  p_exam_stage    TEXT DEFAULT NULL,
  p_topic_config  JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subject_name    TEXT;
  v_difficulty_dist JSONB;
  v_difficulty      TEXT;
  v_count           INTEGER;
  v_selected_ids    UUID[];
  v_total_added     INTEGER := 0;
BEGIN
  -- Clear existing auto-selected questions for this exam
  DELETE FROM mock_exam_questions WHERE mock_exam_id = p_exam_id;

  FOR v_subject_name, v_difficulty_dist IN
    SELECT * FROM jsonb_each(p_distribution)
  LOOP
    FOR v_difficulty, v_count IN
      SELECT * FROM jsonb_each_text(v_difficulty_dist)
    LOOP
      SELECT array_agg(q.id) INTO v_selected_ids
      FROM (
        SELECT q.id
        FROM questions q
        JOIN subjects s ON s.id = q.subject_id
        WHERE s.name_en = v_subject_name
          AND q.difficulty = v_difficulty
          AND q.is_active = true
          -- Respect exam stage filter if provided
          AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)
        ORDER BY RANDOM()
        LIMIT v_count::INTEGER
      ) q;

      IF v_selected_ids IS NOT NULL THEN
        v_total_added := v_total_added + add_questions_to_mock_exam(p_exam_id, v_selected_ids);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_total_added;
END;
$$;
