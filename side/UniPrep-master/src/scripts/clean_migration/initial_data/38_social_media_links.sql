-- ============================================================================
-- Stage 6: Social Media Links Settings
-- File: 38_social_media_links.sql
-- Purpose: Add social media link settings to system_settings for landing page
-- Version: 1.0.0
-- Created: March 14, 2026
-- ============================================================================

BEGIN;

-- Add social media link settings (all public, displayed on landing page footer)
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('general', 'social_facebook', '""', 'string', 'Facebook page URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_instagram', '""', 'string', 'Instagram profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_twitter', '""', 'string', 'Twitter/X profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_linkedin', '""', 'string', 'LinkedIn page URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_tiktok', '""', 'string', 'TikTok profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Verification
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM system_settings WHERE key LIKE 'social_%';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Social Media Links Settings Added';
  RAISE NOTICE '  ✓ % social media settings inserted', v_count;
  RAISE NOTICE '========================================';
END $$;
