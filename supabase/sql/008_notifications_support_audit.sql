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
-- question_reports : user-filed "Report a problem" tickets against ONE question
-- (migration 115). Structurally the support_requests pattern — uuid pk, nullable
-- profile FK with ON DELETE SET NULL, status enum, message text, created/updated
-- — plus the context an admin needs to reproduce the complaint.
--
-- The client sends only question_id, message and two enum-constrained hints
-- (locale, platform). Reporter, status, package and attempt context are ALL
-- derived by trg_question_report_derive (011), which is also where the
-- authoritative 5/hour + 20/day throttle lives; the mobile app inserts through
-- PostgREST directly, so an app-tier limiter would have covered the web only.
-- -----------------------------------------------------------------------------
create table if not exists public.question_reports (
  id                  uuid primary key default gen_random_uuid(),
  question_id         uuid not null references public.questions (id) on delete cascade,
  -- Attempt context, kept only when it survives verification in the BEFORE
  -- INSERT trigger. Nullable so a future non-attempt surface still works.
  attempt_id          uuid references public.test_attempts (id) on delete set null,
  attempt_kind        text check (attempt_kind in ('test','practice','daily','olympiad')),
  -- SNAPSHOT of questions.olympiad_package_id at report time. Denormalised on
  -- purpose: a pool question can later be archived or re-homed, and the admin
  -- still has to know which package the child was sitting in.
  -- NO inline FK: the canonical run order is 001-012,014,015,016,013, so
  -- public.olympiad_packages does not exist yet. 015 adds the constraint.
  olympiad_package_id uuid,
  -- set null, not cascade (support_requests precedent): deleting a child must
  -- not erase a still-valid report about a broken question.
  reporter_profile_id uuid references public.profiles (id) on delete set null,
  message             text not null,
  -- The locale the reporter was READING. Most reports are about a specific
  -- rendering ("the English text is wrong"), so an az-only row is useless.
  locale              public.content_locale not null,
  platform            public.report_platform not null,
  app_version         text,
  status              public.question_report_status not null default 'new',
  admin_note          text,
  handled_by          uuid references public.profiles (id) on delete set null,
  handled_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_question_reports_message
    check (char_length(message) between 1 and 1000),
  constraint chk_question_reports_app_version
    check (app_version is null or app_version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  constraint chk_question_reports_admin_note
    check (admin_note is null or char_length(admin_note) <= 2000)
);

comment on table public.question_reports is
  'User-filed reports against a question. Every context column is derived '
  'server-side by trg_question_report_derive; the client supplies only the '
  'message plus two enum-constrained diagnostic hints (locale, platform).';

comment on column public.question_reports.locale is
  'CLIENT-SUPPLIED diagnostic: the UI language the reporter was reading. The '
  'database cannot observe it. Enum-constrained, never an authorization input. '
  'The web server action hardcodes it from its own getLocale() cookie '
  'resolution; a mobile client self-reports.';

comment on column public.question_reports.platform is
  'CLIENT-SUPPLIED diagnostic (see locale). A tampered client could claim the '
  'wrong platform; the consequence is a mislabelled admin row, nothing more.';

comment on column public.question_reports.olympiad_package_id is
  'Snapshot of questions.olympiad_package_id at report time, not a live join: '
  'a pool question can later be archived or moved, and test_attempts carries no '
  'package column, so the question row is the only source at insert time.';

-- -----------------------------------------------------------------------------
-- bug_reports : PLATFORM-scoped defect reports filed from the contact/help area
-- (migration 116). The structural sibling of question_reports above, and a
-- deliberately separate feature: that one says "this question is wrong" and is
-- bound to one question row; this one says "this page/flow is broken" and
-- carries the prose an engineer needs to reproduce it.
--
-- Unlike question_reports it references only public.profiles (created in 002),
-- so every FK can be inline here — no deferred constraint in a later file.
--
-- The client sends prose plus four diagnostics (severity claim, route, locale,
-- platform). Reporter, role, contact email, status, priority and both stamps
-- are ALL derived by trg_bug_report_derive (011), which is also where the
-- authoritative throttle lives, so a direct PostgREST insert is exactly as
-- constrained as the submit_bug_report RPC.
-- -----------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id                      uuid primary key default gen_random_uuid(),

  -- ---- what the reporter wrote (frozen after insert) ----------------------
  title                   text not null,
  description             text not null,
  steps_to_reproduce      text,
  expected_behavior       text,
  actual_behavior         text,
  -- The reporter's SEVERITY CLAIM. Deliberately NOT named `priority`: a
  -- reporter-set priority makes the admin worklist sort useless within a week
  -- (everything becomes 'critical'). This is evidence; `priority` below is
  -- triage, and only an administrator moves it.
  reported_severity       public.bug_report_priority not null default 'normal',

  -- ---- who (all derived server-side; never from the payload) --------------
  -- set null, not cascade (support_requests / question_reports precedent):
  -- deleting an account must not erase a still-valid bug report.
  reporter_profile_id     uuid references public.profiles (id) on delete set null,
  reporter_role           public.report_reporter_role not null default 'anonymous',
  reporter_email          citext,
  -- true  = copied from profiles.email for a resolved session (trustworthy)
  -- false = typed into the public form by an unauthenticated visitor
  reporter_email_verified boolean not null default false,

  -- ---- environment (client-declared diagnostics, never authorization) -----
  -- PATH ONLY. The query string and the fragment are stripped before this
  -- column is written: /auth/callback?code=... and #access_token=... are
  -- exactly where credentials live, and a bug report must never capture one.
  route_path              text,
  user_agent              text,
  locale                  public.content_locale not null,
  platform                public.report_platform not null,
  app_version             text,

  -- ---- triage (the ONLY mutable columns) ----------------------------------
  status                  public.bug_report_status   not null default 'new',
  priority                public.bug_report_priority not null default 'normal',
  admin_note              text,
  handled_by              uuid references public.profiles (id) on delete set null,
  handled_at              timestamptz,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Dedupe key for uq_bug_reports_open_per_reporter (011). md5/lower/btrim are
  -- all IMMUTABLE, so this is a legal STORED generated column. Generated
  -- columns are computed AFTER BEFORE triggers, so it hashes the trimmed text
  -- the derive trigger actually stored.
  content_hash text generated always as
    (md5(lower(btrim(title)) || '|' || lower(btrim(description)))) stored,

  constraint chk_bug_reports_title
    check (char_length(title) between 3 and 160),
  constraint chk_bug_reports_description
    check (char_length(description) between 10 and 4000),
  constraint chk_bug_reports_steps
    check (steps_to_reproduce is null or char_length(steps_to_reproduce) <= 2000),
  constraint chk_bug_reports_expected
    check (expected_behavior is null or char_length(expected_behavior) <= 1000),
  constraint chk_bug_reports_actual
    check (actual_behavior is null or char_length(actual_behavior) <= 1000),
  constraint chk_bug_reports_admin_note
    check (admin_note is null or char_length(admin_note) <= 2000),
  -- A root-relative path with no whitespace and no control bytes. The app-tier
  -- gate is isSafeRelativeUrl(); this is the LAST word, so a direct insert that
  -- never passed through the app is bound by the same rule.
  constraint chk_bug_reports_route
    check (route_path is null or route_path ~ '^/[^[:space:][:cntrl:]]{0,499}$'),
  constraint chk_bug_reports_user_agent
    check (user_agent is null or char_length(user_agent) <= 300),
  constraint chk_bug_reports_app_version
    check (app_version is null or app_version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  constraint chk_bug_reports_email
    check (reporter_email is null
           or (char_length(reporter_email) <= 254
               and reporter_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
);

-- DELIBERATELY ABSENT: any CHECK coupling reporter_role / reporter_email_verified
-- to reporter_profile_id. The FK is ON DELETE SET NULL, so deleting a parent
-- (migration 098 cascades to their children) issues an UPDATE that nulls the
-- column while the role stays 'parent' — a cross-column CHECK would make that
-- DELETE fail and BLOCK ACCOUNT DELETION. The rule is enforced in the BEFORE
-- INSERT trigger instead, where it is true at write time and cannot fight a
-- referential action.

comment on table public.bug_reports is
  'Platform-scoped defect reports filed from the contact/help area (web + '
  'mobile). Distinct from question_reports, which is bound to one question. '
  'Reporter, role, contact email, status, priority and both stamps are derived '
  'server-side by trg_bug_report_derive; the client supplies prose plus four '
  'enum-constrained or shape-checked diagnostics.';

comment on column public.bug_reports.route_path is
  'PATH ONLY — the query string and the fragment are stripped by '
  'trg_bug_report_derive BEFORE the row is written. /auth/callback?code=... and '
  '#access_token=... are exactly the shapes that would turn a bug report into a '
  'credential leak. Rendered as TEXT in the admin panel, never as a link.';

comment on column public.bug_reports.user_agent is
  'Read server-side from the request header, never a form field — but still '
  'attacker-controlled: any client may send any string. Control characters are '
  'flattened to spaces and the value is capped at 300 chars.';

comment on column public.bug_reports.locale is
  'CLIENT-SUPPLIED diagnostic: the UI language the reporter was reading. The '
  'database cannot observe it. Enum-constrained, never an authorization input. '
  'The web server action hardcodes it from its own getLocale() cookie '
  'resolution; a mobile client self-reports.';

comment on column public.bug_reports.platform is
  'CLIENT-SUPPLIED diagnostic (see locale). A tampered client could claim the '
  'wrong platform; the consequence is a mislabelled admin row, nothing more.';

comment on column public.bug_reports.reported_severity is
  'The REPORTER''s severity claim, frozen after insert. Never the triage value: '
  'a reporter-set priority makes the admin worklist sort useless within a week. '
  'public.bug_reports.priority is the administrator''s, and starts at normal.';

comment on column public.bug_reports.reporter_email_verified is
  'true = copied from profiles.email for a resolved session; false = typed into '
  'the public form by an unauthenticated visitor. The admin detail view labels '
  'the address "unverified" on false — it is a contact hint, never an identity.';

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
