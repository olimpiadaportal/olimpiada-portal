-- ============================================================================
-- HOTFIX 11: Fix competitive_question_results schema to match original S10
-- Run this on EXISTING databases (after hotfix 10)
-- ============================================================================
--
-- PROBLEM 1: question_id is UUID REFERENCES questions(id) but AI-generated
--   questions have IDs like "3be38ccf-5468-4e3f-b201-3b65e70ee833_q1" which
--   are NOT valid UUIDs and don't exist in the questions table.
--   Error: "invalid input syntax for type uuid: '...._q1'"
--   
--   Original S10 schema had: question_id TEXT NOT NULL (no FK constraint)
--   The consolidated schema wrongly used: question_id UUID REFERENCES questions(id)
--
-- PROBLEM 2: subject_id column is missing. The adaptiveLearningService writes
--   subject_id for topic-level performance tracking.
--   Error: "Could not find the 'subject_id' column"
--   
--   Original S10 schema had: subject_id UUID NOT NULL REFERENCES subjects(id)
--
-- PROBLEM 3: UNIQUE(session_id, question_id) constraint is too restrictive.
--   Both competitiveSessionService and adaptiveLearningService insert rows
--   for the same session, potentially with the same question_id.
--
-- FIX: Drop and recreate the table with the correct schema that matches
--   the original S10 design + mobile app denormalized fields.
-- ============================================================================

-- Step 1: Drop the existing table (CASCADE removes dependent objects)
DROP TABLE IF EXISTS competitive_question_results CASCADE;

-- Step 2: Recreate with correct schema matching original S10 + mobile app needs
CREATE TABLE competitive_question_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES competitive_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  -- question_id is TEXT, not UUID — AI-generated questions have non-UUID IDs
  question_id TEXT NOT NULL,
  -- Original S10 adaptive learning fields
  topic TEXT,
  difficulty TEXT,
  student_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  time_spent INTEGER DEFAULT 0,
  -- S10.1 fields
  selected_answer TEXT,
  time_spent_seconds INTEGER DEFAULT 0,
  -- Mobile app denormalized fields (for review screen)
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  -- Timestamps
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes for performance (from original S10)
CREATE INDEX IF NOT EXISTS idx_competitive_results_session
  ON competitive_question_results(session_id);

CREATE INDEX IF NOT EXISTS idx_competitive_results_student
  ON competitive_question_results(student_id);

CREATE INDEX IF NOT EXISTS idx_competitive_results_student_subject
  ON competitive_question_results(student_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_competitive_results_topic
  ON competitive_question_results(student_id, subject_id, topic);

CREATE INDEX IF NOT EXISTS idx_competitive_results_created_at
  ON competitive_question_results(created_at DESC);

-- Step 4: Enable RLS
ALTER TABLE competitive_question_results ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS Policies (from original S10)
CREATE POLICY "Students can view own results"
  ON competitive_question_results
  FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert own results"
  ON competitive_question_results
  FOR INSERT
  WITH CHECK (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Students can update own results"
  ON competitive_question_results
  FOR UPDATE
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Students can delete own results"
  ON competitive_question_results
  FOR DELETE
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE competitive_question_results IS 
  'Tracks individual question results for competitive mode session history and adaptive learning';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table exists with correct columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'competitive_question_results'
ORDER BY ordinal_position;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'competitive_question_results';

-- Verify policies exist
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'competitive_question_results';
