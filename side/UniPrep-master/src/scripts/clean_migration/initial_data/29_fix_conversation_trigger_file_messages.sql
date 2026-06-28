-- Migration 29: Fix update_conversation_on_message trigger for file-only messages
-- 
-- Problem: When a file-only message is sent (content = NULL), the trigger sets
-- last_message = NULL, which caused the conversations list to hide those conversations
-- (the query filtered .not('last_message', 'is', null)).
--
-- Fix: Use COALESCE so file messages get a readable placeholder in last_message.
-- The app-side filter has also been removed so all conversations always appear.

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message = COALESCE(
      NEW.content,
      CASE NEW.file_type
        WHEN 'image' THEN '📷 Photo'
        WHEN 'pdf'   THEN '📄 PDF'
        ELSE              '📎 File'
      END
    ),
    last_message_at = NEW.created_at,
    updated_at = NOW(),
    unread_count_student = CASE 
      WHEN NEW.sender_type = 'teacher' THEN unread_count_student + 1
      ELSE unread_count_student
    END,
    unread_count_teacher = CASE 
      WHEN NEW.sender_type = 'student' THEN unread_count_teacher + 1
      ELSE unread_count_teacher
    END
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: fix existing conversations where last_message is NULL
-- because file-only messages were sent before this trigger fix.
-- For each such conversation, find the latest message and set last_message accordingly.
UPDATE conversations c
SET last_message = COALESCE(
  m.content,
  CASE m.file_type
    WHEN 'image' THEN '📷 Photo'
    WHEN 'pdf'   THEN '📄 PDF'
    ELSE              '📎 File'
  END
)
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    content,
    file_type,
    created_at
  FROM messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id
  AND c.last_message IS NULL;

-- Verify
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_conversation_on_message') AS trigger_fn_exists,
  (SELECT prosrc LIKE '%COALESCE%' FROM pg_proc WHERE proname = 'update_conversation_on_message') AS has_coalesce_fix,
  (SELECT COUNT(*) FROM conversations WHERE last_message IS NULL AND id IN (SELECT DISTINCT conversation_id FROM messages)) AS remaining_null_last_messages;
-- Expected: true, true, 0
