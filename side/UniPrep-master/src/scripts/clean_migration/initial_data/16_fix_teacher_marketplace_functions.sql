-- ============================================================================
-- HOTFIX 16: Teacher Marketplace Functions
-- Date: 2025-02-12
-- Description: Adds missing teacher marketplace functions that were added to
--              the consolidated 04_functions_triggers.sql but never applied
--              to the test database as a standalone hotfix.
-- 
-- Functions added:
--   - get_student_teachers(UUID)
--   - search_teachers(TEXT, UUID, TEXT, INTEGER)
--   - assign_teacher_to_subject(UUID, UUID, UUID)
--   - remove_teacher_from_subject(UUID, UUID)
--   - get_leaderboard_with_teachers(TEXT, TEXT, INTEGER)
--   - update_student_teachers_timestamp() trigger function
--
-- Prerequisites: Tables student_teachers, leaderboard_display_settings,
--                subjects, teachers, profiles, bookings must exist.
-- ============================================================================

-- 1. Get student's assigned teachers
CREATE OR REPLACE FUNCTION get_student_teachers(p_student_id UUID)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  teacher_id UUID,
  teacher_name TEXT,
  teacher_city TEXT,
  assigned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id as subject_id,
    sub.name_az as subject_name,
    t.id as teacher_id,
    p.full_name as teacher_name,
    p.city as teacher_city,
    st.created_at as assigned_at
  FROM student_teachers st
  JOIN subjects sub ON st.subject_id = sub.id
  JOIN teachers t ON st.teacher_id = t.id
  JOIN profiles p ON t.user_id = p.id
  WHERE st.student_id = p_student_id
  ORDER BY sub.name_az;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_student_teachers IS 'Get all teachers assigned by a student';

-- 2. Search teachers (student-facing)
DROP FUNCTION IF EXISTS search_teachers(TEXT, UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION search_teachers(
  p_query TEXT,
  p_subject_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  teacher_id UUID,
  teacher_name TEXT,
  teacher_city TEXT,
  teacher_avatar_url TEXT,
  subject_count INTEGER,
  student_count INTEGER
) AS $$
DECLARE
  v_subject_name_en TEXT;
  v_subject_name_az TEXT;
BEGIN
  IF p_subject_id IS NOT NULL THEN
    SELECT name_en, name_az INTO v_subject_name_en, v_subject_name_az
    FROM subjects WHERE id = p_subject_id;
  END IF;

  RETURN QUERY
  SELECT
    t.id as teacher_id,
    p.full_name as teacher_name,
    p.city as teacher_city,
    p.avatar_url as teacher_avatar_url,
    COALESCE(array_length(t.specializations, 1), 0)::INTEGER as subject_count,
    (
      SELECT COUNT(DISTINCT student_id) FROM (
        SELECT student_id FROM student_teachers st WHERE st.teacher_id = t.id
        UNION
        SELECT student_id FROM bookings b WHERE b.teacher_id = t.id AND b.status = 'completed'
      ) AS combined_students
    )::INTEGER as student_count
  FROM teachers t
  JOIN profiles p ON t.user_id = p.id
  WHERE
    (p_query IS NULL OR p_query = '' OR p.full_name ILIKE '%' || p_query || '%')
    AND (
      v_subject_name_en IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(t.specializations) AS spec
        WHERE
          LOWER(spec) = LOWER(v_subject_name_en)
          OR LOWER(spec) = LOWER(v_subject_name_az)
          OR spec ILIKE '%' || v_subject_name_en || '%'
          OR v_subject_name_en ILIKE '%' || spec || '%'
          OR spec ILIKE '%' || v_subject_name_az || '%'
          OR v_subject_name_az ILIKE '%' || spec || '%'
      )
    )
    AND (p_city IS NULL OR p.city = p_city)
  GROUP BY t.id, p.full_name, p.city, p.avatar_url, t.specializations
  ORDER BY student_count DESC, p.full_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION search_teachers IS 'Search for teachers by name, subject, or city';

-- 3. Assign teacher to subject
CREATE OR REPLACE FUNCTION assign_teacher_to_subject(
  p_student_id UUID,
  p_subject_id UUID,
  p_teacher_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO student_teachers (student_id, subject_id, teacher_id, status)
  VALUES (p_student_id, p_subject_id, p_teacher_id, 'active')
  ON CONFLICT (student_id, subject_id)
  DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id,
    status     = 'active',
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'assign_teacher_to_subject error: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assign_teacher_to_subject IS 'Assign or update teacher for a subject';

-- 4. Remove teacher from subject
CREATE OR REPLACE FUNCTION remove_teacher_from_subject(
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM student_teachers
  WHERE student_id = p_student_id
    AND subject_id = p_subject_id;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION remove_teacher_from_subject IS 'Remove teacher assignment for a subject';

-- 5. Get leaderboard with teacher info
CREATE OR REPLACE FUNCTION get_leaderboard_with_teachers(
  p_city TEXT DEFAULT NULL,
  p_rank_type TEXT DEFAULT 'score',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  student_id UUID,
  display_name TEXT,
  score DECIMAL,
  streak INTEGER,
  city TEXT,
  target_group TEXT,
  rank BIGINT,
  teachers JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_students AS (
    SELECT
      s.id,
      SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
      s.monthly_score::DECIMAL as score,
      s.current_streak,
      s.city,
      s.target_group,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN p_rank_type = 'score' THEN s.monthly_score
            ELSE s.current_streak
          END DESC
      ) as rank
    FROM students s
    JOIN profiles p ON s.user_id = p.id
    LEFT JOIN user_settings us ON p.id = us.user_id
    WHERE
      (p_city IS NULL OR s.city = p_city)
      AND COALESCE(us.show_in_leaderboard, true) = true
      AND (
        CASE
          WHEN p_rank_type = 'score' THEN s.monthly_score > 0
          ELSE s.current_streak > 0
        END
      )
  ),
  student_teachers_agg AS (
    SELECT
      st.student_id,
      jsonb_agg(
        jsonb_build_object(
          'subject', sub.name_az,
          'teacher_name', tp.full_name,
          'teacher_city', tp.city
        )
      ) as teachers
    FROM student_teachers st
    JOIN subjects sub ON st.subject_id = sub.id
    JOIN teachers t ON st.teacher_id = t.id
    JOIN profiles tp ON t.user_id = tp.id
    JOIN leaderboard_display_settings lds ON st.student_id = lds.student_id
    WHERE lds.show_teachers = true
    GROUP BY st.student_id
  )
  SELECT
    rs.id as student_id,
    rs.display_name,
    rs.score,
    rs.current_streak as streak,
    rs.city,
    rs.target_group,
    rs.rank,
    COALESCE(sta.teachers, '[]'::jsonb) as teachers
  FROM ranked_students rs
  LEFT JOIN student_teachers_agg sta ON rs.id = sta.student_id
  ORDER BY rs.rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_leaderboard_with_teachers IS 'Get leaderboard with teacher information';

-- 6. Trigger function: update student_teachers timestamp
CREATE OR REPLACE FUNCTION update_student_teachers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger (if not exists)
DROP TRIGGER IF EXISTS update_student_teachers_updated_at ON student_teachers;
CREATE TRIGGER update_student_teachers_updated_at
  BEFORE UPDATE ON student_teachers
  FOR EACH ROW
  EXECUTE FUNCTION update_student_teachers_timestamp();

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_student_teachers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_teachers(TEXT, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_teacher_to_subject(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_teacher_from_subject(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard_with_teachers(TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_student_teachers') AS get_student_teachers_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'search_teachers') AS search_teachers_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'assign_teacher_to_subject') AS assign_teacher_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'remove_teacher_from_subject') AS remove_teacher_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_leaderboard_with_teachers') AS leaderboard_teachers_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_student_teachers_timestamp') AS timestamp_trigger_fn;
