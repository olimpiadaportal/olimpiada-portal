-- ============================================================================
-- Hotfix 73: Teacher Questions & Exams — Full Schema
--
-- Adds:
--   - mock_exams: is_official, created_by_teacher, uses_teacher_questions, is_approved
--   - Table: teacher_questions   (teacher's private question library)
--   - Table: teacher_exam_questions (links teacher exams to questions)
--   - RLS: updated mock_exams, new tables
--   - RPCs: admin_set_exam_official, admin_approve_teacher_exam,
--           get_teacher_exam_questions, get_recommended_teacher_exams
--   - Leaderboard guard in update_leaderboard_score_after_exam
--   - Indexes
-- ============================================================================

-- ============================================================================
-- SECTION 1: ALTER mock_exams
-- ============================================================================

ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS is_official           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by_teacher    UUID    REFERENCES teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uses_teacher_questions BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_approved           BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing rows are Elmly-created official exams — mark them as such.
-- Teacher-created exams (future) will have created_by_teacher set and is_official=FALSE.
UPDATE mock_exams
SET is_official = TRUE
WHERE created_by_teacher IS NULL;

-- ============================================================================
-- SECTION 2: teacher_questions table
-- ============================================================================
-- Private library: only the creating teacher can read/write their questions.
-- Students never query this table directly — see get_teacher_exam_questions RPC.

CREATE TABLE IF NOT EXISTS teacher_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id      UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  topic_id        UUID REFERENCES subject_topics(id),
  subtopic_id     UUID REFERENCES subject_subtopics(id),
  question_type   TEXT NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq', 'short_answer')),
  question_text   TEXT NOT NULL,
  option_a        TEXT,
  option_b        TEXT,
  option_c        TEXT,
  option_d        TEXT,
  correct_answer  TEXT NOT NULL,
  explanation     TEXT,
  image_url       TEXT,
  difficulty      INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_questions_teacher_id
  ON teacher_questions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_questions_subtopic_id
  ON teacher_questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_teacher_questions_subject_id
  ON teacher_questions(subject_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_teacher_question_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_questions_updated_at ON teacher_questions;
CREATE TRIGGER trg_teacher_questions_updated_at
  BEFORE UPDATE ON teacher_questions
  FOR EACH ROW EXECUTE FUNCTION touch_teacher_question_updated_at();

-- ============================================================================
-- SECTION 3: teacher_exam_questions table
-- ============================================================================
-- Links a teacher exam to its questions (mix of Elmly questions + teacher questions).
-- Exactly one of question_id / teacher_question_id must be set per row.

CREATE TABLE IF NOT EXISTS teacher_exam_questions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id             UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  question_id         UUID REFERENCES questions(id) ON DELETE CASCADE,
  teacher_question_id UUID REFERENCES teacher_questions(id) ON DELETE CASCADE,
  question_order      INTEGER NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT only_one_source CHECK (
    (question_id IS NULL) != (teacher_question_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_teacher_exam_questions_exam_id
  ON teacher_exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_teacher_exam_questions_question_id
  ON teacher_exam_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_teacher_exam_questions_teacher_question_id
  ON teacher_exam_questions(teacher_question_id);

-- ============================================================================
-- SECTION 4: Additional indexes on mock_exams
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mock_exams_created_by_teacher
  ON mock_exams(created_by_teacher);
CREATE INDEX IF NOT EXISTS idx_mock_exams_is_official
  ON mock_exams(is_official);
CREATE INDEX IF NOT EXISTS idx_mock_exams_is_approved
  ON mock_exams(is_approved);

-- ============================================================================
-- SECTION 5: RLS — mock_exams (update existing + add teacher policies)
-- ============================================================================

-- Drop the old blanket "Anyone can view mock exams" policy.
-- Replace with a scoped policy that respects the new columns.
DROP POLICY IF EXISTS "Anyone can view mock exams" ON mock_exams;

CREATE POLICY "View mock exams"
  ON mock_exams FOR SELECT
  USING (
    -- Official Elmly exams: always visible (retains existing behaviour)
    is_official = TRUE
    -- Approved teacher exams: visible to all authenticated users
    OR (
      created_by_teacher IS NOT NULL
      AND is_approved = TRUE
      AND auth.uid() IS NOT NULL
    )
    -- Teachers always see their own exams regardless of approval status
    OR (
      created_by_teacher IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM teachers t
        WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
      )
    )
  );

-- Teachers can INSERT their own exams (not official, not approved, must reference themselves)
DROP POLICY IF EXISTS "Teachers can insert their own exams" ON mock_exams;
CREATE POLICY "Teachers can insert their own exams"
  ON mock_exams FOR INSERT TO authenticated
  WITH CHECK (
    created_by_teacher IS NOT NULL
    AND is_official = FALSE
    AND is_approved = FALSE
    AND uses_teacher_questions = TRUE
    AND EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
    )
  );

-- Teachers can UPDATE their own exams only while pending (not yet approved)
DROP POLICY IF EXISTS "Teachers can update their own pending exams" ON mock_exams;
CREATE POLICY "Teachers can update their own pending exams"
  ON mock_exams FOR UPDATE TO authenticated
  USING (
    created_by_teacher IS NOT NULL
    AND is_approved = FALSE
    AND EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
    )
  );

-- Teachers can DELETE their own exams at any time
DROP POLICY IF EXISTS "Teachers can delete their own exams" ON mock_exams;
CREATE POLICY "Teachers can delete their own exams"
  ON mock_exams FOR DELETE TO authenticated
  USING (
    created_by_teacher IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
    )
  );

-- ============================================================================
-- SECTION 6: RLS — teacher_questions
-- ============================================================================

ALTER TABLE teacher_questions ENABLE ROW LEVEL SECURITY;

-- Teachers: full access to their own questions only
DROP POLICY IF EXISTS "Teachers manage own questions" ON teacher_questions;
CREATE POLICY "Teachers manage own questions"
  ON teacher_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id AND t.user_id = auth.uid()
    )
  );

-- Students have NO direct SELECT — they receive question data via
-- the get_teacher_exam_questions SECURITY DEFINER RPC only.

-- ============================================================================
-- SECTION 7: RLS — teacher_exam_questions
-- ============================================================================

ALTER TABLE teacher_exam_questions ENABLE ROW LEVEL SECURITY;

-- Teachers can manage question rows for their own exams
DROP POLICY IF EXISTS "Teachers manage own exam questions" ON teacher_exam_questions;
CREATE POLICY "Teachers manage own exam questions"
  ON teacher_exam_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_exams me
      JOIN teachers t ON t.id = me.created_by_teacher
      WHERE me.id = exam_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_exams me
      JOIN teachers t ON t.id = me.created_by_teacher
      WHERE me.id = exam_id AND t.user_id = auth.uid()
    )
  );

-- Students have NO direct SELECT — get_teacher_exam_questions handles this.

-- ============================================================================
-- SECTION 8: ADMIN RPCs
-- ============================================================================

-- 8a. Set Official Stamp (admin only)
CREATE OR REPLACE FUNCTION admin_set_exam_official(
  p_exam_id    UUID,
  p_is_official BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE mock_exams SET is_official = p_is_official WHERE id = p_exam_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found: %', p_exam_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_exam_official(UUID, BOOLEAN) TO authenticated;

-- 8b. Approve / Reject Teacher Exam (admin only)
CREATE OR REPLACE FUNCTION admin_approve_teacher_exam(
  p_exam_id  UUID,
  p_approved BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE mock_exams
    SET is_approved = p_approved
    WHERE id = p_exam_id AND created_by_teacher IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher exam not found: %', p_exam_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_teacher_exam(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- SECTION 9: get_teacher_exam_questions RPC
-- ============================================================================
-- Used by students (and teachers previewing) when taking a teacher exam.
-- SECURITY DEFINER: students never query teacher_questions directly.
-- Returns merged question data from both Elmly + teacher question sources.

DROP FUNCTION IF EXISTS get_teacher_exam_questions(UUID);

CREATE OR REPLACE FUNCTION get_teacher_exam_questions(p_exam_id UUID)
RETURNS TABLE (
  question_order      INTEGER,
  source              TEXT,       -- 'elmly' | 'teacher'
  question_id         UUID,       -- set when source = 'elmly'
  teacher_question_id UUID,       -- set when source = 'teacher'
  question_type       TEXT,
  question_text       TEXT,
  option_a            TEXT,
  option_b            TEXT,
  option_c            TEXT,
  option_d            TEXT,
  correct_answer      TEXT,
  explanation         TEXT,
  image_url           TEXT,
  teacher_name        TEXT        -- non-null when source = 'teacher'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify exam exists, is a teacher exam, and is approved
  -- (teachers previewing their own unapproved exam can bypass: check ownership)
  IF NOT EXISTS (
    SELECT 1 FROM mock_exams me
    WHERE me.id = p_exam_id
      AND me.created_by_teacher IS NOT NULL
      AND (
        me.is_approved = TRUE
        OR EXISTS (
          SELECT 1 FROM teachers t WHERE t.id = me.created_by_teacher AND t.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Exam not found, not a teacher exam, or not yet approved';
  END IF;

  RETURN QUERY
  SELECT
    teq.question_order,
    CASE WHEN teq.question_id IS NOT NULL THEN 'elmly' ELSE 'teacher' END::TEXT AS source,
    teq.question_id,
    teq.teacher_question_id,
    COALESCE(q.question_type::TEXT, tq.question_type),
    COALESCE(q.question_text, tq.question_text),
    COALESCE(q.option_a, tq.option_a),
    COALESCE(q.option_b, tq.option_b),
    COALESCE(q.option_c, tq.option_c),
    COALESCE(q.option_d, tq.option_d),
    COALESCE(q.correct_answer, tq.correct_answer),
    COALESCE(q.explanation, tq.explanation),
    COALESCE(q.question_image_url, tq.image_url),
    CASE WHEN tq.id IS NOT NULL THEN p.full_name ELSE NULL END AS teacher_name
  FROM teacher_exam_questions teq
  LEFT JOIN questions        q  ON q.id  = teq.question_id
  LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
  LEFT JOIN teachers         t  ON t.id  = tq.teacher_id
  LEFT JOIN profiles         p  ON p.id  = t.user_id
  WHERE teq.exam_id = p_exam_id
  ORDER BY teq.question_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_questions(UUID) TO authenticated;

-- ============================================================================
-- SECTION 10: Leaderboard guard in update_leaderboard_score_after_exam
-- ============================================================================
-- Teacher exams (is_official=FALSE) must NOT affect ELO / leaderboard score.
-- We add an early return at the top of the existing function.
-- The rest of the function body is unchanged from 04_functions_triggers.sql /
-- hotfix 35 (hybrid scoring).

DROP FUNCTION IF EXISTS update_leaderboard_score_after_exam(UUID, UUID);

CREATE OR REPLACE FUNCTION update_leaderboard_score_after_exam(
  p_student_id UUID,
  p_attempt_id UUID
)
RETURNS TABLE(
  new_leaderboard_score DECIMAL,
  exam_component        DECIMAL,
  practice_component    DECIMAL,
  streak_component      DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_exam_percentage   DECIMAL;
  v_exam_score        DECIMAL := 0;
  v_practice_score    DECIMAL := 0;
  v_streak_bonus      DECIMAL := 0;
  v_final_score       DECIMAL;
  v_weights           DECIMAL[] := ARRAY[0.4, 0.3, 0.2, 0.1];
  v_weighted_sum      DECIMAL   := 0;
  v_total_weight      DECIMAL   := 0;
  v_recent_exams      RECORD;
  v_idx               INTEGER   := 0;
  v_is_official       BOOLEAN;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Verify student ownership
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: student record does not belong to caller';
  END IF;

  -- 3. Verify the exam attempt is real, completed, and belongs to caller
  SELECT mea.percentage
  INTO   v_exam_percentage
  FROM   mock_exam_attempts mea
  WHERE  mea.id        = p_attempt_id
    AND  mea.user_id   = v_user_id
    AND  mea.status    = 'completed'
    AND  mea.percentage IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid attempt: not found, not completed, or does not belong to caller';
  END IF;

  -- *** LEADERBOARD GUARD ***
  -- Teacher-created exams are never official. Return zeros silently — the
  -- caller (mobile / webapp) handles the non-leaderboard case.
  SELECT me.is_official
  INTO   v_is_official
  FROM   mock_exam_attempts mea
  JOIN   mock_exams me ON me.id = mea.mock_exam_id
  WHERE  mea.id = p_attempt_id;

  IF NOT COALESCE(v_is_official, TRUE) THEN
    RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;

  -- 4. Calculate EXAM SCORE (70% weight) - weighted average of last 4 official exams
  FOR v_recent_exams IN
    SELECT mea2.percentage
    FROM   mock_exam_attempts mea2
    JOIN   mock_exams me2 ON me2.id = mea2.mock_exam_id
    WHERE  mea2.user_id   = v_user_id
      AND  mea2.status    = 'completed'
      AND  mea2.percentage IS NOT NULL
      AND  me2.is_official = TRUE        -- only official exams count
    ORDER  BY mea2.completed_at DESC
    LIMIT  4
  LOOP
    IF v_idx < 4 THEN
      v_weighted_sum := v_weighted_sum + v_recent_exams.percentage * v_weights[v_idx + 1];
      v_total_weight := v_total_weight + v_weights[v_idx + 1];
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_total_weight > 0 THEN
    v_exam_score := v_weighted_sum / v_total_weight;
  ELSE
    v_exam_score := v_exam_percentage;
  END IF;

  -- 5. Calculate PRACTICE SCORE (20% weight)
  v_practice_score := calculate_practice_score(v_user_id);

  -- 6. Calculate STREAK BONUS (10% weight)
  SELECT LEAST(COALESCE(current_streak, 0) * 0.5, 10)
  INTO   v_streak_bonus
  FROM   students
  WHERE  id = p_student_id;

  -- 7. Hybrid formula: 70% exam + 20% practice + 10% streak
  v_final_score := (v_exam_score * 0.7) + (v_practice_score * 0.2) + (v_streak_bonus * 0.1);

  -- 8. Persist to students table
  UPDATE students
  SET    leaderboard_score = v_final_score,
         updated_at        = NOW()
  WHERE  id = p_student_id;

  RETURN QUERY
  SELECT
    v_final_score       AS new_leaderboard_score,
    v_exam_score        AS exam_component,
    v_practice_score    AS practice_component,
    v_streak_bonus      AS streak_component;
END;
$$;

COMMENT ON FUNCTION update_leaderboard_score_after_exam IS
  'Hybrid scoring: 70% exam (official only, weighted avg of last 4), 20% practice, 10% streak. '
  'Teacher exams (is_official=FALSE) are silently skipped — returns zeros.';

GRANT EXECUTE ON FUNCTION update_leaderboard_score_after_exam(UUID, UUID) TO authenticated;

-- ============================================================================
-- SECTION 11: get_recommended_teacher_exams RPC
-- ============================================================================
-- Returns one row per teacher who has ≥1 approved exam, ranked by relevance
-- score for the given student. Used to populate the Exams Hub teacher card grid.

DROP FUNCTION IF EXISTS get_recommended_teacher_exams(UUID);

CREATE OR REPLACE FUNCTION get_recommended_teacher_exams(p_student_id UUID)
RETURNS TABLE (
  teacher_id   UUID,
  full_name    TEXT,
  avatar_url   TEXT,
  city         TEXT,
  subjects     TEXT[],
  exam_count   BIGINT,
  avg_rating   NUMERIC,
  score        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_group  TEXT;
  v_student_city   TEXT;
BEGIN
  -- Load student profile for personalisation
  SELECT s.target_group, s.city
  INTO   v_student_group, v_student_city
  FROM   students s
  WHERE  s.id = p_student_id;

  RETURN QUERY
  WITH teacher_exams AS (
    -- Aggregate stats per teacher (approved exams only)
    SELECT
      me.created_by_teacher                                    AS tid,
      COUNT(DISTINCT me.id)                                    AS exam_count,
      -- Sum of all attempt counts across teacher's exams (popularity proxy)
      COALESCE(SUM(attempt_agg.cnt), 0)                        AS total_attempts,
      -- Most recent published exam date (recency)
      MAX(me.created_at)                                       AS last_published_at,
      -- Subjects this teacher covers (deduplicated array)
      ARRAY(
        SELECT DISTINCT s.name_en
        FROM mock_exams me2
        JOIN subjects s ON s.id = (
          -- Derive subject from first question in the exam
          SELECT q.subject_id
          FROM teacher_exam_questions teq
          JOIN questions q ON q.id = teq.question_id
          WHERE teq.exam_id = me2.id
          LIMIT 1
        )
        WHERE me2.created_by_teacher = me.created_by_teacher
          AND me2.is_approved = TRUE
      )                                                        AS subjects,
      -- Most common target_group for this teacher's exams
      MODE() WITHIN GROUP (ORDER BY me.target_group)           AS common_group
    FROM mock_exams me
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt
      FROM mock_exam_attempts mea
      WHERE mea.mock_exam_id = me.id
    ) attempt_agg ON TRUE
    WHERE me.created_by_teacher IS NOT NULL
      AND me.is_approved = TRUE
    GROUP BY me.created_by_teacher
    HAVING COUNT(DISTINCT me.id) >= 1
  )
  SELECT
    t.id                                                       AS teacher_id,
    COALESCE(p.full_name, 'Unknown')                          AS full_name,
    p.avatar_url,
    t.city,
    COALESCE(te.subjects, ARRAY[]::TEXT[])                     AS subjects,
    te.exam_count,
    ROUND(t.rating, 1)                                         AS avg_rating,
    -- Recommendation score (max 100)
    ROUND((
      -- Group match (40 pts)
      CASE WHEN te.common_group = v_student_group THEN 40 ELSE 0 END
      -- City match (20 pts)
      + CASE WHEN t.city IS NOT NULL AND t.city = v_student_city THEN 20 ELSE 0 END
      -- Bookmarked teacher (25 pts)
      + CASE WHEN EXISTS (
          SELECT 1 FROM favorite_teachers ft
          JOIN students s2 ON s2.id = ft.student_id
          WHERE ft.teacher_id = t.id AND s2.id = p_student_id
        ) THEN 25 ELSE 0 END
      -- Popularity (max 10 pts: 1 pt per 50 attempts)
      + LEAST(te.total_attempts::NUMERIC / 50, 10)
      -- Recency bonus (max 5 pts, decays linearly over 30 days)
      + GREATEST(5 - (EXTRACT(EPOCH FROM (NOW() - te.last_published_at)) / 86400 / 30 * 5), 0)
    )::NUMERIC, 2)                                             AS score
  FROM teacher_exams te
  JOIN teachers t ON t.id = te.tid
  LEFT JOIN profiles p ON p.id = t.user_id
  ORDER BY score DESC, te.exam_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommended_teacher_exams(UUID) TO authenticated;

-- ============================================================================
-- SECTION 12: Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';
