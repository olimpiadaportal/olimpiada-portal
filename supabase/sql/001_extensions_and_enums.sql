-- =============================================================================
-- 001_extensions_and_enums.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 001 of 013.
--
-- Responsibility : PostgreSQL extensions, enum types and common domains.
-- Run order      : FIRST. Must run before any table that uses these enums.
-- Safe to rerun  : Yes. Extensions use IF NOT EXISTS; enums are created inside
--                  exception-guarded DO blocks (duplicate_object -> no-op).
-- Environment    : Apply on local/staging Supabase first. Never production first.
-- Notes          : This file is non-destructive. It never drops extensions or
--                  types. Adding values to an existing enum is done via a
--                  migration file under supabase/sql/migrations/, then backported
--                  here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto  : gen_random_uuid() for primary keys (also core in PG13+).
-- citext    : case-insensitive text for emails and codes.
-- pg_trgm   : trigram indexes for question/content search (used in 011).
-- On Supabase these typically install into the "extensions" schema, which is
-- already on the search_path. IF NOT EXISTS makes this safe to rerun.
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
-- Each enum is wrapped so a rerun does not fail if the type already exists.
-- Keep enum value lists in sync with application validation schemas.

-- Account lifecycle status for profiles (03_AUTH_RBAC: Account Status).
do $$ begin
  create type public.account_status as enum
    ('active', 'pending', 'suspended', 'deactivated', 'deleted');
exception when duplicate_object then null; end $$;

-- Content locale. MVP content is 'az'; 'ru'/'en' are future content phases.
do $$ begin
  create type public.content_locale as enum ('az', 'ru', 'en');
exception when duplicate_object then null; end $$;

-- Generic catalog/reference status (subjects, schools, plans, achievements...).
do $$ begin
  create type public.catalog_status as enum ('active', 'inactive', 'archived');
exception when duplicate_object then null; end $$;

-- Parent <-> student link lifecycle (03_AUTH_RBAC: Parent/Student Linking).
do $$ begin
  create type public.link_status as enum
    ('pending', 'active', 'revoked', 'disputed');
exception when duplicate_object then null; end $$;

-- Content lifecycle for questions / tests / daily task packages
-- (05_ADMIN_PANEL content workflow: draft .. published .. archived/rejected).
do $$ begin
  create type public.content_status as enum
    ('draft', 'in_review', 'approved', 'published', 'archived', 'rejected');
exception when duplicate_object then null; end $$;

-- Review decision status for content_reviews / admin_actions.
do $$ begin
  create type public.review_status as enum
    ('pending', 'approved', 'rejected', 'changes_requested');
exception when duplicate_object then null; end $$;

-- Test attempt lifecycle.
do $$ begin
  create type public.attempt_status as enum
    ('in_progress', 'submitted', 'graded', 'abandoned');
exception when duplicate_object then null; end $$;

-- Student daily task progress state.
do $$ begin
  create type public.task_progress_status as enum
    ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

-- Subscription state (Stripe-aligned, provider-agnostic).
do $$ begin
  create type public.subscription_status as enum
    ('trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete');
exception when duplicate_object then null; end $$;

-- Payment record status.
do $$ begin
  create type public.payment_status as enum
    ('pending', 'succeeded', 'failed', 'refunded', 'canceled');
exception when duplicate_object then null; end $$;

-- Subscription plan billing interval.
do $$ begin
  create type public.plan_interval as enum ('week', 'month', 'year');
exception when duplicate_object then null; end $$;

-- Coupon discount type.
do $$ begin
  create type public.discount_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

-- Notification channels. NOTE: no 'sms' value — SMS is excluded by project rule.
do $$ begin
  create type public.notification_channel as enum ('in_app', 'email');
exception when duplicate_object then null; end $$;

-- Notification / email delivery status.
do $$ begin
  create type public.delivery_status as enum
    ('pending', 'queued', 'sent', 'failed', 'bounced');
exception when duplicate_object then null; end $$;

-- Leaderboard period type.
do $$ begin
  create type public.leaderboard_period_type as enum
    ('weekly', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

-- Leaderboard scope (future school/district/country readiness).
do $$ begin
  create type public.leaderboard_scope_type as enum
    ('global', 'grade', 'subject', 'school', 'district', 'country');
exception when duplicate_object then null; end $$;

-- Support request status.
do $$ begin
  create type public.support_status as enum
    ('open', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

-- Audit log severity.
do $$ begin
  create type public.audit_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

-- Stored media visibility (media_assets / storage policies).
do $$ begin
  create type public.media_visibility as enum
    ('public', 'private', 'restricted');
exception when duplicate_object then null; end $$;

-- Test scoring policy.
do $$ begin
  create type public.scoring_policy as enum
    ('all_or_nothing', 'per_question', 'weighted');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- End of 001_extensions_and_enums.sql
-- =============================================================================
