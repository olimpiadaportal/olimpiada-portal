-- ============================================================================
-- HOTFIX 07: Fix exam_groups/exam_group_subjects schema + ai_usage_logs schema
-- ============================================================================
-- Run this on EXISTING databases that were set up with the clean migration
-- but have:
--   1. Wrong exam_groups schema (name instead of name_en, missing stage columns)
--   2. Wrong ai_usage_logs schema (old mobile-only columns instead of S5.5)
--
-- Safe to re-run (uses IF NOT EXISTS, DO $$ blocks with checks)
-- ============================================================================

-- ============================================================================
-- PART 1: FIX exam_groups TABLE SCHEMA
-- The clean migration had: name, name_az, code, max_points
-- S9.1 requires: code, name_en, name_az, first_stage_max_points,
--                second_stage_max_points, has_second_stage
-- ============================================================================

-- 1a. Rename 'name' column to 'name_en' if it exists and 'name_en' doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'name_en'
  ) THEN
    ALTER TABLE exam_groups RENAME COLUMN name TO name_en;
    RAISE NOTICE 'Renamed exam_groups.name -> name_en';
  END IF;
END $$;

-- 1b. Add name_en if neither name nor name_en exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'name_en'
  ) THEN
    ALTER TABLE exam_groups ADD COLUMN name_en TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added exam_groups.name_en';
  END IF;
END $$;

-- 1c. Make name_az NOT NULL (with default for existing rows)
DO $$
BEGIN
  -- Update any NULL name_az values first
  UPDATE exam_groups SET name_az = name_en WHERE name_az IS NULL;
  -- We can't easily change nullable to NOT NULL on existing column with data,
  -- so just ensure all values are populated
  RAISE NOTICE 'Ensured exam_groups.name_az is populated';
END $$;

-- 1d. Add first_stage_max_points if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'first_stage_max_points'
  ) THEN
    ALTER TABLE exam_groups ADD COLUMN first_stage_max_points INTEGER NOT NULL DEFAULT 300;
    RAISE NOTICE 'Added exam_groups.first_stage_max_points';
  END IF;
END $$;

-- 1e. Add second_stage_max_points if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'second_stage_max_points'
  ) THEN
    ALTER TABLE exam_groups ADD COLUMN second_stage_max_points INTEGER NOT NULL DEFAULT 400;
    RAISE NOTICE 'Added exam_groups.second_stage_max_points';
  END IF;
END $$;

-- 1f. Add has_second_stage if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'has_second_stage'
  ) THEN
    ALTER TABLE exam_groups ADD COLUMN has_second_stage BOOLEAN NOT NULL DEFAULT true;
    RAISE NOTICE 'Added exam_groups.has_second_stage';
  END IF;
END $$;

-- 1g. Add CHECK constraint on code if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'exam_groups_code_check'
  ) THEN
    -- Only add if all existing codes are valid
    IF NOT EXISTS (SELECT 1 FROM exam_groups WHERE code NOT IN ('I', 'II', 'III', 'IV', 'V')) THEN
      ALTER TABLE exam_groups ADD CONSTRAINT exam_groups_code_check CHECK (code IN ('I', 'II', 'III', 'IV', 'V'));
      RAISE NOTICE 'Added CHECK constraint on exam_groups.code';
    END IF;
  END IF;
END $$;

-- 1h. Drop old max_points column if it exists (data migrated to first/second stage)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_groups' AND column_name = 'max_points'
  ) THEN
    -- Migrate data before dropping
    UPDATE exam_groups 
    SET first_stage_max_points = 300,
        second_stage_max_points = CASE WHEN code = 'V' THEN 0 ELSE 400 END,
        has_second_stage = CASE WHEN code = 'V' THEN false ELSE true END
    WHERE first_stage_max_points = 300; -- Only if still default
    
    ALTER TABLE exam_groups DROP COLUMN max_points;
    RAISE NOTICE 'Dropped old exam_groups.max_points column (migrated to first/second_stage_max_points)';
  END IF;
END $$;

-- ============================================================================
-- PART 2: FIX exam_group_subjects TABLE SCHEMA
-- Clean migration had: coefficient, question_count, is_required
-- S9.1 requires: stage, coefficient (with CHECK), questions_count, display_order,
--                is_active, updated_at
-- ============================================================================

-- 2a. Add stage column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'stage'
  ) THEN
    ALTER TABLE exam_group_subjects ADD COLUMN stage TEXT NOT NULL DEFAULT 'second' CHECK (stage IN ('first', 'second'));
    RAISE NOTICE 'Added exam_group_subjects.stage';
  END IF;
END $$;

-- 2b. Rename question_count to questions_count if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'question_count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'questions_count'
  ) THEN
    ALTER TABLE exam_group_subjects RENAME COLUMN question_count TO questions_count;
    RAISE NOTICE 'Renamed exam_group_subjects.question_count -> questions_count';
  END IF;
END $$;

-- 2c. Add display_order if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE exam_group_subjects ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added exam_group_subjects.display_order';
  END IF;
END $$;

-- 2d. Add is_active if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE exam_group_subjects ADD COLUMN is_active BOOLEAN DEFAULT true;
    RAISE NOTICE 'Added exam_group_subjects.is_active';
  END IF;
END $$;

-- 2e. Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE exam_group_subjects ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added exam_group_subjects.updated_at';
  END IF;
END $$;

-- 2f. Drop is_required if it exists (replaced by is_active)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_group_subjects' AND column_name = 'is_required'
  ) THEN
    ALTER TABLE exam_group_subjects DROP COLUMN is_required;
    RAISE NOTICE 'Dropped old exam_group_subjects.is_required column';
  END IF;
END $$;

-- 2g. Fix unique constraint to include stage
ALTER TABLE exam_group_subjects 
DROP CONSTRAINT IF EXISTS exam_group_subjects_exam_group_id_subject_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'exam_group_subjects_exam_group_id_subject_id_stage_key'
  ) THEN
    ALTER TABLE exam_group_subjects 
    ADD CONSTRAINT exam_group_subjects_exam_group_id_subject_id_stage_key 
    UNIQUE (exam_group_id, subject_id, stage);
    RAISE NOTICE 'Updated unique constraint to include stage';
  END IF;
END $$;

-- ============================================================================
-- PART 3: ENSURE RLS POLICIES FOR EXAM GROUPS
-- ============================================================================

ALTER TABLE exam_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_group_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view exam groups" ON exam_groups;
DROP POLICY IF EXISTS "Everyone can view exam group subjects" ON exam_group_subjects;
DROP POLICY IF EXISTS "Admins can manage exam groups" ON exam_groups;
DROP POLICY IF EXISTS "Admins can manage exam group subjects" ON exam_group_subjects;

CREATE POLICY "Everyone can view exam groups"
  ON exam_groups FOR SELECT USING (true);

CREATE POLICY "Everyone can view exam group subjects"
  ON exam_group_subjects FOR SELECT USING (true);

CREATE POLICY "Admins can manage exam groups"
  ON exam_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

CREATE POLICY "Admins can manage exam group subjects"
  ON exam_group_subjects FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin'));

-- ============================================================================
-- PART 4: RE-INSERT EXAM GROUPS WITH CORRECT SCHEMA
-- ============================================================================

-- Delete old rows that may have wrong column values
DELETE FROM exam_groups WHERE code IN ('I', 'II', 'III', 'IV', 'V');

INSERT INTO exam_groups (code, name_en, name_az, description, first_stage_max_points, second_stage_max_points, has_second_stage)
VALUES 
  ('I', 'Group I', 'I Qrup', 'Engineering, Technical - Stage II: Mathematics, Physics, Chemistry', 300, 400, true),
  ('II', 'Group II', 'II Qrup', 'Economics, Management - Stage II: Mathematics, Geography, History', 300, 400, true),
  ('III', 'Group III', 'III Qrup', 'Humanities, Law - Stage II: Native Language, History, Literature', 300, 400, true),
  ('IV', 'Group IV', 'IV Qrup', 'Medicine, Biology - Stage II: Biology, Chemistry, Physics', 300, 400, true),
  ('V', 'Group V', 'V Qrup', 'Special Aptitude, Arts, PE - First Stage Only (no Stage II)', 300, 0, false)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_az = EXCLUDED.name_az,
  description = EXCLUDED.description,
  first_stage_max_points = EXCLUDED.first_stage_max_points,
  second_stage_max_points = EXCLUDED.second_stage_max_points,
  has_second_stage = EXCLUDED.has_second_stage,
  updated_at = NOW();

GRANT SELECT ON exam_groups TO authenticated;
GRANT SELECT ON exam_group_subjects TO authenticated;

-- ============================================================================
-- PART 5: FIX ai_usage_logs TABLE SCHEMA
-- Clean migration had old mobile schema: student_id, request_type, model_used,
--   tokens_used, processing_time_ms, success
-- S5.5 requires: request_id, user_id, feature_type, provider, model,
--   prompt_tokens, completion_tokens, total_tokens, latency_ms, status,
--   quality_score, flagged_for_review, review_status, etc.
-- ============================================================================

-- 5a. Add request_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'request_id'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN request_id TEXT UNIQUE;
    RAISE NOTICE 'Added ai_usage_logs.request_id';
  END IF;
END $$;

-- 5b. Add user_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added ai_usage_logs.user_id';
  END IF;
END $$;

-- 5c. Add feature_type if missing (migrate from request_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'feature_type'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN feature_type TEXT NOT NULL DEFAULT 'insight_generation';
    -- Migrate data from request_type if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ai_usage_logs' AND column_name = 'request_type'
    ) THEN
      UPDATE ai_usage_logs SET feature_type = request_type;
    END IF;
    RAISE NOTICE 'Added ai_usage_logs.feature_type';
  END IF;
END $$;

-- 5d. Add provider if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'provider'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN provider TEXT NOT NULL DEFAULT 'deepseek';
    RAISE NOTICE 'Added ai_usage_logs.provider';
  END IF;
END $$;

-- 5e. Add/rename model column (model_used -> model)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'model_used'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'model'
  ) THEN
    ALTER TABLE ai_usage_logs RENAME COLUMN model_used TO model;
    RAISE NOTICE 'Renamed ai_usage_logs.model_used -> model';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'model'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN model TEXT NOT NULL DEFAULT 'deepseek-chat';
    RAISE NOTICE 'Added ai_usage_logs.model';
  END IF;
END $$;

-- 5f. Add prompt_tokens if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'prompt_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN prompt_tokens INTEGER DEFAULT 0;
    RAISE NOTICE 'Added ai_usage_logs.prompt_tokens';
  END IF;
END $$;

-- 5g. Add completion_tokens if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'completion_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN completion_tokens INTEGER DEFAULT 0;
    RAISE NOTICE 'Added ai_usage_logs.completion_tokens';
  END IF;
END $$;

-- 5h. Add total_tokens if missing (migrate from tokens_used)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'total_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN total_tokens INTEGER DEFAULT 0;
    -- Migrate data from tokens_used if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ai_usage_logs' AND column_name = 'tokens_used'
    ) THEN
      UPDATE ai_usage_logs SET total_tokens = COALESCE(tokens_used, 0);
    END IF;
    RAISE NOTICE 'Added ai_usage_logs.total_tokens';
  END IF;
END $$;

-- 5i. Add latency_ms if missing (migrate from processing_time_ms)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN latency_ms INTEGER;
    -- Migrate data from processing_time_ms if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ai_usage_logs' AND column_name = 'processing_time_ms'
    ) THEN
      UPDATE ai_usage_logs SET latency_ms = processing_time_ms;
    END IF;
    RAISE NOTICE 'Added ai_usage_logs.latency_ms';
  END IF;
END $$;

-- 5j. Add status if missing (migrate from success boolean)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'status'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'success';
    -- Migrate data from success boolean if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ai_usage_logs' AND column_name = 'success'
    ) THEN
      UPDATE ai_usage_logs SET status = CASE WHEN success = true THEN 'success' ELSE 'error' END;
    END IF;
    RAISE NOTICE 'Added ai_usage_logs.status';
  END IF;
END $$;

-- 5k. Add error_code if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'error_code'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN error_code TEXT;
    RAISE NOTICE 'Added ai_usage_logs.error_code';
  END IF;
END $$;

-- 5l. Add quality_score if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN quality_score NUMERIC(3, 2);
    RAISE NOTICE 'Added ai_usage_logs.quality_score';
  END IF;
END $$;

-- 5m. Add flagged_for_review if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'flagged_for_review'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN flagged_for_review BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added ai_usage_logs.flagged_for_review';
  END IF;
END $$;

-- 5n. Add review_status if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN review_status TEXT;
    RAISE NOTICE 'Added ai_usage_logs.review_status';
  END IF;
END $$;

-- 5o. Add prompt_version if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'prompt_version'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN prompt_version TEXT;
    RAISE NOTICE 'Added ai_usage_logs.prompt_version';
  END IF;
END $$;

-- 5p. Add request_metadata if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'request_metadata'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN request_metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added ai_usage_logs.request_metadata';
  END IF;
END $$;

-- 5q. Add response_metadata if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'response_metadata'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN response_metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added ai_usage_logs.response_metadata';
  END IF;
END $$;

-- 5r. Add reviewed_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN reviewed_at TIMESTAMPTZ;
    RAISE NOTICE 'Added ai_usage_logs.reviewed_at';
  END IF;
END $$;

-- 5s. Add reviewed_by if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_usage_logs' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added ai_usage_logs.reviewed_by';
  END IF;
END $$;

-- 5t. Drop dependent views FIRST, then drop old columns, then recreate views
-- The ai_usage_logs_mobile view (from 08_security_hardening.sql) depends on old columns

-- Drop the mobile compatibility view that references old column names
DROP VIEW IF EXISTS ai_usage_logs_mobile CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'request_type') THEN
    ALTER TABLE ai_usage_logs DROP COLUMN request_type;
    RAISE NOTICE 'Dropped old ai_usage_logs.request_type (migrated to feature_type)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'tokens_used') THEN
    ALTER TABLE ai_usage_logs DROP COLUMN tokens_used;
    RAISE NOTICE 'Dropped old ai_usage_logs.tokens_used (migrated to total_tokens)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'processing_time_ms') THEN
    ALTER TABLE ai_usage_logs DROP COLUMN processing_time_ms;
    RAISE NOTICE 'Dropped old ai_usage_logs.processing_time_ms (migrated to latency_ms)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'success') THEN
    ALTER TABLE ai_usage_logs DROP COLUMN success;
    RAISE NOTICE 'Dropped old ai_usage_logs.success (migrated to status)';
  END IF;
  -- Also drop model_used if rename didn't happen (e.g. model already existed)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'model_used') THEN
    ALTER TABLE ai_usage_logs DROP COLUMN model_used;
    RAISE NOTICE 'Dropped old ai_usage_logs.model_used (migrated to model)';
  END IF;
END $$;

-- Recreate ai_usage_logs_mobile view mapping NEW S5.5 columns -> OLD mobile column names
-- This preserves backward compatibility for the mobile app
CREATE VIEW ai_usage_logs_mobile
WITH (security_invoker = true) AS
SELECT
  id,
  student_id,
  feature_type AS request_type,
  model AS model_used,
  total_tokens AS tokens_used,
  cost_usd,
  latency_ms AS processing_time_ms,
  (status = 'success') AS success,
  error_message,
  created_at
FROM ai_usage_logs;

COMMENT ON VIEW ai_usage_logs_mobile IS 'Compatibility view for mobile app - maps S5.5 columns to old mobile column names';
GRANT SELECT ON ai_usage_logs_mobile TO authenticated;

-- 5u. Create indexes for S5.5 columns
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature ON ai_usage_logs(feature_type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON ai_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status ON ai_usage_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_review ON ai_usage_logs(flagged_for_review, review_status) WHERE flagged_for_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_cost ON ai_usage_logs(cost_usd DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_quality ON ai_usage_logs(quality_score) WHERE quality_score IS NOT NULL;

-- ============================================================================
-- PART 6: RE-CREATE AI ANALYTICS FUNCTIONS (they reference the new columns)
-- These were created in hotfix 06 but may fail if columns didn't exist yet
-- ============================================================================

-- Drop and recreate to ensure they use the correct column names
DROP FUNCTION IF EXISTS get_ai_usage_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_ai_usage_overview(
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_feature_type TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_requests INTEGER;
  v_total_tokens BIGINT;
  v_total_cost NUMERIC;
  v_avg_latency NUMERIC;
  v_success_rate NUMERIC;
  v_by_feature JSONB;
  v_by_provider JSONB;
  v_by_status JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(total_tokens), 0),
    COALESCE(SUM(cost_usd), 0),
    ROUND(AVG(latency_ms)::NUMERIC, 2),
    ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2)
  INTO v_total_requests, v_total_tokens, v_total_cost, v_avg_latency, v_success_rate
  FROM ai_usage_logs
  WHERE created_at BETWEEN p_start_date AND p_end_date
    AND (p_feature_type IS NULL OR feature_type = p_feature_type)
    AND (p_provider IS NULL OR provider = p_provider);

  SELECT jsonb_agg(jsonb_build_object(
    'feature', feature_type, 'requests', count,
    'tokens', tokens, 'cost', cost, 'avg_quality', avg_quality
  ))
  INTO v_by_feature
  FROM (
    SELECT feature_type, COUNT(*)::INTEGER as count,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost_usd), 0)::NUMERIC, 2) as cost,
      ROUND(AVG(quality_score)::NUMERIC, 2) as avg_quality
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_provider IS NULL OR provider = p_provider)
    GROUP BY feature_type ORDER BY count DESC
  ) sub;

  SELECT jsonb_agg(jsonb_build_object(
    'provider', provider, 'requests', count,
    'tokens', tokens, 'cost', cost, 'avg_latency', avg_latency
  ))
  INTO v_by_provider
  FROM (
    SELECT provider, COUNT(*)::INTEGER as count,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost_usd), 0)::NUMERIC, 2) as cost,
      ROUND(AVG(latency_ms)::NUMERIC, 2) as avg_latency
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_feature_type IS NULL OR feature_type = p_feature_type)
    GROUP BY provider ORDER BY count DESC
  ) sub;

  SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count, 'percentage', percentage))
  INTO v_by_status
  FROM (
    SELECT status, COUNT(*)::INTEGER as count,
      ROUND((COUNT(*)::NUMERIC / NULLIF(v_total_requests, 0) * 100), 2) as percentage
    FROM ai_usage_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
      AND (p_feature_type IS NULL OR feature_type = p_feature_type)
      AND (p_provider IS NULL OR provider = p_provider)
    GROUP BY status ORDER BY count DESC
  ) sub;

  v_result := jsonb_build_object(
    'total_requests', COALESCE(v_total_requests, 0),
    'total_tokens', COALESCE(v_total_tokens, 0),
    'total_cost', COALESCE(v_total_cost, 0),
    'avg_latency_ms', COALESCE(v_avg_latency, 0),
    'success_rate', COALESCE(v_success_rate, 0),
    'by_feature', COALESCE(v_by_feature, '[]'::jsonb),
    'by_provider', COALESCE(v_by_provider, '[]'::jsonb),
    'by_status', COALESCE(v_by_status, '[]'::jsonb),
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'timestamp', NOW()
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_ai_usage_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Hotfix 07 applied successfully' AS status;

-- Verify exam_groups schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'exam_groups' 
ORDER BY ordinal_position;

-- Verify exam_groups data
SELECT code, name_en, first_stage_max_points, second_stage_max_points, has_second_stage 
FROM exam_groups ORDER BY code;

-- Verify ai_usage_logs has required columns
SELECT 
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'total_tokens') AS has_total_tokens,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'provider') AS has_provider,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'feature_type') AS has_feature_type,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'latency_ms') AS has_latency_ms,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'status') AS has_status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'quality_score') AS has_quality_score;
-- Expected: all true
