-- Hotfix 83: Add correct_answer to get_mock_exam_details RPC
-- Updates both teacher and Elmly exam branches to include correct_answer field.
-- This makes the admin exam detail page able to display the correct answer for each question.

CREATE OR REPLACE FUNCTION get_mock_exam_details(p_exam_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON;
  v_uses_teacher_questions BOOLEAN;
BEGIN
  SELECT uses_teacher_questions INTO v_uses_teacher_questions
  FROM mock_exams WHERE id = p_exam_id;

  IF v_uses_teacher_questions = TRUE THEN
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(json_build_object(
            'id', teq.id,
            'question_id', COALESCE(teq.question_id::text, teq.teacher_question_id::text),
            'question_order', teq.question_order,
            'question_text',  COALESCE(q.question_text, tq.question_text),
            'question_type',  COALESCE(q.question_type::text, tq.question_type),
            'group_id', q.group_id, 'group_order', q.group_order, 'context_text', NULL,
            'subject_id', COALESCE(q.subject_id, tq.subject_id),
            'subject_name', s.name_en,
            'difficulty', COALESCE(q.difficulty::text,
              CASE tq.difficulty WHEN 1 THEN 'easy' WHEN 2 THEN 'easy'
                WHEN 3 THEN 'medium' WHEN 4 THEN 'hard' WHEN 5 THEN 'hard' END),
            'correct_answer', COALESCE(q.correct_answer, tq.correct_answer),
            'source', CASE WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher' ELSE 'elmly' END
          ) ORDER BY teq.question_order)
         FROM teacher_exam_questions teq
         LEFT JOIN questions q ON q.id = teq.question_id
         LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
         LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
         WHERE teq.exam_id = me.id), '[]'::json)
    ) INTO v_result FROM mock_exams me WHERE me.id = p_exam_id;
  ELSE
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(json_build_object(
            'id', meq.id, 'question_id', meq.question_id,
            'question_order', meq.question_order, 'question_text', q.question_text,
            'question_type', q.question_type, 'group_id', q.group_id,
            'group_order', q.group_order, 'context_text', qg.context_text,
            'subject_id', q.subject_id, 'subject_name', s.name_en, 'difficulty', q.difficulty,
            'correct_answer', q.correct_answer
          ) ORDER BY meq.question_order)
         FROM mock_exam_questions meq
         JOIN questions q ON q.id = meq.question_id
         JOIN subjects s ON s.id = q.subject_id
         LEFT JOIN question_groups qg ON qg.id = q.group_id
         WHERE meq.mock_exam_id = me.id), '[]'::json)
    ) INTO v_result FROM mock_exams me WHERE me.id = p_exam_id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_mock_exam_details(UUID) TO authenticated;
