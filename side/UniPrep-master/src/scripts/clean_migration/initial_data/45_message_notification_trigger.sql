-- ============================================================================
-- 45_message_notification_trigger.sql
-- Add trigger to send push notifications when new messages are received
-- ============================================================================
-- Purpose: Automatically queue push notifications when a message is sent
-- Dependencies: queue_payment_notification function, messages table
-- ============================================================================

-- Function to queue notification when a new message is inserted
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation RECORD;
  v_sender_profile RECORD;
  v_recipient_user_id UUID;
  v_message_preview TEXT;
BEGIN
  -- Get conversation details
  SELECT * INTO v_conversation
  FROM conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get sender profile for name
  SELECT full_name INTO v_sender_profile
  FROM profiles
  WHERE id = NEW.sender_id;

  -- Determine recipient user_id (get from students/teachers table, not conversation directly)
  -- notification_queue.user_id references profiles(id), which equals auth.users.id
  -- conversations has student_id -> students.id and teacher_id -> teachers.id
  -- We need to get the user_id from students/teachers table
  IF NEW.sender_type = 'student' THEN
    -- Sender is student, recipient is teacher
    SELECT t.user_id INTO v_recipient_user_id
    FROM teachers t
    WHERE t.id = v_conversation.teacher_id;
  ELSE
    -- Sender is teacher, recipient is student
    SELECT s.user_id INTO v_recipient_user_id
    FROM students s
    WHERE s.id = v_conversation.student_id;
  END IF;

  -- Skip if no recipient
  IF v_recipient_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create message preview (truncate if too long)
  v_message_preview := CASE
    WHEN NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
      CASE WHEN LENGTH(NEW.content) > 50 
        THEN SUBSTRING(NEW.content, 1, 47) || '...'
        ELSE NEW.content
      END
    WHEN NEW.file_type = 'image' THEN '📷 Şəkil'
    WHEN NEW.file_type = 'pdf' THEN '📄 PDF'
    WHEN NEW.file_type IS NOT NULL THEN '📎 Fayl'
    ELSE 'Yeni mesaj'
  END;

  -- Queue notification for recipient (use BEGIN/EXCEPTION to not fail message send if notification fails)
  BEGIN
    PERFORM queue_payment_notification(
      v_recipient_user_id,
      'new_message',
      '💬 ' || COALESCE(v_sender_profile.full_name, 'Yeni mesaj'),
      v_message_preview,
      jsonb_build_object(
        'conversationId', NEW.conversation_id,
        'messageId', NEW.id,
        'senderId', NEW.sender_id,
        'senderName', COALESCE(v_sender_profile.full_name, 'Unknown'),
        'senderType', NEW.sender_type,
        'preview', v_message_preview
      ),
      ARRAY['push']::TEXT[],
      7  -- Priority 7 for messages (push only - messages shown in chat, not notifications center)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the message insert
    RAISE WARNING 'Failed to queue message notification: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION notify_new_message TO authenticated;
GRANT EXECUTE ON FUNCTION notify_new_message TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Message notification trigger created successfully';
  RAISE NOTICE 'New messages will now trigger push notifications to recipients';
END $$;
