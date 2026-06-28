-- ============================================================================
-- 07_realtime.sql
-- Elmly Database - Supabase Realtime Publications
-- ============================================================================
-- Purpose: Enable realtime subscriptions for tables that need live updates
-- Depends on: 01_base_schema.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from S10 (messaging), Admin S7 (notifications)
-- ============================================================================

-- ============================================================================
-- SECTION 1: MESSAGING REALTIME (S10)
-- ============================================================================

-- Add messages table to realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'messages already in supabase_realtime - skipping';
  END;
END $$;

-- Add conversations table to realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'conversations already in supabase_realtime - skipping';
  END;
END $$;

-- ============================================================================
-- SECTION 2: NOTIFICATIONS REALTIME (Admin S7)
-- ============================================================================

-- Add notifications table to realtime publication (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'notifications' AND table_schema = 'public'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- DONE - Realtime publications configured
-- ============================================================================
-- Tables with realtime: messages, conversations, notifications
-- ============================================================================
