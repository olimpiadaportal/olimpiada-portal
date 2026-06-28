-- ============================================================================
-- HOTFIX 08: Fix AI Features "Maintenance Mode"
-- Run this on EXISTING databases where 02_smoketest_fixes.sql was already run
-- ============================================================================
-- 
-- ROOT CAUSE:
-- The mobile app's aiConfigService.checkFeatureEnabled() reads from the
-- ai_configuration table WHERE config_key = 'feature_flags'. This row was
-- present in the original Stage 9.5 SQL (COMPLETE_AI_SETUP.sql) but was
-- accidentally omitted from the consolidated migration's 02_smoketest_fixes.sql.
--
-- Without this row, getConfig('feature_flags') returns null, causing
-- feature?.enabled to evaluate to false, which triggers "maintenance mode"
-- for ALL AI features: AI Generate Questions, AI Insights, AI Explain.
--
-- FIX:
-- Insert the missing 'feature_flags' row into ai_configuration with the
-- correct nested structure that aiConfigService expects:
--   { "feature_name": { "enabled": true, "name": "Display Name" } }
-- ============================================================================

-- Insert the missing feature_flags config row
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
) ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  config_key,
  config_value->>'question_generation' IS NOT NULL AS has_question_generation,
  config_value->>'answer_explanation' IS NOT NULL AS has_answer_explanation,
  config_value->>'student_insights' IS NOT NULL AS has_student_insights,
  is_active
FROM ai_configuration 
WHERE config_key = 'feature_flags';
-- Expected: 1 row with all true

-- Also verify all 6 ai_configuration rows exist
SELECT config_key, is_active 
FROM ai_configuration 
WHERE config_key IN ('global_settings', 'emergency_controls', 'rate_limits', 'cost_controls', 'provider_config', 'feature_flags')
ORDER BY config_key;
-- Expected: 6 rows, all is_active = true
