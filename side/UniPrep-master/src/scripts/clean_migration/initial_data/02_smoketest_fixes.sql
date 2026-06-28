-- ============================================================================
-- SMOKE TEST FIXES
-- Run AFTER 01_reference_data.sql
-- Fixes 4 issues discovered during smoke testing:
--   1. Missing check_email_exists function (PGRST202)
--   2. Missing ai_configuration rows: global_settings, emergency_controls, etc. (PGRST116)
--   3. Missing create_default_user_settings RPC function (called by mobile app)
--   4. Missing FK from teachers/students to profiles for PostgREST joins (PGRST200)
-- ============================================================================

-- ============================================================================
-- FIX 1: check_email_exists function (Stage 9)
-- Mobile app calls this during signup to check for duplicate emails
-- ============================================================================
CREATE OR REPLACE FUNCTION check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE email = LOWER(TRIM(email_to_check))
  ) INTO email_exists;
  
  RETURN email_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO anon;

-- ============================================================================
-- FIX 2: Missing ai_configuration rows (Admin S5.5/17)
-- The mobile app's aiConfigService reads these by config_key using .single()
-- which fails with PGRST116 when the row doesn't exist
-- ============================================================================

-- 2a. Global Settings
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'global_settings',
  'system',
  'Global AI system settings',
  jsonb_build_object(
    'enabled', true,
    'default_provider', 'deepseek',
    'default_model', 'deepseek-chat',
    'default_temperature', 0.7,
    'default_max_tokens', 1000,
    'fallback_provider', 'openai',
    'fallback_model', 'gpt-3.5-turbo',
    'auto_fallback_enabled', true,
    'log_all_requests', true,
    'quality_threshold', 0.5
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- 2b. Emergency Controls
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'emergency_controls',
  'security',
  'Emergency shutdown and throttle controls',
  jsonb_build_object(
    'emergency_mode', false,
    'emergency_message', 'AI services are temporarily unavailable. Please try again later.',
    'throttle_mode', false,
    'throttle_percentage', 100,
    'maintenance_mode', false,
    'maintenance_message', 'AI services are under maintenance.',
    'allowed_features_during_emergency', '[]'::jsonb,
    'notify_admins', true,
    'last_emergency_at', null,
    'last_emergency_reason', null
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- 2c. Rate Limits (complete version from S5.5/17)
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'rate_limits',
  'security',
  'Rate limiting configuration per feature',
  jsonb_build_object(
    'global', jsonb_build_object(
      'requests_per_minute', 100,
      'requests_per_hour', 1000,
      'requests_per_day', 10000
    ),
    'per_user', jsonb_build_object(
      'requests_per_minute', 10,
      'requests_per_hour', 100,
      'requests_per_day', 500
    ),
    'per_feature', jsonb_build_object(
      'question_generation', jsonb_build_object('requests_per_minute', 30, 'requests_per_hour', 300),
      'answer_explanation', jsonb_build_object('requests_per_minute', 50, 'requests_per_hour', 500),
      'student_insights', jsonb_build_object('requests_per_minute', 20, 'requests_per_hour', 200),
      'prompt_testing', jsonb_build_object('requests_per_minute', 10, 'requests_per_hour', 50)
    ),
    'enabled', true,
    'block_on_limit', false,
    'notify_on_limit', true
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- 2d. Cost Controls
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'cost_controls',
  'performance',
  'Cost optimization and controls',
  jsonb_build_object(
    'daily_budget_usd', 50.0,
    'monthly_budget_usd', 1000.0,
    'auto_disable_on_budget', false,
    'alert_at_percentage', 80,
    'prefer_cheaper_models', false,
    'max_cost_per_request', 0.50,
    'track_per_feature', true,
    'optimize_token_usage', true
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- 2e. Provider Configuration
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'provider_config',
  'system',
  'AI provider configurations and priorities',
  jsonb_build_object(
    'deepseek', jsonb_build_object(
      'enabled', true, 'priority', 1, 'api_key_configured', true,
      'models', '["deepseek-chat"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3
    ),
    'openai', jsonb_build_object(
      'enabled', true, 'priority', 2, 'api_key_configured', false,
      'models', '["gpt-4", "gpt-3.5-turbo"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3
    ),
    'anthropic', jsonb_build_object(
      'enabled', false, 'priority', 3, 'api_key_configured', false,
      'models', '["claude-3-opus", "claude-3-sonnet"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3
    )
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- 2f. Feature Flags (AI feature toggles)
-- CRITICAL: The mobile app's aiConfigService.checkFeatureEnabled() reads this row.
-- Without it, all AI features (AI Generate Questions, AI Insights, AI Explain) show "maintenance mode"
-- because getConfig('feature_flags') returns null and feature?.enabled evaluates to false.
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'feature_flags',
  'system',
  'Feature toggles for individual AI capabilities',
  jsonb_build_object(
    'question_generation', jsonb_build_object('enabled', true, 'name', 'AI Generate Questions'),
    'answer_explanation', jsonb_build_object('enabled', true, 'name', 'AI Explain'),
    'student_insights', jsonb_build_object('enabled', true, 'name', 'AI Insights'),
    'prompt_testing', jsonb_build_object('enabled', true, 'name', 'Prompt Testing'),
    'quality_review', jsonb_build_object('enabled', true, 'name', 'Quality Review')
  ),
  true,
  true
) ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- FIX 3: create_default_user_settings RPC function (Stage 9)
-- The mobile app calls this as an RPC with p_user_id parameter during signup.
-- The clean migration only had the trigger version (no params).
-- We keep the trigger version AND add the RPC version.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_default_user_settings(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Check if settings already exist
  IF EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = p_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Insert default settings (uses table defaults for most columns)
  INSERT INTO public.user_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating default settings for user %: %', p_user_id, SQLERRM;
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_default_user_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_user_settings(UUID) TO anon;

-- ============================================================================
-- FIX 4: Add FK from teachers.user_id and students.user_id to profiles.id
-- PostgREST needs an explicit FK to profiles to support the join syntax:
--   .select('*, profiles:user_id(full_name, phone, avatar_url)')
-- The existing FK to auth.users(id) is not enough for PostgREST to infer
-- the join path to profiles.
-- ============================================================================

-- 4a. Add FK from teachers.user_id to profiles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'teachers_user_id_fkey_profiles'
    AND table_name = 'teachers'
  ) THEN
    ALTER TABLE teachers 
    ADD CONSTRAINT teachers_user_id_fkey_profiles 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4b. Add FK from students.user_id to profiles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'students_user_id_fkey_profiles'
    AND table_name = 'students'
  ) THEN
    ALTER TABLE students 
    ADD CONSTRAINT students_user_id_fkey_profiles 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_email_exists') AS check_email_exists_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'create_default_user_settings' AND pronargs = 1) AS create_default_settings_rpc,
  (SELECT COUNT(*) FROM ai_configuration WHERE config_key IN ('global_settings', 'emergency_controls', 'rate_limits', 'cost_controls', 'provider_config', 'feature_flags')) AS ai_config_rows,
  EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'teachers_user_id_fkey_profiles') AS teachers_fk_profiles,
  EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'students_user_id_fkey_profiles') AS students_fk_profiles;
-- Expected: true, true, 6, true, true
