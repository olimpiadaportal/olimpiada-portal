-- Hotfix 90: Align all leaderboard functions to use monthly_score
-- Date: 2026-04-26
-- Context: The leaderboard "Score" tab was updated on the frontend to show monthly_score
--          instead of the old hybrid leaderboard_score. This hotfix ensures ALL backend
--          functions (city + national leaderboard + student rank) return/order/filter
--          by monthly_score.

-- =============================================================================
-- 1. Update get_city_leaderboard
-- =============================================================================

DROP FUNCTION IF EXISTS get_city_leaderboard(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_city_leaderboard(
  p_city TEXT,
  p_rank_type TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  score DECIMAL,
  monthly_score DECIMAL,
  streak INTEGER,
  city TEXT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
    s.leaderboard_score as score,
    s.monthly_score::DECIMAL,
    s.current_streak as streak,
    s.city,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE 
          WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
          ELSE s.current_streak::DECIMAL 
        END DESC
    ) as rank
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE s.city = p_city
    AND COALESCE(us.show_in_leaderboard, true) = true
    AND (
      CASE 
        WHEN p_rank_type = 'score' THEN s.monthly_score > 0
        ELSE s.current_streak > 0 
      END
    )
  ORDER BY rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. Update get_national_leaderboard
-- =============================================================================

DROP FUNCTION IF EXISTS get_national_leaderboard(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_national_leaderboard(
  p_rank_type TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  score DECIMAL,
  monthly_score DECIMAL,
  streak INTEGER,
  city TEXT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' as display_name,
    s.leaderboard_score as score,
    s.monthly_score::DECIMAL,
    s.current_streak as streak,
    s.city,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE 
          WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
          ELSE s.current_streak::DECIMAL 
        END DESC
    ) as rank
  FROM students s
  JOIN profiles p ON s.user_id = p.id
  LEFT JOIN user_settings us ON p.id = us.user_id
  WHERE COALESCE(us.show_in_leaderboard, true) = true
    AND (
      CASE 
        WHEN p_rank_type = 'score' THEN s.monthly_score > 0
        ELSE s.current_streak > 0 
      END
    )
  ORDER BY rank
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. Update get_student_rank (city + national branches)
-- =============================================================================

DROP FUNCTION IF EXISTS get_student_rank(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_student_rank(
  p_student_id UUID,
  p_rank_type TEXT,
  p_scope TEXT
)
RETURNS TABLE (
  rank BIGINT,
  total BIGINT,
  value DECIMAL
) AS $$
BEGIN
  IF p_scope = 'city' THEN
    RETURN QUERY
    WITH ranked_students AS (
      SELECT 
        s.id,
        s.monthly_score,
        s.current_streak,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE 
              WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
              ELSE s.current_streak::DECIMAL 
            END DESC
        ) as student_rank
      FROM students s
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      WHERE s.city = (SELECT city FROM students WHERE id = p_student_id)
        AND COALESCE(us.show_in_leaderboard, true) = true
        AND (
          CASE 
            WHEN p_rank_type = 'score' THEN s.monthly_score > 0
            ELSE s.current_streak > 0 
          END
        )
    )
    SELECT 
      student_rank as rank,
      (SELECT COUNT(*) FROM ranked_students)::BIGINT as total,
      CASE 
        WHEN p_rank_type = 'score' THEN monthly_score 
        ELSE current_streak::DECIMAL 
      END as value
    FROM ranked_students
    WHERE id = p_student_id;
  ELSE
    RETURN QUERY
    WITH ranked_students AS (
      SELECT 
        s.id,
        s.monthly_score,
        s.current_streak,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE 
              WHEN p_rank_type = 'score' THEN s.monthly_score::DECIMAL 
              ELSE s.current_streak::DECIMAL 
            END DESC
        ) as student_rank
      FROM students s
      LEFT JOIN user_settings us ON s.user_id = us.user_id
      WHERE COALESCE(us.show_in_leaderboard, true) = true
        AND (
          CASE 
            WHEN p_rank_type = 'score' THEN s.monthly_score > 0
            ELSE s.current_streak > 0 
          END
        )
    )
    SELECT 
      student_rank as rank,
      (SELECT COUNT(*) FROM ranked_students)::BIGINT as total,
      CASE 
        WHEN p_rank_type = 'score' THEN monthly_score 
        ELSE current_streak::DECIMAL 
      END as value
    FROM ranked_students
    WHERE id = p_student_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_city_leaderboard IS
  'Returns city leaderboard ordered by monthly_score for score rank type.';
COMMENT ON FUNCTION get_national_leaderboard IS
  'Returns national leaderboard ordered by monthly_score for score rank type.';
COMMENT ON FUNCTION get_student_rank IS
  'Returns student rank with monthly_score as the value metric for score rank type.';
