-- ============================================================================
-- 01_base_schema.sql
-- Elmly Database - Complete Table Definitions
-- ============================================================================
-- Purpose: Create ALL tables in their final state for a fresh Supabase instance
-- Depends on: 00_prerequisites.sql (extensions, enums)
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- Authoritative Rule: Latest applied version used for all conflicting objects
-- ============================================================================

-- ============================================================================
-- SECTION 1: REFERENCE DATA TABLES
-- ============================================================================

-- 1.1 Cities (reference data for location selection)
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  name_az TEXT,
  name_ru TEXT,
  region TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Universities (reference data for target university selection)
CREATE TABLE IF NOT EXISTS universities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  name_az TEXT,
  name_ru TEXT,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Target Groups (exam group definitions I-V)
CREATE TABLE IF NOT EXISTS target_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_az TEXT,
  description TEXT,
  max_points INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 2: CORE USER TABLES
-- ============================================================================

-- 2.1 Profiles (extends auth.users - created by handle_new_user trigger)
-- Authoritative: S10.3/03 (latest - adds first_name, last_name, UPSERT)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  city TEXT,
  target_university TEXT,
  target_group TEXT,
  user_type TEXT NOT NULL CHECK (user_type IN ('student', 'teacher', 'admin')),
  -- Security fields (Admin S9)
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Students table
-- Authoritative: S10.3/03 (latest - streak defaults to 1)
-- Columns added across: base, S7 (city), S8 (streak, score), S9 (bio, city), S10.2 (ELO)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_group TEXT,
  target_university TEXT,
  graduation_year INTEGER,
  first_stage_score INTEGER,
  bio TEXT,
  city TEXT,
  -- Streak & Activity (S8)
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_active_date DATE,
  -- Hybrid Scoring System (70% exams + 20% practice + 10% streak)
  leaderboard_score DECIMAL(5,2) DEFAULT 0,
  practice_score DECIMAL(5,2) DEFAULT 0,
  -- Legacy Scoring Fields (kept for data integrity, not used for ranking)
  elo_rating INTEGER DEFAULT 1200,
  monthly_score INTEGER DEFAULT 0,
  total_exams_taken INTEGER DEFAULT 0,
  activity_multiplier DECIMAL(3,2) DEFAULT 1.00,
  last_score_update TIMESTAMPTZ DEFAULT NOW(),
  k_factor INTEGER DEFAULT 40,
  bonus_points INTEGER DEFAULT 0,
  -- Streak System Upgrade (S10.2)
  last_activity_timestamp TIMESTAMPTZ,
  streak_freeze_count INTEGER DEFAULT 0,
  streak_freeze_used_this_month BOOLEAN DEFAULT FALSE,
  user_timezone TEXT DEFAULT 'Asia/Baku',
  -- Onboarding Personalization (Phase 2)
  onboarding_completed BOOLEAN DEFAULT FALSE,
  strongest_subjects UUID[] DEFAULT '{}',
  weakest_subjects UUID[] DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2.3 Teachers table
-- Columns added across: base, S7 (city, education, certificates, totals)
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bio TEXT,
  city TEXT,
  education TEXT,
  specializations TEXT[] DEFAULT '{}',
  certificates TEXT[] DEFAULT '{}',
  experience_years INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10,2),
  monthly_rate DECIMAL(10,2),
  stripe_subscription_product_id TEXT,
  stripe_subscription_price_id TEXT,
  stripe_subscription_price_amount NUMERIC(10,2),
  stripe_subscription_price_currency TEXT,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  current_students INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'not_submitted'
    CHECK (verification_status IN ('not_submitted', 'pending', 'verified', 'rejected')),
  verification_rejection_reason TEXT,
  available_groups TEXT[] DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2.4 Admins table (Admin S2 - authoritative: 03_admin_management.sql)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role admin_role NOT NULL DEFAULT 'moderator',
  display_name TEXT,
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 3: SUBJECTS & QUESTIONS
-- ============================================================================

-- 3.1 Subjects table
-- Authoritative: Admin S9.1/02 (category/coefficient made nullable)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en TEXT NOT NULL,
  name_az TEXT NOT NULL,
  category TEXT,
  coefficient DECIMAL(2,1),
  max_points INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Subject Topics (S9.5 - topic tracking for weak area analysis)
CREATE TABLE IF NOT EXISTS subject_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  description TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subject_id, topic_name)
);

-- 3.3 Subject Subtopics (Subtopics layer beneath Topics — Subjects → Topics → Subtopics → Questions)
CREATE TABLE IF NOT EXISTS subject_subtopics (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id        UUID    NOT NULL REFERENCES subject_topics(id) ON DELETE CASCADE,
  subject_id      UUID    NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,  -- denormalized for fast queries
  subtopic_name   TEXT    NOT NULL,
  description     TEXT,
  difficulty_level TEXT   CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic_id, subtopic_name)
);

-- 3.4 Questions table
-- Columns added across: base, Admin S3/04 (metadata), S9.5 (topic), Admin S10 (question_type, ai_explanation)
-- subtopic_id added: Stage 1 subtopics migration (nullable — existing questions unaffected)
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_image_url TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  option_e TEXT,
  correct_answer TEXT,
  explanation TEXT,
  ai_explanation TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  exam_stage TEXT CHECK (exam_stage IN ('first', 'second')),
  topic TEXT,               -- legacy free-text topic name (kept for backward compat)
  subtopic_id UUID,         -- FK to subject_subtopics (nullable; set via admin panel)
  question_type question_type DEFAULT 'mcq',
  -- Open question fields (Admin S10)
  expected_answer TEXT,
  answer_keywords TEXT[],
  max_points INTEGER DEFAULT 1 NOT NULL,
  grading_rubric JSONB,
  sample_answer TEXT,
  exclude_from_practice BOOLEAN DEFAULT false NOT NULL,
  -- Group fields (Admin S10 - situasiya questions) - FK added after question_groups table
  group_id UUID,
  group_order INTEGER,
  -- Admin metadata (Admin S3/04)
  tags TEXT[],
  source TEXT,
  year INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT valid_group_order CHECK (group_order IS NULL OR (group_order >= 1 AND group_order <= 3))
);

-- 3.5 Question Groups (Admin S10 - for situasiya/written-open/codable-open questions)
-- Schema aligned with questionGroupService.ts (CreateQuestionGroupData interface)
CREATE TABLE IF NOT EXISTS question_groups (
  id                    UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id            UUID    REFERENCES subjects(id) ON DELETE CASCADE,
  topic                 TEXT,
  context_text          TEXT,       -- shared passage/scenario shown above all sub-questions
  context_image_url     TEXT,       -- optional image for the shared context
  difficulty            TEXT    DEFAULT 'medium'
                                CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  tags                  TEXT[]  DEFAULT '{}',
  source                TEXT,
  year                  INTEGER CHECK (year IS NULL OR (year >= 1990 AND year <= 2100)),
  is_active             BOOLEAN DEFAULT TRUE,
  exclude_from_practice BOOLEAN DEFAULT FALSE,
  created_by            UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  -- legacy columns kept for backward compatibility (not used by TypeScript code)
  title                 TEXT    DEFAULT '',
  description           TEXT,
  passage_text          TEXT,
  passage_image_url     TEXT,
  question_type         question_type DEFAULT 'written_open',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- FK: questions.group_id -> question_groups (added after question_groups table exists)
ALTER TABLE questions ADD CONSTRAINT questions_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE CASCADE;

-- FK: questions.subtopic_id -> subject_subtopics (nullable; ON DELETE SET NULL preserves question if subtopic is removed)
ALTER TABLE questions ADD CONSTRAINT questions_subtopic_id_fkey
  FOREIGN KEY (subtopic_id) REFERENCES subject_subtopics(id) ON DELETE SET NULL;

-- ============================================================================
-- SECTION 4: MOCK EXAMS & ATTEMPTS
-- ============================================================================

-- 4.1 Mock Exams (base schema)
-- Teacher exam columns added: hotfix 73; individual type + exam_group_id: hotfix 80
CREATE TABLE IF NOT EXISTS mock_exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('first_stage', 'second_stage', 'full_exam', 'individual')),
  target_group TEXT CHECK (target_group IN ('I', 'II', 'III', 'IV', 'V')),
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  -- Teacher exam support (hotfix 73)
  is_official            BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_teacher     UUID REFERENCES teachers(id) ON DELETE SET NULL,
  uses_teacher_questions BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Links first/second stage teacher exams to exam_groups config (hotfix 80)
  exam_group_id          UUID REFERENCES exam_groups(id),
  -- Draft flag: TRUE = incomplete exam saved locally, not yet sent to admin for review (hotfix 84)
  is_draft               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 Mock Exam Questions junction (base schema)
CREATE TABLE IF NOT EXISTS mock_exam_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mock_exam_id UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mock_exam_id, question_id)
);

-- 4.2b Teacher Questions (private question library per teacher — hotfix 73)
-- No is_approved column — questions are private to the creating teacher, never shared.
-- Approval happens at the exam level, not the question level.
-- Students never SELECT directly; they receive questions via get_teacher_exam_questions() RPC.
CREATE TABLE IF NOT EXISTS teacher_questions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id      UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id      UUID        NOT NULL REFERENCES subjects(id),
  topic_id        UUID        REFERENCES subject_topics(id),
  subtopic_id     UUID        REFERENCES subject_subtopics(id),
  question_type   TEXT        NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'short_answer')),
  question_text   TEXT        NOT NULL,
  option_a        TEXT,
  option_b        TEXT,
  option_c        TEXT,
  option_d        TEXT,
  option_e        TEXT,
  correct_answer  TEXT        NOT NULL,
  explanation     TEXT,
  image_url       TEXT,
  difficulty      INTEGER     NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2c Teacher Exam Questions (links teacher exams to a mix of teacher + Elmly questions — hotfix 73)
-- Exactly one of question_id / teacher_question_id must be set (enforced by constraint).
CREATE TABLE IF NOT EXISTS teacher_exam_questions (
  id                  UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id             UUID    NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  question_id         UUID    REFERENCES questions(id),           -- from Elmly DB
  teacher_question_id UUID    REFERENCES teacher_questions(id),   -- from teacher's library
  question_order      INTEGER NOT NULL,
  CONSTRAINT only_one_source CHECK (
    (question_id IS NULL) != (teacher_question_id IS NULL)
  )
);

-- 4.3 Mock Exam Attempts (S6 - enhanced exam tracking)
-- Columns added: S9.1 (analytics_updated), S10 (question_ids)
CREATE TABLE IF NOT EXISTS mock_exam_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mock_exam_id UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  time_remaining_seconds INTEGER NOT NULL,
  total_score DECIMAL(5,2),
  percentage DECIMAL(5,2),
  analytics_updated BOOLEAN DEFAULT FALSE,
  leaderboard_score_updated_at TIMESTAMPTZ,
  question_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 Exam Answers (S6)
-- Columns added: Admin S10/21 (text_answer); hotfix 57 (image_url, ai_score, final_score, ai_explanation)
-- hotfix 80: dropped FK on question_id (teacher q UUIDs come from teacher_questions table),
--            made question_id nullable, added teacher_question_id column with its own FK,
--            replaced UNIQUE constraint with two partial unique indexes.
CREATE TABLE IF NOT EXISTS exam_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
  question_id UUID,                                                   -- Elmly question (nullable — no FK, enforced by app)
  teacher_question_id UUID REFERENCES teacher_questions(id) ON DELETE CASCADE,  -- teacher question
  selected_answer TEXT CHECK (selected_answer IN ('A', 'B', 'C', 'D', 'E')),
  text_answer TEXT,
  image_url TEXT,           -- photo of handwritten written_open answer
  ai_score DECIMAL(5,2),    -- 0-100 score from AI grading edge function
  final_score DECIMAL(5,2), -- resolved score after any manual override
  ai_explanation TEXT,      -- feedback text from AI grader
  is_marked BOOLEAN DEFAULT FALSE,
  time_spent_seconds INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- Unique indexes defined below (partial) to allow both Elmly and teacher question answers
);

-- 4.5 Exam Subject Scores (S6)
CREATE TABLE IF NOT EXISTS exam_subject_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  coefficient DECIMAL(2,1) NOT NULL CHECK (coefficient IN (1.0, 1.5)),
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL,
  raw_score DECIMAL(5,2) NOT NULL,
  weighted_score DECIMAL(5,2) NOT NULL,
  max_possible DECIMAL(5,2) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attempt_id, subject_id)
);

-- 4.6 Student Exam Attempts (legacy - base schema)
CREATE TABLE IF NOT EXISTS student_exam_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mock_exam_id UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  score DECIMAL(5,2) DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 5: PRACTICE SYSTEM
-- ============================================================================

-- 5.1 Practice Sessions (S5)
-- Columns added: S9.1 (analytics_updated), S10 (question_ids)
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('practice', 'quiz')),
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  total_time_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  analytics_updated BOOLEAN DEFAULT FALSE,
  question_ids UUID[] DEFAULT '{}',
  offline_session_id TEXT,
  shuffled_questions JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 Student Answers (base + S5 enhancements)
-- Columns added: S5 (user_id, time_spent, practice_session_id, answered_at), Admin S10/21 (text_answer)
CREATE TABLE IF NOT EXISTS student_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID REFERENCES student_exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE,
  selected_answer TEXT CHECK (selected_answer IN ('A', 'B', 'C', 'D', 'E')),
  text_answer TEXT,
  is_correct BOOLEAN DEFAULT FALSE,
  time_spent_seconds INTEGER DEFAULT 0,
  was_skipped BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2b Practice Answers (Admin S5 analytics - practice-specific answer tracking)
CREATE TABLE IF NOT EXISTS practice_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  practice_session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE,
  selected_answer TEXT CHECK (selected_answer IN ('A', 'B', 'C', 'D', 'E')),
  is_correct BOOLEAN DEFAULT FALSE,
  is_skipped BOOLEAN DEFAULT FALSE,
  time_spent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.3 Bookmarked Questions (base + S5 enhancements: user_id replaces student_id)
CREATE TABLE IF NOT EXISTS bookmarked_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- 5.4 Study Progress (base schema)
CREATE TABLE IF NOT EXISTS study_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  study_time INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

-- ============================================================================
-- SECTION 6: AI & COMPETITIVE MODE (S9.5, S10, S10.1)
-- ============================================================================

-- 6.1 AI Insights (S9.5)
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'recommendation', 'weak_area', 'strength', 'study_tip',
    'prediction', 'motivation', 'analysis', 'warning'
  )),
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  insight_data JSONB DEFAULT '{}',
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  confidence_score DECIMAL(3,2),
  is_read BOOLEAN DEFAULT FALSE,
  was_helpful BOOLEAN,
  user_feedback TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '6 hours'),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.2 Test Sets (S9.5 - Classic Mode)
CREATE TABLE IF NOT EXISTS test_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  total_questions INTEGER NOT NULL DEFAULT 40,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subject_id, set_number)
);

-- 6.3 Test Set Questions (S9.5)
CREATE TABLE IF NOT EXISTS test_set_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_set_id UUID NOT NULL REFERENCES test_sets(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(test_set_id, question_id),
  UNIQUE(test_set_id, question_order)
);

-- 6.4 Student Test Set Progress (S9.5)
CREATE TABLE IF NOT EXISTS student_test_set_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  test_set_id UUID NOT NULL REFERENCES test_sets(id) ON DELETE CASCADE,
  practice_completed BOOLEAN DEFAULT FALSE,
  practice_score INTEGER DEFAULT 0,
  practice_completed_at TIMESTAMPTZ,
  quiz_completed BOOLEAN DEFAULT FALSE,
  quiz_score INTEGER DEFAULT 0,
  quiz_completed_at TIMESTAMPTZ,
  best_score INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, test_set_id)
);

-- 6.4b Competitive Matches (Admin S5 analytics - match tracking)
CREATE TABLE IF NOT EXISTS competitive_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  winner_id UUID REFERENCES auth.users(id),
  player1_score INTEGER DEFAULT 0,
  player2_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 6.5 Competitive Sessions (S9.5 + S10.1 enhancements)
CREATE TABLE IF NOT EXISTS competitive_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  subject_name TEXT,
  questions_data JSONB NOT NULL,
  answers_data JSONB,
  total_questions INTEGER NOT NULL DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  weak_topics TEXT[] DEFAULT '{}',
  weak_topics_covered JSONB DEFAULT '[]'::jsonb,
  difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  score INTEGER DEFAULT 0,
  session_metadata JSONB DEFAULT '{}'::jsonb,
  cache_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.6 Competitive Question Results (S10 + S10.1 + mobile app denormalized fields)
-- NOTE: question_id is TEXT, not UUID — AI-generated questions have non-UUID IDs like "sessionId_q1"
CREATE TABLE IF NOT EXISTS competitive_question_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES competitive_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  topic TEXT,
  subtopic_id UUID,         -- FK to subject_subtopics (nullable; Stage 7)
  difficulty TEXT,
  student_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  time_spent INTEGER DEFAULT 0,
  selected_answer TEXT,
  time_spent_seconds INTEGER DEFAULT 0,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK: competitive_question_results.subtopic_id -> subject_subtopics (nullable; Stage 7)
ALTER TABLE competitive_question_results ADD CONSTRAINT competitive_question_results_subtopic_id_fkey
  FOREIGN KEY (subtopic_id) REFERENCES subject_subtopics(id) ON DELETE SET NULL;

-- 6.7 AI Usage Logs (S5.5 - unified schema for both mobile app and admin panel)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Request Info
  request_id TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  feature_type TEXT NOT NULL DEFAULT 'insight_generation',
  -- AI Service Info
  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  -- Usage Metrics
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  -- Performance
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  error_code TEXT,
  -- Quality Metrics (S5.5)
  quality_score NUMERIC(3, 2),
  flagged_for_review BOOLEAN DEFAULT FALSE,
  review_status TEXT,
  -- Metadata
  prompt_version TEXT,
  request_metadata JSONB DEFAULT '{}'::jsonb,
  response_metadata JSONB DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 6.8 AI Feedback (S9.5)
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_id UUID REFERENCES ai_insights(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  feedback_type TEXT CHECK (feedback_type IN ('helpful', 'not_helpful', 'incorrect', 'excellent')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.9 AI Configuration (S9.5 + S5.5/17 enhancements)
CREATE TABLE IF NOT EXISTS ai_configuration (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key TEXT UNIQUE NOT NULL,
  config_category TEXT NOT NULL DEFAULT 'system',
  config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INTEGER DEFAULT 1,
  previous_value JSONB
);

-- ============================================================================
-- SECTION 7: ANALYTICS & PROGRESS (S8, S9.1)
-- ============================================================================

-- 7.1 Study Goals (S8)
CREATE TABLE IF NOT EXISTS study_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('daily_study_time', 'target_score', 'questions_per_day', 'subject_mastery')),
  target_value DECIMAL(10,2) NOT NULL,
  current_value DECIMAL(10,2) DEFAULT 0,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.2 Achievements (S8 - authoritative, enhanced with badge_icon, milestone_value)
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'questions_milestone', 'study_streak', 'high_accuracy',
    'exam_score', 'subject_master', 'consistent_learner', 'leaderboard_rank'
  )),
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  badge_icon TEXT,
  milestone_value INTEGER,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, achievement_type, milestone_value)
);

-- 7.3 Activity Log (S8)
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'practice_session', 'mock_exam', 'booking_created', 'booking_completed',
    'goal_set', 'goal_achieved', 'achievement_earned', 'review_posted'
  )),
  activity_title TEXT NOT NULL,
  activity_description TEXT,
  activity_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.4 Daily Stats (S8)
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  study_time_minutes INTEGER DEFAULT 0,
  exams_taken INTEGER DEFAULT 0,
  exams_completed INTEGER DEFAULT 0,
  practice_sessions INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

-- 7.5 Leaderboard Cache (S8 + S10.2 enhancements)
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leaderboard_type TEXT NOT NULL CHECK (leaderboard_type IN ('score', 'streak')),
  city TEXT,
  target_group TEXT CHECK (target_group IN ('I', 'II', 'III', 'IV', 'V')),
  rank INTEGER NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  score DECIMAL(5,2),
  streak INTEGER,
  exams_taken INTEGER,
  elo_rating INTEGER,
  monthly_score INTEGER,
  activity_multiplier DECIMAL(3,2),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(leaderboard_type, city, target_group, student_id)
);

-- 7.6 Study Sessions (S9.1)
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.7 User Achievements (S9.1 - separate from S8 achievements)
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL CHECK (achievement_type IN ('streak', 'accuracy', 'questions', 'exam', 'milestone')),
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.8 Study Reminders (S9.1)
CREATE TABLE IF NOT EXISTS study_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE NOT NULL,
  reminder_time TIME,
  type TEXT CHECK (type IN ('exam', 'assignment', 'goal', 'custom')) DEFAULT 'custom',
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.9 Daily Study Tips (S9.1)
CREATE TABLE IF NOT EXISTS daily_study_tips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT CHECK (category IN ('motivation', 'technique', 'health', 'time-management')) NOT NULL,
  tip_text TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 8: TEACHER MARKETPLACE (S7)
-- ============================================================================

-- 8.1 Bookings
-- Columns added: S7 (duration_hours, session_method, service_type, location, lifecycle timestamps)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'completed', 'cancelled')),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  duration_hours DECIMAL(3,1) DEFAULT 1.0,
  session_method TEXT DEFAULT 'online',
  service_type TEXT DEFAULT 'hourly' CHECK (service_type IN ('hourly', 'monthly')),
  notes TEXT,
  location TEXT,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by TEXT CHECK (cancelled_by IN ('student', 'teacher', 'admin')),
  student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  teacher_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  teacher_notes TEXT,
  teacher_notes_updated_at TIMESTAMPTZ,
  -- Phase 8: Payment infrastructure
  payment_intent_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_status IN ('free', 'awaiting_acceptance', 'awaiting_payment', 'pending_payment', 'paid', 'payment_failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8.1b Booking Reminders (Phase 5)
-- Tracks which reminders have already been sent to prevent duplicates.
-- The notification processor (cron-job.org -> /api/notifications/processor) calls
-- send_booking_reminders() which inserts here after queuing each notification.
CREATE TABLE IF NOT EXISTS booking_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type   TEXT        NOT NULL CHECK (reminder_type IN ('24h', '1h', '15min')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, reminder_type)
);

ALTER TABLE booking_reminders ENABLE ROW LEVEL SECURITY;

-- 8.2 Teacher Reviews
-- Columns added: S7 (updated_at)
CREATE TABLE IF NOT EXISTS teacher_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8.3 Teacher Exam Ratings (hotfix 87: student rates a teacher-created exam after completing it)
CREATE TABLE IF NOT EXISTS teacher_exam_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attempt_id  UUID REFERENCES mock_exam_attempts(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attempt_id)
);

ALTER TABLE teacher_exam_ratings ENABLE ROW LEVEL SECURITY;

-- 8.4 Favorite Teachers (base schema)
CREATE TABLE IF NOT EXISTS favorite_teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, teacher_id)
);

-- 8.4 Student Teachers (S10.2B - assigned teachers per subject)
CREATE TABLE IF NOT EXISTS student_teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

-- 8.4b Teacher Subscriptions
-- Recurring teacher-student membership. This is the authority for teacher
-- current/total student counts; one-off bookings do not count as students.
CREATE TABLE IF NOT EXISTS teacher_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN (
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'cancelled',
      'incomplete_expired'
    )),
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly')),
  monthly_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'azn',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  ever_active BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_latest_invoice_id TEXT,
  stripe_latest_payment_intent_id TEXT,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.5 Leaderboard Display Settings (S10.2B)
CREATE TABLE IF NOT EXISTS leaderboard_display_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  show_real_name BOOLEAN DEFAULT false,
  show_city BOOLEAN DEFAULT true,
  show_target_group BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 9: MESSAGING & NOTIFICATIONS (S10)
-- ============================================================================

-- 9.1 Push Tokens (S10 + S7/advanced enhancements)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name TEXT,
  is_valid BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  failure_count INTEGER DEFAULT 0,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9.2 Notification Tokens (S9 - separate from push_tokens, needs consolidation)
CREATE TABLE IF NOT EXISTS notification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- 9.3 Notification Preferences (S10)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  study_reminders BOOLEAN DEFAULT TRUE,
  exam_reminders BOOLEAN DEFAULT TRUE,
  booking_updates BOOLEAN DEFAULT TRUE,
  achievement_notifications BOOLEAN DEFAULT TRUE,
  weekly_reports BOOLEAN DEFAULT TRUE,
  goal_reminders BOOLEAN DEFAULT TRUE,
  reminder_time TIME DEFAULT '18:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9.4 Conversations (S10)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count_student INTEGER DEFAULT 0,
  unread_count_teacher INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, teacher_id)
);

-- 9.5 Messages (S10 - authoritative, conversation-based schema)
-- Phase 4: file_url, file_name, file_type, file_size_bytes added for file sharing
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('student', 'teacher')),
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT CHECK (file_type IN ('image', 'pdf', 'document')),
  file_size_bytes BIGINT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9.6 Notifications (base + S7/advanced enhancements)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('exam', 'booking', 'achievement', 'reminder', 'general', 'announcement', 'payment', 'message')),
  is_read BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  action_url TEXT,
  action_data JSONB DEFAULT '{}',
  data JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  category TEXT,
  image_url TEXT,
  idempotency_key TEXT UNIQUE,  -- UNIQUE CONSTRAINT required for ON CONFLICT in queue_payment_notification()
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9.7 Scheduled Notifications (S9)
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 10: USER SETTINGS (S9 - authoritative)
-- ============================================================================

-- 10.1 User Settings
-- Authoritative: S9/STAGE_9_COMPLETE_SETUP_NEW.sql (most columns)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- General Settings
  language TEXT DEFAULT 'az' CHECK (language IN ('az', 'en', 'ru')),
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  default_screen TEXT,
  -- Notification Settings
  notifications_enabled BOOLEAN DEFAULT true,
  study_reminders BOOLEAN DEFAULT true,
  exam_reminders BOOLEAN DEFAULT true,
  achievement_notifications BOOLEAN DEFAULT true,
  goal_reminders BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  -- Study Settings
  timer_enabled BOOLEAN DEFAULT true,
  auto_advance BOOLEAN DEFAULT false,
  show_explanations BOOLEAN DEFAULT true,
  -- Privacy Settings
  profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private')),
  show_in_leaderboard BOOLEAN DEFAULT true,
  -- Accessibility Settings
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  high_contrast BOOLEAN DEFAULT false,
  -- Legacy columns (kept for backward compatibility)
  sound_enabled BOOLEAN DEFAULT TRUE,
  vibration_enabled BOOLEAN DEFAULT TRUE,
  leaderboard_opt_out BOOLEAN DEFAULT FALSE,
  settings_json JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 11: SCORING & LEADERBOARD (S10.2)
-- ============================================================================

-- 11.1 Score Transactions (S10.2 - audit trail)
CREATE TABLE IF NOT EXISTS score_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'exam_completion', 'quiz_completion', 'practice_completion',
    'competitive_completion', 'practice_session', 'streak_bonus',
    'achievement_bonus', 'monthly_decay', 'admin_adjustment', 'season_reset'
  )),
  elo_change INTEGER NOT NULL,
  previous_elo INTEGER NOT NULL,
  new_elo INTEGER NOT NULL,
  activity_multiplier DECIMAL(3,2),
  bonus_points INTEGER DEFAULT 0,
  exam_score DECIMAL(5,2),
  exam_difficulty TEXT CHECK (exam_difficulty IN ('easy', 'medium', 'hard')),
  notes TEXT,
  admin_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11.2 Leaderboard History (S10.2)
CREATE TABLE IF NOT EXISTS leaderboard_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_name TEXT NOT NULL,
  season_start DATE NOT NULL,
  season_end DATE NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  city TEXT,
  target_group TEXT CHECK (target_group IN ('I', 'II', 'III', 'IV', 'V')),
  final_rank INTEGER NOT NULL,
  final_elo_rating INTEGER NOT NULL,
  final_monthly_score INTEGER NOT NULL,
  total_exams_taken INTEGER NOT NULL,
  current_streak INTEGER NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_name, student_id)
);

-- 11.3 Leaderboard Seasons (Admin S3 - season management)
CREATE TABLE IF NOT EXISTS leaderboard_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT false,
  reset_type TEXT CHECK (reset_type IN ('soft', 'hard', 'seasonal')),
  reset_percentage NUMERIC(5,2),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11.4 Score Adjustments (Admin S3 - manual ELO adjustments)
CREATE TABLE IF NOT EXISTS score_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  old_elo NUMERIC(10,2) NOT NULL,
  new_elo NUMERIC(10,2) NOT NULL,
  adjustment NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11.5 Scoring Config (Admin S3 - ELO and scoring system configuration)
CREATE TABLE IF NOT EXISTS scoring_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES admins(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11.6 Leaderboard Settings (S10.2)
CREATE TABLE IF NOT EXISTS leaderboard_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11.4 Streak History (S10.2)
CREATE TABLE IF NOT EXISTS streak_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  streak_value INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'streak_gained', 'streak_lost', 'streak_frozen', 'streak_recovered'
  )),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- ============================================================================
-- SECTION 12: APP MANAGEMENT (S10)
-- ============================================================================

-- 12.1 App Versions (S10)
CREATE TABLE IF NOT EXISTS app_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version TEXT NOT NULL,
  build_number INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  force_update BOOLEAN DEFAULT FALSE,
  update_message TEXT,
  update_message_az TEXT,
  update_message_ru TEXT,
  ios_url TEXT,
  android_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version, build_number, platform)
);

-- ============================================================================
-- SECTION 13: ADMIN PANEL TABLES
-- ============================================================================

-- 13.1 Admin Audit Log (Admin S1 - authoritative: log_admin_action function)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.2 Admin Audit Logs (Admin S2 - admin-specific audit)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.3 Exams (Admin S3 - authoritative)
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('practice', 'mock', 'official')),
  exam_stage TEXT NOT NULL CHECK (exam_stage IN ('first', 'second')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  registration_deadline TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  passing_score INTEGER NOT NULL CHECK (passing_score >= 0 AND passing_score <= 100),
  shuffle_questions BOOLEAN DEFAULT true,
  shuffle_options BOOLEAN DEFAULT true,
  allow_review BOOLEAN DEFAULT true,
  show_results_immediately BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES admins(id),
  instructions TEXT,
  rules JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.4 Exam Questions junction (Admin S3 - authoritative)
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL CHECK (question_order > 0),
  points INTEGER DEFAULT 1 CHECK (points > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, question_id),
  UNIQUE(exam_id, question_order)
);

-- 13.4b Exam Templates (Admin S3)
CREATE TABLE IF NOT EXISTS exam_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('practice', 'mock', 'official')),
  exam_stage TEXT NOT NULL CHECK (exam_stage IN ('first', 'second')),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  passing_score INTEGER NOT NULL CHECK (passing_score >= 0 AND passing_score <= 100),
  question_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_settings JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.4c Question Imports (Admin S3)
CREATE TABLE IF NOT EXISTS question_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  successful_imports INTEGER DEFAULT 0,
  failed_imports INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  imported_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 13.5 Exam Groups (Admin S9.1)
CREATE TABLE IF NOT EXISTS exam_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('I', 'II', 'III', 'IV', 'V')),
  name_en TEXT NOT NULL,
  name_az TEXT NOT NULL,
  description TEXT,
  first_stage_max_points INTEGER NOT NULL DEFAULT 300,
  second_stage_max_points INTEGER NOT NULL DEFAULT 400,
  has_second_stage BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.6 Exam Group Subjects (Admin S9.1)
CREATE TABLE IF NOT EXISTS exam_group_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'second' CHECK (stage IN ('first', 'second')),
  coefficient DECIMAL(2,1) NOT NULL DEFAULT 1.0 CHECK (coefficient IN (1.0, 1.5)),
  questions_count INTEGER NOT NULL DEFAULT 30,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_group_id, subject_id, stage)
);

-- ============================================================================
-- SECTION 14: ADMIN AI MANAGEMENT (Admin S5.5)
-- ============================================================================

-- 14.1 AI Usage Logs (Admin S5.5 - extended version for admin panel)
-- Note: ai_usage_logs already created in Section 6.7
-- Admin panel extends it with additional views and functions

-- 14.2 AI Prompts (Admin S5.5 - authoritative: 12_ai_prompts_table.sql)
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  provider TEXT DEFAULT 'deepseek',
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  temperature NUMERIC(3,2) DEFAULT 0.70 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 1000 CHECK (max_tokens > 0),
  top_p NUMERIC(3,2) DEFAULT 1.00 CHECK (top_p >= 0 AND top_p <= 1),
  frequency_penalty NUMERIC(3,2) DEFAULT 0.00 CHECK (frequency_penalty >= -2 AND frequency_penalty <= 2),
  presence_penalty NUMERIC(3,2) DEFAULT 0.00 CHECK (presence_penalty >= -2 AND presence_penalty <= 2),
  version INTEGER DEFAULT 1 CHECK (version > 0),
  is_active BOOLEAN DEFAULT TRUE,
  parent_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  previous_version_id UUID REFERENCES ai_prompts(id),
  tags TEXT[],
  variables JSONB,
  example_input JSONB,
  example_output TEXT,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  avg_quality_score NUMERIC(3,2),
  avg_response_time_ms INTEGER,
  avg_tokens_used INTEGER,
  avg_latency_ms INTEGER,
  avg_cost_usd NUMERIC(10,6),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

-- 14.3 AI Quality Reviews (Admin S5.5)
CREATE TABLE IF NOT EXISTS ai_quality_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  usage_log_id UUID REFERENCES ai_usage_logs(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES auth.users(id),
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  accuracy_score INTEGER CHECK (accuracy_score >= 1 AND accuracy_score <= 5),
  relevance_score INTEGER CHECK (relevance_score >= 1 AND relevance_score <= 5),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14.4 AI Budgets (Admin S5.5 - authoritative: 01_ai_tables.sql)
CREATE TABLE IF NOT EXISTS ai_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budget_usd NUMERIC(10,2) NOT NULL CHECK (budget_usd > 0),
  alert_threshold_percent INTEGER DEFAULT 80 CHECK (alert_threshold_percent > 0 AND alert_threshold_percent <= 100),
  hard_limit BOOLEAN DEFAULT FALSE,
  feature_types TEXT[],
  providers TEXT[],
  user_ids UUID[],
  current_spend_usd NUMERIC(10,2) DEFAULT 0,
  current_tokens INTEGER DEFAULT 0,
  current_requests INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  alert_sent BOOLEAN DEFAULT FALSE,
  alert_sent_at TIMESTAMPTZ,
  limit_reached BOOLEAN DEFAULT FALSE,
  limit_reached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- 14.5 AI Budget Alerts (Admin S5.5/08 - budget alert history)
CREATE TABLE IF NOT EXISTS ai_budget_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID REFERENCES ai_budgets(id) ON DELETE CASCADE,
  alert_type VARCHAR NOT NULL,
  threshold_percentage INTEGER NOT NULL,
  current_spend DECIMAL(10,4) NOT NULL,
  budget_limit DECIMAL(10,4) NOT NULL,
  percentage_used DECIMAL(5,2) NOT NULL,
  alert_message TEXT,
  email_sent BOOLEAN DEFAULT false,
  email_error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 15: ADMIN SYSTEM SETTINGS (Admin S6)
-- ============================================================================

-- 15.1 System Settings (Admin S6 - authoritative: 01_system_settings_schema.sql)
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('general', 'notification', 'security', 'payment', 'feature')),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('string', 'number', 'boolean', 'json', 'array')),
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  is_sensitive BOOLEAN DEFAULT FALSE,
  validation_rules JSONB,
  default_value JSONB,
  requires_restart BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_version CHECK (version > 0)
);

-- 15.2 Feature Flags (Admin S6 - authoritative: 01_system_settings_schema.sql)
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  target_users JSONB,
  target_groups TEXT[] DEFAULT ARRAY['all'],
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date)
);

-- 15.3 Notification Templates (Admin S6 email + S7 admin push templates merged)
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- S7 admin template columns (primary)
  name TEXT UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT[] DEFAULT ARRAY['in_app'],
  -- S6 email template columns
  template_name TEXT UNIQUE,
  template_type TEXT CHECK (template_type IN ('email', 'push', 'in_app', 'sms')),
  subject TEXT,
  language TEXT CHECK (language IN ('az', 'en', 'ru')),
  -- Shared columns
  category TEXT DEFAULT 'general',
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15.4 Security Policies (Admin S6 - authoritative: 01_system_settings_schema.sql)
CREATE TABLE IF NOT EXISTS security_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_name TEXT NOT NULL UNIQUE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('password', 'session', 'access', 'rate_limit')),
  rules JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  enforcement_level TEXT DEFAULT 'strict' CHECK (enforcement_level IN ('strict', 'moderate', 'lenient')),
  applies_to TEXT[] DEFAULT ARRAY['all'],
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15.5 Settings History (Admin S6 - authoritative: 01_system_settings_schema.sql)
CREATE TABLE IF NOT EXISTS settings_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_value JSONB,
  new_value JSONB,
  changed_fields TEXT[],
  changed_by UUID REFERENCES profiles(id),
  change_reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15.6 Settings Audit Log (Admin S6 - authoritative: 01_system_settings_schema.sql)
CREATE TABLE IF NOT EXISTS settings_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  setting_key TEXT,
  old_value JSONB,
  new_value JSONB,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'reverted')),
  error_message TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 16: ADMIN NOTIFICATION SYSTEM (Admin S7)
-- ============================================================================

-- 16.1 Admin Notifications (Admin S7 - authoritative: 04e functions schema)
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT[] DEFAULT ARRAY['in_app'],
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'students', 'teachers', 'target_group', 'individual')),
  target_filter JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  total_recipients INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.2 Notification Recipients (Admin S7)
CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push', 'email')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.3 Notification Queue (Admin S7 - authoritative: advanced/01_notification_foundation_schema.sql)
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  channels TEXT[] DEFAULT ARRAY['in_app']::TEXT[],
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  token TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,  -- UNIQUE CONSTRAINT required for ON CONFLICT in queue_payment_notification()
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.4 Notification Delivery Log (Admin S7)
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  token TEXT,
  status TEXT DEFAULT 'pending',
  provider_response JSONB,
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.5 Notification Events (Admin S7/advanced - event trigger configuration)
CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT UNIQUE NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT,
  trigger_conditions JSONB DEFAULT '{}',
  notification_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  enabled BOOLEAN DEFAULT TRUE,
  channels TEXT[] DEFAULT ARRAY['in_app', 'push']::TEXT[],
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  rate_limit_per_hour INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.6 User Notification Settings (Admin S7/advanced - granular per-type preferences)
CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  channels TEXT[] DEFAULT ARRAY['in_app', 'push']::TEXT[],
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  quiet_hours_days INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);

-- 16.7 Notification Analytics (Admin S7/advanced - engagement tracking)
CREATE TABLE IF NOT EXISTS notification_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('delivered', 'opened', 'clicked', 'dismissed')),
  channel TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.8 Notification Failures (Admin S7/advanced - failed delivery log)
CREATE TABLE IF NOT EXISTS notification_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  will_retry BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16.9 Notification Rate Limits (Admin S7/advanced/06 - rate limiting)
CREATE TABLE IF NOT EXISTS notification_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, notification_type, window_start)
);

-- 16.10 Notification Deduplication (Admin S7/advanced/06 - prevent duplicates)
CREATE TABLE IF NOT EXISTS notification_deduplication (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_hash TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- 16.11 Notification Performance Snapshots (Admin S7/advanced - monitoring)
CREATE TABLE IF NOT EXISTS notification_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_time TIMESTAMPTZ DEFAULT NOW(),
  total_notifications BIGINT,
  pending_count BIGINT,
  processing_count BIGINT,
  sent_count BIGINT,
  failed_count BIGINT,
  avg_processing_time_seconds NUMERIC,
  success_rate NUMERIC,
  queue_health_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 17: ADMIN SECURITY & AUDIT (Admin S8-S9)
-- ============================================================================

-- 17.1 Login Attempts (Admin S9)
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 18: ADMIN REPORTS (Admin S5)
-- ============================================================================

-- 18.1 Scheduled Reports (Admin S5 - authoritative: 04_scheduled_reports_schema.sql)
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  recipients TEXT[] NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'excel', 'csv')),
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18.2 Report History (Admin S5 - authoritative: 04_scheduled_reports_schema.sql)
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  format TEXT NOT NULL,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  recipients TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'generating', 'sent', 'failed')),
  error_message TEXT,
  file_url TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 18: GOAL SETTING & STUDY PLANS (Phase 1 — Feature Roadmap)
-- ============================================================================

-- 18.1 Student Goals (daily targets, exam prep, study preferences)
CREATE TABLE IF NOT EXISTS student_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  daily_question_target INT NOT NULL DEFAULT 20,
  daily_time_target_minutes INT NOT NULL DEFAULT 30,
  target_exam_date DATE,
  target_score INT,
  preferred_study_days INT[] DEFAULT '{1,2,3,4,5}',
  preferred_study_time TEXT DEFAULT 'evening',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id)
);

-- 18.2 Study Plans (generated multi-week plans)
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_weeks INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18.3 Study Plan Weeks (weekly breakdown with focus subjects)
CREATE TABLE IF NOT EXISTS study_plan_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  focus_subjects UUID[] NOT NULL,
  focus_subject_names TEXT[] NOT NULL,
  target_questions INT NOT NULL DEFAULT 100,
  target_accuracy DECIMAL(5,2),
  completed_questions INT DEFAULT 0,
  actual_accuracy DECIMAL(5,2) DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18.4 Daily Progress (tracks daily goal completion)
CREATE TABLE IF NOT EXISTS daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  questions_completed INT DEFAULT 0,
  time_spent_minutes INT DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,
  question_goal_met BOOLEAN DEFAULT FALSE,
  time_goal_met BOOLEAN DEFAULT FALSE,
  consecutive_goal_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

-- ============================================================================
-- SECTION 19: TEACHER AVAILABILITY MANAGEMENT (Phase 3 — Feature Roadmap)
-- ============================================================================

-- 19.1 Teacher Availability (recurring weekly schedule)
CREATE TABLE IF NOT EXISTS teacher_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_availability_time_range CHECK (end_time > start_time),
  CONSTRAINT unique_teacher_day UNIQUE (teacher_id, day_of_week)
);

-- 19.2 Teacher Time Off (date-range vacation/sick blocks)
CREATE TABLE IF NOT EXISTS teacher_time_off (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_off_date_range CHECK (end_date >= start_date)
);

-- ============================================================================
-- DONE - All tables created
-- ============================================================================
-- Total: 69+ tables covering:
-- - Reference data (cities, universities, target_groups)
-- - Core users (profiles, students, teachers, admins)
-- - Subjects & questions (subjects, questions, question_groups, subject_topics, subject_subtopics)
-- - Mock exams & attempts
-- - Practice system
-- - AI & competitive mode
-- - Analytics & progress tracking
-- - Teacher marketplace
-- - Messaging & notifications
-- - User settings
-- - Scoring & leaderboard
-- - App management
-- - Admin panel (audit, settings, notifications, security, reports)
-- ============================================================================

-- ============================================================================
-- POST-CREATION: Additional FK constraints for PostgREST join support
-- PostgREST needs explicit FKs to profiles for the join syntax:
--   .select('*, profiles:user_id(full_name, phone, avatar_url)')
-- The existing FK to auth.users(id) is not enough for PostgREST to infer
-- the join path to profiles.
-- ============================================================================
ALTER TABLE students ADD CONSTRAINT students_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE teachers ADD CONSTRAINT teachers_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- SECTION 16: PAYMENT INFRASTRUCTURE (Phase 8)
-- ============================================================================

-- 16.1 Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency        TEXT          NOT NULL DEFAULT 'EUR',
  total_earned    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_spent     DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 16.2 Transactions (immutable ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id            UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id              UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id              UUID          REFERENCES bookings(id)   ON DELETE SET NULL,
  amount                  DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency                TEXT          NOT NULL DEFAULT 'EUR',
  type                    TEXT          NOT NULL CHECK (type IN (
    'booking_payment','teacher_earning','platform_commission',
    'refund','withdrawal','subscription_charge','top_up'
  )),
  status                  TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','processing','completed','failed','refunded'
  )),
  external_payment_id     TEXT,
  external_payment_method TEXT,
  commission_rate         DECIMAL(5,4),
  commission_amount       DECIMAL(12,2),
  description             TEXT,
  metadata                JSONB         NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  idempotency_key         TEXT          UNIQUE
);

-- 16.3 Payout Requests
CREATE TABLE IF NOT EXISTS payout_requests (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID          NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency         TEXT          NOT NULL DEFAULT 'EUR',
  bank_details_ref TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','processing','completed','rejected'
  )),
  processed_by     UUID          REFERENCES auth.users(id),
  processed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  admin_notes      TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 16.4 Subscription Tiers
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT          NOT NULL UNIQUE,
  display_name             TEXT          NOT NULL,
  display_name_az          TEXT,
  display_name_ru          TEXT,
  price_monthly            DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly             DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency                 TEXT          NOT NULL DEFAULT 'EUR',
  max_bookings_per_month   INTEGER,
  ai_explanations_limit    INTEGER,
  has_score_prediction     BOOLEAN       NOT NULL DEFAULT FALSE,
  has_priority_matching    BOOLEAN       NOT NULL DEFAULT FALSE,
  has_advanced_analytics   BOOLEAN       NOT NULL DEFAULT FALSE,
  stripe_product_id        TEXT,
  stripe_price_id_monthly  TEXT,
  stripe_price_id_yearly   TEXT,
  is_active                BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order               INTEGER       NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 16.5 User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id                UUID        NOT NULL REFERENCES subscription_tiers(id),
  status                 TEXT        NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','cancelled','past_due','trialing','paused'
  )),
  billing_cycle          TEXT        CHECK (billing_cycle IN ('monthly','yearly')),
  stripe_subscription_id TEXT        UNIQUE,
  stripe_customer_id     TEXT,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  trial_end              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================================
-- SECTION 17: WAITLIST (Pre-Launch)
-- ============================================================================

-- 17.1 Waitlist Subscribers
CREATE TABLE IF NOT EXISTS waitlist_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'landing_page', -- landing_page, referral, social, etc.
  referral_code TEXT,
  referred_by UUID REFERENCES waitlist_subscribers(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'registered', 'unsubscribed')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  locale TEXT DEFAULT 'az',
  invited_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17.2 Waitlist Rate Limits (IP-based spam prevention)
CREATE TABLE IF NOT EXISTS waitlist_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address INET NOT NULL,
  email_hash TEXT, -- SHA256 hash of email for privacy
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17.3 Waitlist Email Queue (for sending invite emails to non-registered users)
CREATE TABLE IF NOT EXISTS waitlist_email_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_id UUID REFERENCES waitlist_subscribers(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  template_name TEXT NOT NULL,
  locale TEXT DEFAULT 'az',
  metadata JSONB DEFAULT '{}'::JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 18: MESSAGE NOTIFICATION TRIGGER (Migration 45)
-- ============================================================================
-- Automatically queues push notifications when a new message is sent.
-- Uses push-only channel (no in_app) - messages are shown in chat, not notifications center.

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
  SELECT * INTO v_conversation FROM conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT full_name INTO v_sender_profile FROM profiles WHERE id = NEW.sender_id;

  IF NEW.sender_type = 'student' THEN
    SELECT t.user_id INTO v_recipient_user_id FROM teachers t WHERE t.id = v_conversation.teacher_id;
  ELSE
    SELECT s.user_id INTO v_recipient_user_id FROM students s WHERE s.id = v_conversation.student_id;
  END IF;

  IF v_recipient_user_id IS NULL THEN RETURN NEW; END IF;

  v_message_preview := CASE
    WHEN NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
      CASE WHEN LENGTH(NEW.content) > 50 THEN SUBSTRING(NEW.content, 1, 47) || '...' ELSE NEW.content END
    WHEN NEW.file_type = 'image' THEN '📷 Şəkil'
    WHEN NEW.file_type = 'pdf' THEN '📄 PDF'
    WHEN NEW.file_type IS NOT NULL THEN '📎 Fayl'
    ELSE 'Yeni mesaj'
  END;

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
      7
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to queue message notification: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();

GRANT EXECUTE ON FUNCTION notify_new_message TO authenticated;
GRANT EXECUTE ON FUNCTION notify_new_message TO service_role;

-- ============================================
-- Question Feedback (student-reported issues)
-- ============================================
CREATE TABLE IF NOT EXISTS question_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'wrong_answer', 'unclear_question', 'unclear_options',
    'missing_explanation', 'wrong_topic', 'duplicate', 'other'
  )),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT question_feedback_user_question_unique UNIQUE (user_id, question_id)
);
