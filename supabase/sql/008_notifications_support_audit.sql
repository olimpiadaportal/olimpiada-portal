-- =============================================================================
-- 008_notifications_support_audit.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 008 of 013.
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

-- -----------------------------------------------------------------------------
-- site_content : admin-managed TRILINGUAL site-text OVERRIDES keyed by i18n key
-- (Round 12 / migration 031). Empty locale value = fall back to the app's built-in
-- i18n. Read server-side via the service-role client; admin-only RLS (010).
-- updated_at trigger lives in 011. group_key drives the admin UI grouping.
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  key        text primary key,
  group_key  text not null default 'general',
  -- Round 12 (migration 033): hierarchical Section -> Menu grouping for the admin
  -- "Website Content Management" UI (e.g. section='landing', menu='hero'). The
  -- editable-key registry lives in the admin app; these columns record the chosen
  -- grouping per override row. NULL for legacy rows.
  section    text,
  menu       text,
  az         text not null default '',
  en         text not null default '',
  ru         text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- mobile_app_versions : per-platform version gate for the MOBILE APP (Stage M1 /
-- migration 045). Backs the `version` block of the anon-callable
-- get_mobile_config() RPC (011) and the admin panel's "Mobile App" section.
-- Admin-only RLS (010); the config RPC is the only public reader. `force_update`
-- hard-blocks app versions below `min_version`; `latest_version` drives a soft
-- update hint. updated_at + audit triggers live in 011; ios/android seeded in 012.
-- -----------------------------------------------------------------------------
create table if not exists public.mobile_app_versions (
  id             uuid primary key default gen_random_uuid(),
  platform       text not null unique check (platform in ('ios','android')),
  min_version    text not null default '1.0.0' check (min_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  latest_version text not null default '1.0.0' check (latest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  force_update   boolean not null default false,
  store_url      text not null default '' check (store_url = '' or store_url ~ '^https://'),
  message_az     text not null default '',
  message_en     text not null default '',
  message_ru     text not null default '',
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- free_access_intervals : admin-scheduled FREE-ACCESS windows (Round 12 / migration
-- 033). Targets a specific child (student_profile_id) OR a whole parent's children
-- (parent_profile_id); at least one is set. While now() is inside [starts_at,
-- ends_at) and is_active, the parent's subscription content is FREE (prices 0, add/
-- remove subjects free, no paid rows) and the child can practice/olympiad free.
-- Access is evaluated LAZILY (helpers in 011) — no job, nothing to unwind. Writes
-- are admin/service only (RLS in 010). Distinct from the GLOBAL giveaway and from
-- the PERMANENT admin_grant_child_access comped subscription.
-- -----------------------------------------------------------------------------
create table if not exists public.free_access_intervals (
  id                  uuid primary key default gen_random_uuid(),
  parent_profile_id   uuid references public.profiles (id) on delete cascade,
  student_profile_id  uuid references public.students (profile_id) on delete cascade,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  is_active           boolean not null default true,
  note                text,
  created_by_admin_id uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_fai_target check (parent_profile_id is not null or student_profile_id is not null),
  constraint chk_fai_window check (ends_at > starts_at)
);
create index if not exists ix_fai_parent  on public.free_access_intervals (parent_profile_id);
create index if not exists ix_fai_student on public.free_access_intervals (student_profile_id);
create index if not exists ix_fai_window  on public.free_access_intervals (starts_at, ends_at);

comment on table public.free_access_intervals is
  'Admin-scheduled per-parent/child free-access windows. Free (prices 0, no paid rows) while now() in [starts_at,ends_at) and is_active. Lazy expiry (helpers in 011). Admin/service write only.';


-- -----------------------------------------------------------------------------
-- NOTIFICATIONS ENGINE (backported from migrations/2026_07_07_042)
-- notifications columns + admin_notifications + preferences + push_tokens.
-- -----------------------------------------------------------------------------
-- ---- A) extend notifications --------------------------------------------------
alter table public.notifications
  add column if not exists idempotency_key text,
  add column if not exists priority        int not null default 5,
  add column if not exists category        text,
  add column if not exists action_url      text,     -- same-origin RELATIVE deep link
  add column if not exists expires_at      timestamptz;

do $$ begin
  alter table public.notifications add constraint uq_notifications_idempotency unique (idempotency_key);
exception when duplicate_table then null; when duplicate_object then null; end $$;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_profile_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (recipient_profile_id) where read_at is null;

-- ---- B) admin broadcast records ----------------------------------------------
create table if not exists public.admin_notifications (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  title             text not null,
  body              text not null,
  template_code     text,
  channels          text[] not null default '{in_app}',
  audience_type     text not null,   -- all_parents|all_children|parent|by_subject|individual
  audience_filter   jsonb not null default '{}'::jsonb,
  status            text not null default 'sent'
                      check (status in ('draft','scheduled','sending','sent','failed','canceled')),
  total_recipients  int not null default 0,
  delivered_count   int not null default 0,
  failed_count      int not null default 0,
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_admin_notifications_created on public.admin_notifications (created_at desc);
create index if not exists idx_admin_notifications_scheduled
  on public.admin_notifications (scheduled_at) where status = 'scheduled';

-- ---- C) per-user preferences (coarse per-channel; parent manages child) -------
create table if not exists public.notification_preferences (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled    boolean not null default true,
  email_enabled     boolean not null default true,
  push_enabled      boolean not null default true,
  quiet_hours_start int,     -- optional (0..23), reserved for a later stage
  quiet_hours_end   int,
  updated_at        timestamptz not null default now()
);

-- ---- D) push tokens (mobile-ready; schema from the mobile master plan) --------
create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  token         text not null unique,
  platform      text not null check (platform in ('ios','android','web')),
  is_valid      boolean not null default true,
  failure_count int not null default 0,
  device_info   jsonb not null default '{}'::jsonb,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_push_tokens_profile on public.push_tokens (profile_id) where is_valid;

-- =============================================================================
-- End of 008_notifications_support_audit.sql
-- =============================================================================
