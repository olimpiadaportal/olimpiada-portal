-- ============================================================================
-- Hotfix 85: Security hardening for teacher exam features
--
-- Fixes 6 vulnerabilities discovered during pre-release security audit:
--
-- 1. get_teacher_exam_questions — access gate removed in hotfix 82 rewrite.
--    Any authenticated user could read questions + correct_answer from ANY exam
--    (including unapproved drafts) by calling the RPC directly.
--    Fix: restore approval/ownership check.
--
-- 2. admin_get_teacher_submissions — no admin authorization check.
--    Any authenticated user (student, teacher) could enumerate all teacher
--    exam submissions via direct RPC call.
--    Fix: add admin identity verification.
--
-- 3. get_my_teacher_exams — no anti-spoofing.
--    Any authenticated user could call with another teacher's UUID and read
--    their exam metadata (titles, question counts, draft status).
--    Fix: verify auth.uid() belongs to the provided teacher record.
--
-- 4. get_recommended_teacher_exams — no anti-spoofing.
--    Any user could pass another user's UUID to impersonate their student
--    profile for recommendation scoring.
--    Fix: assert p_student_id = auth.uid().
--
-- 5. mock_exams RLS UPDATE — missing WITH CHECK clause.
--    A teacher could UPDATE their own pending exam to set is_official=TRUE,
--    making it appear in the Official Elmly exam list without admin approval.
--    Also allowed self-approval (is_approved=TRUE).
--    Fix: add WITH CHECK enforcing is_official=FALSE and is_approved=FALSE.
--
-- 6. search_mock_exams — admin-only function, but granted to all authenticated.
--    Any authenticated user could enumerate ALL teacher exams (including drafts
--    and unapproved exams) via direct RPC call.
--    Fix: add admin authorization check.
-- ============================================================================


-- ─── Fix 1: Restore access gate in get_teacher_exam_questions ─────────────────
-- Access rules:
--   • Approved exam  → any authenticated user can read (students taking/reviewing)
--   • Unapproved exam → only the owning teacher can read (edit mode preview)
-- correct_answer is included because it is required for post-exam review.
-- Pre-exam answer leakage is addressed by the mobile app not displaying it
-- during an active attempt; API-level correct_answer access to approved exams
-- is acceptable (exams are static, non-secret knowledge-testing content).

DROP FUNCTION IF EXISTS get_teacher_exam_questions(UUID);

CREATE OR REPLACE FUNCTION get_teacher_exam_questions(p_exam_id UUID)
RETURNS TABLE (
  id              UUID,
  question_order  INTEGER,
  question_id     UUID,
  question_text   TEXT,
  question_type   TEXT,
  option_a        TEXT,
  option_b        TEXT,
  option_c        TEXT,
  option_d        TEXT,
  option_e        TEXT,
  correct_answer  TEXT,
  explanation     TEXT,
  difficulty      TEXT,
  subject_id      UUID,
  subject_name    TEXT,
  source          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Access gate: approved exams are public; unapproved only visible to owning teacher.
  IF NOT EXISTS (
    SELECT 1 FROM mock_exams me
    WHERE me.id = p_exam_id
      AND me.created_by_teacher IS NOT NULL
      AND (
        me.is_approved = TRUE
        OR EXISTS (
          SELECT 1 FROM teachers t
          WHERE t.id = me.created_by_teacher AND t.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Exam not found, not a teacher exam, or not yet approved';
  END IF;

  RETURN QUERY
    SELECT
      teq.id,
      teq.question_order,
      COALESCE(teq.question_id, teq.teacher_question_id)     AS question_id,
      COALESCE(q.question_text, tq.question_text)::TEXT       AS question_text,
      COALESCE(q.question_type::TEXT, tq.question_type)       AS question_type,
      COALESCE(q.option_a, tq.option_a)::TEXT                 AS option_a,
      COALESCE(q.option_b, tq.option_b)::TEXT                 AS option_b,
      COALESCE(q.option_c, tq.option_c)::TEXT                 AS option_c,
      COALESCE(q.option_d, tq.option_d)::TEXT                 AS option_d,
      COALESCE(q.option_e, tq.option_e)::TEXT                 AS option_e,
      COALESCE(q.correct_answer, tq.correct_answer)::TEXT     AS correct_answer,
      COALESCE(q.explanation, tq.explanation)::TEXT           AS explanation,
      COALESCE(
        q.difficulty::TEXT,
        CASE tq.difficulty
          WHEN 1 THEN 'easy' WHEN 2 THEN 'easy'
          WHEN 3 THEN 'medium'
          WHEN 4 THEN 'hard' WHEN 5 THEN 'hard'
        END
      )                                                       AS difficulty,
      COALESCE(q.subject_id, tq.subject_id)                   AS subject_id,
      s.name_en::TEXT                                         AS subject_name,
      CASE WHEN teq.teacher_question_id IS NOT NULL THEN 'teacher' ELSE 'elmly' END AS source
    FROM teacher_exam_questions teq
    LEFT JOIN questions q          ON q.id  = teq.question_id
    LEFT JOIN teacher_questions tq ON tq.id = teq.teacher_question_id
    LEFT JOIN subjects s ON s.id = COALESCE(q.subject_id, tq.subject_id)
    WHERE teq.exam_id = p_exam_id
    ORDER BY teq.question_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_exam_questions(UUID) TO authenticated;


-- ─── Fix 2: Add admin auth check to admin_get_teacher_submissions ──────────────

DROP FUNCTION IF EXISTS admin_get_teacher_submissions(TEXT);

CREATE OR REPLACE FUNCTION admin_get_teacher_submissions(
  p_status TEXT DEFAULT NULL   -- 'pending' | 'approved' | NULL (all)
)
RETURNS TABLE (
  id                     UUID,
  title                  TEXT,
  exam_type              TEXT,
  target_group           TEXT,
  duration_minutes       INTEGER,
  total_questions        INTEGER,
  created_at             TIMESTAMPTZ,
  is_official            BOOLEAN,
  created_by_teacher     UUID,
  is_approved            BOOLEAN,
  uses_teacher_questions BOOLEAN,
  teacher_name           TEXT,
  teacher_avatar_url     TEXT,
  question_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only: reject non-admin callers
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    me.is_official,
    me.created_by_teacher,
    me.is_approved,
    me.uses_teacher_questions,
    pr.full_name                                              AS teacher_name,
    pr.avatar_url                                             AS teacher_avatar_url,
    (SELECT COUNT(*) FROM teacher_exam_questions teq
     WHERE teq.exam_id = me.id)                              AS question_count
  FROM mock_exams me
  JOIN teachers t  ON t.id  = me.created_by_teacher
  JOIN profiles pr ON pr.id = t.user_id
  WHERE me.created_by_teacher IS NOT NULL
    AND me.is_draft = FALSE             -- drafts never appear in admin review queue
    AND (
      p_status IS NULL
      OR (p_status = 'pending'  AND me.is_approved = FALSE)
      OR (p_status = 'approved' AND me.is_approved = TRUE)
    )
  ORDER BY me.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_teacher_submissions(TEXT) TO authenticated;


-- ─── Fix 3: Add anti-spoofing to get_my_teacher_exams ─────────────────────────

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
  is_draft              BOOLEAN,
  uses_teacher_questions BOOLEAN,
  created_at            TIMESTAMPTZ,
  question_count        BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-spoofing: caller must own the teacher record they are querying
  IF NOT EXISTS (
    SELECT 1 FROM teachers WHERE id = p_teacher_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: teacher record does not belong to caller';
  END IF;

  RETURN QUERY
    SELECT
      me.id,
      me.title,
      me.exam_type,
      me.target_group,
      me.duration_minutes,
      me.total_questions,
      me.is_approved,
      me.is_draft,
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


-- ─── Fix 4: Add anti-spoofing to get_recommended_teacher_exams ────────────────

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
  -- Anti-spoofing: caller can only request recommendations for themselves
  IF p_student_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot request recommendations for another user';
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


-- ─── Fix 5: mock_exams RLS UPDATE — add WITH CHECK to prevent privilege escalation ──
-- Without WITH CHECK, teachers could UPDATE their own pending exams to set
-- is_official=TRUE (to impersonate Official Elmly exams) or is_approved=TRUE
-- (self-approval). WITH CHECK enforces the new row values, not just the filter.

DROP POLICY IF EXISTS "Teachers can update own pending exams" ON mock_exams;
DROP POLICY IF EXISTS "Teachers can update their own pending exams" ON mock_exams;

CREATE POLICY "Teachers can update own pending exams"
  ON mock_exams FOR UPDATE TO authenticated
  USING (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    AND is_approved = FALSE
  )
  WITH CHECK (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    AND is_official = FALSE       -- prevent is_official escalation
    AND is_approved = FALSE       -- prevent self-approval
    AND uses_teacher_questions = TRUE
  );


-- ─── Fix 6: Add admin auth check to search_mock_exams ─────────────────────────
-- search_mock_exams is admin-panel-only but was granted to all authenticated users.
-- Without an auth check, any user could enumerate all teacher exams including
-- unapproved drafts, leaking private exam metadata.

DROP FUNCTION IF EXISTS search_mock_exams(TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION search_mock_exams(
  p_exam_type    TEXT    DEFAULT NULL,
  p_target_group TEXT    DEFAULT NULL,
  p_search_text  TEXT    DEFAULT NULL,
  p_limit        INTEGER DEFAULT 50,
  p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                     UUID,
  title                  TEXT,
  exam_type              TEXT,
  target_group           TEXT,
  duration_minutes       INTEGER,
  total_questions        INTEGER,
  created_at             TIMESTAMPTZ,
  question_count         BIGINT,
  is_official            BOOLEAN,
  created_by_teacher     UUID,
  is_approved            BOOLEAN,
  uses_teacher_questions BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only: reject non-admin callers
  IF NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    me.id,
    me.title,
    me.exam_type,
    me.target_group,
    me.duration_minutes,
    me.total_questions,
    me.created_at,
    CASE
      WHEN me.uses_teacher_questions THEN
        (SELECT COUNT(*) FROM teacher_exam_questions teq WHERE teq.exam_id = me.id)
      ELSE
        (SELECT COUNT(*) FROM mock_exam_questions meq WHERE meq.mock_exam_id = me.id)
    END                                  AS question_count,
    me.is_official,
    me.created_by_teacher,
    me.is_approved,
    me.uses_teacher_questions
  FROM mock_exams me
  WHERE (p_exam_type    IS NULL OR me.exam_type    = p_exam_type)
    AND (p_target_group IS NULL OR me.target_group = p_target_group)
    AND (p_search_text  IS NULL OR me.title ILIKE '%' || p_search_text || '%')
  ORDER BY me.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_mock_exams(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
