-- ============================================================================
-- 00_drop_all.sql
-- Elmly Database - DROP ALL public objects
-- ============================================================================
-- Purpose: Clean slate before running migration files 00-09
-- WARNING: This will DELETE ALL DATA and objects in the public schema!
-- ============================================================================

-- Drop all views first (they depend on tables)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
  RAISE NOTICE 'All views dropped.';
END $$;

-- Drop all functions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
  RAISE NOTICE 'All functions dropped.';
END $$;

-- Drop all tables (CASCADE handles foreign keys)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  RAISE NOTICE 'All tables dropped.';
END $$;

-- Drop all custom types/enums
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  ) LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
  RAISE NOTICE 'All custom types dropped.';
END $$;

-- Remove tables from realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE conversations;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE NOTICE 'Realtime publications cleaned.';
END $$;

-- Clean storage buckets and policies
DO $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id IN ('question-images', 'exam-answers');
  DELETE FROM storage.buckets WHERE id IN ('question-images', 'exam-answers');
  RAISE NOTICE 'Storage buckets cleaned.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage cleanup skipped (may not exist).';
END $$;

-- Final verification
DO $$
DECLARE
  v_tables INTEGER;
  v_functions INTEGER;
  v_views INTEGER;
  v_types INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tables FROM pg_tables WHERE schemaname = 'public';
  SELECT COUNT(*) INTO v_functions FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public';
  SELECT COUNT(*) INTO v_views FROM information_schema.views WHERE table_schema = 'public';
  SELECT COUNT(*) INTO v_types FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e';
  
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DATABASE RESET COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Remaining: % tables, % functions, % views, % types', v_tables, v_functions, v_views, v_types;
  RAISE NOTICE '';
  RAISE NOTICE 'Now run migration files in order:';
  RAISE NOTICE '  1. 00_prerequisites.sql';
  RAISE NOTICE '  2. 01_base_schema.sql';
  RAISE NOTICE '  3. 02_indexes.sql';
  RAISE NOTICE '  4. 03_rls_policies.sql';
  RAISE NOTICE '  5. 04_functions_triggers.sql';
  RAISE NOTICE '  6. 04b_admin_functions.sql';
  RAISE NOTICE '  7. 04c_question_exam_functions.sql';
  RAISE NOTICE '  8. 04d_analytics_ai_functions.sql';
  RAISE NOTICE '  9. 04e_notification_leaderboard_functions.sql';
  RAISE NOTICE '  10. 05_default_data.sql';
  RAISE NOTICE '  11. 06_storage_buckets.sql';
  RAISE NOTICE '  12. 07_realtime.sql';
  RAISE NOTICE '  13. 08_security_hardening.sql';
  RAISE NOTICE '  14. 09_verify.sql';
  RAISE NOTICE '============================================================';
END $$;
