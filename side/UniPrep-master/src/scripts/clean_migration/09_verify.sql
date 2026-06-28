-- ============================================================================
-- 09_verify.sql
-- Elmly Database - Post-Migration Verification
-- ============================================================================
-- Purpose: Verify that all database objects were created correctly
--          Run this AFTER executing files 00-08 in order
--          Returns a single JSON result visible in Supabase SQL editor
-- ============================================================================
-- Created: February 6, 2026
-- ============================================================================

SELECT jsonb_pretty(jsonb_build_object(
  '00_ELMLY_VERIFICATION_REPORT', '========================================',

  -- 1. TABLES
  '01_tables', (
    SELECT jsonb_build_object(
      'total_count', COUNT(*),
      'expected', 59,
      'status', CASE WHEN COUNT(*) >= 50 THEN 'OK' ELSE 'WARNING - fewer tables than expected' END,
      'list', jsonb_agg(jsonb_build_object(
        'name', tablename,
        'columns', (SELECT COUNT(*) FROM information_schema.columns c 
                    WHERE c.table_name = t.tablename AND c.table_schema = 'public')
      ) ORDER BY tablename)
    )
    FROM pg_tables t WHERE schemaname = 'public'
  ),

  -- 2. ENUMS
  '02_enums', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', typname,
      'values', vals
    ) ORDER BY typname), '[]'::jsonb)
    FROM (
      SELECT t.typname, STRING_AGG(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS vals
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    ) sub
  ),

  -- 3. INDEXES
  '03_indexes', (
    SELECT jsonb_build_object(
      'total_count', COUNT(*),
      'status', CASE WHEN COUNT(*) >= 30 THEN 'OK' ELSE 'WARNING' END
    )
    FROM pg_indexes WHERE schemaname = 'public'
  ),

  -- 4. RLS
  '04_rls', (
    SELECT jsonb_build_object(
      'tables_with_rls', (
        SELECT COUNT(*)
        FROM pg_tables t
        JOIN pg_class c ON t.tablename = c.relname
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE t.schemaname = 'public' AND n.nspname = 'public' AND c.relrowsecurity = true
      ),
      'tables_without_rls', (
        SELECT COALESCE(jsonb_agg(t.tablename ORDER BY t.tablename), '[]'::jsonb)
        FROM pg_tables t
        JOIN pg_class c ON t.tablename = c.relname
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE t.schemaname = 'public' AND n.nspname = 'public' AND c.relrowsecurity = false
      ),
      'policies_per_table', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'table', tablename, 'policies', cnt
        ) ORDER BY tablename), '[]'::jsonb)
        FROM (
          SELECT tablename, COUNT(*) AS cnt
          FROM pg_policies WHERE schemaname = 'public'
          GROUP BY tablename
        ) sub
      )
    )
  ),

  -- 5. FUNCTIONS
  '05_functions', (
    SELECT jsonb_build_object(
      'total_count', COUNT(*),
      'list', jsonb_agg(jsonb_build_object(
        'name', proname,
        'security', CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
      ) ORDER BY proname)
    )
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  ),

  -- 6. TRIGGERS
  '06_triggers', (
    SELECT jsonb_build_object(
      'total_count', COUNT(*),
      'list', jsonb_agg(jsonb_build_object(
        'name', trigger_name,
        'table', event_object_table,
        'event', event_manipulation,
        'timing', action_timing
      ) ORDER BY event_object_table, trigger_name)
    )
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  ),

  -- 7. VIEWS
  '07_views', (
    SELECT jsonb_build_object(
      'total_count', COUNT(*),
      'list', jsonb_agg(table_name ORDER BY table_name)
    )
    FROM information_schema.views
    WHERE table_schema = 'public'
  ),

  -- 8. STORAGE BUCKETS
  '08_storage_buckets', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', name,
      'public', public,
      'size_limit', file_size_limit
    ) ORDER BY name), '[]'::jsonb)
    FROM storage.buckets
  ),

  -- 9. REALTIME PUBLICATIONS
  '09_realtime_tables', (
    SELECT COALESCE(jsonb_agg(tablename ORDER BY tablename), '[]'::jsonb)
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
  ),

  -- 10. SEED DATA
  '10_seed_data', (
    SELECT jsonb_build_object(
      'system_settings', (SELECT COUNT(*) FROM system_settings),
      'feature_flags', (SELECT COUNT(*) FROM feature_flags),
      'notification_templates', (SELECT COUNT(*) FROM notification_templates),
      'security_policies', (SELECT COUNT(*) FROM security_policies),
      'leaderboard_settings', (SELECT COUNT(*) FROM leaderboard_settings),
      'ai_configuration', (SELECT COUNT(*) FROM ai_configuration),
      'ai_prompts', (SELECT COUNT(*) FROM ai_prompts),
      'daily_study_tips', (SELECT COUNT(*) FROM daily_study_tips)
    )
  ),

  -- 11. EXTENSIONS
  '11_extensions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', extname, 'version', extversion
    ) ORDER BY extname), '[]'::jsonb)
    FROM pg_extension
    WHERE extname IN ('uuid-ossp', 'pg_cron', 'pgcrypto')
  ),

  -- 12. FORUM TABLES (Phase: Forum Q&A)
  '12_forum_tables', (
    SELECT jsonb_build_object(
      'forum_categories', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_categories'),
      'forum_questions', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_questions'),
      'forum_answers', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_answers'),
      'forum_comments', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_comments'),
      'forum_votes', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_votes'),
      'forum_bookmarks', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_bookmarks'),
      'forum_user_stats', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_user_stats'),
      'forum_tags', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'forum_tags'),
      'forum_reputation_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'forum_reputation'),
      'forum_categories_count', (SELECT COUNT(*) FROM forum_categories WHERE is_active = TRUE),
      'forum_notification_events', (SELECT COUNT(*) FROM notification_events WHERE event_type LIKE 'forum_%')
    )
  ),

  '13_STATUS', 'VERIFICATION COMPLETE'
)) AS "ELMLY_VERIFICATION_REPORT";
