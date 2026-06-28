-- ============================================================================
-- Hotfix 65: Fix RPC overload + Create question_feedback table
-- ============================================================================
-- 1. admin_get_content_quality_issues has two overloaded signatures:
--    - () → JSON          (from 04b)
--    - (p_threshold) → TABLE (from 04d)
--    PostgREST can't resolve which to call → error.
--    Fix: drop the p_threshold version; keep the no-param JSON version.
--
-- 2. Create question_feedback table for student-reported question issues.
-- ============================================================================

-- 1. Drop the conflicting overloaded function (from 04d_analytics_ai_functions.sql)
DROP FUNCTION IF EXISTS admin_get_content_quality_issues(NUMERIC);

-- 2. Create question_feedback table
CREATE TABLE IF NOT EXISTS question_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'wrong_answer',
    'unclear_question',
    'unclear_options',
    'missing_explanation',
    'wrong_topic',
    'duplicate',
    'other'
  )),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_question_feedback_question_id ON question_feedback(question_id);
CREATE INDEX IF NOT EXISTS idx_question_feedback_user_id ON question_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_question_feedback_status ON question_feedback(status);
CREATE INDEX IF NOT EXISTS idx_question_feedback_created_at ON question_feedback(created_at DESC);

-- RLS
ALTER TABLE question_feedback ENABLE ROW LEVEL SECURITY;

-- Students can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON question_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Students can read their own feedback
CREATE POLICY "Users can read own feedback" ON question_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role (admin) can do everything
CREATE POLICY "Service role full access on question_feedback" ON question_feedback
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Admin RPC to get feedback summary for content analytics
CREATE OR REPLACE FUNCTION admin_get_question_feedback_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      qf.id,
      qf.question_id,
      q.question_text,
      s.name_en as subject_name,
      q.difficulty,
      q.topic,
      qf.feedback_type,
      qf.comment,
      qf.status,
      qf.admin_notes,
      qf.created_at,
      u.raw_user_meta_data->>'full_name' as reporter_name,
      (SELECT COUNT(*) FROM question_feedback qf2 WHERE qf2.question_id = qf.question_id) as total_reports
    FROM question_feedback qf
    JOIN questions q ON q.id = qf.question_id
    JOIN subjects s ON s.id = q.subject_id
    JOIN auth.users u ON u.id = qf.user_id
    ORDER BY
      CASE qf.status WHEN 'pending' THEN 0 WHEN 'reviewed' THEN 1 WHEN 'resolved' THEN 2 WHEN 'dismissed' THEN 3 END,
      qf.created_at DESC
    LIMIT 200
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_question_feedback_summary() TO service_role;

-- 4. RPC to update feedback status (admin only)
CREATE OR REPLACE FUNCTION admin_update_question_feedback(
  p_feedback_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE question_feedback
  SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END,
    resolved_by = CASE WHEN p_status IN ('resolved', 'dismissed') THEN auth.uid() ELSE resolved_by END,
    updated_at = NOW()
  WHERE id = p_feedback_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_question_feedback(UUID, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
