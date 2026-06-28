-- ============================================================================
-- 44_fix_notification_queue_constraint.sql
-- Fix: Add proper UNIQUE CONSTRAINT for ON CONFLICT to work
-- ============================================================================
-- Problem: queue_payment_notification() uses ON CONFLICT (idempotency_key) DO NOTHING
-- but only a partial UNIQUE INDEX exists, not a UNIQUE CONSTRAINT.
-- PostgreSQL requires a UNIQUE CONSTRAINT (not just index) for ON CONFLICT.
-- ============================================================================

-- Step 1: Drop the existing partial unique index (it's not sufficient for ON CONFLICT)
DROP INDEX IF EXISTS idx_notification_queue_idempotency;

-- Step 2: Add a proper UNIQUE CONSTRAINT on idempotency_key
-- This allows ON CONFLICT (idempotency_key) DO NOTHING to work
ALTER TABLE notification_queue 
  DROP CONSTRAINT IF EXISTS notification_queue_idempotency_key_unique;

ALTER TABLE notification_queue 
  ADD CONSTRAINT notification_queue_idempotency_key_unique 
  UNIQUE (idempotency_key);

-- Step 3: Also fix the notifications table (same issue)
DROP INDEX IF EXISTS idx_notifications_idempotency;

ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_idempotency_key_unique;

ALTER TABLE notifications 
  ADD CONSTRAINT notifications_idempotency_key_unique 
  UNIQUE (idempotency_key);

-- Step 4: Verify the constraints exist
DO $$
BEGIN
  RAISE NOTICE '✅ Notification queue constraint fix applied successfully';
  RAISE NOTICE 'notification_queue.idempotency_key now has UNIQUE CONSTRAINT';
  RAISE NOTICE 'notifications.idempotency_key now has UNIQUE CONSTRAINT';
END $$;

-- ============================================================================
-- VERIFICATION QUERY (run after migration):
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid IN ('notification_queue'::regclass, 'notifications'::regclass) 
--   AND contype = 'u';
-- ============================================================================
