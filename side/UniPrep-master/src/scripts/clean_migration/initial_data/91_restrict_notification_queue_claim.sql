-- ============================================================================
-- 91_restrict_notification_queue_claim.sql
-- Purpose: Ensure notification queue claiming remains server/worker-only.
-- Date: 2026-05-26
--
-- Live database patch:
--   claim_pending_notifications is an atomic worker claim primitive. Normal
--   authenticated clients must not be able to mark arbitrary queued
--   notifications as processing.
--
-- Rollback, only if an authenticated-client use case is intentionally restored:
--   GRANT EXECUTE ON FUNCTION claim_pending_notifications(INTEGER, TEXT) TO authenticated;
-- ============================================================================

REVOKE EXECUTE ON FUNCTION claim_pending_notifications(INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_pending_notifications(INTEGER, TEXT) TO service_role;
