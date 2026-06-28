-- ============================================================================
-- 36_messaging_booking_restriction.sql
-- Implements booking-based messaging restriction
-- Messaging is only allowed after a student has an active/completed booking
-- Also implements booking request limits to prevent spam
-- ============================================================================
-- VERSION 2 (March 2026): Fixed approve_conversation to always update,
-- added revoke function for rejections, added booking spam prevention
-- ============================================================================
-- If you already ran v1, run this file again to apply the fixes.
-- All functions use CREATE OR REPLACE so they're safe to re-run.
-- ============================================================================

-- ============================================================================
-- 1. UPDATE RLS POLICY FOR MESSAGES
-- Only allow message insertion in APPROVED conversations
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in approved conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;

CREATE POLICY "Users can insert messages in approved conversations"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE is_approved = TRUE
        AND (
          student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
          OR teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
        )
    )
  );

-- ============================================================================
-- 2. FUNCTION TO CHECK IF STUDENT HAS ACTIVE BOOKING WITH TEACHER
-- ============================================================================

CREATE OR REPLACE FUNCTION has_active_booking(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND teacher_id = p_teacher_id
      AND status IN ('confirmed', 'completed')
  );
END;
$$;

-- ============================================================================
-- 3. FUNCTION TO APPROVE CONVERSATION (FIXED)
-- Always updates regardless of current state
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_conversation(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Try to get existing conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  
  IF v_conversation_id IS NULL THEN
    -- Create new approved conversation
    INSERT INTO conversations (student_id, teacher_id, is_approved, approved_at)
    VALUES (p_student_id, p_teacher_id, TRUE, NOW())
    RETURNING id INTO v_conversation_id;
  ELSE
    -- Always update to approved (removed WHERE is_approved = FALSE)
    UPDATE conversations
    SET is_approved = TRUE, approved_at = COALESCE(approved_at, NOW()), updated_at = NOW()
    WHERE id = v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$;

-- ============================================================================
-- 4. FUNCTION TO REVOKE CONVERSATION APPROVAL
-- Called when ALL bookings are cancelled/rejected
-- Only revokes if no confirmed/completed bookings remain
-- ============================================================================

CREATE OR REPLACE FUNCTION revoke_conversation_if_no_bookings(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only revoke if no active bookings remain
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND teacher_id = p_teacher_id
      AND status IN ('confirmed', 'completed')
  ) THEN
    UPDATE conversations
    SET is_approved = FALSE, updated_at = NOW()
    WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  END IF;
END;
$$;

-- ============================================================================
-- 5. TRIGGER TO AUTO-APPROVE/REVOKE CONVERSATION ON BOOKING STATUS CHANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_manage_conversation_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When booking is confirmed, approve the conversation
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    PERFORM approve_conversation(NEW.student_id, NEW.teacher_id);
  -- When booking is cancelled, check if we should revoke
  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed') THEN
    PERFORM revoke_conversation_if_no_bookings(NEW.student_id, NEW.teacher_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approve_conversation_on_booking ON bookings;
DROP TRIGGER IF EXISTS trg_manage_conversation_on_booking ON bookings;

CREATE TRIGGER trg_manage_conversation_on_booking
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_manage_conversation_on_booking();

-- ============================================================================
-- 6. FUNCTION TO CHECK MESSAGING ELIGIBILITY (IMPROVED)
-- Also checks for active bookings directly as fallback
-- ============================================================================

CREATE OR REPLACE FUNCTION check_messaging_eligibility(
  p_student_id UUID,
  p_teacher_id UUID
) RETURNS TABLE (
  can_message BOOLEAN,
  has_booking BOOLEAN,
  booking_status TEXT,
  conversation_id UUID,
  is_approved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_active_booking BOOLEAN;
  v_has_pending_booking BOOLEAN;
  v_booking_status TEXT;
  v_conversation_id UUID;
  v_is_approved BOOLEAN;
BEGIN
  -- Check for confirmed/completed booking
  SELECT TRUE INTO v_has_active_booking
  FROM bookings
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id
    AND status IN ('confirmed', 'completed')
  LIMIT 1;
  v_has_active_booking := COALESCE(v_has_active_booking, FALSE);
  
  -- Check for pending booking
  SELECT TRUE INTO v_has_pending_booking
  FROM bookings
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id
    AND status = 'pending'
  LIMIT 1;
  v_has_pending_booking := COALESCE(v_has_pending_booking, FALSE);
  
  -- Determine best booking status to show
  IF v_has_active_booking THEN
    v_booking_status := 'confirmed';
  ELSIF v_has_pending_booking THEN
    v_booking_status := 'pending';
  ELSE
    v_booking_status := NULL;
  END IF;
  
  -- Check conversation status
  SELECT id, is_approved
  INTO v_conversation_id, v_is_approved
  FROM conversations
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id;
  
  v_is_approved := COALESCE(v_is_approved, FALSE);
  
  -- Can message if: conversation is approved OR has active booking (fallback)
  RETURN QUERY SELECT 
    (v_is_approved OR v_has_active_booking) AS can_message,
    (v_has_active_booking OR v_has_pending_booking) AS has_booking,
    v_booking_status AS booking_status,
    v_conversation_id AS conversation_id,
    v_is_approved AS is_approved;
END;
$$;

-- ============================================================================
-- 7. BOOKING REQUEST LIMITS - PREVENT SPAM
-- ============================================================================

-- 7a. Prevent duplicate bookings for same date/time/teacher
CREATE OR REPLACE FUNCTION check_booking_conflicts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if student already has a booking with this teacher at same date/time
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND student_id = NEW.student_id
      AND teacher_id = NEW.teacher_id
      AND scheduled_date = NEW.scheduled_date
      AND scheduled_time = NEW.scheduled_time
      AND status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'You already have a booking with this teacher at this date and time';
  END IF;
  
  -- Check if student has too many pending requests with this teacher (max 3)
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND teacher_id = NEW.teacher_id
      AND status = 'pending'
  ) >= 3 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'You have too many pending requests with this teacher. Please wait for a response.';
  END IF;
  
  -- Check if student has too many pending requests overall (max 10)
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND status = 'pending'
  ) >= 10 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'You have too many pending booking requests. Please wait for responses.';
  END IF;
  
  -- Rate limit: max 5 booking requests per hour per student
  IF (
    SELECT COUNT(*) FROM bookings
    WHERE student_id = NEW.student_id
      AND created_at > NOW() - INTERVAL '1 hour'
  ) >= 5 AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Too many booking requests. Please wait before making more requests.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_booking_conflicts ON bookings;

CREATE TRIGGER trg_check_booking_conflicts
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_conflicts();

-- ============================================================================
-- 8. RETROACTIVELY APPROVE EXISTING CONVERSATIONS WITH CONFIRMED BOOKINGS
-- ============================================================================

UPDATE conversations c
SET is_approved = TRUE, approved_at = COALESCE(c.approved_at, NOW())
WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.student_id = c.student_id
      AND b.teacher_id = c.teacher_id
      AND b.status IN ('confirmed', 'completed')
  );

-- ============================================================================
-- 9. GRANT EXECUTE PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION has_active_booking(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_messaging_eligibility(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_conversation_if_no_bookings(UUID, UUID) TO service_role;

