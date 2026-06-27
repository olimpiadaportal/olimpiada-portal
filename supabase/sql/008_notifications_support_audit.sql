-- =============================================================================
-- 008_notifications_support_audit.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 008 of 013.
--
-- Responsibility : Notifications, support, audit, content review, media metadata,
--                  settings & feature flags:
--                  notifications, notification_templates, notification_deliveries,
--                  support_requests, audit_logs, admin_actions, content_reviews,
--                  media_assets, system_settings, feature_flags.
-- Run order      : After 007. Before 009 (storage policies reference media_assets).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
--
-- KEY RULES:
--   * No SMS: notification_channel enum has only in_app/email.
--   * media_assets stores ONLY file metadata (bucket, path, mime, size, owner,
--     visibility). Never store binary file bytes in PostgreSQL.
--   * audit_logs is append-only and admin-read-only (enforced by RLS in 010 and
--     audit triggers in 011).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- media_assets : metadata for files stored in Supabase Storage. Metadata only.
-- This is the FK target for question/explanation/profile media (added in 011).
-- -----------------------------------------------------------------------------
create table if not exists public.media_assets (
  id               uuid primary key default gen_random_uuid(),
  bucket           text not null,
  path             text not null,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  mime_type        text,
  file_size_bytes  bigint,
  visibility       public.media_visibility not null default 'private',
  metadata_json    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_media_bucket_path unique (bucket, path)
);

comment on table public.media_assets is
  'File METADATA only (bucket, object path, mime, size, owner, visibility). Binary files live in Supabase Storage, never in PostgreSQL.';

-- -----------------------------------------------------------------------------
-- notification_templates : in-app/email templates (localized).
-- -----------------------------------------------------------------------------
create table if not exists public.notification_templates (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  locale     public.content_locale not null default 'az',
  subject    text,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_notification_template unique (code, locale)
);

-- -----------------------------------------------------------------------------
-- notifications : in-app notifications addressed to a profile.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  type                 text not null,
  title                text not null,
  body                 text,
  data_json            jsonb not null default '{}'::jsonb,
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- notification_deliveries : delivery state per channel (in_app/email).
-- -----------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel         public.notification_channel not null,
  status          public.delivery_status not null default 'pending',
  provider_ref    text,
  error_text      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- support_requests : support/contact tickets.
-- -----------------------------------------------------------------------------
create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  category   text,
  status     public.support_status not null default 'open',
  subject    text,
  message    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- audit_logs : immutable, append-only trail of sensitive actions.
-- No updates/deletes are permitted (RLS in 010; append-only intent).
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action           text not null,
  target_table     text,
  target_id        uuid,
  before_json      jsonb,
  after_json       jsonb,
  ip_address       inet,
  user_agent       text,
  severity         public.audit_severity not null default 'info',
  metadata_json    jsonb not null default '{}'::jsonb,
  success          boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail. Admin-read-only. No UPDATE/DELETE from application roles.';

-- -----------------------------------------------------------------------------
-- admin_actions : structured tracking layered on top of audit_logs.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_actions (
  id            uuid primary key default gen_random_uuid(),
  audit_log_id  uuid references public.audit_logs (id) on delete set null,
  action_type   text not null,
  review_status public.review_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- content_reviews : review workflow for questions/tests/daily tasks.
-- content_type + content_id is polymorphic (no FK; validated in service layer).
-- -----------------------------------------------------------------------------
create table if not exists public.content_reviews (
  id           uuid primary key default gen_random_uuid(),
  content_type text not null,                    -- 'question' | 'test' | 'daily_task_package'
  content_id   uuid not null,
  status       public.review_status not null default 'pending',
  reviewer_id  uuid references public.profiles (id) on delete set null,
  submitted_by uuid references public.profiles (id) on delete set null,
  comments     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- system_settings : platform settings (admin only).
-- -----------------------------------------------------------------------------
create table if not exists public.system_settings (
  key        text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- feature_flags : safe rollout flags (admin only).
-- -----------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  rules_json jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- End of 008_notifications_support_audit.sql
-- =============================================================================
