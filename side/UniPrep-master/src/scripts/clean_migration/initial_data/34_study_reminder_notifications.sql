-- ============================================================================
-- MIGRATION 34: Study Reminder Notifications Enhancement
-- ============================================================================
-- Purpose: Enhance notification system for study day/time reminders
-- Created: February 25, 2026
-- 
-- This migration ensures the notification infrastructure properly supports
-- study reminders based on preferred study days and times.
-- 
-- NOTE: The actual notification scheduling happens client-side via
-- expo-notifications in notificationService.ts. This SQL ensures the
-- database has the proper templates and events registered.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Ensure notification templates exist with Azerbaijani support
-- ============================================================================
-- The notification content is translated client-side via i18n, but we store
-- the default English templates in the database for reference and server-side
-- notifications (if needed in the future).

-- Update Goal Reminder template with better messaging
UPDATE notification_templates
SET 
  title = 'Time to Study! 📚',
  body = 'Hi {{user_name}}, it''s your scheduled study time. Don''t forget your daily goal of {{daily_questions}} questions!',
  variables = ARRAY['user_name', 'daily_questions'],
  updated_at = NOW()
WHERE name = 'Goal Reminder';

-- Insert if not exists (for fresh databases)
INSERT INTO notification_templates (name, title, body, channels, variables, category)
VALUES (
  'Goal Reminder',
  'Time to Study! 📚',
  'Hi {{user_name}}, it''s your scheduled study time. Don''t forget your daily goal of {{daily_questions}} questions!',
  ARRAY['in_app', 'push'],
  ARRAY['user_name', 'daily_questions'],
  'reminder'
)
ON CONFLICT (name) DO NOTHING;

-- Add Weekly Plan Summary template (optional weekly notification)
INSERT INTO notification_templates (name, title, body, channels, variables, category)
VALUES (
  'Weekly Plan Summary',
  'This Week''s Study Plan 📋',
  'Hi {{user_name}}, this week focus on: {{focus_subjects}}. Target: {{target_questions}} questions.',
  ARRAY['in_app', 'push'],
  ARRAY['user_name', 'focus_subjects', 'target_questions'],
  'reminder'
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- STEP 2: Ensure notification events are registered
-- ============================================================================

-- Goal reminder event (already exists, ensure it's enabled)
UPDATE notification_events
SET 
  enabled = TRUE,
  description = 'Sends a push notification reminding the student to study on their preferred days and time. Scheduled client-side based on student_goals.preferred_study_days and preferred_study_time.',
  updated_at = NOW()
WHERE event_type = 'goal_reminder';

-- Insert if not exists
INSERT INTO notification_events (event_type, event_name, description, enabled, channels, priority)
VALUES (
  'goal_reminder',
  'Daily Goal Reminder',
  'Sends a push notification reminding the student to study on their preferred days and time. Scheduled client-side based on student_goals.preferred_study_days and preferred_study_time.',
  TRUE,
  ARRAY['push'],
  7
)
ON CONFLICT (event_type) DO NOTHING;

-- Weekly plan summary event (optional)
INSERT INTO notification_events (event_type, event_name, description, enabled, channels, priority)
VALUES (
  'weekly_plan_summary',
  'Weekly Plan Summary',
  'Sends a weekly summary notification about the current week''s study plan focus subjects and targets.',
  FALSE, -- Disabled by default, can be enabled if needed
  ARRAY['push'],
  5
)
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- STEP 3: Ensure user settings support goal reminders
-- ============================================================================

-- Add goal_reminders column to user_settings if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_settings' AND column_name = 'goal_reminders'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN goal_reminders BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Added goal_reminders column to user_settings';
  END IF;
END $$;

-- Add goal_reminders column to notification_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_preferences' AND column_name = 'goal_reminders'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN goal_reminders BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Added goal_reminders column to notification_preferences';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  'Goal Reminder template exists' AS check_item,
  EXISTS(SELECT 1 FROM notification_templates WHERE name = 'Goal Reminder') AS status
UNION ALL
SELECT 
  'goal_reminder event exists',
  EXISTS(SELECT 1 FROM notification_events WHERE event_type = 'goal_reminder')
UNION ALL
SELECT 
  'goal_reminders column in user_settings',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'goal_reminders')
UNION ALL
SELECT 
  'goal_reminders column in notification_preferences',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'goal_reminders');

-- ============================================================================
-- NOTES FOR CLIENT-SIDE IMPLEMENTATION
-- ============================================================================
-- The actual notification scheduling is handled by notificationService.ts:
-- 
-- 1. scheduleGoalReminder(preferredTime, preferredDays) schedules weekly
--    recurring notifications using expo-notifications WeeklyTriggerInput.
-- 
-- 2. Notifications are scheduled when:
--    - User saves goals in GoalSettingScreen
--    - User generates a new study plan
-- 
-- 3. Notification content uses i18n translations, so it will be in the
--    user's app language (Azerbaijani, English, or Russian).
-- 
-- 4. Time mapping:
--    - morning: 08:00
--    - afternoon: 13:00
--    - evening: 18:00
--    - night: 21:00
-- 
-- 5. Days are stored as integers: 0=Sunday, 1=Monday, ..., 6=Saturday
-- ============================================================================
