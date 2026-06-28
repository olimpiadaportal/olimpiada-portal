-- ============================================================================
-- 42_payment_notification_events.sql
-- Payment-Related Notification Events for Phase 8B (Pay-After-Acceptance)
-- ============================================================================
-- Purpose: Add notification events for payment flow and ensure proper queuing
-- Dependencies: 01_base_schema.sql (notification_events, notification_queue tables)
-- Run after: All base schema files
-- ============================================================================

-- ============================================================================
-- SECTION 0: SCHEMA UPDATES FOR IDEMPOTENCY AND PAYMENT TYPE
-- ============================================================================

-- Add idempotency_key column to notification_queue if not exists
-- NOTE: Uses UNIQUE CONSTRAINT (not partial index) for ON CONFLICT support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_queue' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE notification_queue ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
  -- Ensure constraint exists even if column was added without it
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_idempotency_key_key'
  ) THEN
    ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- Add idempotency_key column to notifications if not exists
-- NOTE: Uses UNIQUE CONSTRAINT (not partial index) for ON CONFLICT support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE notifications ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
  -- Ensure constraint exists even if column was added without it
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_idempotency_key_key'
  ) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- Update the type CHECK constraint to include 'payment'
-- First drop the old constraint, then add the new one
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add new constraint with 'payment' type included
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('exam', 'booking', 'achievement', 'reminder', 'general', 'announcement', 'payment', 'message'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update type constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- SECTION 1: PAYMENT NOTIFICATION EVENTS
-- ============================================================================

INSERT INTO notification_events (event_type, event_name, description, channels, priority, enabled)
VALUES
  -- Teacher accepts booking, student needs to pay
  ('booking_accepted_payment_required', 'Booking Accepted - Payment Required', 
   'Sent to student when teacher accepts their booking request and payment is required', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 8, TRUE),
  
  -- Payment successful, booking confirmed
  ('payment_succeeded', 'Payment Successful', 
   'Sent to student when their payment is successfully processed', 
   ARRAY['push', 'in_app']::TEXT[], 8, TRUE),
  
  -- Payment received notification for teacher
  ('payment_received', 'Payment Received', 
   'Sent to teacher when student completes payment for a booking', 
   ARRAY['push', 'in_app']::TEXT[], 8, TRUE),
  
  -- Payment failed
  ('payment_failed', 'Payment Failed', 
   'Sent to student when their payment fails', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 9, TRUE),
  
  -- Booking confirmed (after payment or free booking)
  ('booking_confirmed', 'Booking Confirmed', 
   'Sent to both student and teacher when a booking is confirmed', 
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE),
  
  -- Booking cancelled
  ('booking_cancelled', 'Booking Cancelled', 
   'Sent when a booking is cancelled', 
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE),
  
  -- Refund processed
  ('refund_processed', 'Refund Processed', 
   'Sent to student when a refund is processed', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 7, TRUE)
ON CONFLICT (event_type) DO UPDATE SET
  event_name = EXCLUDED.event_name,
  description = EXCLUDED.description,
  channels = EXCLUDED.channels,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- ============================================================================
-- SECTION 2: NOTIFICATION TEMPLATES FOR PAYMENT EVENTS
-- ============================================================================

INSERT INTO notification_templates (name, title, body, channels, variables, category, is_active)
VALUES
  ('Payment Required', 
   '💳 Payment Required', 
   '{{teacher_name}} accepted your booking! Complete payment of {{currency}} {{amount}} to confirm your session on {{scheduled_date}}.', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 
   ARRAY['teacher_name', 'currency', 'amount', 'scheduled_date']::TEXT[], 
   'payment', TRUE),
  
  ('Payment Successful', 
   '✅ Payment Successful', 
   'Your payment of {{currency}} {{amount}} was successful! Your session with {{teacher_name}} on {{scheduled_date}} is now confirmed.', 
   ARRAY['push', 'in_app']::TEXT[], 
   ARRAY['teacher_name', 'currency', 'amount', 'scheduled_date']::TEXT[], 
   'payment', TRUE),
  
  ('Payment Received', 
   '💰 Payment Received', 
   'Student has completed payment for your {{subject_name}} session on {{scheduled_date}}. Booking is now confirmed!', 
   ARRAY['push', 'in_app']::TEXT[], 
   ARRAY['subject_name', 'scheduled_date', 'amount', 'currency']::TEXT[], 
   'payment', TRUE),
  
  ('Payment Failed', 
   '❌ Payment Failed', 
   'Your payment for the session with {{teacher_name}} could not be processed. Please try again or use a different payment method.', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 
   ARRAY['teacher_name', 'scheduled_date']::TEXT[], 
   'payment', TRUE),
  
  ('Booking Confirmed', 
   '🎉 Booking Confirmed', 
   'Your session with {{other_party_name}} for {{subject_name}} on {{scheduled_date}} at {{scheduled_time}} is confirmed!', 
   ARRAY['push', 'in_app']::TEXT[], 
   ARRAY['other_party_name', 'subject_name', 'scheduled_date', 'scheduled_time']::TEXT[], 
   'booking', TRUE),
  
  ('Refund Processed', 
   '💸 Refund Processed', 
   'Your refund of {{currency}} {{amount}} has been processed. It may take 5-10 business days to appear in your account.', 
   ARRAY['push', 'in_app', 'email']::TEXT[], 
   ARRAY['currency', 'amount']::TEXT[], 
   'payment', TRUE)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  variables = EXCLUDED.variables,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- SECTION 3: FUNCTION TO QUEUE PAYMENT NOTIFICATIONS
-- ============================================================================
-- This function properly queues notifications for the processor to handle
-- including push notifications via Expo

CREATE OR REPLACE FUNCTION queue_payment_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB,
  p_channels TEXT[] DEFAULT ARRAY['push', 'in_app']::TEXT[],
  p_priority INTEGER DEFAULT 8
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Generate idempotency key to prevent duplicates
  v_idempotency_key := p_notification_type || ':' || p_user_id || ':' || 
                       COALESCE((p_data->>'bookingId')::TEXT, '') || ':' || 
                       DATE_TRUNC('minute', NOW())::TEXT;

  -- Insert into notification queue for processor to handle
  INSERT INTO notification_queue (
    user_id,
    notification_type,
    title,
    body,
    data,
    channels,
    priority,
    status,
    idempotency_key,
    created_at
  ) VALUES (
    p_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_data,
    p_channels,
    p_priority,
    'pending',
    v_idempotency_key,
    NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_queue_id;

  -- Also insert into notifications table for in-app display
  -- Map specific notification types to allowed DB type values
  IF 'in_app' = ANY(p_channels) THEN
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      data,
      priority,
      is_read,
      idempotency_key,
      created_at
    ) VALUES (
      p_user_id,
      p_title,
      p_body,
      CASE 
        WHEN p_notification_type IN ('booking_accepted_payment_required', 'payment_succeeded', 'payment_received', 'payment_failed', 'refund_processed') THEN 'payment'
        WHEN p_notification_type IN ('booking_confirmed', 'booking_cancelled', 'new_booking_request') THEN 'booking'
        WHEN p_notification_type = 'new_message' THEN 'message'
        ELSE 'general'
      END,
      p_data || jsonb_build_object('notification_subtype', p_notification_type),
      p_priority,
      FALSE,
      v_idempotency_key || ':in_app',
      NOW()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_queue_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_payment_notification TO service_role;

-- ============================================================================
-- SECTION 4: MESSAGE NOTIFICATION EVENT
-- ============================================================================

INSERT INTO notification_events (event_type, event_name, description, channels, priority, enabled)
VALUES
  ('new_message', 'New Message Received', 
   'Sent when a user receives a new message in a conversation', 
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE)
ON CONFLICT (event_type) DO UPDATE SET
  event_name = EXCLUDED.event_name,
  description = EXCLUDED.description,
  channels = EXCLUDED.channels,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- ============================================================================
-- DONE
-- ============================================================================
-- This migration adds:
--   - idempotency_key columns to notification_queue and notifications tables
--   - Updated type CHECK constraint to include 'payment' and 'message'
--   - 7 payment notification events
--   - 6 payment notification templates
--   - queue_payment_notification() function for proper push delivery
--   - 1 message notification event
-- ============================================================================
