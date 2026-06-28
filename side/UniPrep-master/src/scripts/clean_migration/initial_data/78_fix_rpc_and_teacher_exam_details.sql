-- Hotfix 78: Two fixes
-- 1. Fix get_recommended_teacher_exams: JOIN profiles (not users — table is called profiles)
-- 2. Fix get_mock_exam_details: also return teacher_exam_questions for teacher exams

-- ─── Part 1: Fix get_recommended_teacher_exams ──────────────────────────────

DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id      UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  subjects        TEXT[],
  exam_count      BIGINT,
  avg_rating      NUMERIC,
  score           NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_group TEXT;
BEGIN
  SELECT s.target_group INTO v_target_group
  FROM students s WHERE s.user_id = p_student_id;

  RETURN QUERY
    SELECT
      t.id                          AS teacher_id,
      p.full_name,
      p.avatar_url,
      t.specializations             AS subjects,
      COUNT(DISTINCT me.id)         AS exam_count,
      ROUND(AVG(tr.rating), 1)      AS avg_rating,
      (
        CASE
          WHEN v_target_group IS NOT NULL
               AND v_target_group = ANY(t.available_groups::TEXT[])
          THEN 30.0
          ELSE 0.0
        END
        + LEAST(COUNT(DISTINCT me.id)::NUMERIC * 5.0, 50.0)
        + COALESCE(AVG(tr.rating), 3.0) * 4.0
      )                             AS score
    FROM teachers t
    JOIN profiles p ON p.id = t.user_id
    JOIN mock_exams me
      ON me.created_by_teacher = t.id
     AND me.is_approved = TRUE
    LEFT JOIN teacher_reviews tr ON tr.teacher_id = t.id
    WHERE t.is_verified = TRUE
    GROUP BY t.id, p.full_name, p.avatar_url, t.specializations, t.available_groups
    HAVING COUNT(DISTINCT me.id) >= 1
    ORDER BY score DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

-- ─── Part 2: Fix get_mock_exam_details to show teacher questions ─────────────
-- Teacher exams store questions in teacher_exam_questions (not mock_exam_questions)
-- The admin panel uses this RPC to display exam questions.

CREATE OR REPLACE FUNCTION get_mock_exam_details(p_exam_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_uses_teacher_questions BOOLEAN;
BEGIN
  -- Check whether this is a teacher exam
  SELECT uses_teacher_questions INTO v_uses_teacher_questions
  FROM mock_exams WHERE id = p_exam_id;

  IF v_uses_teacher_questions = TRUE THEN
    -- Teacher exam: pull from teacher_exam_questions (mix of teacher + Elmly questions)
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id',             teq.id,
            'question_id',    COALESCE(teq.question_id::text, teq.teacher_question_id::text),
            'question_order', teq.question_order,
            'question_text',  COALESCE(q.question_text, tq.question_text),
            'question_type',  COALESCE(q.question_type::text, tq.question_type),
            'group_id',       q.group_id,
            'group_order',    q.group_order,
            'context_text',   NULL,
            'subject_id',     COALESCE(q.subject_id, tq.subject_id),
            'subject_name',   s.name_en,
            'difficulty',     COALESCE(
              q.difficulty::text,
              CASE tq.difficulty
                WHEN 1 THEN 'easy'  WHEN 2 THEN 'easy'
                WHEN 3 THEN 'medium'
                WHEN 4 THEN 'hard'  WHEN 5 THEN 'hard'
              END
            ),
            'source', CASE
              WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher'
              ELSE 'elmly'
            END
          ) ORDER BY teq.question_order
        )
        FROM teacher_exam_questions teq
        LEFT JOIN questions q        ON q.id  = teq.question_id
        LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
        LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
        WHERE teq.exam_id = me.id),
        '[]'::json
      )
    ) INTO v_result
    FROM mock_exams me WHERE me.id = p_exam_id;

  ELSE
    -- Official exam: pull from mock_exam_questions (Elmly questions only)
    SELECT json_build_object(
      'exam', row_to_json(me.*),
      'questions', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id',             meq.id,
            'question_id',    meq.question_id,
            'question_order', meq.question_order,
            'question_text',  q.question_text,
            'question_type',  q.question_type,
            'group_id',       q.group_id,
            'group_order',    q.group_order,
            'context_text',   qg.context_text,
            'subject_id',     q.subject_id,
            'subject_name',   s.name_en,
            'difficulty',     q.difficulty
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
  END IF;

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
