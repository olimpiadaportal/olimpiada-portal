-- ============================================================================
-- Hotfix 80: Teacher Exam Improvements (4 parts)
-- 1. Drop FK on exam_answers.question_id  → unblocks teacher exam answer saves
-- 2. get_my_teacher_exams RPC            → fixes 0/30 question count in My Exams
-- 3. Add 'individual' exam type + exam_group_id to mock_exams
-- 4. get_teacher_exam_group_subjects RPC → group-based subject config for builder
-- 5. Fix get_recommended_teacher_exams   → return subjects as JSONB with az/en names
-- ============================================================================


-- ─── Part 1: Drop FK on exam_answers.question_id ─────────────────────────────
-- Teacher questions live in teacher_questions table (different UUID space).
-- The FK to questions(id) rejects teacher question UUIDs with 23503 error.
-- Referential integrity is maintained by application logic instead.

ALTER TABLE exam_answers
  DROP CONSTRAINT IF EXISTS exam_answers_question_id_fkey;

-- Also allow question_id to be null for future teacher_question_id column support
ALTER TABLE exam_answers
  ALTER COLUMN question_id DROP NOT NULL;

-- Add teacher_question_id column for explicit teacher question answers
ALTER TABLE exam_answers
  ADD COLUMN IF NOT EXISTS teacher_question_id UUID REFERENCES teacher_questions(id) ON DELETE CASCADE;

-- Recreate the unique constraint to cover both types separately
ALTER TABLE exam_answers
  DROP CONSTRAINT IF EXISTS exam_answers_attempt_id_question_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_attempt_elmly_q
  ON exam_answers (attempt_id, question_id)
  WHERE question_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_attempt_teacher_q
  ON exam_answers (attempt_id, teacher_question_id)
  WHERE teacher_question_id IS NOT NULL;

-- RLS: students can manage their own teacher-exam answers
DROP POLICY IF EXISTS "Students can manage own teacher exam answers" ON exam_answers;
CREATE POLICY "Students can manage own teacher exam answers"
  ON exam_answers
  USING (
    attempt_id IN (
      SELECT id FROM mock_exam_attempts WHERE user_id = auth.uid()
    )
  );


-- ─── Part 2: get_my_teacher_exams SECURITY DEFINER RPC ───────────────────────
-- Replaces the problematic nested PostgREST select that returned 0 question counts
-- due to RLS evaluation order on teacher_exam_questions nested joins.

DROP FUNCTION IF EXISTS get_my_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_my_teacher_exams(p_teacher_id UUID)
RETURNS TABLE (
  id                    UUID,
  title                 TEXT,
  exam_type             TEXT,
  target_group          TEXT,
  duration_minutes      INTEGER,
  total_questions       INTEGER,
  is_approved           BOOLEAN,
  uses_teacher_questions BOOLEAN,
  created_at            TIMESTAMPTZ,
  question_count        BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT
      me.id,
      me.title,
      me.exam_type,
      me.target_group,
      me.duration_minutes,
      me.total_questions,
      me.is_approved,
      me.uses_teacher_questions,
      me.created_at,
      COUNT(teq.id) AS question_count
    FROM mock_exams me
    LEFT JOIN teacher_exam_questions teq ON teq.exam_id = me.id
    WHERE me.created_by_teacher = p_teacher_id
    GROUP BY me.id
    ORDER BY me.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_teacher_exams(UUID) TO authenticated;


-- ─── Part 3: Add 'individual' exam type + exam_group_id ──────────────────────

-- Drop old check constraint and recreate with 'individual' included
ALTER TABLE mock_exams
  DROP CONSTRAINT IF EXISTS mock_exams_exam_type_check;

ALTER TABLE mock_exams
  ADD CONSTRAINT mock_exams_exam_type_check
  CHECK (exam_type IN ('first_stage', 'second_stage', 'full_exam', 'individual'));

-- Add exam_group_id to link teacher exams to an exam group config
ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS exam_group_id UUID REFERENCES exam_groups(id);


-- ─── Part 4: get_teacher_exam_group_subjects RPC ─────────────────────────────
-- Returns subjects for a group+stage from exam_group_subjects table.
-- Used by TeacherBuildExamScreen to show required subjects for first/second stage exams.

DROP FUNCTION IF EXISTS get_teacher_exam_group_subjects(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_teacher_exam_group_subjects(
  p_group_code TEXT,
  p_stage      TEXT  -- 'first' or 'second'
)
RETURNS TABLE (
  group_id          UUID,
  subject_id        UUID,
  subject_name_az   TEXT,
  subject_name_en   TEXT,
  coefficient       DECIMAL,
  questions_count   INTEGER,
  subject_max_points INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_group_id         UUID;
  v_max_points       INTEGER;
  v_total_coefficient DECIMAL;
BEGIN
  -- Resolve group
  SELECT
    eg.id,
    CASE WHEN p_stage = 'first' THEN eg.first_stage_max_points
         ELSE eg.second_stage_max_points
    END
  INTO v_group_id, v_max_points
  FROM exam_groups eg
  WHERE eg.code = p_group_code AND eg.is_active = true;

  IF v_group_id IS NULL THEN RETURN; END IF;

  -- Sum of coefficients for this stage (to compute weighted max_points per subject)
  SELECT COALESCE(SUM(egs.coefficient), 0)
  INTO v_total_coefficient
  FROM exam_group_subjects egs
  WHERE egs.exam_group_id = v_group_id
    AND egs.stage = p_stage
    AND egs.is_active = true;

  RETURN QUERY
    SELECT
      v_group_id                                                            AS group_id,
      s.id                                                                  AS subject_id,
      s.name_az                                                             AS subject_name_az,
      COALESCE(s.name_en, s.name_az)                                        AS subject_name_en,
      egs.coefficient,
      egs.questions_count,
      ROUND((egs.coefficient / NULLIF(v_total_coefficient, 0)) * v_max_points)::INTEGER
        AS subject_max_points
    FROM exam_group_subjects egs
    JOIN subjects s ON s.id = egs.subject_id
    WHERE egs.exam_group_id = v_group_id
      AND egs.stage = p_stage
      AND egs.is_active = true
    ORDER BY egs.display_order ASC, egs.coefficient DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_group_subjects(TEXT, TEXT) TO authenticated;


-- ─── Part 5: Fix get_recommended_teacher_exams to return structured subjects ─
-- Subjects field changes from TEXT[] to JSONB [{id, name_az, name_en}]
-- Matched by joining teachers.specializations (text array of subject names) to subjects table.

DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id      UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  subjects        JSONB,   -- [{id, name_az, name_en}]
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
      -- Match teacher specializations (text[]) against subjects table for multilingual names
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id',      s.id::text,
            'name_az', s.name_az,
            'name_en', COALESCE(s.name_en, s.name_az)
          )
        )::jsonb
        FROM subjects s
        WHERE s.name_az = ANY(t.specializations)
           OR s.name_en = ANY(t.specializations)
        ),
        '[]'::jsonb
      )                             AS subjects,
      COUNT(DISTINCT me.id)         AS exam_count,
      ROUND(AVG(tr.rating), 1)      AS avg_rating,
      (
        CASE
          WHEN v_target_group IS NOT NULL
               AND v_target_group = ANY(t.available_groups::TEXT[])
          THEN 30.0 ELSE 0.0
        END
        + LEAST(COUNT(DISTINCT me.id)::NUMERIC * 5.0, 50.0)
        + COALESCE(AVG(tr.rating), 3.0) * 4.0
      ) AS score
    FROM teachers t
    JOIN profiles p ON p.id = t.user_id
    JOIN mock_exams me
      ON me.created_by_teacher = t.id AND me.is_approved = TRUE
    LEFT JOIN teacher_reviews tr ON tr.teacher_id = t.id
    WHERE t.is_verified = TRUE
    GROUP BY t.id, p.full_name, p.avatar_url, t.specializations, t.available_groups
    HAVING COUNT(DISTINCT me.id) >= 1
    ORDER BY score DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
