-- Hotfix 52: Enable RLS on waitlist internal tables
-- Both tables were created in hotfix 40 (waitlist_security_improvements) without RLS.
-- These tables are only accessed by SECURITY DEFINER functions (join_waitlist,
-- get_pending_waitlist_emails, update_waitlist_email_status, cleanup_waitlist_rate_limits).
-- SECURITY DEFINER functions bypass RLS, so enabling RLS here has zero functional impact
-- while closing the PostgREST exposure warning.
-- No user-facing policies are needed or added.

ALTER TABLE waitlist_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_email_queue ENABLE ROW LEVEL SECURITY;
