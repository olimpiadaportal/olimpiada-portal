-- ============================================================================
-- 00_prerequisites.sql
-- Elmly Database - Prerequisites
-- ============================================================================
-- Purpose: Enable required PostgreSQL extensions and create custom enum types
-- Run this FIRST before any other migration script
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- UUID generation (used across all tables for primary keys)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_cron for scheduled jobs (monthly ELO decay, cache cleanup)
-- NOTE: pg_cron must be enabled via Supabase Dashboard > Database > Extensions
-- It cannot be enabled via SQL in all Supabase plans
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pgcrypto is available by default in Supabase under the 'extensions' schema
-- Used by verify_user_password() function for password hash comparison
-- No explicit CREATE EXTENSION needed - accessed via extensions.crypt()

-- ============================================================================
-- CUSTOM ENUM TYPES
-- ============================================================================

-- Admin role hierarchy: super_admin > admin > moderator
DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Question types: MCQ (multiple choice), codable_open (short answer), written_open (essay)
DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('mcq', 'codable_open', 'written_open');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify prerequisites are in place:
--
-- Check extensions:
--   SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_cron');
--
-- Check enum types:
--   SELECT typname, enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
--   WHERE typname IN ('admin_role', 'question_type') ORDER BY typname, enumsortorder;
-- ============================================================================
