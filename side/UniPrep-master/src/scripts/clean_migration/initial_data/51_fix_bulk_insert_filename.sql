-- Hotfix 51: Add p_filename parameter to bulk_insert_questions
-- Replaces hard-coded 'Bulk Import' so the actual filename is stored.
-- Client passes p_filename from the browser; SECURITY DEFINER context bypasses RLS on question_imports.

DROP FUNCTION IF EXISTS bulk_insert_questions(JSONB, UUID, UUID);
DROP FUNCTION IF EXISTS bulk_insert_questions(JSONB, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION bulk_insert_questions(
  p_questions   JSONB,
  p_subject_id  UUID,
  p_imported_by UUID    DEFAULT NULL,
  p_filename    TEXT    DEFAULT 'Bulk Import'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_import_id     UUID;
  v_question      JSONB;
  v_total         INTEGER := 0;
  v_successful    INTEGER := 0;
  v_failed        INTEGER := 0;
  v_errors        JSONB   := '[]'::JSONB;
  v_question_id   UUID;
  v_question_type TEXT;
  v_correct_answer TEXT;
BEGIN
  INSERT INTO question_imports (filename, total_questions, imported_by)
  VALUES (COALESCE(NULLIF(TRIM(p_filename), ''), 'Bulk Import'), jsonb_array_length(p_questions), p_imported_by)
  RETURNING id INTO v_import_id;

  v_total := jsonb_array_length(p_questions);

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    BEGIN
      v_question_type := COALESCE(v_question->>'question_type', 'mcq');

      IF v_question_type = 'mcq' THEN
        v_correct_answer := v_question->>'correct_answer';
      ELSE
        v_correct_answer := COALESCE(v_question->>'correct_answer', v_question->>'expected_answer');
      END IF;

      INSERT INTO questions (
        subject_id, topic, subtopic_id, question_type, question_text, question_image_url,
        option_a, option_b, option_c, option_d, option_e,
        correct_answer, explanation, difficulty, tags, source, year,
        created_by, is_active, exclude_from_practice
      ) VALUES (
        p_subject_id,
        v_question->>'topic',
        CASE
          WHEN v_question->>'subtopic_id' IS NOT NULL AND v_question->>'subtopic_id' != ''
          THEN (v_question->>'subtopic_id')::UUID
          ELSE NULL
        END,
        v_question_type::question_type,
        v_question->>'question_text',
        v_question->>'question_image_url',
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_a' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_b' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_c' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_d' ELSE '' END,
        CASE WHEN v_question_type = 'mcq' THEN v_question->>'option_e' ELSE '' END,
        v_correct_answer,
        v_question->>'explanation',
        COALESCE(v_question->>'difficulty', 'medium'),
        CASE
          WHEN v_question->'tags' IS NOT NULL THEN
            ARRAY(SELECT jsonb_array_elements_text(v_question->'tags'))
          ELSE '{}'::TEXT[]
        END,
        v_question->>'source',
        CASE
          WHEN v_question->>'year' IS NOT NULL AND v_question->>'year' != ''
          THEN (v_question->>'year')::INTEGER
          ELSE NULL
        END,
        p_imported_by,
        COALESCE((v_question->>'is_active')::BOOLEAN, TRUE),
        CASE
          WHEN v_question_type = 'written_open' THEN TRUE
          ELSE COALESCE((v_question->>'exclude_from_practice')::BOOLEAN, FALSE)
        END
      ) RETURNING id INTO v_question_id;

      v_successful := v_successful + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'question_text', COALESCE(v_question->>'question_text', 'Unknown'),
        'question_type', v_question_type,
        'error', SQLERRM,
        'detail', SQLSTATE
      );
    END;
  END LOOP;

  UPDATE question_imports
  SET successful_imports = v_successful, failed_imports = v_failed, errors = v_errors
  WHERE id = v_import_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'import_id', v_import_id, 'total', v_total,
      'successful', v_successful, 'failed', v_failed, 'errors', v_errors
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_insert_questions(JSONB, UUID, UUID, TEXT) TO authenticated;
