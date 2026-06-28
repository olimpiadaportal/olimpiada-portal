-- ============================================================================
-- FIX: get_recent_activity UNION ORDER BY clause
-- Error: "Only result column names can be used, not expressions or functions"
-- Fix: Wrap UNION in a subquery so ORDER BY applies to the outer SELECT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recent_activity(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(event_type TEXT, user_id UUID, user_name TEXT, event_timestamp TIMESTAMPTZ, metadata JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 'registration'::TEXT AS event_type, p.id AS user_id, p.full_name AS user_name, p.created_at AS event_timestamp,
      jsonb_build_object('user_type', p.user_type, 'city', p.city) AS metadata
    FROM profiles p WHERE p.created_at >= NOW() - INTERVAL '24 hours' AND p.user_type = 'student'
    UNION ALL
    SELECT 'score_change'::TEXT, s.id, p.full_name, st.created_at,
      jsonb_build_object('elo_change', st.elo_change, 'new_elo', st.new_elo)
    FROM score_transactions st JOIN students s ON st.student_id = s.id JOIN profiles p ON s.user_id = p.id
    WHERE st.created_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'admin_action'::TEXT, aal.admin_id, p.full_name, aal.timestamp,
      jsonb_build_object('action', aal.action_type, 'table', aal.table_name)
    FROM admin_audit_log aal JOIN profiles p ON aal.admin_id = p.id
    WHERE aal.timestamp >= NOW() - INTERVAL '24 hours'
  ) sub
  ORDER BY sub.event_timestamp DESC LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recent_activity(INTEGER) TO authenticated;

-- Verify
SELECT get_recent_activity(5);
