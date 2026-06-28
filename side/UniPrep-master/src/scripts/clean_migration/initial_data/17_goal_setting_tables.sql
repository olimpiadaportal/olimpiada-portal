-- ============================================================================
-- Phase 1: Goal Setting & Study Plans
-- File: 17_goal_setting_tables.sql
-- Purpose: Add tables for student goals, study plans, and daily progress tracking
-- Created: February 14, 2026
-- ============================================================================
-- NOTE: These tables have ALSO been added to the main consolidated files:
--   01_base_schema.sql, 02_indexes.sql, 03_rls_policies.sql
-- This hotfix file is for EXISTING databases that were set up before Phase 1.
-- For NEW database setups, you do NOT need to run this file.
-- ============================================================================

-- ============================================================================
-- PRE-REQUISITE: Add missing UNIQUE constraints for ON CONFLICT to work
-- ============================================================================
-- The original DB scripts created these tables without UNIQUE constraints
-- that the consolidated migration includes. We need to add them first.

-- Add UNIQUE constraint on notification_templates.name if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'notification_templates'::regclass
    AND c.contype = 'u'
    AND a.attname = 'name'
  ) THEN
    -- First, delete duplicates keeping only the first occurrence
    DELETE FROM notification_templates a
    USING notification_templates b
    WHERE a.id > b.id AND a.name = b.name;
    
    ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_name_key UNIQUE (name);
    RAISE NOTICE 'Added UNIQUE constraint on notification_templates(name)';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'notification_templates constraint: %', SQLERRM;
END $$;

-- Add UNIQUE constraint on notification_events.event_type if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'notification_events'::regclass
    AND c.contype = 'u'
    AND a.attname = 'event_type'
  ) THEN
    -- First, delete duplicates keeping only the first occurrence
    DELETE FROM notification_events a
    USING notification_events b
    WHERE a.id > b.id AND a.event_type = b.event_type;
    
    ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_key UNIQUE (event_type);
    RAISE NOTICE 'Added UNIQUE constraint on notification_events(event_type)';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'notification_events constraint: %', SQLERRM;
END $$;

BEGIN;

-- ============================================================================
-- TABLE 1: student_goals
-- ============================================================================
-- Purpose: Store student daily targets, exam prep info, and study preferences

CREATE TABLE IF NOT EXISTS student_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  -- Daily targets
  daily_question_target INT NOT NULL DEFAULT 20,
  daily_time_target_minutes INT NOT NULL DEFAULT 30,

  -- Exam preparation
  target_exam_date DATE,
  target_score INT,

  -- Weekly preferences
  preferred_study_days INT[] DEFAULT '{1,2,3,4,5}',
  preferred_study_time TEXT DEFAULT 'evening',

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(student_id)
);

-- ============================================================================
-- TABLE 2: study_plans (generated plans)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,

  -- Plan structure
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_weeks INT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  progress_percentage DECIMAL(5,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 3: study_plan_weeks (weekly breakdown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_plan_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,

  week_number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Focus areas for this week
  focus_subjects UUID[] NOT NULL,
  focus_subject_names TEXT[] NOT NULL,

  -- Targets
  target_questions INT NOT NULL DEFAULT 100,
  target_accuracy DECIMAL(5,2),

  -- Progress
  completed_questions INT DEFAULT 0,
  actual_accuracy DECIMAL(5,2) DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 4: daily_progress (tracks daily goal completion)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Actual progress
  questions_completed INT DEFAULT 0,
  time_spent_minutes INT DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,

  -- Goal completion
  question_goal_met BOOLEAN DEFAULT FALSE,
  time_goal_met BOOLEAN DEFAULT FALSE,

  -- Streak tracking for goals
  consecutive_goal_days INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(student_id, date)
);

COMMIT;

-- ============================================================================
-- ADD UNIQUE CONSTRAINTS FOR LEGACY DBs
-- ============================================================================
-- This handles the case where CREATE TABLE IF NOT EXISTS skipped creation
-- but the existing table lacks the required UNIQUE constraints for ON CONFLICT

-- Add UNIQUE constraint for student_goals if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'student_goals'::regclass
    AND c.contype = 'u'
    AND a.attname = 'student_id'
    AND array_length(c.conkey, 1) = 1
  ) THEN
    RAISE NOTICE 'Adding UNIQUE constraint on student_goals(student_id)';
    ALTER TABLE student_goals ADD CONSTRAINT student_goals_student_id_key UNIQUE (student_id);
  ELSE
    RAISE NOTICE 'UNIQUE constraint on student_goals(student_id) already exists';
  END IF;
EXCEPTION 
  WHEN duplicate_table THEN
    RAISE NOTICE 'Constraint student_goals_student_id_key already exists';
  WHEN others THEN
    RAISE NOTICE 'Error adding student_goals constraint: %', SQLERRM;
END $$;

-- Add UNIQUE constraint for daily_progress if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = c.conkey[1]
    JOIN pg_attribute a2 ON a2.attrelid = c.conrelid AND a2.attnum = c.conkey[2]
    WHERE c.conrelid = 'daily_progress'::regclass
    AND c.contype = 'u'
    AND a1.attname IN ('student_id', 'date')
    AND a2.attname IN ('student_id', 'date')
    AND array_length(c.conkey, 1) = 2
  ) THEN
    RAISE NOTICE 'Adding UNIQUE constraint on daily_progress(student_id, date)';
    ALTER TABLE daily_progress ADD CONSTRAINT daily_progress_student_id_date_key UNIQUE (student_id, date);
  ELSE
    RAISE NOTICE 'UNIQUE constraint on daily_progress(student_id, date) already exists';
  END IF;
EXCEPTION 
  WHEN duplicate_table THEN
    RAISE NOTICE 'Constraint daily_progress_student_id_date_key already exists';
  WHEN others THEN
    RAISE NOTICE 'Error adding daily_progress constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;

-- student_goals policies
DROP POLICY IF EXISTS "Students can manage own goals" ON student_goals;
CREATE POLICY "Students can manage own goals"
  ON student_goals FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- study_plans policies
DROP POLICY IF EXISTS "Students can manage own plans" ON study_plans;
CREATE POLICY "Students can manage own plans"
  ON study_plans FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- study_plan_weeks policies
DROP POLICY IF EXISTS "Students can manage own plan weeks" ON study_plan_weeks;
CREATE POLICY "Students can manage own plan weeks"
  ON study_plan_weeks FOR ALL
  USING (plan_id IN (
    SELECT id FROM study_plans WHERE student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  ));

-- daily_progress policies
DROP POLICY IF EXISTS "Students can manage own daily progress" ON daily_progress;
CREATE POLICY "Students can manage own daily progress"
  ON daily_progress FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_student_goals_student ON student_goals(student_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_student ON study_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_status ON study_plans(student_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_study_plan_weeks_plan ON study_plan_weeks(plan_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_weeks_dates ON study_plan_weeks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_daily_progress_student_date ON daily_progress(student_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON daily_progress(date DESC);

-- ============================================================================
-- FUNCTION: Upsert daily progress (called after practice/exam completion)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_daily_progress(
  p_student_id UUID,
  p_questions INT,
  p_correct INT,
  p_time_minutes INT
)
RETURNS daily_progress
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_goal_questions INT;
  v_goal_time INT;
  v_result daily_progress;
BEGIN
  -- Get student's goal targets (defaults if no goals set)
  SELECT
    COALESCE(daily_question_target, 20),
    COALESCE(daily_time_target_minutes, 30)
  INTO v_goal_questions, v_goal_time
  FROM student_goals
  WHERE student_id = p_student_id;

  -- Use defaults if no goals row exists
  IF NOT FOUND THEN
    v_goal_questions := 20;
    v_goal_time := 30;
  END IF;

  -- Upsert daily progress
  INSERT INTO daily_progress (
    student_id, date,
    questions_completed, time_spent_minutes, accuracy,
    question_goal_met, time_goal_met
  ) VALUES (
    p_student_id, v_today,
    p_questions, p_time_minutes,
    CASE WHEN p_questions > 0 THEN ROUND((p_correct::DECIMAL / p_questions) * 100, 2) ELSE 0 END,
    p_questions >= v_goal_questions,
    p_time_minutes >= v_goal_time
  )
  ON CONFLICT (student_id, date) DO UPDATE SET
    questions_completed = daily_progress.questions_completed + p_questions,
    time_spent_minutes = daily_progress.time_spent_minutes + p_time_minutes,
    accuracy = CASE
      WHEN (daily_progress.questions_completed + p_questions) > 0
      THEN ROUND(
        ((daily_progress.accuracy * daily_progress.questions_completed + (CASE WHEN p_questions > 0 THEN (p_correct::DECIMAL / p_questions) * 100 ELSE 0 END) * p_questions)
         / (daily_progress.questions_completed + p_questions)), 2)
      ELSE 0
    END,
    question_goal_met = (daily_progress.questions_completed + p_questions) >= v_goal_questions,
    time_goal_met = (daily_progress.time_spent_minutes + p_time_minutes) >= v_goal_time,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_daily_progress(UUID, INT, INT, INT) TO authenticated;

COMMENT ON FUNCTION upsert_daily_progress IS 'Upsert daily progress after practice/exam completion. Accumulates questions and time, recalculates accuracy.';

-- ============================================================================
-- TRIGGER: updated_at on student_goals
-- ============================================================================

CREATE OR REPLACE FUNCTION update_student_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_student_goals_updated_at ON student_goals;
CREATE TRIGGER trigger_student_goals_updated_at
  BEFORE UPDATE ON student_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_student_goals_updated_at();

-- ============================================================================
-- TRIGGER: updated_at on study_plans
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_study_plans_updated_at ON study_plans;
CREATE TRIGGER trigger_study_plans_updated_at
  BEFORE UPDATE ON study_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_student_goals_updated_at();

-- ============================================================================
-- FEATURE FLAGS: Add goal_setting and study_plans flags
-- ============================================================================

INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, rollout_percentage)
VALUES
  ('goal_setting', 'Goal Setting', 'Enable daily goal setting and progress tracking', true, 100),
  ('study_plans', 'Study Plans', 'Enable AI-powered study plan generation', true, 100)
ON CONFLICT (flag_name) DO NOTHING;

-- ============================================================================
-- NOTIFICATION INFRASTRUCTURE: Goal reminders
-- ============================================================================

-- Add goal_reminders preference column to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS goal_reminders BOOLEAN DEFAULT TRUE;

-- Add goal_reminders preference column to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS goal_reminders BOOLEAN DEFAULT TRUE;

-- Add goal reminder notification template
INSERT INTO notification_templates (name, title, body, channels, variables, category)
VALUES (
  'Goal Reminder',
  'Time to Study! 📚',
  'Hi {{user_name}}, don''t forget your daily goal. Let''s keep your streak going!',
  ARRAY['in_app', 'push'],
  ARRAY['user_name'],
  'reminder'
)
ON CONFLICT (name) DO NOTHING;

-- Add goal streak notification template
INSERT INTO notification_templates (name, title, body, channels, variables, category)
VALUES (
  'Goal Streak',
  '{{days}}-Day Goal Streak! 🔥',
  'Congratulations {{user_name}}! You''ve met your daily goals for {{days}} days in a row. Keep it up!',
  ARRAY['in_app', 'push'],
  ARRAY['user_name', 'days'],
  'achievement'
)
ON CONFLICT (name) DO NOTHING;

-- Register goal reminder notification event
INSERT INTO notification_events (event_type, event_name, description, enabled, channels, priority)
VALUES (
  'goal_reminder',
  'Daily Goal Reminder',
  'Sends a push notification reminding the student to study on their preferred days and time',
  TRUE,
  ARRAY['push'],
  7
)
ON CONFLICT (event_type) DO NOTHING;

-- Register goal streak notification event
INSERT INTO notification_events (event_type, event_name, description, enabled, channels, priority)
VALUES (
  'goal_streak',
  'Goal Streak Achievement',
  'Sends a notification when a student achieves a consecutive goal streak',
  TRUE,
  ARRAY['in_app', 'push'],
  6
)
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 1: Goal Setting & Study Plans';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ student_goals';
  RAISE NOTICE '  ✓ study_plans';
  RAISE NOTICE '  ✓ study_plan_weeks';
  RAISE NOTICE '  ✓ daily_progress';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  ✓ upsert_daily_progress(UUID, INT, INT, INT)';
  RAISE NOTICE '';
  RAISE NOTICE 'Feature flags added:';
  RAISE NOTICE '  ✓ goal_setting (enabled)';
  RAISE NOTICE '  ✓ study_plans (enabled)';
  RAISE NOTICE '';
  RAISE NOTICE 'Notification infrastructure:';
  RAISE NOTICE '  ✓ goal_reminders column on notification_preferences';
  RAISE NOTICE '  ✓ goal_reminders column on user_settings';
  RAISE NOTICE '  ✓ Goal Reminder notification template';
  RAISE NOTICE '  ✓ Goal Streak notification template';
  RAISE NOTICE '  ✓ goal_reminder notification event';
  RAISE NOTICE '  ✓ goal_streak notification event';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 1: COMPLETE ✓';
  RAISE NOTICE '========================================';
END $$;
