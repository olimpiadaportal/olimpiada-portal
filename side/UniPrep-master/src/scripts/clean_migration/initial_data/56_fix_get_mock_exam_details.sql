-- Hotfix 56: Fix get_mock_exam_details to return question_type, group_id, group_order, context_text
-- Without these fields the admin panel cannot identify written_open groups, preventing
-- correct group-level rendering and group-level removal in the exam editor.

CREATE OR REPLACE FUNCTION get_mock_exam_details(p_exam_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'exam', row_to_json(me.*),
    'questions', COALESCE(
      (SELECT json_agg(
        json_build_object(
          'id', meq.id, 'question_id', meq.question_id,
          'question_order', meq.question_order, 'question_text', q.question_text,
          'question_type', q.question_type, 'group_id', q.group_id,
          'group_order', q.group_order, 'context_text', qg.context_text,
          'subject_id', q.subject_id, 'subject_name', s.name_en, 'difficulty', q.difficulty
        ) ORDER BY meq.question_order
      )
      FROM mock_exam_questions meq
      JOIN questions q ON q.id = meq.question_id
      JOIN subjects s ON s.id = q.subject_id
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      WHERE meq.mock_exam_id = me.id),
      '[]'::json
    )
  ) INTO v_result
  FROM mock_exams me WHERE me.id = p_exam_id;
  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
