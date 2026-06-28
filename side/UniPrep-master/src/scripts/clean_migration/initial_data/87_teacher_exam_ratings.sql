-- Hotfix 87: Teacher exam ratings table + submit RPC + update get_recommended_teacher_exams
-- Run on live DB

-- ── 1. New table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_exam_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attempt_id  UUID REFERENCES mock_exam_attempts(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attempt_id)  -- one rating per attempt; student can re-rate on a new attempt
);

-- RLS
ALTER TABLE teacher_exam_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own exam ratings"
  ON teacher_exam_ratings FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY "Students can read own exam ratings"
  ON teacher_exam_ratings FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ── 2. SECURITY DEFINER submit RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_teacher_exam_rating(
  p_exam_id    UUID,
  p_attempt_id UUID,
  p_rating     INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  -- Anti-spoof: resolve student from the authenticated caller
  SELECT id INTO v_student_id FROM students WHERE user_id = auth.uid();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate rating range
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  INSERT INTO teacher_exam_ratings(exam_id, student_id, attempt_id, rating)
  VALUES (p_exam_id, v_student_id, p_attempt_id, p_rating)
  ON CONFLICT (attempt_id) DO UPDATE
    SET rating = EXCLUDED.rating;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_teacher_exam_rating(UUID, UUID, INTEGER) TO authenticated;

-- ── 3. Update get_recommended_teacher_exams to include exam ratings in avg_rating ──

DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id      UUID,
  full_name       TEXT,
  avatar_url      TEXT,
  subjects        JSONB,
  exam_count      BIGINT,
  avg_rating      NUMERIC,
  score           NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_group TEXT;
BEGIN
  -- Anti-spoof: caller must be the student they're requesting for
  IF p_student_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.target_group INTO v_target_group
  FROM students s WHERE s.user_id = p_student_id;

  RETURN QUERY
    SELECT
      t.id                          AS teacher_id,
      p.full_name,
      p.avatar_url,
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
      -- avg_rating now combines booking reviews + exam-specific ratings
      ROUND(
        (SELECT AVG(rating) FROM (
          SELECT tr.rating FROM teacher_reviews tr WHERE tr.teacher_id = t.id
          UNION ALL
          SELECT ter.rating FROM teacher_exam_ratings ter
            JOIN mock_exams me2 ON me2.id = ter.exam_id
            WHERE me2.created_by_teacher = t.id
        ) all_ratings),
        1
      )                             AS avg_rating,
      (
        CASE
          WHEN v_target_group IS NOT NULL
               AND v_target_group = ANY(t.available_groups::TEXT[])
          THEN 30.0 ELSE 0.0
        END
        + LEAST(COUNT(DISTINCT me.id)::NUMERIC * 5.0, 50.0)
        + COALESCE(
            (SELECT AVG(rating) FROM (
              SELECT tr2.rating FROM teacher_reviews tr2 WHERE tr2.teacher_id = t.id
              UNION ALL
              SELECT ter.rating::numeric FROM teacher_exam_ratings ter
                JOIN mock_exams me3 ON me3.id = ter.exam_id
                WHERE me3.created_by_teacher = t.id
            ) all_ratings2),
            3.0
          ) * 4.0
      ) AS score
    FROM teachers t
    JOIN profiles p ON p.id = t.user_id
    JOIN mock_exams me
      ON me.created_by_teacher = t.id AND me.is_approved = TRUE
    WHERE t.is_verified = TRUE
    GROUP BY t.id, p.full_name, p.avatar_url, t.specializations, t.available_groups
    HAVING COUNT(DISTINCT me.id) >= 1
    ORDER BY score DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
