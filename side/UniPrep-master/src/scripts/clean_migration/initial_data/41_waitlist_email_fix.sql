-- ============================================================================
-- 41_waitlist_email_fix.sql
-- Fix: update_waitlist_status now queues emails when inviting
-- ============================================================================
-- Run this AFTER 40_waitlist_security_improvements.sql
-- ============================================================================

-- Drop existing versions to avoid ambiguity
DROP FUNCTION IF EXISTS update_waitlist_status(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS update_waitlist_status(UUID, TEXT, TEXT, BOOLEAN);

-- Update the update_waitlist_status function to queue emails
CREATE OR REPLACE FUNCTION update_waitlist_status(
  p_subscriber_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT TRUE  -- Default to sending email when inviting
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber RECORD;
BEGIN
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'invited', 'registered', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- Get subscriber info before update (for email)
  SELECT id, email, name, locale INTO v_subscriber
  FROM waitlist_subscribers
  WHERE id = p_subscriber_id;

  IF v_subscriber.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE waitlist_subscribers
  SET 
    status = p_status,
    notes = COALESCE(p_notes, notes),
    invited_at = CASE WHEN p_status = 'invited' THEN NOW() ELSE invited_at END,
    registered_at = CASE WHEN p_status = 'registered' THEN NOW() ELSE registered_at END,
    updated_at = NOW()
  WHERE id = p_subscriber_id;

  -- Queue email if inviting and send_email is true
  IF p_status = 'invited' AND p_send_email THEN
    INSERT INTO waitlist_email_queue (
      subscriber_id,
      recipient_email,
      recipient_name,
      template_name,
      locale,
      metadata
    ) VALUES (
      v_subscriber.id,
      v_subscriber.email,
      v_subscriber.name,
      'waitlist_invitation_' || COALESCE(v_subscriber.locale, 'az'),
      COALESCE(v_subscriber.locale, 'az'),
      jsonb_build_object('subscriber_id', v_subscriber.id)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'email_queued', p_status = 'invited' AND p_send_email);
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION update_waitlist_status TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Waitlist email fix applied!';
  RAISE NOTICE 'update_waitlist_status now queues emails when status = invited';
END $$;
