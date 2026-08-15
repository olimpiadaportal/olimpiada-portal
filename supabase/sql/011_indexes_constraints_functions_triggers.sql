-- =============================================================================
-- 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 011 of 013.
--
-- Responsibility : Performance indexes, deferred cross-file foreign keys,
--                  updated_at maintenance, and the audit-logging trigger
--                  foundation.
-- Run order      : After 010 (all tables/policies exist). Before 012.
-- Safe to rerun  : Yes. CREATE INDEX IF NOT EXISTS; constraints use
--                  DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (idempotent,
--                  non-data-destructive); CREATE OR REPLACE FUNCTION; triggers
--                  use DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- NOTE: The security/permission helper functions (is_admin, has_permission, ...)
-- live in 002 because 010 needs them. This file adds only the trigger/utility
-- functions and the forward FKs that could not be created earlier without
-- breaking numeric run order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Deferred cross-file foreign keys (targets created in later-numbered files).
-- -----------------------------------------------------------------------------
-- students.* -> taxonomy (003)
alter table public.students drop constraint if exists fk_students_grade;
alter table public.students add constraint fk_students_grade
  foreign key (grade_id) references public.grades (id) on delete set null;

alter table public.students drop constraint if exists fk_students_school;
alter table public.students add constraint fk_students_school
  foreign key (school_id) references public.schools (id) on delete set null;

alter table public.students drop constraint if exists fk_students_district;
alter table public.students add constraint fk_students_district
  foreign key (district_id) references public.districts (id) on delete set null;

-- Round 21: the intra-city district (rayon) stored on the child profile
-- (guard-enforced to match the school's rayon; leaderboard fallback).
alter table public.students drop constraint if exists fk_students_city_district;
alter table public.students add constraint fk_students_city_district
  foreign key (city_district_id) references public.city_districts (id) on delete set null;
create index if not exists idx_students_city_district on public.students (city_district_id);

-- profile / content media -> media_assets (008)
alter table public.profiles drop constraint if exists fk_profiles_avatar_media;
alter table public.profiles add constraint fk_profiles_avatar_media
  foreign key (avatar_media_id) references public.media_assets (id) on delete set null;

alter table public.question_translations drop constraint if exists fk_qtrans_media;
alter table public.question_translations add constraint fk_qtrans_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

alter table public.question_explanations drop constraint if exists fk_qexpl_media;
alter table public.question_explanations add constraint fk_qexpl_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

-- Migration 102: the ANSWER-OPTION image. Same ON DELETE SET NULL as the
-- question figure above — deleting an asset blanks the link, it must never
-- cascade away a live answer option.
alter table public.answer_option_translations drop constraint if exists fk_aotrans_media;
alter table public.answer_option_translations add constraint fk_aotrans_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;
-- Partial: only a minority of options ever carry an image.
create index if not exists idx_aotrans_media
  on public.answer_option_translations (media_asset_id)
  where media_asset_id is not null;

-- wallpapers (003) -> media_assets (008) for the image-kind catalog entries.
alter table public.wallpapers drop constraint if exists fk_wallpapers_media;
alter table public.wallpapers add constraint fk_wallpapers_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

-- sticker_images (003) -> media_assets (008) + sticker_themes.created_by ->
-- profiles (Round 11, migration 026). Guarded by RELATION-PAIR existence (not
-- constraint name): migration 026 created these inline on dev with the default
-- names, and a name-keyed drop+add here would produce a DUPLICATE FK — the
-- exact PGRST201 embed-ambiguity bug fixed in Round 9 (check #30 class).
do $$ begin
  if not exists (select 1 from pg_constraint
                  where contype = 'f'
                    and conrelid = 'public.sticker_images'::regclass
                    and confrelid = 'public.media_assets'::regclass) then
    alter table public.sticker_images add constraint fk_sticker_images_media
      foreign key (media_asset_id) references public.media_assets (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint
                  where contype = 'f'
                    and conrelid = 'public.sticker_themes'::regclass
                    and confrelid = 'public.profiles'::regclass) then
    alter table public.sticker_themes add constraint fk_sticker_themes_created_by
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Indexes (foreign-key lookups, status filters, search).
-- -----------------------------------------------------------------------------
create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profile_roles_role on public.profile_roles (role_id);
create index if not exists idx_role_permissions_perm on public.role_permissions (permission_id);

create index if not exists idx_students_grade on public.students (grade_id);
create index if not exists idx_students_school on public.students (school_id);
create index if not exists idx_students_created_by_parent on public.students (created_by_parent_profile_id);
create index if not exists idx_psl_student on public.parent_student_links (student_profile_id);
create index if not exists idx_psl_parent_status on public.parent_student_links (parent_profile_id, status);

create index if not exists idx_schools_district on public.schools (district_id);
create index if not exists idx_topics_subject_grade on public.topics (subject_id, grade_id);
create index if not exists idx_subtopics_topic on public.subtopics (topic_id);

create index if not exists idx_questions_status on public.questions (status);
create index if not exists idx_questions_subject on public.questions (subject_id);
create index if not exists idx_questions_grade on public.questions (grade_id);
create index if not exists idx_questions_topic on public.questions (topic_id);
create index if not exists idx_questions_created_by on public.questions (created_by);
create index if not exists idx_questions_primary_locale on public.questions (primary_locale);
-- Audit M23 (migration 035): the admin list's type/subtopic filters need index
-- support. The companion (olympiad_package_id, created_at desc) index lives in
-- 015 — questions.olympiad_package_id is added there (FKs olympiad_packages).
create index if not exists idx_questions_type on public.questions (type_id);
create index if not exists idx_questions_subtopic on public.questions (subtopic_id);
-- School-term filter (migration 054): daily-round pool + admin review lists.
create index if not exists idx_questions_term on public.questions (term);
-- trigram search over localized question bodies (pg_trgm from 001).
create index if not exists idx_qtrans_body_trgm
  on public.question_translations using gin (body gin_trgm_ops);

create index if not exists idx_answer_options_question on public.answer_options (question_id);
create index if not exists idx_tests_status on public.tests (status);
create index if not exists idx_test_questions_question on public.test_questions (question_id);

create index if not exists idx_attempts_student on public.test_attempts (student_profile_id);
create index if not exists idx_attempts_test on public.test_attempts (test_id);
create index if not exists idx_attempts_status on public.test_attempts (status);
-- Practice/daily attempts filtered by subject (Stage 13 test engine).
create index if not exists idx_test_attempts_subject on public.test_attempts (subject_id);
create index if not exists idx_answers_attempt on public.test_attempt_answers (attempt_id);
-- Round 21: delete-guard lookups + review joins.
create index if not exists idx_answers_question on public.test_attempt_answers (question_id);
-- Timed topic tests (migration 037): one open test per child + expiry sweep.
create unique index if not exists uq_test_attempts_open_test
  on public.test_attempts (student_profile_id)
  where kind = 'test' and status = 'in_progress';
create index if not exists idx_test_attempts_deadline
  on public.test_attempts (deadline_at)
  where status = 'in_progress';

create index if not exists idx_snap_student_period on public.progress_snapshots (student_profile_id, period);

create index if not exists idx_lb_entries_period on public.leaderboard_entries (period_id);
create index if not exists idx_lb_entries_student on public.leaderboard_entries (student_profile_id);
-- NULL-safe uniqueness for leaderboard entries (scope_id is NULL for 'global').
create unique index if not exists uq_leaderboard_entry_scope
  on public.leaderboard_entries
  (period_id, student_profile_id, scope_type,
   coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_subs_owner on public.subscriptions (owner_profile_id);
create index if not exists idx_subs_student on public.subscriptions (student_profile_id);
create index if not exists idx_subs_status on public.subscriptions (status);
create index if not exists idx_payments_profile on public.payments (profile_id);
create index if not exists idx_payments_status on public.payments (status);

-- Child-based subscriptions / subject pricing / checkout (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
create index if not exists idx_child_subs_student on public.child_subscriptions (student_profile_id);
create index if not exists idx_child_subs_owner on public.child_subscriptions (owner_parent_profile_id);
create index if not exists idx_child_subs_status on public.child_subscriptions (status);
-- Audit C2 (migration 035): at most ONE live subscription per child, enforced
-- by the DB (create_child_subscription also guards + advisory-locks per family).
create unique index if not exists uq_child_subscriptions_live
  on public.child_subscriptions (student_profile_id)
  where status in ('trialing', 'active', 'past_due');
create index if not exists idx_sub_subjects_subject on public.subscription_subjects (subject_id);
-- Migration 109: each subject owns its own period, so the access gates and the
-- expiry scan both look up (subscription, period end); next_renewal_at is the
-- MIN over those, scanned only for live plans.
create index if not exists idx_sub_subjects_period
  on public.subscription_subjects (child_subscription_id, current_period_end);
create index if not exists idx_child_subs_next_renewal
  on public.child_subscriptions (next_renewal_at)
  where status in ('trialing', 'active', 'past_due');
create index if not exists idx_checkout_owner on public.checkout_sessions (owner_parent_profile_id);
create index if not exists idx_sibling_discounts_owner on public.sibling_discounts (owner_parent_profile_id);

create index if not exists idx_notifications_recipient on public.notifications (recipient_profile_id, read_at);
create index if not exists idx_support_profile_status on public.support_requests (profile_id, status);
create index if not exists idx_media_owner on public.media_assets (owner_profile_id);

create index if not exists idx_audit_actor on public.audit_logs (actor_profile_id);
create index if not exists idx_audit_action on public.audit_logs (action);
create index if not exists idx_audit_created on public.audit_logs (created_at);

-- -----------------------------------------------------------------------------
-- updated_at maintenance function + triggers.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','permissions','parents','students','parent_student_links',
    'districts','city_districts','schools','grades','subjects','topics','subtopics',
    'question_types','difficulty_levels','olympiad_types','sources',
    'questions','question_translations','answer_options','answer_option_translations',
    'question_explanations','tests',
    'test_attempts','test_attempt_answers','progress_snapshots',
    'leaderboard_periods','leaderboard_entries',
    'achievements','question_analytics',
    'subscription_plans','subscriptions','payments','coupons',
    'notification_templates','notification_deliveries','support_requests',
    'admin_actions','content_reviews','media_assets','system_settings','feature_flags'
  ]
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Audit logging foundation.
-- A generic SECURITY DEFINER trigger writes append-only rows into audit_logs
-- (bypassing RLS, which is intended). Attached to the most sensitive tables as
-- a foundation; more actions are added in later feature stages.
-- -----------------------------------------------------------------------------
create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target uuid;
begin
  v_actor := public.current_profile_id();
  v_target := case
                when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
                else (to_jsonb(new) ->> 'id')::uuid
              end;

  insert into public.audit_logs(
    actor_profile_id, action, target_table, target_id,
    before_json, after_json, severity, success)
  values (
    v_actor,
    lower(tg_op) || ':' || tg_table_name,
    tg_table_name,
    v_target,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    'info',
    true
  );

  return case when tg_op = 'DELETE' then old else new end;
exception
  when others then
    -- Auditing must never break the underlying business transaction.
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Attach audit triggers to sensitive tables (role assignment, links, money).
drop trigger if exists trg_audit_profile_roles on public.profile_roles;
create trigger trg_audit_profile_roles
  after insert or delete on public.profile_roles
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_parent_student_links on public.parent_student_links;
create trigger trg_audit_parent_student_links
  after insert or update or delete on public.parent_student_links
  for each row execute function public.fn_audit_row();

-- Money trail (migration 073): INSERT+UPDATE so NEW subscription/payment rows
-- are captured, not just status transitions.
drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after insert or update on public.subscriptions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments
  after insert or update on public.payments
  for each row execute function public.fn_audit_row();

-- Content actions (create/edit/archive/publish/etc.) — backported from
-- migrations/2026_06_27_003_content_audit_triggers.sql.
drop trigger if exists trg_audit_questions on public.questions;
create trigger trg_audit_questions
  after insert or update or delete on public.questions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_tests on public.tests;
create trigger trg_audit_tests
  after insert or update or delete on public.tests
  for each row execute function public.fn_audit_row();

-- Round-28 audit coverage (migration 073): money trail, accounts, credentials
-- and config get full before/after rows. child_credentials holds NO secret
-- material (password lives in Supabase Auth). Tables keyed on key/profile_id
-- get a null target_id; their contents still land in before_json/after_json.
drop trigger if exists trg_audit_checkout_sessions on public.checkout_sessions;
create trigger trg_audit_checkout_sessions
  after insert or update on public.checkout_sessions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update or delete on public.profiles
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_child_credentials on public.child_credentials;
create trigger trg_audit_child_credentials
  after insert or update on public.child_credentials
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_system_settings on public.system_settings;
create trigger trg_audit_system_settings
  after update on public.system_settings
  for each row execute function public.fn_audit_row();

-- feature_flags: reconciles a dev-only drifted trigger into canonical.
drop trigger if exists trg_audit_feature_flags on public.feature_flags;
create trigger trg_audit_feature_flags
  after insert or update or delete on public.feature_flags
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_subjects_pricing on public.subjects_pricing;
create trigger trg_audit_subjects_pricing
  after insert or update on public.subjects_pricing
  for each row execute function public.fn_audit_row();

-- -----------------------------------------------------------------------------
-- Child account business-logic functions & triggers (Stage 7).
-- -----------------------------------------------------------------------------
-- 8-digit child ID generator: random, collision-safe, server-side. Inserts into
-- the child_unique_ids registry (002) under uniqueness and retries on collision,
-- then stamps students.child_unique_id. SECURITY DEFINER so it can write the
-- RLS-protected registry; never trust a client-provided ID. Idempotent for an
-- already-allocated child (audit M26) and service-role only (audit H1 — this was
-- the one DEFINER RPC without an explicit revoke, so 010's default privileges
-- made it anon/authenticated-executable).
create or replace function public.allocate_child_unique_id(p_student_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  tries int := 0;
begin
  -- Idempotent: a child that already holds a registry row keeps its ID.
  select child_unique_id into v_id
  from public.child_unique_ids
  where student_profile_id = p_student_profile_id;
  if v_id is not null then
    update public.students set child_unique_id = v_id
     where profile_id = p_student_profile_id
       and child_unique_id is distinct from v_id;
    return v_id;
  end if;

  loop
    tries := tries + 1;
    -- 10000000..99999999 (no leading zero), ~90M space.
    v_id := (10000000 + floor(random() * 90000000))::bigint::text;
    begin
      insert into public.child_unique_ids (child_unique_id, student_profile_id)
      values (v_id, p_student_profile_id);
      update public.students set child_unique_id = v_id where profile_id = p_student_profile_id;
      return v_id;
    exception when unique_violation then
      if tries > 50 then
        raise exception 'Could not allocate a unique child ID after 50 attempts';
      end if;
      -- random-ID collision: loop and retry
    end;
  end loop;
end;
$$;

revoke all on function public.allocate_child_unique_id(uuid) from public, anon, authenticated;
grant execute on function public.allocate_child_unique_id(uuid) to service_role;

-- updated_at triggers for the child-account tables (not in the bulk array above).
drop trigger if exists trg_set_updated_at on public.child_credentials;
create trigger trg_set_updated_at before update on public.child_credentials
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.wallpapers;
create trigger trg_set_updated_at before update on public.wallpapers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.sticker_themes;
create trigger trg_set_updated_at before update on public.sticker_themes
  for each row execute function public.set_updated_at();
-- site_content (Round 12, migration 031): keep updated_at fresh on edits.
drop trigger if exists trg_set_updated_at on public.site_content;
create trigger trg_set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();
-- free_access_intervals (Round 12, migration 033).
drop trigger if exists trg_set_updated_at on public.free_access_intervals;
create trigger trg_set_updated_at before update on public.free_access_intervals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- MOBILE CONTROL PLANE (Stage M1, migration 045): mobile_app_versions triggers +
-- the two anon-callable whitelist readers the mobile app boots against.
-- feature_flags / system_settings / site_content are admin-RLS-locked, so these
-- SECURITY DEFINER functions are the ONLY public read path (never `select *`).
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.mobile_app_versions;
create trigger trg_set_updated_at before update on public.mobile_app_versions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_mobile_app_versions on public.mobile_app_versions;
create trigger trg_audit_mobile_app_versions
  after insert or update or delete on public.mobile_app_versions
  for each row execute function public.fn_audit_row();

-- get_mobile_config(): one JSON of everything the app gates itself with. The
-- payment MODE is resolved here with web paymentMode.ts parity: missing
-- `payments` flag -> real (legacy), missing demo/giveaway -> off; the giveaway
-- window expires LAZILY (flag alone is never enough); precedence
-- giveaway(active) > demo > real > off.
create or replace function public.get_mobile_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags        jsonb;
  v_real         boolean;
  v_demo         boolean;
  v_gvw_flag     boolean;
  v_gvw_days     int := 0;
  v_gvw_start    timestamptz;
  v_gvw_end      timestamptz;
  v_gvw_active   boolean := false;
  v_mode         text;
  v_maint_on     boolean := false;
  v_maint_msg    jsonb := jsonb_build_object('az','','en','','ru','');
  v_locales      jsonb := jsonb_build_array('az','en','ru');
  v_default_loc  text := 'az';
  v_setting      jsonb;
  v_version      jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments','demo_payments','giveaway_period','news_public',
                'olympiad_module','leaderboard','notifications',
                'notifications_push','launch_promo');
  v_flags    := coalesce(v_flags, '{}'::jsonb);
  -- Round 51 (migration 091): missing flag row = OFF for the money gate too
  -- (fail closed; matches current_payment_mode and the web resolver).
  v_real     := coalesce((v_flags->>'payments')::boolean, false);
  v_demo     := coalesce((v_flags->>'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags->>'giveaway_period')::boolean, false);

  select value_json into v_setting from public.system_settings where key = 'giveaway.duration_days';
  if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
    v_gvw_days := greatest(0, floor((v_setting)::text::numeric)::int);
  end if;
  select value_json into v_setting from public.system_settings where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;
  if v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_end    := v_gvw_start + make_interval(days => v_gvw_days);
    v_gvw_active := now() < v_gvw_end;
  end if;
  v_mode := case
    when v_gvw_active then 'giveaway'
    when v_demo       then 'demo'
    when v_real       then 'real'
    else 'off'
  end;

  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_mode';
  if v_setting is not null and jsonb_typeof(v_setting) = 'boolean' then
    v_maint_on := (v_setting)::text::boolean;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_message';
  if v_setting is not null and jsonb_typeof(v_setting) = 'object' then
    v_maint_msg := jsonb_build_object(
      'az', coalesce(v_setting->>'az',''),
      'en', coalesce(v_setting->>'en',''),
      'ru', coalesce(v_setting->>'ru',''));
  end if;

  select value_json into v_setting from public.system_settings where key = 'platform.supported_locales';
  if v_setting is not null and jsonb_typeof(v_setting) = 'array' and jsonb_array_length(v_setting) > 0 then
    v_locales := v_setting;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.default_locale';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    v_default_loc := trim(v_setting->>0);
  end if;

  select jsonb_object_agg(platform, jsonb_build_object(
           'min',       min_version,
           'latest',    latest_version,
           'force',     force_update,
           'store_url', store_url,
           'message',   jsonb_build_object('az', message_az, 'en', message_en, 'ru', message_ru)))
    into v_version
  from public.mobile_app_versions;

  return jsonb_build_object(
    'payment', jsonb_build_object(
        'mode', v_mode,
        'giveaway_ends_at', case when v_gvw_active then to_jsonb(v_gvw_end) else 'null'::jsonb end),
    'flags', jsonb_build_object(
        'news_public',        coalesce((v_flags->>'news_public')::boolean, false),
        'olympiad_module',    coalesce((v_flags->>'olympiad_module')::boolean, false),
        'leaderboard',        coalesce((v_flags->>'leaderboard')::boolean, false),
        'notifications',      coalesce((v_flags->>'notifications')::boolean, false),
        'notifications_push', coalesce((v_flags->>'notifications_push')::boolean, false),
        'launch_promo',       coalesce((v_flags->>'launch_promo')::boolean, false)),
    'maintenance', jsonb_build_object('on', v_maint_on, 'message', v_maint_msg),
    'locales', jsonb_build_object('supported', v_locales, 'default', v_default_loc),
    'contact', jsonb_build_object(
        'email',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_email'), ''),
        'phone',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_phone'), ''),
        -- Migration 070: admin-configured WhatsApp line (empty = hidden in UIs).
        'whatsapp', coalesce((select value_json->>0 from public.system_settings where key='contact.support_whatsapp'), ''),
        -- Migration 072: admin-editable support/office address (contact page).
        'address',  coalesce((select value_json->>0 from public.system_settings where key='contact.support_address'), ''),
        -- Migration 075: precise map query/coordinates (empty = derive from address).
        'map_query', coalesce((select value_json->>0 from public.system_settings where key='contact.support_map_query'), '')),
    'social', jsonb_build_object(
        'facebook',  coalesce((select value_json->>0 from public.system_settings where key='social.facebook'), ''),
        'instagram', coalesce((select value_json->>0 from public.system_settings where key='social.instagram'), ''),
        'youtube',   coalesce((select value_json->>0 from public.system_settings where key='social.youtube'), ''),
        'tiktok',    coalesce((select value_json->>0 from public.system_settings where key='social.tiktok'), '')),
    -- Migration 097: admin-owned privacy-policy metadata. The compiled-in
    -- constants in {web-app,mobile-app}/src/lib/privacyPolicy.ts stay as the
    -- FALLBACK so an offline phone still renders a coherent page; a non-empty
    -- value here wins.
    'privacy', jsonb_build_object(
        'effective_date',          coalesce((select value_json->>0 from public.system_settings where key='privacy.effective_date'), ''),
        'last_updated',            coalesce((select value_json->>0 from public.system_settings where key='privacy.last_updated'), ''),
        'website_url',             coalesce((select value_json->>0 from public.system_settings where key='privacy.website_url'), ''),
        'contact_email',           coalesce((select value_json->>0 from public.system_settings where key='privacy.contact_email'), ''),
        'hosting_region',          coalesce((select value_json->>0 from public.system_settings where key='privacy.hosting_region'), ''),
        'server_log_retention',    coalesce((select value_json->>0 from public.system_settings where key='privacy.server_log_retention'), ''),
        'learning_data_retention', coalesce((select value_json->>0 from public.system_settings where key='privacy.learning_data_retention'), ''),
        'backup_retention',        coalesce((select value_json->>0 from public.system_settings where key='privacy.backup_retention'), ''),
        -- DERIVED, never stored: both already have exactly one canonical switch
        -- in this database, and a second free-typed admin copy could only ever
        -- contradict it. 'real' only — demo/giveaway move no money and touch no
        -- card data, so §8 must keep describing payments in the future tense.
        'push_live',               coalesce((v_flags->>'notifications_push')::boolean, false),
        'payments_live',           (v_mode = 'real')),
    'version', coalesce(v_version, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- get_mobile_content(locale): the site_content override map for ONE locale so
-- the admin "Website Content" CMS reaches the mobile app with zero releases
-- (web getT()/I18nProvider parity). Empty values are fallbacks and are omitted;
-- rows are registry-allowlisted at write time; a hard cap bounds the payload.
create or replace function public.get_mobile_content(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(s.key, s.val), '{}'::jsonb)
  from (
    select key,
           case when p_locale = 'en' then en
                when p_locale = 'ru' then ru
                else az
           end as val
    from public.site_content
    order by key
    limit 500
  ) s
  where length(s.val) > 0;
$$;
revoke all on function public.get_mobile_content(text) from public;
grant execute on function public.get_mobile_content(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Character Sticker guard triggers (Round 11, migration 026; threshold raised
-- 5 -> 6 in migration 028): a theme may be ENABLED only with >= 6 images; an
-- enabled theme may not drop below 6. The child layer shows EXACTLY 6 unique
-- stickers (3 per side), so 6 distinct images are guaranteed. Business
-- invariants live in the DB, not only the admin UI.
-- -----------------------------------------------------------------------------
create or replace function public.fn_sticker_theme_enable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if new.is_enabled and not coalesce(old.is_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = new.id;
    if v_count < 6 then
      raise exception 'sticker theme needs at least 6 images to be enabled (has %)', v_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sticker_theme_enable_guard on public.sticker_themes;
create trigger trg_sticker_theme_enable_guard
  before update of is_enabled on public.sticker_themes
  for each row execute function public.fn_sticker_theme_enable_guard();

create or replace function public.fn_sticker_image_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_enabled boolean; v_count int;
begin
  select is_enabled into v_enabled from public.sticker_themes where id = old.theme_id;
  if coalesce(v_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = old.theme_id;
    if v_count - 1 < 6 then
      raise exception 'an enabled sticker theme must keep at least 6 images — disable the theme first'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_sticker_image_delete_guard on public.sticker_images;
create trigger trg_sticker_image_delete_guard
  before delete on public.sticker_images
  for each row execute function public.fn_sticker_image_delete_guard();

-- -----------------------------------------------------------------------------
-- Child-based subscriptions / subject pricing (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
-- updated_at triggers (not in the bulk array above) + child-subscription audit.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.subjects_pricing;
create trigger trg_set_updated_at before update on public.subjects_pricing
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.child_subscriptions;
create trigger trg_set_updated_at before update on public.child_subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.launch_promo_config;
create trigger trg_set_updated_at before update on public.launch_promo_config
  for each row execute function public.set_updated_at();

-- Audit subscription/payment status changes (money table).
-- Migration 073: INSERT+UPDATE+DELETE so a new child subscription is captured.
drop trigger if exists trg_audit_child_subscriptions on public.child_subscriptions;
create trigger trg_audit_child_subscriptions
  after insert or update or delete on public.child_subscriptions
  for each row execute function public.fn_audit_row();

-- Migration 109 — per-subject billing periods. child_subscriptions no longer
-- carries the billing dates itself: current_period_end is the MAX of the
-- subjects' period ends (coverage ends), next_renewal_at is the MIN (next
-- charge) and base/discount/total_amount are the NEXT invoice. This trigger is
-- their SINGLE writer; an RPC that also assigned them would drift from it
-- inside one release, which is the failure 013 check 92 recomputes against.
-- (The REVOKE/GRANT for this function lives with the other subscription-engine
-- grants further down, after 010's blanket grants.)
create or replace function public.fn_sync_subscription_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub  uuid;
  v_max  timestamptz;
  v_min  timestamptz;
  v_base numeric(12,2);
  v_pct  numeric(5,2);
begin
  -- OLD is UNASSIGNED (not null) during an INSERT, so reading it there raises
  -- "record old is not assigned yet" — branch on TG_OP rather than coalescing.
  if tg_op = 'DELETE' then
    v_sub := old.child_subscription_id;
  else
    v_sub := new.child_subscription_id;
  end if;
  if v_sub is null then return null; end if;

  select sibling_discount_percent into v_pct
  from public.child_subscriptions where id = v_sub;
  -- The parent row is gone (cascade delete): nothing to reconcile.
  if not found then return null; end if;

  select max(ss.current_period_end),
         min(ss.current_period_end) filter (where ss.remove_at is null)
    into v_max, v_min
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub;

  -- The NEXT invoice = the subjects whose cycle ends first. A NULL period end
  -- (legacy row that still inherits) falls into the group so the amount never
  -- silently drops a paid subject.
  select coalesce(sum(ss.price_amount), 0) into v_base
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub
    and ss.remove_at is null
    and (v_min is null or ss.current_period_end is not distinct from v_min);

  update public.child_subscriptions cs
     set current_period_end = coalesce(v_max, cs.current_period_end),
         next_renewal_at    = v_min,
         base_amount        = v_base,
         discount_amount    = round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         total_amount       = v_base - round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         updated_at         = now()
   where cs.id = v_sub;

  return null;
end;
$$;

comment on function public.fn_sync_subscription_period() is
  'Migration 109: derives child_subscriptions.current_period_end (MAX = coverage ends), next_renewal_at (MIN = next charge) and base/discount/total_amount (the NEXT invoice) from the per-subject rows. THE ONLY WRITER of those five columns — coalesce keeps a legacy row''s stored period when every subject period is still NULL, so the trigger can never blank a row.';

drop trigger if exists trg_sync_subscription_period on public.subscription_subjects;
create trigger trg_sync_subscription_period
  after insert or update or delete on public.subscription_subjects
  for each row
  execute function public.fn_sync_subscription_period();

-- -----------------------------------------------------------------------------
-- Child authentication & account model (Stage 8, increment 1).
-- Backported from migrations/2026_06_28_008_child_account_provisioning.sql.
-- Placed AFTER allocate_child_unique_id() (create_child_account calls it) and at
-- the END of the file so the table-privilege REVOKEs below run AFTER 010's blanket
-- grants — otherwise the write-revoke for `authenticated` would be re-granted.
-- -----------------------------------------------------------------------------

-- Lookup index for the lockout window (child_unique_id + recent attempts).
create index if not exists idx_child_login_attempts_lookup
  on public.child_login_attempts (child_unique_id, attempted_at desc);

-- -----------------------------------------------------------------------------
-- student_district_guard (Round 21) : keeps students.city_district_id honest.
-- Auto-fills the rayon from the school when missing; rejects a rayon outside the
-- child's city; rejects a rayon that contradicts the school's rayon. (The
-- "required when the city has rayons" rule lives in create_child_account so
-- legacy rows never break.) NB: districts = the CITIES table (historic naming).
-- -----------------------------------------------------------------------------
create or replace function public.student_district_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rayon_city  uuid;
  v_school_rayon uuid;
begin
  -- Auto-fill from the school when the rayon was not provided.
  if new.city_district_id is null and new.school_id is not null then
    select sc.city_district_id into new.city_district_id
      from public.schools sc where sc.id = new.school_id;
  end if;

  if new.city_district_id is not null then
    select cd.city_id into v_rayon_city
      from public.city_districts cd where cd.id = new.city_district_id;
    if v_rayon_city is null then
      raise exception 'student: district % does not exist', new.city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    -- Rayon must belong to the child's city (when a city is set).
    if new.district_id is not null and v_rayon_city <> new.district_id then
      raise exception 'student: district % is not in city %', new.city_district_id, new.district_id
        using errcode = 'check_violation';
    end if;
    -- Rayon must match the school's rayon (when the school has one).
    if new.school_id is not null then
      select sc.city_district_id into v_school_rayon
        from public.schools sc where sc.id = new.school_id;
      if v_school_rayon is not null and v_school_rayon <> new.city_district_id then
        raise exception 'student: district % contradicts the school''s district', new.city_district_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_district_guard on public.students;
create trigger trg_student_district_guard
  before insert or update of city_district_id, school_id, district_id on public.students
  for each row execute function public.student_district_guard();

-- create_child_account : atomic, server-side child provisioning WITHOUT a login ID.
-- The Auth user (p_auth_user_id) is created first by the service layer; the
-- on_auth_user_created trigger has already inserted a base profiles row. This
-- function promotes that profile to an active child, creates the student row
-- (optional structured p_grade_id + p_district_id/p_city_district_id/p_school_id —
-- the intra-city rayon is REQUIRED when the city has active rayons, Round 21),
-- assigns the Student role, records the credential mapping with a NULL
-- child_unique_id, and auto-links
-- the child to the creating parent — all in one txn. The 8-digit ID is DEFERRED: it
-- is allocated later by create_child_subscription once a plan is chosen (Batch H).
-- access_status stays 'inactive' until then. The structured city(district)/school
-- params are OPTIONAL at the DB layer (the app enforces mandatory); FK targets are
-- validated when provided, but a null is never an error. SECURITY DEFINER; EXECUTE
-- restricted to service_role.
-- (drop first: the parameter list / signature changed across versions)
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null,
  p_grade_id          uuid default null,
  p_district_id       uuid default null,
  p_school_id         uuid default null,
  p_city_district_id  uuid default null
)
-- OUT column names are deliberately non-colliding with table columns (else plpgsql
-- raises "ambiguous column reference" inside the body).
returns table (new_student_profile_id uuid, new_child_unique_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id      uuid;
  v_student_role_id uuid;
begin
  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- Validate the optional structured grade.
  if p_grade_id is not null
     and not exists (select 1 from public.grades g where g.id = p_grade_id) then
    raise exception 'create_child_account: grade % does not exist', p_grade_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate the optional structured city (district). OPTIONAL: no raise on null.
  if p_district_id is not null
     and not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'create_child_account: city (district) % does not exist', p_district_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Round 21: the intra-city district (rayon). REQUIRED when the chosen city has
  -- active rayons; must belong to that city. (The students trigger additionally
  -- enforces school-rayon consistency and auto-fills from the school.)
  if p_district_id is not null and p_city_district_id is null
     and exists (select 1 from public.city_districts cd
                  where cd.city_id = p_district_id and cd.status = 'active') then
    raise exception 'create_child_account: district is required for city %', p_district_id
      using errcode = 'check_violation',
            hint    = 'district_required';
  end if;
  if p_city_district_id is not null then
    if not exists (select 1 from public.city_districts cd where cd.id = p_city_district_id) then
      raise exception 'create_child_account: district % does not exist', p_city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.city_districts cd
                        where cd.id = p_city_district_id and cd.city_id = p_district_id) then
      raise exception 'create_child_account: district % is not in city %', p_city_district_id, p_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Validate the optional structured school, and (when both given) that the
  -- school belongs to the chosen city. OPTIONAL: no raise on null.
  if p_school_id is not null then
    if not exists (select 1 from public.schools sc where sc.id = p_school_id) then
      raise exception 'create_child_account: school % does not exist', p_school_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.schools sc
                        where sc.id = p_school_id and sc.district_id = p_district_id) then
      raise exception 'create_child_account: school % is not in city %', p_school_id, p_district_id
        using errcode = 'check_violation';
    end if;
    -- Round 21: the school must belong to the chosen rayon (when it has one).
    if p_city_district_id is not null
       and exists (select 1 from public.schools sc
                    where sc.id = p_school_id
                      and sc.city_district_id is not null
                      and sc.city_district_id <> p_city_district_id) then
      raise exception 'create_child_account: school % is not in district %', p_school_id, p_city_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row WITHOUT a login ID (no paid access yet).
  --    child_unique_id stays NULL until a plan is chosen (subscribe step).
  --    Structured district_id/city_district_id/school_id are stored alongside the
  --    free-text city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, city_district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_city_district_id, p_school_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 4) Record the credential mapping with a NULL ID (backfilled on allocation).
  --    Password lives ONLY in Supabase Auth (never stored here).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, null, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- The login ID is NULL until a plan is chosen (create_child_subscription).
  return query select v_profile_id, null::text;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning WITHOUT a login ID (allocated later on subscribe). Optional structured grade/city(district)/school stored on students; the intra-city district (rayon) is REQUIRED when the city has active rayons (Round 21). service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.
revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- advance_student_grades : yearly grade promotion (intended Sept 1 via pg_cron).
-- For every non-graduated student with a grade_id: level < 11 -> next grade level;
-- level = 11 -> graduated = true (grade_id kept as last grade attended). Returns
-- jsonb {promoted, graduated}. SECURITY DEFINER; service_role EXECUTE only.
--
-- INTENDED SCHEDULE (run once a year on Sep 1). If pg_cron is enabled (it is NOT
-- assumed here), schedule it with:
--   select cron.schedule(
--     'advance-student-grades-sept-1',
--     '0 3 1 9 *',                          -- 03:00 on Sep 1, every year
--     $$ select public.advance_student_grades(); $$
--   );
-- -----------------------------------------------------------------------------
create or replace function public.advance_student_grades()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promoted  int := 0;
  v_graduated int := 0;
begin
  -- Promote students below grade 11 to the next grade level.
  with promotable as (
    select s.profile_id, g_next.id as next_grade_id
    from public.students s
    join public.grades g_cur  on g_cur.id = s.grade_id
    join public.grades g_next on g_next.level = g_cur.level + 1
    where s.graduated = false
      and s.grade_id is not null
      and g_cur.level < 11
  ),
  upd as (
    update public.students s
       set grade_id   = p.next_grade_id,
           updated_at = now()
      from promotable p
     where s.profile_id = p.profile_id
    returning 1
  )
  select count(*) into v_promoted from upd;

  -- Graduate students currently in grade 11 (keep grade_id as the last grade).
  with grads as (
    update public.students s
       set graduated  = true,
           updated_at = now()
      from public.grades g_cur
     where g_cur.id = s.grade_id
       and s.graduated = false
       and s.grade_id is not null
       and g_cur.level = 11
    returning 1
  )
  select count(*) into v_graduated from grads;

  return jsonb_build_object('promoted', v_promoted, 'graduated', v_graduated);
end;
$$;

comment on function public.advance_student_grades() is
  'Yearly grade promotion (intended Sept 1 via pg_cron). Promotes non-graduated students level<11 to next grade; marks level-11 students graduated. Returns jsonb {promoted, graduated}. service_role EXECUTE only.';

revoke all on function public.advance_student_grades() from public, anon, authenticated;
grant execute on function public.advance_student_grades() to service_role;

-- True when a child ID has >= 8 failed attempts in the last 15 minutes.
create or replace function public.is_child_login_locked(p_child_unique_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) >= 8
  from public.child_login_attempts a
  where a.child_unique_id = p_child_unique_id
    and a.success = false
    and a.attempted_at > now() - interval '15 minutes'
$$;

-- Record a login attempt; a success clears the recent failure streak (resets window).
create or replace function public.record_child_login_attempt(
  p_child_unique_id text,
  p_ip_hash         text,
  p_success         boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.child_login_attempts (child_unique_id, ip_hash, success)
  values (p_child_unique_id, p_ip_hash, p_success);
  if p_success then
    delete from public.child_login_attempts
     where child_unique_id = p_child_unique_id
       and success = false
       and attempted_at > now() - interval '15 minutes';
  end if;
end;
$$;

-- Login helpers: service_role only (revoke anon/authenticated explicitly, as above).
revoke all on function public.is_child_login_locked(text) from public, anon, authenticated;
grant execute on function public.is_child_login_locked(text) to service_role;
revoke all on function public.record_child_login_attempt(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_child_login_attempt(text, text, boolean) to service_role;

-- child_login_attempts table privileges. MUST run here (after 010's blanket
-- grants) so the write-revoke for `authenticated` actually takes effect: writes
-- are service-role only; admins may READ (RLS in 010 limits rows to is_admin()).
revoke all on public.child_login_attempts from anon, authenticated;
grant select on public.child_login_attempts to authenticated;  -- RLS restricts rows to admins
grant all on public.child_login_attempts to service_role;
grant usage, select on sequence public.child_login_attempts_id_seq to service_role;

-- -----------------------------------------------------------------------------
-- Bulk question import (admin/content-manager) — Stage 6 increment.
-- Backported from migrations/2026_06_28_009_bulk_question_import.sql. Placed at
-- the END of this file so the question_imports table-privilege REVOKE below runs
-- AFTER 010's blanket grants — otherwise authenticated's write grant would remain.
-- (The question_imports table is created in 004; its RLS policy in 010.)
-- -----------------------------------------------------------------------------

-- Import-history lookup (importer's recent imports).
create index if not exists idx_question_imports_imported_by
  on public.question_imports (imported_by, created_at desc);

-- assert_question_type_rules (migration 037, MCQ-only launch): per-type structure
-- validation shared by BOTH bulk-import RPCs (the admin single-question form
-- applies the same rules app-side from question_types.status/options_required/
-- correct_required). MCQ (multiple_choice) = exactly 4 options, exactly 1 correct
-- (options count fixed since migration 040).
create or replace function public.assert_question_type_rules(
  p_type_id uuid,
  p_options jsonb
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_req         int;
  v_correct_req int;
  v_status      public.catalog_status;
  v_name        text;
  v_n           int;
  v_ncorrect    int;
begin
  select options_required, correct_required, status, name
    into v_req, v_correct_req, v_status, v_name
  from public.question_types where id = p_type_id;
  if not found then
    raise exception 'unknown question type';
  end if;
  if v_status <> 'active' then
    raise exception 'question type "%" is not enabled for new questions', v_name;
  end if;

  select count(*),
         count(*) filter (where coalesce((o->>'is_correct')::boolean, false))
    into v_n, v_ncorrect
  from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o;

  if v_req is not null and v_n <> v_req then
    raise exception 'type "%" requires exactly % answer options (got %)', v_name, v_req, v_n;
  end if;
  if v_req is null and (v_n < 2 or v_n > 10) then
    raise exception 'between 2 and 10 answer options required (got %)', v_n;
  end if;
  if v_correct_req is not null and v_ncorrect <> v_correct_req then
    raise exception 'type "%" requires exactly % correct option(s) (got %)', v_name, v_correct_req, v_ncorrect;
  end if;
  if v_correct_req is null and v_ncorrect < 1 then
    raise exception 'at least one correct option is required';
  end if;
end;
$$;

revoke all on function public.assert_question_type_rules(uuid, jsonb) from public, anon;
grant execute on function public.assert_question_type_rules(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ACADEMIC TERMS (migration 054): consistency triggers keep the topic →
-- subtopic/question term tree in sync (a subtopic's/question's term must equal
-- its topic's term when both are set; NULL inherits), plus the central
-- current-term helper. Columns live in 003/004; settings seeds in 012.
-- -----------------------------------------------------------------------------
-- Subtopics inherit/must match the parent topic's term.
create or replace function public.subtopic_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  select term into v_topic_term from public.topics where id = new.topic_id;
  if new.term is null then
    new.term := v_topic_term;            -- inherit on insert/update when omitted
  elsif v_topic_term is not null and new.term <> v_topic_term then
    raise exception 'subtopic: term must match the parent topic (%)', v_topic_term
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_subtopic_term_guard on public.subtopics;
create trigger trg_subtopic_term_guard
  before insert or update of term, topic_id on public.subtopics
  for each row execute function public.subtopic_term_guard();

-- Questions inherit/must match their topic's term; Round 39 (migration 084):
-- a general-bank question can never END UP termless (olympiad pool exempt).
create or replace function public.question_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  -- Migration 054: inherit the topic's term when omitted; a set term must
  -- match the topic's term (the tree stays consistent).
  if new.topic_id is not null then
    select term into v_topic_term from public.topics where id = new.topic_id;
    if new.term is null then
      new.term := v_topic_term;
    elsif v_topic_term is not null and new.term <> v_topic_term then
      raise exception 'question: term must match the topic (%)', v_topic_term
        using errcode = 'check_violation';
    end if;
  end if;
  -- Round 39: after inheritance, a GENERAL-bank question can never end up
  -- termless — no new bank question without a Rüb, and a term can never be
  -- stripped. Olympiad pool rows stay exempt (optional taxonomy by design);
  -- legacy NULL-term rows keep transitioning (this fires only on INSERT or
  -- UPDATE OF term/topic_id) until the review queue assigns their term.
  if new.olympiad_package_id is null and new.term is null then
    raise exception 'question: term (Rüb 1-4) is required for bank questions'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

comment on function public.question_term_guard() is
  'Term guard (054 + Round 39): inherit/match the topic''s term, AND a general-'
  'bank question can never be inserted termless or have its term stripped. '
  'Olympiad pool questions exempt; legacy NULL-term rows transition freely '
  'until reviewed.';

drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

-- Changing a TOPIC's term cascades to its subtopics and questions (keeps the
-- tree consistent; admin edits the topic once).
create or replace function public.topic_term_cascade()
returns trigger
language plpgsql
as $$
begin
  if new.term is distinct from old.term then
    update public.subtopics set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
    update public.questions set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_topic_term_cascade on public.topics;
create trigger trg_topic_term_cascade
  after update of term on public.topics
  for each row execute function public.topic_term_cascade();

-- Current-term helper used by daily-round generation + admin readiness checks.
-- Reads system_settings 'academic.current_term' (seeded in 012), clamped 1..4.
create or replace function public.current_academic_term()
returns smallint
language sql
stable
set search_path = public, pg_temp
as $$
  select least(greatest(coalesce(
           (select nullif(value_json #>> '{}', '')::int
              from public.system_settings where key = 'academic.current_term'), 1), 1), 4)::smallint;
$$;
revoke all on function public.current_academic_term() from public, anon;
grant execute on function public.current_academic_term() to authenticated, service_role;

-- Safety net (migration 059): NEW general-bank questions must carry topic +
-- subtopic (insert trigger; legacy rows untouched; term inherits via 054's guard).
create or replace function public.question_taxonomy_guard()
returns trigger
language plpgsql
as $$
begin
  if new.olympiad_package_id is null then
    if new.topic_id is null or new.subtopic_id is null then
      raise exception 'question: topic and subtopic are required'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_question_taxonomy_guard on public.questions;
create trigger trg_question_taxonomy_guard
  before insert on public.questions
  for each row execute function public.question_taxonomy_guard();

-- -----------------------------------------------------------------------------
-- question_delete_guard (Round 21) : test_attempt_answers.question_id is
-- ON DELETE CASCADE, so hard-deleting an answered question silently destroys
-- graded history (review rows vanish, max_score no longer matches). Block the
-- delete with a clear error — archive instead. BEFORE DELETE fires before the
-- FK cascade, so the history rows still exist for the check.
-- -----------------------------------------------------------------------------
create or replace function public.question_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.test_attempt_answers a where a.question_id = old.id) then
    raise exception 'question % has attempt history and cannot be deleted; archive it instead', old.id
      using errcode = 'check_violation',
            hint    = 'question_has_attempts';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_question_delete_guard on public.questions;
create trigger trg_question_delete_guard
  before delete on public.questions
  for each row execute function public.question_delete_guard();

-- -----------------------------------------------------------------------------
-- GUARDED DELETION — the subject half (migration 111).
--
-- Same family as question_delete_guard directly above, and for the same
-- reason: a delete the UI already offers destroys history nobody agreed to
-- lose. deleteRow() in admin-panel/src/lib/admin/actions.ts is a live,
-- registered, unguarded `delete from subjects`, and subscription_subjects
-- (CASCADE) makes that delete strip a PAID line item out of a live
-- subscription while topics (CASCADE) takes the whole curriculum tree.
--
-- All plpgsql, so the references to olympiad_packages below resolve at CALL
-- time and 011 may run before 015 — the precedent is
-- assert_olympiad_pool_meets_per_attempt further down this file. Never put a
-- `language sql` body that reads an olympiad table here; that one IS parsed
-- at CREATE time. The olympiad half lives in 015.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- purge_question_set : THE answered-question policy, in one place.
--
-- Splits a set of questions into "hard-delete" and "archive" and returns both
-- counts plus the media assets the delete orphaned. Every destructive path in
-- this migration goes through it, so the policy cannot drift between the
-- olympiad half and the subject half.
--
-- Why a split at all, instead of refusing the whole operation: a single attempt
-- anywhere in a 240-question pool would otherwise make that pool permanently
-- un-purgeable, leaving the admin 240 individual archive clicks — or a psql
-- session, which is precisely where the migration-095 catastrophe came from.
-- Archiving is the remedy CLAUDE.md prescribes, and an archived question is
-- already inert: start_olympiad_attempt and draw_daily_questions both draw
-- status = 'published' only, while test_attempt_answers and every review screen
-- stay intact.
-- -----------------------------------------------------------------------------
create or replace function public.purge_question_set(p_question_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidates uuid[] := '{}'::uuid[];   -- media referenced anywhere in the scope
  v_orphans    uuid[] := '{}'::uuid[];   -- …of those, the ones nothing references now
  v_del_ids    uuid[] := '{}'::uuid[];
  v_deleted    int := 0;
  v_archived   int := 0;
  v_retained   int := 0;
  v_already    int := 0;
  v_repaired   int := 0;
  v_truncated  boolean := false;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return jsonb_build_object(
      'deleted', 0, 'archived', 0, 'retained', 0, 'already_archived', 0,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb, 'media_truncated', false);
  end if;

  select count(*)::int into v_already
  from public.questions q
  where q.id = any(p_question_ids) and q.status = 'archived';

  -- Media ids referenced ANYWHERE in the scope, collected BEFORE the delete —
  -- the translation rows that carry them cascade away with the question. The
  -- set is deliberately over-collected; the post-delete filter below is what
  -- makes it exact, and it is exact for the archived SURVIVORS too: their
  -- translation rows are still there, so their images are never reported.
  select coalesce(array_agg(distinct s.m), '{}'::uuid[]) into v_candidates
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
     where qt.question_id = any(p_question_ids) and qt.media_asset_id is not null
    union
    select qe.media_asset_id
      from public.question_explanations qe
     where qe.question_id = any(p_question_ids) and qe.media_asset_id is not null
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
     where ao.question_id = any(p_question_ids) and aot.media_asset_id is not null
  ) s;

  -- DELETE FIRST, and re-derive "unanswered" INSIDE the statement. Carrying a
  -- classification computed a moment earlier (by the preview, or even by the
  -- select above) is the bug: a student can answer one of these questions in
  -- between, and trg_question_delete_guard would then abort the entire
  -- transaction after the admin already confirmed.
  with del as (
    delete from public.questions q
     where q.id = any(p_question_ids)
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    returning q.id
  )
  select coalesce(array_agg(del.id), '{}'::uuid[]) into v_del_ids from del;
  v_deleted := cardinality(v_del_ids);

  -- Everything that survived the DELETE is answered BY CONSTRUCTION, so this
  -- statement needs no predicate of its own and the split can never disagree
  -- with what the delete actually did. The reverse order (archive first) would
  -- leave a question that got answered in between published AND undeleted.
  update public.questions
     set status = 'archived', updated_at = now()
   where id = any(p_question_ids) and status <> 'archived';
  get diagnostics v_archived = row_count;

  -- Survivors, not "newly archived": a scope whose answered questions were
  -- ALREADY archived still leaves rows behind, and the caller's decision to
  -- archive the container instead of deleting it keys off this number.
  select count(*)::int into v_retained
  from public.questions q where q.id = any(p_question_ids);

  if v_deleted > 0 then
    -- daily_practice_sets.question_ids is a plain uuid[] with NO foreign key
    -- and, unlike daily_rounds, no content_snapshot — so a deleted question
    -- silently SHRINKS a student's locked replay instead of failing loudly.
    -- Deleting the row is the repair: start_daily_round_attempt regenerates the
    -- set on next open, so it is self-healing. test_attempts.question_ids is
    -- deliberately left alone — that is graded history.
    delete from public.daily_practice_sets where question_ids && v_del_ids;
    get diagnostics v_repaired = row_count;
  end if;

  -- Now that the delete has happened, "orphan" is decidable exactly: a
  -- candidate nothing references any more. This is also what keeps an archived
  -- question's image safe — its translation row still points at it.
  --
  -- ALL EIGHT media_assets consumers are listed, not just the question-shaped
  -- ones, and the list must STAY exhaustive: the caller hands this array
  -- straight to a Storage delete that removes the BYTES FIRST, and nothing
  -- stops one asset backing two features — so a missing consumer does not fail
  -- loudly, it sweeps a LIVE avatar, wallpaper, sticker or news cover out of
  -- the bucket. Seven of the eight FKs are ON DELETE SET NULL, so the row is
  -- then silently blanked; sticker_images is ON DELETE RESTRICT, which is no
  -- excuse to omit it — the bytes are already gone by the time that FK
  -- refuses, and it refuses the caller's whole batched media_assets delete
  -- with them.
  -- This exact omission already shipped once as a data-loss bug on the other
  -- side of the same coin: sweepAbandonedImportMedia in
  -- admin-panel/src/lib/admin/import-media.ts was missing
  -- answer_option_translations and deleted yesterday's option images. That
  -- file's `consumers` array and this WHERE clause are two spellings of one
  -- list; a column added to media_assets must be added to both.
  if cardinality(v_candidates) > 0 then
    select coalesce(array_agg(c.m), '{}'::uuid[]) into v_orphans
    from unnest(v_candidates) as c(m)
    where not exists (select 1 from public.question_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.question_explanations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.answer_option_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.profiles x
                       where x.avatar_media_id = c.m)
      and not exists (select 1 from public.wallpapers x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.sticker_images x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.news x
                       where x.cover_media_id = c.m)
      and not exists (select 1 from public.olympiad_packages x
                       where x.cover_media_id = c.m);
  end if;

  -- A stale object left in a bucket is a cost bug; aborting a purge the admin
  -- already confirmed because the id list got long would be a correctness bug.
  -- Cap, and say so, so the caller can report the leak instead of hiding it.
  if cardinality(v_orphans) > 2000 then
    v_orphans   := v_orphans[1:2000];
    v_truncated := true;
  end if;

  return jsonb_build_object(
    'deleted', v_deleted,
    'archived', v_archived,
    'retained', v_retained,
    'already_archived', v_already,
    'repaired_practice_sets', v_repaired,
    'orphaned_media_ids', to_jsonb(v_orphans),
    'media_truncated', v_truncated);
end;
$$;

comment on function public.purge_question_set(uuid[]) is
  'Service-internal (migration 111): hard-deletes the UNANSWERED questions of a '
  'set and ARCHIVES the rest, re-deriving the split inside the DELETE so it can '
  'never drift. Returns {deleted, archived, retained, already_archived, '
  'repaired_practice_sets, orphaned_media_ids, media_truncated}. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question. Reached only through the admin_* RPCs, never by a client.';
revoke all on function public.purge_question_set(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_question_set(uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- subject_deletion_blocks : the six reasons a subject may not be deleted,
-- evaluated together and returned as one array so the dialog can list every
-- reason at once instead of the admin fixing one, re-clicking, and hitting the
-- next. Shared by the preview, the RPC and the BEFORE DELETE trigger — three
-- copies of six subqueries would drift within a release.
--
-- NOT blocked, deliberately: daily_rounds and daily_practice_sets (both
-- CASCADE). Blocks 3 and 4 already fire for any round anyone actually played,
-- so all that remains is unplayed generated content — blocking on it would make
-- a freshly seeded, never used subject undeletable for no benefit. Both are
-- REPORTED by the preview instead.
-- -----------------------------------------------------------------------------
create or replace function public.subject_deletion_blocks(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  -- 1. ANY subscription_subjects row, in ANY state. subject_id is CASCADE, and
  --    a cancelled row is the receipt for money already taken — CASCADE
  --    destroys it exactly as thoroughly as it destroys a live one. Existence
  --    of the row is the only rule that cannot be reasoned into a mistake at
  --    2am. This is money; there is no override.
  select count(*)::int into n
  from public.subscription_subjects where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_subscriptions', 'count', n);
  end if;

  -- 2. Billing history. The FK is already RESTRICT so this blocks today — but
  --    with a bare 23503 carrying no hint, which the panel can only render as
  --    "server error". Converting it into a counted, named block is the point.
  select count(*)::int into n
  from public.subscription_changes where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_billing_history', 'count', n);
  end if;

  -- 3. Attempt history. test_attempts.subject_id is SET NULL, and the Round-36
  --    weighted percentage reads that column: a NULL there is a WRONG RANK, not
  --    missing data.
  select count(*)::int into n
  from public.test_attempts where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_attempts', 'count', n);
  end if;

  -- 4. Points ledger — same SET NULL argument, and the ledger is explicitly
  --    append-only.
  select count(*)::int into n
  from public.student_points_ledger where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_points', 'count', n);
  end if;

  -- 5. olympiad_packages.subject_id is SET NULL, and a subject-less package
  --    still sells: get_my_olympiad_catalog LEFT JOINs subjects, so a paying
  --    parent would be shown a nameless card. Purchased packages can never be
  --    deleted, so re-pointing or archiving them first is the only way to keep
  --    the catalog coherent.
  select count(*)::int into n
  from public.olympiad_packages where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_olympiad_packages', 'count', n);
  end if;

  -- 6. A round in flight. Redundant with block 3 for any subject that was ever
  --    played, but it carries a different sentence ("wait" rather than "never")
  --    and it is the block that closes most of the delete/answer race window in
  --    purge_question_set — it is also the ONLY one of the six that applies to
  --    admin_purge_subject_questions, which does not touch the subject row.
  select count(*)::int into n
  from public.test_attempts
  where subject_id = p_subject_id and status = 'in_progress';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  -- 7. THE CURRICULUM TREE. topics.subject_id is CASCADE and subtopics cascade
  --    from topics, so a subject that still owns a tree takes the whole tree
  --    with it — silently. Without this block the six history blocks above are
  --    all empty for a seeded-but-never-played subject, the guard PASSES, and
  --    one click removes every topic and subtopic while questions.topic_id
  --    (SET NULL) untags the general bank a second time. Delete the tree from
  --    the Curriculum Structure screen first, where each removal is its own
  --    confirmed, previewed step.
  select count(*)::int into n
  from public.topics where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_topics', 'count', n);
  end if;

  -- 8. THE GENERAL QUESTION BANK. questions.subject_id is SET NULL, so these
  --    rows are not destroyed but ORPHANED: every one silently loses the column
  --    that says what it teaches. Requiring the bank to be cleared FIRST (with
  --    admin_purge_subject_questions, which is itself confirmed and counted) is
  --    also what makes the outcome of a subject delete decidable BEFORE it
  --    runs — it is the block that stops admin_delete_subject destroying a bank
  --    on its way to reporting that it archived the subject instead.
  select count(*)::int into n
  from public.questions
  where subject_id = p_subject_id and olympiad_package_id is null;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_questions', 'count', n);
  end if;

  -- 9. An attempt reachable ONLY through a daily round. daily_rounds.subject_id
  --    is CASCADE while test_attempts.daily_round_id is RESTRICT, so an attempt
  --    whose own subject_id was already NULLed still pins the round: it passes
  --    blocks 1-8 and then aborts the delete with a bare 23503 that carries no
  --    hint — the generic "server error" this whole migration exists to remove.
  --    Counted here, it becomes a named reason the preview shows in advance.
  select count(*)::int into n
  from public.test_attempts ta
  join public.daily_rounds dr on dr.id = ta.daily_round_id
  where dr.subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_round_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.subject_deletion_blocks(uuid) is
  'Service-internal (migration 111): the reasons a subject may not be deleted, '
  'as a jsonb array of {hint, count}. Empty array = deletable. Blocks 1-6 are '
  'history (subscriptions, billing, attempts, points, olympiad packages, live '
  'attempts); blocks 7-9 are the structural ones that also fire for a '
  'never-played subject — topics, general-bank questions and attempts pinned to '
  'this subject''s daily rounds. Shared by admin_preview_subject_deletion, '
  'admin_delete_subject and trg_subject_delete_guard so the rule has exactly '
  'one definition.';
revoke all on function public.subject_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.subject_deletion_blocks(uuid) to service_role;

create or replace function public.subject_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
begin
  v_blocks := public.subject_deletion_blocks(old.id);
  if jsonb_array_length(v_blocks) > 0 then
    -- HINT is the single block's own hint when there is exactly one, so the
    -- common case gets a specific machine key; DETAIL always carries the whole
    -- blocks[] array, so the panel renders every reason from one code path.
    raise exception 'subject % cannot be deleted: % blocking reference(s)',
      old.id, jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;
  return old;
end;
$$;

comment on function public.subject_delete_guard() is
  'Migration 111: refuses to delete a subject that any subscription has ever '
  'covered, that carries billing/attempt/points history, that backs an olympiad '
  'package, or that STILL OWNS topics or general-bank questions — the last two '
  'are the ones that also fire for a seeded-but-never-played subject, which is '
  'the state a bare cascade would find. Exists because admin-panel deleteRow() '
  'is a live, registered, unguarded delete on this table — the RPC alone would '
  'not cover it. Errcode check_violation, HINT = the single block or '
  'subject_not_deletable, DETAIL = {"blocks":[{hint,count},…]}.';
drop trigger if exists trg_subject_delete_guard on public.subjects;
create trigger trg_subject_delete_guard
  before delete on public.subjects
  for each row execute function public.subject_delete_guard();

create or replace function public.admin_preview_subject_deletion(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_warn     jsonb := '[]'::jsonb;
  v_subs     int := 0;
  v_total    int; v_deletable int; v_answered int; v_archived int;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_subject_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.name, s.status into v_sub
  from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_preview_subject_deletion: subject not found'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);

  -- GENERAL BANK ONLY. Pool questions carry subject_id too, and they are never
  -- in scope: see admin_purge_subject_questions for why that clause is
  -- load-bearing rather than cosmetic.
  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  -- THE NUMBER THE PURGE DIALOG MUST SHOUT. admin_purge_subject_questions is
  -- deliberately NOT blocked by a live subscription: replacing a live subject's
  -- curriculum is its one legitimate use (the 2026-07-30 replacement did
  -- exactly that), and refusing it would leave a psql session as the only
  -- route — which is where the migration-095 catastrophe came from. But an
  -- emptied bank is not a content edit: draw_daily_questions can no longer
  -- assemble a full set, so start_daily_round_attempt raises no_data_found for
  -- EVERY one of these children until a replacement pool is published. The
  -- honest design is therefore to report it as loudly as possible, next to a
  -- confirmation token, rather than to pretend the operation is safe or to
  -- forbid the only supported way of doing it.
  --
  -- Counted per CHILD, not per subscription line: two lines for one child (a
  -- past_due row alongside a new trial) is one blocked student, and a number
  -- that double-counts is a number an admin stops trusting. remove_at rows are
  -- excluded — that subject is already scheduled to leave the basket.
  select count(distinct cs.student_profile_id)::int into v_subs
  from public.subscription_subjects ss
  join public.child_subscriptions cs on cs.id = ss.child_subscription_id
  where ss.subject_id = p_subject_id
    and ss.remove_at is null
    and cs.status in ('trialing', 'active', 'past_due');
  if v_subs > 0 then
    v_warn := v_warn || jsonb_build_object(
                'hint', 'subject_purge_active_subscribers', 'count', v_subs);
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocks) = 0,
    'subject', jsonb_build_object('id', v_sub.id, 'code', v_sub.code,
                                  'name', v_sub.name, 'status', v_sub.status),
    'blocked_by', v_blocks,
    -- Not blocks: consequences. Rendered by the SAME hint-to-sentence map the
    -- blocks use, so a new warning never falls through to "server error".
    'warnings', v_warn,
    'active_subscribers', v_subs,
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    'cascade', jsonb_build_object(
      'topics', (select count(*)::int from public.topics where subject_id = p_subject_id),
      'subtopics', (select count(*)::int from public.subtopics st
                     join public.topics t on t.id = st.topic_id
                    where t.subject_id = p_subject_id),
      'subjects_pricing', (select count(*)::int from public.subjects_pricing
                            where subject_id = p_subject_id),
      'subscription_subjects', (select count(*)::int from public.subscription_subjects
                                 where subject_id = p_subject_id),
      'daily_rounds', (select count(*)::int from public.daily_rounds
                        where subject_id = p_subject_id),
      'daily_practice_sets', (select count(*)::int from public.daily_practice_sets
                               where subject_id = p_subject_id)),
    'orphans', jsonb_build_object(
      'tests', (select count(*)::int from public.tests where subject_id = p_subject_id),
      'test_attempts', (select count(*)::int from public.test_attempts
                         where subject_id = p_subject_id),
      'student_points_ledger', (select count(*)::int from public.student_points_ledger
                                 where subject_id = p_subject_id),
      'progress_snapshots', (select count(*)::int from public.progress_snapshots
                              where subject_id = p_subject_id),
      'question_imports', (select count(*)::int from public.question_imports
                            where subject_id = p_subject_id),
      'olympiad_packages', (select count(*)::int from public.olympiad_packages
                             where subject_id = p_subject_id),
      -- Olympiad POOL questions tagged with this subject. Normally zero once
      -- the olympiad_packages block above is clear, but a pool question can
      -- outlive a re-pointed package; it is inert (olympiad draws read
      -- olympiad_package_id, never subject_id) and only loses the tag.
      'questions', (select count(*)::int from public.questions
                     where subject_id = p_subject_id
                       and olympiad_package_id is not null)),
    'history', jsonb_build_object(
      'subscription_changes', (select count(*)::int from public.subscription_changes
                                where subject_id = p_subject_id)));
end;
$$;

comment on function public.admin_preview_subject_deletion(uuid) is
  'Admin-only, side-effect free (migration 111): what deleting this subject '
  'would destroy — the nine blocked_by[] reasons, the general-bank question '
  'delete/archive split, the CASCADE row counts (topics, subtopics, pricing, '
  'subscription lines, daily rounds/practice sets) and the SET NULL orphan '
  'counts. Also serves the PURGE dialog: active_subscribers / warnings[] carry '
  'how many children are currently subscribed to this subject, because emptying '
  'its bank breaks their daily round without blocking anything. In practice '
  'only a mistyped, never-used subject is deletable.';
revoke all on function public.admin_preview_subject_deletion(uuid) from public, anon;
grant execute on function public.admin_preview_subject_deletion(uuid)
  to authenticated, service_role;

create or replace function public.admin_purge_subject_questions(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text;
  v_ids   uuid[];
  v_live  int;
  v_purge jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_purge_subject_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.code into v_code from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_purge_subject_questions: subject not found'
      using errcode = 'no_data_found';
  end if;

  -- THE SAME CONFIRMATION TOKEN THE CONTAINER DELETES DEMAND. This is the
  -- operation that destroys the most rows in the platform — a whole subject's
  -- question bank — and its only block is live_attempts, so an actively sold,
  -- actively played subject is squarely in scope by design (curriculum
  -- replacement is the reason it exists). It is also granted to
  -- `authenticated`, which makes it a PostgREST endpoint any admin session can
  -- POST directly with nothing but a subject id: the dialog is not a control,
  -- the token is. Checked before the scope is read so a wrong-tab mix-up fails
  -- on the cheap test; admin_preview_subject_deletion reports how many children
  -- are currently subscribed so the admin types it knowing the cost.
  if p_expected_code is null or p_expected_code <> v_code then
    raise exception 'admin_purge_subject_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- `olympiad_package_id is null` is LOAD-BEARING, not cosmetic: pool questions
  -- carry subject_id too, so without it "clear this subject's questions" would
  -- silently empty a PURCHASED olympiad pool — a back door around every
  -- olympiad guard in this migration. Topics and subtopics are untouched; the
  -- taxonomy tree is exactly what "without removing the subject" preserves.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress'
    and (ta.subject_id = p_subject_id or ta.question_ids && v_ids);
  if v_live > 0 then
    raise exception 'admin_purge_subject_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  v_purge := public.purge_question_set(v_ids);

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_purge_subject_questions(uuid, text) is
  'Admin-only (migration 111): clears a subject''s GENERAL-BANK questions '
  '(olympiad_package_id IS NULL) without touching the subject, its topics or '
  'its subtopics — unanswered deleted, answered ARCHIVED. p_expected_code must '
  'equal the subject code (confirmation_mismatch); the only BLOCK is '
  'live_attempts, because emptying a live subject''s bank is this function''s '
  'legitimate use (curriculum replacement) — the cost is reported by '
  'admin_preview_subject_deletion.active_subscribers, not refused. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question (they regenerate on next open). Returns the counts plus '
  'orphaned_media_ids for the Storage sweep.';
revoke all on function public.admin_purge_subject_questions(uuid, text) from public, anon;
grant execute on function public.admin_purge_subject_questions(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_delete_subject(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_answered int;
  v_purge    jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_subject: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.status into v_sub
  from public.subjects s where s.id = p_subject_id
  for update;
  if not found then
    raise exception 'admin_delete_subject: subject not found'
      using errcode = 'no_data_found';
  end if;

  if p_expected_code is null or p_expected_code <> v_sub.code then
    raise exception 'admin_delete_subject: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_subject: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DECIDE THE OUTCOME BEFORE DESTROYING ANYTHING. The earlier shape purged
  -- first and only then discovered that answered questions had survived, so it
  -- could report "subject archived" — a soft, reassuring word — AFTER the whole
  -- unanswered half of the bank had already been hard-deleted. The admin read
  -- the soft outcome and had in fact lost the bank. Block 8 makes a non-empty
  -- bank unreachable here anyway; this ordering is what makes that a belt
  -- rather than the only brace.
  select count(*)::int into v_answered
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null
    and exists (select 1 from public.test_attempt_answers a
                 where a.question_id = q.id);

  if v_answered > 0 then
    -- Same rule as packages: if anything answered survives, the CONTAINER is
    -- archived, not deleted — and NOTHING is purged on the way there. Deleting
    -- the subject would SET NULL those rows' subject_id, which is exactly the
    -- orphaning this function exists to prevent.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', 0,
      'archived_questions', 0,
      'retained_questions', v_answered,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb,
      'media_truncated', false);
  end if;

  -- Nothing answered is in scope, so the purge below can only hard-delete. It
  -- still runs, and it still passes the token on: block 8 normally leaves it an
  -- empty bank, but a question inserted between that check and this line must
  -- not be left pointing at a subject that no longer exists (SET NULL).
  v_purge := public.admin_purge_subject_questions(p_subject_id, p_expected_code);

  if (v_purge->>'retained_questions')::int > 0 then
    -- Reachable only through a race — a question answered between the count
    -- above and the purge. The purge archived it rather than deleting it, so
    -- the subject must be archived too: the alternative is SET NULL on an
    -- archived row, i.e. a question nobody can ever find again.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', (v_purge->>'deleted_questions')::int,
      'archived_questions', (v_purge->>'archived_questions')::int,
      'retained_questions', (v_purge->>'retained_questions')::int,
      'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
      'orphaned_media_ids', v_purge->'orphaned_media_ids',
      'media_truncated', (v_purge->>'media_truncated')::boolean);
  end if;

  -- Fires trg_subject_delete_guard, which re-evaluates the same nine blocks.
  -- It passes because the conditions still hold, never because anything was
  -- suppressed — and if a subscription or an attempt appeared in between, the
  -- guard aborts the transaction, which is the correct outcome.
  delete from public.subjects where id = p_subject_id;

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'subject_deleted', true,
    'subject_archived', false,
    'deleted_questions', (v_purge->>'deleted_questions')::int,
    'archived_questions', 0,
    'retained_questions', 0,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_subject(uuid, text) is
  'Admin-only (migration 111): deletes a subject that is already EMPTY — its '
  'topics and its general-bank questions must be gone first (blocks 7 and 8), '
  'so this can never destroy a curriculum tree or a question bank as a side '
  'effect of removing the container. Also blocked by any subscription line ever '
  'written, by billing/attempt/points history, by an olympiad package on the '
  'subject, by a live attempt and by an attempt pinned to one of its daily '
  'rounds — the net effect is that a subject which has ever been sold or played '
  'is permanently undeletable, and in practice only a mistyped, never-used '
  'subject can be removed. p_expected_code must equal the subject code. The '
  'archive-vs-delete outcome is decided BEFORE anything is purged; when '
  'answered questions survive, the SUBJECT IS ARCHIVED and the bank is left '
  'untouched.';
revoke all on function public.admin_delete_subject(uuid, text) from public, anon;
grant execute on function public.admin_delete_subject(uuid, text)
  to authenticated, service_role;

-- =============================================================================
-- THE TOKEN-LESS ARITY MUST NOT SURVIVE.
--
-- Unconditional, and BEFORE the create: a function whose signature gains a
-- parameter is a new OVERLOAD, not a replacement, and an overload that destroys
-- the same rows without a confirmation token is the bypass itself. Same
-- treatment migration 111 gave admin_delete_olympiad_grade_pool(uuid,uuid,bool).
-- =============================================================================
drop function if exists public.admin_delete_olympiad_questions(uuid, uuid[]);


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_questions : the ADMIN-FACING, package-SCOPED wrapper
-- around purge_question_set.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_questions(
  p_package_id      uuid,
  p_question_ids    uuid[],
  p_expected_code   text,
  p_refuse_answered boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_ids      uuid[] := '{}'::uuid[];
  v_gone     uuid[] := '{}'::uuid[];
  v_raw      int;
  v_foreign  int;
  v_missing  int;
  v_scope    jsonb := '[]'::jsonb;
  v_answered int;
  v_live     int;
  v_blocks   jsonb;
  v_purge    jsonb;
  v_rot      int := 0;
  v_demote   boolean := false;
begin
  -- ADMIN ONLY, AND FIRST. The grant to `authenticated` further down only makes
  -- the RPC reachable from the signed-in admin's own session; this is the gate.
  -- Olympiad pools are an Admin-only module (CLAUDE.md: Content Managers must
  -- not manage the Olympiad Preparation module), so holding content.delete is
  -- deliberately not enough.
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  v_raw := cardinality(coalesce(p_question_ids, '{}'::uuid[]));
  if v_raw = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- 500 is questions_per_attempt's own ceiling, so it is the largest selection
  -- any single attempt could ever be about. Checked on the RAW array, before any
  -- work is done on it: this is a PostgREST endpoint, and an unbounded id list
  -- would let one POST hold a lock while it unnests a million rows.
  if v_raw > 500 then
    raise exception 'admin_delete_olympiad_questions: % ids requested, the limit is 500', v_raw
      using errcode = 'check_violation',
            hint    = 'too_many_questions',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'too_many_questions', 'count', v_raw)),
                        'limit', 500)::text;
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[]) into v_ids
  from unnest(p_question_ids) as u(id)
  where u.id is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package, and pins the
  -- status this function may later demote.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_questions: package not found'
      using errcode = 'no_data_found';
  end if;

  -- THE CONFIRMATION TOKEN, compared HERE and under the lock taken above — the
  -- same control admin_delete_olympiad_grade_pool, admin_delete_olympiad_package
  -- and admin_purge_subject_questions all take. The reason is theirs verbatim:
  -- this function is granted to `authenticated`, which makes it a PostgREST
  -- endpoint any admin session can POST directly, with up to 500 questions of
  -- blast radius. A checkbox in a dialog is not a control; a value the DATABASE
  -- re-checks is. Compared before the ids are looked at so a wrong-tab mix-up
  -- fails on the cheap test.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- THE SCOPE CHECK — the reason this function exists at all.
  --
  -- SECURITY DEFINER is load-bearing here: `questions` is RLS-protected, and an
  -- id that passed only because the row was HIDDEN from the caller would be the
  -- opposite of a scope check.
  --
  -- ALL-OR-NOTHING on purpose. Skipping the strangers and purging the rest would
  -- report a number the admin cannot reconcile with the boxes they ticked, and
  -- would quietly normalise a client that sends ids from another package.
  --
  -- The two failures are COUNTED SEPARATELY because they are different
  -- accidents with different remedies. An id in another package means the client
  -- sent something it should not have — a selection bug worth hunting. An id
  -- that resolves to nothing means the row went away between the dialog opening
  -- and the click, usually because a second admin got there first — nothing is
  -- wrong with the selection, the page is simply stale. Reporting the second as
  -- the first sends the admin looking for a bug that does not exist.
  select count(*)::int into v_foreign
  from unnest(v_ids) as u(id)
  where exists (select 1 from public.questions q
                 where q.id = u.id
                   and q.olympiad_package_id is distinct from p_package_id);
  select count(*)::int into v_missing
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);
  if v_foreign > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_not_in_package',
                                             'count', v_foreign);
  end if;
  if v_missing > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_gone',
                                             'count', v_missing);
  end if;
  if jsonb_array_length(v_scope) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % of % selected id(s) are not in package %, % no longer exist',
      v_foreign, cardinality(v_ids), p_package_id, v_missing
      using errcode = 'check_violation',
            hint    = case when v_foreign > 0
                           then 'question_not_in_package' else 'question_gone' end,
            detail  = jsonb_build_object('blocks', v_scope)::text;
  end if;

  -- The per-row button's one behavioural difference (see the header): a question
  -- with answer history is REFUSED with the shipped "archive it instead"
  -- sentence rather than silently archived. The bulk path never sets this — for
  -- a 40-row selection, refusing the whole call because one row was answered is
  -- exactly the dead end purge_question_set's split exists to avoid.
  if coalesce(p_refuse_answered, false) then
    select count(distinct a.question_id)::int into v_answered
    from public.test_attempt_answers a
    where a.question_id = any(v_ids);
    if v_answered > 0 then
      raise exception 'admin_delete_olympiad_questions: % answered question(s)', v_answered
        using errcode = 'check_violation',
              hint    = 'question_has_attempts',
              detail  = jsonb_build_object(
                          'blocks', jsonb_build_array(
                            jsonb_build_object('hint', 'question_has_attempts',
                                               'count', v_answered)))::text;
    end if;
  end if;

  -- An attempt in flight over the SELECTION. Narrower than the package-wide
  -- block in olympiad_package_deletion_blocks, and narrow is right here: this is
  -- a content edit an admin may need while other grades are being played. It is
  -- still the mitigation for the one real race — an answer row can only appear
  -- through a submit RPC on an in-progress attempt, so a selection no live
  -- attempt is drawing from cannot change classification underneath the purge.
  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_ids;
  if v_live > 0 then
    raise exception 'admin_delete_olympiad_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  -- THE PURCHASE RULE. Delegated whole, for the reason spelled out in the file
  -- header: a second, hand-written copy of "what counts as a purchase" here is
  -- exactly how this operation came to bypass the one migration 111 already
  -- enforced. Every blocked grade travels in DETAIL with its own counts, so the
  -- refusal names the grade instead of being a bare "not allowed".
  v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % purchased grade pool(s) would fall below one attempt',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = 'grade_purchased_pool_below_attempt',
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DELEGATED, never re-implemented: unanswered rows go, answered rows are
  -- archived, and the split is re-derived inside the statement that removes
  -- them. A second copy of that policy here is the drift migration 111 factored
  -- this helper out to prevent.
  v_purge := public.purge_question_set(v_ids);

  -- Which of the selection actually went. purge_question_set reports COUNTS, not
  -- ids, and the survivors are the archived ones — so "gone" is decidable
  -- exactly, and only, by asking which ids no longer resolve.
  select coalesce(array_agg(u.id), '{}'::uuid[]) into v_gone
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);

  -- olympiad_question_rotations.seen_question_ids would keep naming rows that no
  -- longer exist, which makes a re-uploaded pool look partly consumed to that
  -- student and can hand them a short attempt. The row is pure cache, so
  -- resetting it is free — and only the students whose cycle actually touched a
  -- removed id are reset, unlike the grade-pool path which empties the pool
  -- wholesale and can drop every rotation for the grade.
  if cardinality(v_gone) > 0 then
    delete from public.olympiad_question_rotations
     where olympiad_package_id = p_package_id
       and seen_question_ids && v_gone;
    get diagnostics v_rot = row_count;
  end if;

  -- Same auto-demotion admin_delete_olympiad_grade_pool performs, and for the
  -- same reason: leaving an ACTIVE package whose pool can no longer fill an
  -- attempt means the next child to open it gets a runtime failure at attempt
  -- start instead of a closed listing. It stays reachable even with the purchase
  -- rule above, because a grade nobody bought can still be emptied.
  if v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not: the
      -- guard returns early for any row whose new.status is not 'active'. That
      -- early return is what the whole demotion rests on — do not "simplify" it
      -- by suppressing the trigger.
    end if;
  end if;

  -- `deleted` / `archived` are purge_question_set's own spelling, and
  -- `orphaned_media_ids` is the key afterOlympiadDestructiveCall() in
  -- admin-panel/src/lib/admin/olympiad.ts already sweeps from Storage. A second
  -- name for the same array would be two things to keep in step, so there is
  -- exactly one.
  return jsonb_build_object(
    'package_id', p_package_id,
    'requested', cardinality(v_ids),
    'deleted', (v_purge->>'deleted')::int,
    'archived', (v_purge->>'archived')::int,
    'retained', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'reset_rotations', v_rot,
    'package_demoted', v_demote,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean) is
  'Admin-only (migration 112): purges a SELECTION of questions inside ONE '
  'olympiad package — unanswered deleted, answered ARCHIVED, delegated to '
  'purge_question_set so the policy has one definition. Exists to be the SCOPE '
  'CHECK that purge_question_set (service_role-only, bare uuid[]) cannot '
  'perform: is_admin() first, at most 500 ids, p_expected_code must equal the '
  'package code (confirmation_mismatch), and the WHOLE call is refused if any id '
  'is outside the package (question_not_in_package) or no longer exists '
  '(question_gone) — partial silent skipping would hide a wrong selection. Also '
  'refuses while an olympiad attempt is drawing from the selection '
  '(live_attempts) and when a PURCHASED grade''s published pool would be left '
  'unable to fill one attempt (grade_purchased_pool_below_attempt, via '
  'olympiad_pool_purchase_blocks — the per-selection form of the rule '
  'olympiad_grade_pool_blocks applies to a whole pool). p_refuse_answered is the '
  'per-row button''s variant: refuse (question_has_attempts) instead of '
  'archiving. Resets the rotation rows that named a removed question and demotes '
  'an ACTIVE package whose pool can no longer fill an attempt. Returns '
  '{requested, deleted, archived, retained, already_archived, '
  'repaired_practice_sets, reset_rotations, package_demoted, orphaned_media_ids, '
  'media_truncated}.';


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_pool_question : the panel's ONE-question Delete button.
--
-- A thin wrapper, on purpose. Before migration 112 that button was a bare
-- `.delete()` from the panel, which is why it never answered to the purchase
-- rule; giving it its own guarded body would have made a second copy of every
-- rule above, so it makes none — it resolves the package's own code and calls
-- the function above with a single id.
--
-- It takes no token of its own and does not need one. The token exists to bound
-- the blast radius of a direct POST at a 500-id endpoint; this call names ONE
-- row, that row is proved to be inside the named package before anything
-- happens, and the purchase rule is evaluated exactly for a single-row delete.
-- Looping it cannot walk a purchased pool below one attempt: every individual
-- call is a separate statement and each one is checked against the pool as it
-- stands at that moment.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_pool_question(
  p_package_id  uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_pool_question: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.code into v_code
  from public.olympiad_packages p where p.id = p_package_id;
  if not found then
    raise exception 'admin_delete_olympiad_pool_question: package not found'
      using errcode = 'no_data_found';
  end if;

  return public.admin_delete_olympiad_questions(
           p_package_id, array[p_question_id], v_code, true);
end;
$$;

comment on function public.admin_delete_olympiad_pool_question(uuid, uuid) is
  'Admin-only (migration 112): deletes ONE olympiad pool question through '
  'admin_delete_olympiad_questions, so the per-row button answers to the same '
  'scope, live-attempt and PURCHASED-POOL rules as the bulk one instead of '
  'being the bypass around them. Refuses a question with answer history '
  '(question_has_attempts) rather than archiving it, which is the shipped '
  'per-row behaviour. No confirmation token: it names a single row inside a '
  'package it verifies, which is what the token bounds elsewhere.';


-- =============================================================================
-- GRANTS — exactly like the migration-111 admin RPCs.
--
-- The panel calls these as the SIGNED-IN ADMIN's SSR client, not as
-- service_role, so `authenticated` is required and public.is_admin() inside the
-- functions is the real gate. purge_question_set and the two blocks helpers stay
-- service_role-only; nothing here relaxes them, and the verify block below fails
-- this file if anything did.
-- =============================================================================

revoke all on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  from public, anon;
grant execute on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  to authenticated, service_role;

revoke all on function public.admin_delete_olympiad_pool_question(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_olympiad_pool_question(uuid, uuid)
  to authenticated, service_role;

-- bulk_insert_questions (v3, migration 059) : atomic, per-item fault-tolerant
-- batch insert across the normalized trilingual question tables. Resolves
-- taxonomy by code/level/name and auto-creates missing topics/subtopics/sources.
-- Each item runs in its own subtransaction (BEGIN..EXCEPTION): a bad item is
-- skipped + reported, good items persist. Returns {total, successful, failed,
-- errors[]}. Since Round 20: meta.type is OPTIONAL (defaults single_choice),
-- meta.topic/meta.subtopic/meta.term (1..4) are REQUIRED, and an optional
-- meta.media_asset_id links the primary locale's pre-uploaded question image.
--
-- Item shape (JSON):
-- {
--   "primary_locale": "az",
--   "meta": { "subject","grade_level","topic","subtopic","term",
--             "type"?, "olympiad_type"?, "source"?, "media_asset_id"? },
--   "translations": { "az": {"body","prompt"?,"explanation"?}, "en"?: {...}, "ru"?: {...} },
--   "options": [ { "is_correct": true, "order_index"?: 0, "text": {"az": "...","en"?:"...","ru"?:"..."} } ]
-- }
create or replace function public.bulk_insert_questions(
  p_questions jsonb,
  p_filename  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_term     smallint; v_topic_term smallint;
  v_media    uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
  if v_profile is null or not (public.is_admin() or public.has_permission('content.create')) then
    raise exception 'bulk_insert_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_questions: payload must be a JSON array';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      -- ---- required base taxonomy ----
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      -- type is optional since Round 20 — the platform is MCQ (single_choice).
      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      -- Per-type structure rules (five options, exactly one correct — 055).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- ---- REQUIRED term (Rüb) ----
      v_term := nullif(v_item->'meta'->>'term','')::smallint;
      if v_term is null or v_term not between 1 and 4 then
        raise exception 'term (1..4) is required';
      end if;

      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- ---- REQUIRED topic + subtopic (exam scope) ----
      if coalesce(v_item->'meta'->>'topic','') = '' then
        raise exception 'topic is required';
      end if;
      if coalesce(v_item->'meta'->>'subtopic','') = '' then
        raise exception 'subtopic is required';
      end if;

      select id, term into v_topic, v_topic_term from public.topics
        where subject_id = v_subject and name = (v_item->'meta'->>'topic')
          and scope = 'exam' limit 1;
      if v_topic is null then
        insert into public.topics (subject_id, grade_id, name, scope, term)
        values (v_subject, v_grade, v_item->'meta'->>'topic', 'exam', v_term)
        returning id into v_topic;
      elsif v_topic_term is null then
        -- explicit admin declaration upgrades a legacy (unreviewed) topic; the
        -- 054 cascade rolls the term onto its subtopics/questions.
        update public.topics set term = v_term, updated_at = now() where id = v_topic;
      elsif v_topic_term <> v_term then
        raise exception 'term % conflicts with topic "%" (term %)',
          v_term, v_item->'meta'->>'topic', v_topic_term;
      end if;

      select id into v_subtopic from public.subtopics
        where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
      if v_subtopic is null then
        insert into public.subtopics (topic_id, name, term)
        values (v_topic, v_item->'meta'->>'subtopic', v_term) returning id into v_subtopic;
      end if;

      -- ---- optional pre-uploaded question image ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      -- ---- primary locale + required body ----
      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, term, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'in_review', v_pl::public.content_locale, v_term, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''),
                  case when v_loc = v_pl then v_media end);
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  insert into public.question_imports (imported_by, filename, subject_id, total, successful, failed, errors)
  values (v_profile, p_filename,
          (select id from public.subjects where name = (p_questions->0->'meta'->>'subject')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_questions(jsonb, text) is
  'Bulk question import v3 (Round 20): topic+subtopic+term REQUIRED, type optional '
  '(defaults single_choice, 5 options), optional pre-uploaded question image; exam-'
  'scoped taxonomy resolve-or-create; per-item fault tolerance. content.create gated.';

-- EXECUTE: authenticated content authors + service_role; never anon/public.
revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- question_imports table privileges. MUST run here (after 010's blanket grants)
-- so the write-revoke for `authenticated` takes effect: importer/admin may READ
-- (RLS in 010 limits rows); writes happen only via the DEFINER fn above.
revoke all on public.question_imports from anon, authenticated;
grant select on public.question_imports to authenticated;  -- RLS limits rows
grant all on public.question_imports to service_role;

-- -----------------------------------------------------------------------------
-- Parent self-registration (Stage 10, increment 1).
-- Backported from migrations/2026_06_28_011_parent_registration.sql. Placed at
-- the END of this file so the function-privilege REVOKE below runs AFTER 010's
-- blanket grants — otherwise anon/authenticated's EXECUTE grant would remain.
-- The web-app registration server action creates the Auth user (service role,
-- email_confirm) then calls this to promote the auto-created profile into an
-- ACTIVE parent (parent role + parents row). Provider-agnostic; no email
-- dependency (we use admin.createUser, not signUp + email confirmation).
-- SECURITY DEFINER; service_role EXECUTE only (like create_child_account).
-- -----------------------------------------------------------------------------
create or replace function public.setup_parent(
  p_auth_user_id uuid,
  p_display_name text default null
)
returns uuid  -- the parent's profile id
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  v_role    uuid;
begin
  select id into v_profile from public.profiles where auth_user_id = p_auth_user_id;
  if v_profile is null then
    raise exception 'setup_parent: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Migration 105: a STAFF profile must never be turned into a parent either.
  -- Login SELF-HEALS a missing parents row after a correct password (web
  -- parentLogin, and the mobile /auth/heal BFF), so without this an
  -- administrator signing in to the parent app would silently gain a parent
  -- account beside their staff role.
  if exists (
    select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
     where pr.profile_id = v_profile
       and r.code in ('administrator', 'content_manager')
  ) then
    raise exception 'setup_parent: profile % holds a staff role', v_profile
      using errcode = 'check_violation';
  end if;

  -- A child profile must never be turned into a parent.
  if exists (select 1 from public.students s where s.profile_id = v_profile) then
    raise exception 'setup_parent: profile % is a student', v_profile using errcode = 'check_violation';
  end if;

  update public.profiles
     set status       = 'active',
         display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         updated_at   = now()
   where id = v_profile;

  insert into public.parents (profile_id) values (v_profile)
  on conflict (profile_id) do nothing;

  select id into v_role from public.roles where code = 'parent';
  if v_role is null then raise exception 'setup_parent: parent role missing (seed 012)'; end if;
  insert into public.profile_roles (profile_id, role_id) values (v_profile, v_role)
  on conflict do nothing;

  return v_profile;
end;
$$;

comment on function public.setup_parent(uuid, text) is
  'Promote an auth user''s profile to an active parent (parent role + parents row). service_role EXECUTE only; run after admin.createUser.';

revoke all on function public.setup_parent(uuid, text) from public, anon, authenticated;
grant execute on function public.setup_parent(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Child subscription engine (Stage 11, increment 1; PER-SUBJECT since 109).
-- Backported from migrations/2026_06_28_012_child_subscription_engine.sql and
-- migrations/2026_08_11_109_per_subject_billing_interval.sql. Placed at the END
-- of this file so the function-privilege REVOKEs below run AFTER 010's blanket
-- grants — otherwise anon/authenticated's EXECUTE grant would remain.
--
-- Every subject carries its OWN cycle and its OWN period, so the authoritative
-- pair is quote_child_plan / create_child_plan, taking a validated basket
-- [{subject_id, interval}]. plan_items_normalize is the single input gate: it
-- enforces the array shape, the <=20 cap, UUID-shaped ids and the plan_interval
-- whitelist, and de-duplicates. Prices are ALWAYS re-read from subjects_pricing
-- and the sibling discount (2nd 10% / 3rd+ 15%, investor 2026-07-15) is applied
-- per cycle group with the historical rounding rule, so a uniform basket
-- returns exactly the number the single-interval path always returned.
--
-- quote_child_subscription / create_child_subscription stay as thin wrappers
-- with their EXACT historical signatures: 013 pins them, admin_grant_child_access
-- calls them and already-shipped mobile binaries still post {interval,
-- subject_ids}. They build a uniform basket and delegate — ONE implementation.
--
-- SECURITY DEFINER; service_role EXECUTE only (called from the parent server
-- action's admin client after it authorizes the parent + child). create_* calls
-- quote_*, so quote_* is defined first.
-- -----------------------------------------------------------------------------

create or replace function public.plan_items_normalize(p_items jsonb)
-- `interval` is a reserved type keyword, so it cannot be a bare RETURNS TABLE
-- column name — the parser reads it as the start of a type. Quoting the
-- DECLARATION is enough: qualified reads (n.interval) still resolve unquoted,
-- so all 31 call sites are untouched.
returns table (subject_id uuid, "interval" public.plan_interval)
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'plan: items must be a json array'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'plan: too many subjects'
      using errcode = 'check_violation', hint = 'too_many_subjects';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where jsonb_typeof(e.v) <> 'object'
  ) then
    raise exception 'plan: item must be an object'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'subject_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'plan: bad subject id'
      using errcode = 'check_violation', hint = 'bad_subject';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'interval', '') not in ('week', 'month', 'year')
  ) then
    raise exception 'plan: bad interval'
      using errcode = 'check_violation', hint = 'bad_interval';
  end if;

  -- LAST occurrence wins: a UI that appends a changed cycle must not have to
  -- rewrite the array it already sent.
  return query
    select distinct on ((e.v ->> 'subject_id')::uuid)
           (e.v ->> 'subject_id')::uuid,
           (e.v ->> 'interval')::public.plan_interval
    from jsonb_array_elements(p_items) with ordinality as e(v, ord)
    order by (e.v ->> 'subject_id')::uuid, e.ord desc;
end;
$$;

comment on function public.plan_items_normalize(jsonb) is
  'Migration 109: the ONE server-side gate for a client-supplied plan basket. Enforces array shape, <=20 items, UUID-shaped subject_id and the plan_interval whitelist, de-duplicating on subject_id (last wins). Raises check_violation with hints bad_items / bad_subject / bad_interval / too_many_subjects.';

create or replace function public.quote_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_rank    int;
  v_pct     numeric(5,2);
  v_missing int;
  v_count   int;
  v_base    numeric(12,2);
  v_disc    numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_items   jsonb;
  v_groups  jsonb;
  v_ivs     int;
begin
  select count(*) into v_count from public.plan_items_normalize(p_items);
  if v_count = 0 then raise exception 'quote: no subjects selected'; end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
  -- shape as the single-interval quote so existing mappers keep working.
  select count(*) into v_missing
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = n.subject_id
      and sp.interval = n.interval
      and sp.status = 'active');
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  -- Sibling rank = (this parent's OTHER children already on a live
  -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
  -- percent composes trivially across cycle groups.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id,
           'interval',   n.interval,
           'price',      sp.price_amount,
           'currency',   'AZN'))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  -- Per-cycle groups, each rounded with EXACTLY today's rule
  -- (discount = round(group_base * pct / 100, 2)).
  with g as (
    select n.interval as iv,
           count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt,
           'base',  g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         coalesce(sum(g.base), 0),
         coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
         count(*)::int
    into v_groups, v_base, v_disc, v_ivs
  from g;

  v_total := v_base - v_disc;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '{}'::jsonb),
    'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
    'mixed', coalesce(v_ivs, 0) > 1);
end;
$$;

comment on function public.quote_child_plan(uuid, jsonb) is
  'Migration 109: read-only price quote for a PER-SUBJECT basket [{subject_id, interval}]. Prices are re-read from subjects_pricing; the sibling discount (2nd 10% / 3rd+ 15%) is applied per cycle group with today''s rounding rule, so a uniform basket returns exactly the number quote_child_subscription always returned.';

create or replace function public.create_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    uuid;
  v_q        jsonb;
  v_sub      uuid;
  v_trial    int;
  v_child    text;
  v_auth     uuid;
  v_had_any  boolean;
  v_status   public.subscription_status;
  v_default  public.plan_interval;
  v_trialend timestamptz;
  v_row      record;
begin
  -- Round 48 kill switch (migration 089): no paid write while the payment mode
  -- is off. Defence in depth -- the web/BFF layer checks too, but this is the
  -- layer that cannot be forgotten.
  perform public.assert_payments_enabled();

  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  -- Serialize all subscription writes of ONE family: prevents the double-submit
  -- duplicate row and the concurrent sibling-rank race (audit C2 + M14).
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'create: child already has a live subscription'
      using errcode = 'unique_violation';
  end if;

  v_q := public.quote_child_plan(p_student_profile_id, p_items);

  -- The DEFAULT cycle for subjects added later = the most common cycle in the
  -- basket; ties resolve year > month > week (the longer commitment is the
  -- safer default to inherit).
  select n.interval into v_default
  from public.plan_items_normalize(p_items) n
  group by n.interval
  order by count(*) desc,
           case n.interval when 'year' then 3 when 'month' then 2 else 1 end desc
  limit 1;

  -- Trial once per child: any prior subscription row (canceled/expired
  -- included) means no new free trial (audit C2).
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);
  if v_had_any then
    v_trial  := 0;
    v_status := 'active';
  else
    v_trial  := (v_q->>'trial_days')::int;
    v_status := 'trialing';
  end if;
  v_trialend := now() + (v_trial || ' days')::interval;

  -- base/discount/total/current_period_end/next_renewal_at are DELIBERATELY not
  -- written here: trg_sync_subscription_period derives all five from the
  -- per-subject rows inserted below.
  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start,
     sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, v_default, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_trialend end,
     now(),
     (v_q->>'discount_percent')::numeric, 'AZN', 'none')
  returning id into v_sub;

  for v_row in
    select n.subject_id, n.interval, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub, v_row.subject_id, v_row.interval, v_row.price_amount, 'AZN',
       now(),
       case when v_status = 'trialing' then v_trialend
            else now() + case v_row.interval
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child
  -- has none, and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students
     set access_status = case when v_status = 'trialing' then 'trialing' else 'active' end::public.child_access_status
   where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', v_status::text, 'trial_days', v_trial,
    'interval', v_default::text,
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.create_child_plan(uuid, jsonb) is
  'Migration 109: starts a child subscription from a PER-SUBJECT basket. Each subject opens its own period (trial end while trialing, else now() + its own cycle); child_subscriptions.interval stores only the DEFAULT cycle for future adds. The amount columns are left to trg_sync_subscription_period.';

-- Read-only price quote (base, sibling discount, total, trial length) — the
-- uniform-basket wrapper over quote_child_plan.
create or replace function public.quote_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'quote: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.quote_child_plan(p_student_profile_id, v_items);
end;
$$;

-- Create the subscription as a trial (computes amounts via quote; writes rows).
-- Batch H: ALSO allocates the deferred 8-digit login ID on the FIRST subscription
-- for a child that still has none, backfills child_credentials, and returns
-- new_child_unique_id + auth_user_id so the server action sets the synthetic email.
-- -----------------------------------------------------------------------------
-- PAYMENTS KILL SWITCH (migration 089, Round 48)
-- -----------------------------------------------------------------------------
-- current_payment_mode() is the SQL-side single source of truth for the payment
-- mode, with the same semantics as get_mobile_config().payment.mode.
-- assert_payments_enabled() is called at the top of every paid mutation so the
-- "payments off" kill switch cannot be bypassed by a server action or BFF route
-- that forgets to check it. SECURITY DEFINER because feature_flags and
-- system_settings are admin-RLS locked; only the derived mode string is exposed.
create or replace function public.current_payment_mode()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags      jsonb;
  v_real       boolean := false;
  v_demo       boolean := false;
  v_gvw_flag   boolean := false;
  v_gvw_days   int := 0;
  v_gvw_start  timestamptz;
  v_gvw_active boolean := false;
  v_setting    jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments', 'demo_payments', 'giveaway_period');
  v_flags := coalesce(v_flags, '{}'::jsonb);

  -- Missing row → OFF for every flag (fail closed; F1).
  v_real     := coalesce((v_flags ->> 'payments')::boolean, false);
  v_demo     := coalesce((v_flags ->> 'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags ->> 'giveaway_period')::boolean, false);

  -- Giveaway window — the EXACT parsing rules of get_mobile_config (F2):
  -- duration must be an explicit positive number (no invented 30-day default),
  -- started_at must be a non-empty string that parses, and a bad value NEVER
  -- raises out of a money gate — it just means "no active window".
  select value_json into v_setting from public.system_settings
   where key = 'giveaway.duration_days';
  if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
    v_gvw_days := greatest(0, floor((v_setting)::text::numeric)::int);
  end if;
  select value_json into v_setting from public.system_settings
   where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;
  if v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_active := now() < v_gvw_start + make_interval(days => v_gvw_days);
  end if;

  return case
    when v_gvw_active then 'giveaway'
    when v_demo       then 'demo'
    when v_real       then 'real'
    else 'off'
  end;
end;
$$;

comment on function public.current_payment_mode() is
  'Round 51: resolves payments/demo_payments/giveaway_period into '
  'off|real|demo|giveaway with EXACTLY get_mobile_config''s parsing rules — '
  'a 013 check asserts the two can never drift. Missing flag rows mean OFF '
  '(fail closed); a malformed giveaway window means "no window", never an '
  'exception out of a money gate.';

revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;

create or replace function public.assert_payments_enabled()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_payment_mode() = 'off' then
    -- hint = the stable key the web/BFF mappers translate to the trilingual
    -- gate.paymentsOff notice (they key off hints, never raw message text).
    raise exception 'payments: disabled'
      using errcode = 'check_violation', hint = 'payments_disabled';
  end if;
end;
$$;

comment on function public.assert_payments_enabled() is
  'Round 48/51: hard server-side payment kill switch. Raises check_violation '
  'with hint payments_disabled while current_payment_mode() = off; called '
  'first inside every paid RPC (create_child_subscription, purchase_olympiad, '
  'add_subscription_subject, apply_subject_change adds).';

revoke all on function public.assert_payments_enabled() from public, anon, authenticated;
grant execute on function public.assert_payments_enabled() to service_role;

create or replace function public.create_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  -- Round 48 kill switch: create_child_plan asserts too, but this wrapper is a
  -- paid entry point in its own right and must not depend on its callee for a
  -- money gate.
  perform public.assert_payments_enabled();
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'create: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.create_child_plan(p_student_profile_id, v_items);
end;
$$;

-- add_subscription_subject / remove_subscription_subject (Batch H): let a parent edit
-- the subjects on a child's current live subscription. Re-priced server-side from the
-- subscription's interval pricing at the kept sibling rate; never client-set amounts.
create or replace function public.add_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_price    numeric(12,2);
  v_end      timestamptz;
begin
  perform public.assert_payments_enabled();
  select id, interval, owner_parent_profile_id, current_period_end
    into v_sub, v_interval, v_owner, v_end
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  select sp.price_amount into v_price
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active';
  if v_price is null then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects
    (child_subscription_id, subject_id, interval, price_amount, currency,
     current_period_start, current_period_end)
  values
    (v_sub, p_subject_id, v_interval, v_price, 'AZN', now(),
     now() + case v_interval
               when 'week'  then interval '7 days'
               when 'month' then interval '1 month'
               else              interval '1 year'
             end)
  on conflict (child_subscription_id, subject_id) do update
    set remove_at = null, price_amount = excluded.price_amount;

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- The percent moves first, then one touch of the subject rows re-fires
  -- trg_sync_subscription_period so base/discount/total are re-derived from the
  -- new percent by their single writer.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

create or replace function public.remove_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   uuid;
  v_owner uuid;
  v_rank  int;
  v_pct   numeric(5,2);
  v_count int;
begin
  select id, owner_parent_profile_id into v_sub, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;

  select count(*) into v_count
  from public.subscription_subjects where child_subscription_id = v_sub;
  if v_count <= 1 then
    raise exception 'remove_subject: at least one subject must remain';
  end if;

  delete from public.subscription_subjects
  where child_subscription_id = v_sub and subject_id = p_subject_id;

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- Percent first, then one no-op touch of the subject rows so
  -- trg_sync_subscription_period (their single writer) re-derives the amounts
  -- from the NEW percent — the delete above fired it with the old one.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

revoke all on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;
revoke all on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;
revoke all on function public.add_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.remove_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_subscription_subject(uuid, uuid) to service_role;
-- Migration 109 — the per-subject engine + its input gate + the period trigger.
revoke all on function public.plan_items_normalize(jsonb) from public, anon, authenticated;
grant execute on function public.plan_items_normalize(jsonb) to service_role;
revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_child_plan(uuid, jsonb) to service_role;
revoke all on function public.create_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan(uuid, jsonb) to service_role;
revoke all on function public.fn_sync_subscription_period() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin subject pricing (migration 069): the ONLY admin write path into
-- subjects_pricing (everything else is service-role only). Administrator-only
-- via the in-body is_admin() guard (content managers never pass — pricing is
-- an Admin-only module); validates subject/interval/amount server-side; the
-- currency is never client-set; every change audits into audit_logs with the
-- same shape the admin panel's writeAuditLog helper records.
-- -----------------------------------------------------------------------------
create or replace function public.admin_upsert_subject_price(
  p_subject_id uuid,
  p_interval   text,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_old   numeric(12,2);
  v_new   numeric(12,2);
  v_id    uuid;
  v_cur   text;
begin
  -- Administrator ONLY — guard before reading/using any input. is_admin() is
  -- has_role('administrator'); content managers (or any permission holder)
  -- must NOT pass, so no has_permission() escape hatch here.
  if not public.is_admin() then
    raise exception 'pricing: forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_subject_id is null
     or not exists (select 1 from public.subjects s where s.id = p_subject_id) then
    raise exception 'pricing: unknown subject' using errcode = 'check_violation';
  end if;
  -- Whitelist = the public.plan_interval enum values used by subjects_pricing.
  if p_interval is null or p_interval not in ('week', 'month', 'year') then
    raise exception 'pricing: bad interval' using errcode = 'check_violation';
  end if;
  -- Finite, positive, sane cap, max 2 decimals (numeric NaN/Infinity compare
  -- greater than any number → caught by the > 10000 branch; -Infinity by <= 0).
  if p_amount is null or p_amount <= 0 or p_amount > 10000
     or p_amount <> round(p_amount, 2) then
    raise exception 'pricing: bad amount' using errcode = 'check_violation';
  end if;
  v_new := round(p_amount, 2);

  select sp.price_amount into v_old
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id
    and sp.interval = p_interval::public.plan_interval;

  -- Upsert on the (subject_id, interval) unique key. Currency stays whatever
  -- the row/system uses (default 'AZN' on insert; untouched on update).
  insert into public.subjects_pricing (subject_id, interval, price_amount)
  values (p_subject_id, p_interval::public.plan_interval, v_new)
  on conflict (subject_id, interval)
  do update set price_amount = excluded.price_amount, updated_at = now()
  returning id, currency into v_id, v_cur;

  -- Same audit mechanism the other Admin-only mutations use (audit_logs row,
  -- small metadata diff — never large bodies, never credentials).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.pricing.subject_price_upsert', 'subjects_pricing', v_id,
     jsonb_build_object(
       'subject_id', p_subject_id,
       'interval', p_interval,
       'old_amount', v_old,
       'new_amount', v_new),
     'info', true);

  return jsonb_build_object(
    'id', v_id,
    'subject_id', p_subject_id,
    'interval', p_interval,
    'old_amount', v_old,
    'new_amount', v_new,
    'currency', v_cur);
end;
$$;
comment on function public.admin_upsert_subject_price(uuid, text, numeric) is
  'Admin-only (in-body is_admin guard — content managers never pass) upsert of '
  'one subjects_pricing row (subject × week|month|year). Validates subject/'
  'interval/amount server-side, never touches currency, audits into audit_logs. '
  'Migration 069.';

-- Grants: same pattern as admin_send_notification — the in-body admin check
-- gates authenticated callers; anon/public never execute.
revoke all on function public.admin_upsert_subject_price(uuid, text, numeric) from public, anon;
grant execute on function public.admin_upsert_subject_price(uuid, text, numeric) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Round 11 (migrations 2026_07_04_025 + 027): payment-mode exclusivity +
-- free-access grants. Three payment modes exist as feature flags — payments
-- (real/automatic), demo_payments, giveaway_period — and the DB guarantees at
-- most ONE is enabled.
-- -----------------------------------------------------------------------------

-- is_giveaway_active() — single DB-side source of truth for the free window
-- (used by start_practice_attempt / start_olympiad_attempt guards above).
-- SECURITY DEFINER because feature_flags / system_settings are admin-only under
-- RLS while this must be evaluable from child-session RPCs. Exception-safe: any
-- malformed setting means "not active" (a config hiccup must never open or
-- extend a free-access window). An elapsed window is INACTIVE even while the
-- flag is still on — expiry needs no job.
create or replace function public.is_giveaway_active()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_started timestamptz;
  v_days    int;
begin
  select enabled into v_enabled from public.feature_flags where key = 'giveaway_period';
  if not coalesce(v_enabled, false) then return false; end if;

  begin
    select nullif(value_json #>> '{}', '')::timestamptz into v_started
    from public.system_settings where key = 'giveaway.started_at';
    select floor((value_json #>> '{}')::numeric)::int into v_days
    from public.system_settings where key = 'giveaway.duration_days';
  exception when others then
    return false;
  end;

  if v_started is null or coalesce(v_days, 0) < 1 then return false; end if;
  return now() < v_started + make_interval(days => v_days);
end;
$$;

comment on function public.is_giveaway_active() is
  'True while the admin giveaway window (giveaway_period flag + giveaway.started_at + giveaway.duration_days) is running. Elapsed window = false even if the flag is still on.';

revoke all on function public.is_giveaway_active() from public, anon, authenticated;
grant execute on function public.is_giveaway_active() to service_role;

-- -----------------------------------------------------------------------------
-- Round 12 (migration 033): per-parent/child scheduled FREE-ACCESS intervals.
-- An admin-created row in free_access_intervals (below in 008/010) grants free
-- access to a specific child OR to a whole parent's children for a time window.
-- Like the giveaway, access is evaluated LAZILY at use time (no state to unwind
-- on expiry). SECURITY DEFINER because free_access_intervals is admin-only RLS but
-- these must be evaluable from child-session RPCs and parent-session reads.
-- -----------------------------------------------------------------------------
-- True while a student has an active free interval (their own, or one targeting
-- their creating parent). Used inside the attempt-start RPC guards.
create or replace function public.is_free_access_active_for_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.student_profile_id = p_student
        or f.parent_profile_id = (
          select s.created_by_parent_profile_id
          from public.students s where s.profile_id = p_student
        )
      )
  );
$$;
comment on function public.is_free_access_active_for_student(uuid) is
  'True while an admin free-access interval covers this student (its own or its parent''s). Lazy expiry — an elapsed window is false.';
-- Internal SECURITY DEFINER callers only (my_free_access_active, is_child_free_access_active,
-- the attempt RPCs run as owner). Not directly authenticated-executable (migration 034).
revoke all on function public.is_free_access_active_for_student(uuid) from public, anon, authenticated;
grant execute on function public.is_free_access_active_for_student(uuid) to service_role;

-- Per-child free status scoped to the caller (own child / self only) — the parent
-- subscription gate + display use this so a per-child window never blocks an
-- uncovered sibling. (Round 12 pass-2 / migration 034.)
create or replace function public.is_child_free_access_active(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_student is null then false
    when p_student = public.current_profile_id()
      then public.is_free_access_active_for_student(p_student)
    when exists (
      select 1 from public.students s
      where s.profile_id = p_student
        and s.created_by_parent_profile_id = public.current_profile_id()
    ) then public.is_free_access_active_for_student(p_student)
    else false
  end;
$$;
comment on function public.is_child_free_access_active(uuid) is
  'Per-child free-access flag, scoped to the caller (own child / self only). Parent subscription gate + display.';
revoke all on function public.is_child_free_access_active(uuid) from public, anon;
grant execute on function public.is_child_free_access_active(uuid) to authenticated, service_role;

-- The current CHILD's own free-access flag (child dashboard gate).
create or replace function public.my_free_access_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_free_access_active_for_student(public.current_profile_id()); $$;
revoke all on function public.my_free_access_active() from public, anon;
grant execute on function public.my_free_access_active() to authenticated, service_role;

-- The current PARENT's free-access status: { active, ends_at } (max window end
-- across intervals targeting the parent or any of their children). Powers the
-- parent-page countdown + the free pricing gate. current_profile_id() scopes it
-- so a parent can only read their OWN status.
create or replace function public.current_parent_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('active', m.ends_at is not null, 'ends_at', m.ends_at)
  from (
    select max(f.ends_at) as ends_at
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.parent_profile_id = public.current_profile_id()
        or f.student_profile_id in (
          select s.profile_id from public.students s
          where s.created_by_parent_profile_id = public.current_profile_id()
        )
      )
  ) m;
$$;
comment on function public.current_parent_free_access() is
  'Current parent free-access { active, ends_at } (max active window over the parent + their children). Scoped to current_profile_id().';
revoke all on function public.current_parent_free_access() from public, anon;
grant execute on function public.current_parent_free_access() to authenticated, service_role;

-- Enabling any one of the trio disables the other two; enabling giveaway_period
-- (re)stamps system_settings 'giveaway.started_at' so the countdown restarts.
-- SECURITY DEFINER so the cross-row/cross-table writes succeed for any
-- authorized caller (admin session under RLS, or service role). The inner
-- UPDATE sets enabled=false, which does not re-satisfy the trigger's WHEN
-- clause — no recursion. An idempotent re-save of an already-enabled flag is
-- ignored (no giveaway clock restart).
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.enabled = true then
    return new;
  end if;

  update public.feature_flags
     set enabled = false, updated_at = now()
   where key in ('payments', 'demo_payments', 'giveaway_period')
     and key <> new.key
     and enabled;

  if new.key = 'giveaway_period' then
    update public.system_settings
       set value_json = to_jsonb(now()), updated_at = now()
     where key = 'giveaway.started_at';
  end if;

  return new;
end;
$$;

comment on function public.fn_payment_mode_exclusivity() is
  'DB-layer guarantee that payments / demo_payments / giveaway_period are never enabled together; stamps giveaway.started_at when the giveaway flips on.';

drop trigger if exists trg_payment_mode_exclusivity on public.feature_flags;
create trigger trg_payment_mode_exclusivity
  after insert or update of enabled on public.feature_flags
  for each row
  when (new.enabled = true and new.key in ('payments', 'demo_payments', 'giveaway_period'))
  execute function public.fn_payment_mode_exclusivity();

-- Allocate the deferred 8-digit login ID WITHOUT a subscription (giveaway
-- add-child path — access during the giveaway comes from the server-side
-- giveaway override, not from a subscription row, so it auto-reverts when the
-- window ends). Mirrors the allocation block inside create_child_subscription.
create or replace function public.activate_child_login_id(
  p_student_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_child text;
  v_auth  uuid;
begin
  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'activate_login_id: child has no owning parent';
  end if;

  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  return jsonb_build_object('new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.activate_child_login_id(uuid) is
  'Allocate the deferred 8-digit child login ID without a subscription (giveaway add-child path). service_role EXECUTE only; caller authorizes parent ownership first.';

revoke all on function public.activate_child_login_id(uuid) from public, anon, authenticated;
grant execute on function public.activate_child_login_id(uuid) to service_role;

-- Administrator payment bypass: comped ACTIVE subscription (all amounts 0 —
-- nothing was charged; subject pricing is validated to exist so granted
-- subjects are real), provider 'admin_grant', period now → now + p_days
-- (default week 7 / month 30 / year 365, capped 1..730). Allocates the 8-digit
-- login ID exactly like create_child_subscription; NO sibling-discount row.
-- service_role EXECUTE only — the admin-panel action runs requireAdmin() first
-- and writes the audit row.
create or replace function public.admin_grant_child_access(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[],
  p_days               int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_days    int;
  v_missing int;
  v_sub     uuid;
  v_sid     uuid;
  v_ids     jsonb;
  v_end     timestamptz;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'admin_grant: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'admin_grant: child has no owning parent';
  end if;

  v_days := coalesce(p_days,
                     case p_interval when 'week' then 7 when 'month' then 30 else 365 end);
  if v_days < 1 or v_days > 730 then
    raise exception 'admin_grant: days out of range (1..730)';
  end if;

  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then
    raise exception 'admin_grant: missing active pricing for % subject(s)', v_missing;
  end if;

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'admin_grant: child already has a live subscription';
  end if;

  v_end := now() + (v_days || ' days')::interval;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     current_period_start, sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'active',
     now(), 0, 'AZN', 'admin_grant')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values (v_sub, v_sid, p_interval, 0, 'AZN', now(), v_end)
    on conflict do nothing;
  end loop;

  v_ids := public.activate_child_login_id(p_student_profile_id);

  update public.students set access_status = 'active'
   where profile_id = p_student_profile_id;

  return jsonb_build_object(
    'subscription_id', v_sub, 'status', 'active', 'days', v_days,
    'current_period_end', to_jsonb(v_end))
    || v_ids;
end;
$$;

comment on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) is
  'Administrator payment bypass: comped ACTIVE child subscription (amounts 0, provider admin_grant), allocates the 8-digit login ID, flips access_status to active. service_role EXECUTE only; admin-panel action guards + audits.';

revoke all on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) from public, anon, authenticated;
grant execute on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) to service_role;

-- -----------------------------------------------------------------------------
-- Test & daily task engine (Stage 13, increment 1).
-- Backported from migrations/2026_06_28_013_test_engine.sql. Server-side RANDOM
-- question selection + attempts + auto-grading. Users never choose difficulty and
-- never see is_correct before grading; scores are computed server-side. Three
-- SECURITY DEFINER RPCs executable by the authenticated student (each verifies it
-- owns the attempt). Placed at the END so the function REVOKEs run AFTER 010's
-- blanket grants — otherwise anon's EXECUTE grant would remain.
-- -----------------------------------------------------------------------------

-- ---- start_practice_attempt ----
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_practice: not a student'; end if;
  -- Round 11 (migration 027): an active GIVEAWAY window grants access without a
  -- subscription. Round 12 (migration 033): an active per-parent/child FREE-ACCESS
  -- interval does the same. Otherwise (migration 035, audit H6 + C1): the child
  -- needs a live, DATE-VALID subscription covering THIS subject — one paid subject
  -- must not unlock the rest, and expiry is checked lazily against
  -- current_period_end (students.access_status is a display cache, not authority).
  -- trialing/active = live until current_period_end; canceled keeps access until
  -- the already-paid period ends; past_due (failed charge) blocks.
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
        -- Migration 109: cs.current_period_end is the MAX of the per-subject
        -- periods, so the subscription outlives its shortest-cycle subject —
        -- gating on it alone would keep serving a lapsed weekly subject. The
        -- coalesce keeps a legacy row (NULL period) behaving exactly as before.
        and coalesce(ss.current_period_end, cs.current_period_end) > now()
    ) then
      raise exception 'start_practice: no active access' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  -- Random selection of published, objective, auto-gradable GENERAL questions for
  -- the subject (grade-matched when the child has a grade). Difficulty is NOT
  -- chosen. PRIVATE olympiad-package questions are excluded (olympiad_package_id IS NULL).
  with picked as (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
    order by random()
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

-- ---- get_practice_attempt (questions + options, NO is_correct) ----
create or replace function public.get_practice_attempt(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_result  jsonb;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;

  select jsonb_build_object('attempt_id', p_attempt_id, 'status', v_status,
                            'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.questions qq on qq.id = taa.question_id
    left join public.question_types qtp on qtp.id = qq.type_id
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- ---- grade_practice_attempt (records answers, auto-grades, sets score) ----
create or replace function public.grade_practice_attempt(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_item    jsonb;
  v_qid     uuid;
  v_sel     uuid[];
  v_correct uuid[];
  v_ok      boolean;
  v_rows    int;
  v_seen    uuid[] := '{}';
  v_score   numeric := 0;
  v_max     int;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;
  if v_status <> 'in_progress' then raise exception 'attempt already submitted'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    -- Audit H5 (migration 035): each question counts once; ids outside the attempt
    -- are ignored (the UPDATE below matches zero rows and awards nothing).
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao where ao.question_id = v_qid and ao.is_correct;

    v_ok := (array_length(v_correct, 1) is not null)
        and (v_sel <@ v_correct) and (v_correct <@ v_sel)
        and coalesce(array_length(v_sel, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    if v_rows > 0 and v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('score', v_score, 'max', v_max,
    'results', (select coalesce(jsonb_agg(jsonb_build_object(
                  'question_id', question_id, 'is_correct', is_correct)), '[]'::jsonb)
                from public.test_attempt_answers where attempt_id = p_attempt_id));
end;
$$;

-- EXECUTE: the authenticated student (owner-checked inside); never anon.
revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;
revoke all on function public.get_practice_attempt(uuid, text) from public, anon;
grant execute on function public.get_practice_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.grade_practice_attempt(uuid, jsonb) from public, anon;
grant execute on function public.grade_practice_attempt(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Olimpiada Preparation engine (Stage 14, increment 1).
-- Backported from migrations/2026_06_28_014_olympiad_engine.sql. Parent one-time
-- LIFETIME purchase + child olympiad attempts (25 random from the package's
-- curated pool, reusing get_/grade_practice_attempt). Real charge is provider-
-- specific and stubbed (purchase marked active immediately) until a provider is
-- chosen. purchase_olympiad is service-role (parent action authorizes the parent);
-- start_olympiad_attempt is the authenticated child (purchase-gated). Placed at
-- the END so the function REVOKEs run AFTER 010's blanket grants — otherwise
-- anon/authenticated's EXECUTE grant on purchase_olympiad would remain.
-- -----------------------------------------------------------------------------
create or replace function public.purchase_olympiad(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_child_grade uuid;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_existing    uuid;
  v_ex_status   text;
  v_id          uuid;
begin
  -- Round 48 kill switch (migration 089): no paid write while the
  -- payment mode is off. Defence in depth -- the web/BFF layer checks
  -- too, but this is the layer that cannot be forgotten.
  perform public.assert_payments_enabled();
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Sales window (migration 070; supersedes the migration-035 event-date gate,
  -- carried over by 070's one-time sale_ends_at := event_starts_at backfill):
  -- the ONE canonical predicate — olympiad_package_on_sale, defined in 015.
  -- Off-sale = not purchasable, full stop (existing purchasers are unaffected —
  -- this guard only blocks NEW purchases).
  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'purchase: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  -- Round 34: when the package targets grades, the child's CURRENT grade must
  -- be one of them, and the purchase snapshots it (attempts draw THAT pool
  -- forever — yearly promotion never re-points a lifetime entitlement).
  -- Empty target set = legacy grade-less package: buyable by anyone (old rule).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'purchase: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT
    -- price/date — and now also the CURRENT grade entitlement.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           grade_id = coalesce(v_buy_grade, grade_id),
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider, grade_id)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none', v_buy_grade)
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active', 'existing', false);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. '
  'service_role only (payment stubbed). Migration 070: only packages passing '
  'olympiad_package_on_sale are purchasable (hint package_not_on_sale). '
  'Round 34: the child''s grade must be a package target grade (hint '
  'package_not_for_grade) and is SNAPSHOTTED on the purchase row.';


-- Migration 047: olympiad attempts run on the TIMED test engine (jsonb return,
-- TRUE resume, deadline from olympiad_packages.duration_minutes, pre-inserted
-- answer rows). Drop first — the return type changed from uuid to jsonb.
-- Round 51 (migrations 090/092): questions_per_attempt is LIVE — each attempt
-- serves that many via the PER-STUDENT rotation over the entitled grade's
-- pool, and attempts are PRACTICE-ONLY (is_rated = false; Round 48 already
-- kept them out of points/percentage/streak in award_attempt_points).
drop function if exists public.start_olympiad_attempt(uuid);

CREATE OR REPLACE FUNCTION public.start_olympiad_attempt(p_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_student    uuid := public.current_profile_id();
  v_pkg        record;
  v_duration   int;
  v_existing   record;
  v_qids       uuid[];
  v_attempt    uuid;
  v_deadline   timestamptz;
  v_grades     uuid[];
  v_buy_grade  uuid;
  v_cur_grade  uuid;
  v_pool_grade uuid;
  -- Round 49: rotation state. Declared `record`, NOT the table's composite
  -- type: canonical run order creates this function (011) BEFORE the rotation
  -- table (015), and a declared composite type must exist at compile time.
  v_rot        record;
  v_tries      int := 0;
  -- Migration 106: the per-grade config, resolved after grade entitlement.
  v_gcfg       record;
  v_pool       uuid[];
  v_seen       uuid[];
  v_pick1      uuid[] := '{}';
  v_pick2      uuid[] := '{}';
  v_n          int;
  v_k          int;
  v_cycle      int;
  v_reset      boolean := false;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  select grade_id into v_buy_grade
  from public.olympiad_purchases
  where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active';
  if not found then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  -- Round 49: questions_per_attempt is LIVE again (dead config since 057).
  select id, subject_id, coalesce(duration_minutes, 25) as dur_min,
         greatest(least(coalesce(questions_per_attempt, 25), 500), 1) as n_per
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  -- Migration 106: the package values above are only the FALLBACK. What
  -- actually applies depends on the entitled grade and is resolved below, once
  -- v_pool_grade is known — this is why every grade used to share one question
  -- count and one clock.
  v_duration := v_pkg.dur_min * 60;

  -- Round 34: resolve WHICH grade's pool this child is entitled to.
  --   purchase snapshot → current grade → the only target grade (legacy
  --   single-grade purchases made before the snapshot column) → error.
  -- Empty target set = legacy grade-less package → whole pool (old behavior).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    select grade_id into v_cur_grade from public.students where profile_id = v_student;
    if v_buy_grade is not null and v_buy_grade = any(v_grades) then
      v_pool_grade := v_buy_grade;
    elsif v_cur_grade is not null and v_cur_grade = any(v_grades) then
      v_pool_grade := v_cur_grade;
    elsif cardinality(v_grades) = 1 then
      v_pool_grade := v_grades[1];
    else
      raise exception 'olympiad: package does not cover your grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
  end if;

  -- Migration 106: the entitled grade is known now — take THAT grade's
  -- question count and duration (falling back to the package's when the grade
  -- carries no override). The draw size and the deadline below both use these.
  select c.questions_per_attempt, c.duration_minutes
    into v_gcfg
  from public.olympiad_grade_config(p_package_id, v_pool_grade) c;
  if v_gcfg.questions_per_attempt is not null then
    v_pkg.n_per := v_gcfg.questions_per_attempt;
    v_duration  := v_gcfg.duration_minutes * 60;
  end if;

  -- Round 49 — ROTATION LOCK. Get-or-create this student's rotation row for
  -- (package, entitled grade) and hold a row lock for the rest of the call.
  -- Everything below (resume check, unseen read, draw, attempt creation,
  -- consumption write) therefore runs SERIALLY per student+package+grade, so
  -- two tabs cannot consume overlapping question sets. The loop is the standard
  -- upsert race handler: the loser of an insert race retries once and locks the
  -- winner's row. It is bounded, so it can never spin.
  loop
    v_tries := v_tries + 1;
    if v_tries > 3 then
      raise exception 'olympiad: rotation lock contention' using errcode = 'lock_not_available';
    end if;
    select * into v_rot
    from public.olympiad_question_rotations
    where student_profile_id  = v_student
      and olympiad_package_id = p_package_id
      and grade_id is not distinct from v_pool_grade
    for update;
    exit when found;
    begin
      insert into public.olympiad_question_rotations
        (student_profile_id, olympiad_package_id, grade_id)
      values (v_student, p_package_id, v_pool_grade);
    exception when unique_violation then
      null;   -- a concurrent starter created it; loop and lock THAT row
    end;
  end loop;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  -- Runs under the rotation lock, so the losing tab of a race lands here and
  -- replays the winner's identical question list instead of drawing again.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'olympiad' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', coalesce(v_existing.duration_seconds, v_duration));
    end if;
    update public.test_attempts
       set status = (case when v_existing.deadline_at is null
                          then 'abandoned' else 'expired' end)::public.attempt_status,
           updated_at = now()
     where id = v_existing.id;
  end if;

  -- CANDIDATE POOL: all published questions of the ENTITLED GRADE's pool
  -- (Round 34: never another grade's questions). Round 49: this is no longer
  -- the served set — the rotation below picks questions_per_attempt of it.
  select coalesce(array_agg(q.id), '{}') into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id
    and q.status = 'published'
    and (v_pool_grade is null or q.grade_id = v_pool_grade)
    and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct);

  if cardinality(v_pool) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  -- Never ask for more than exists: a pool smaller than the configured count
  -- serves the WHOLE pool. This is also what makes the algorithm terminating —
  -- v_n <= |pool| guarantees the top-up below always finds enough candidates.
  v_n := least(v_pkg.n_per, cardinality(v_pool));

  -- Prune consumed ids that have LEFT the pool (archived or unpublished since).
  -- Without this the stored set could exceed the pool and the cycle would never
  -- appear exhausted.
  select coalesce(array_agg(s), '{}') into v_seen
  from unnest(v_rot.seen_question_ids) s
  where s = any(v_pool);

  -- Up to v_n UNSEEN questions from the student's CURRENT cycle.
  select coalesce(array_agg(t.id), '{}') into v_pick1
  from (select p as id
        from unnest(v_pool) p
        where not (p = any(v_seen))
        order by random()
        limit v_n) t;
  v_k := coalesce(cardinality(v_pick1), 0);

  if v_k >= v_n then
    v_seen  := v_seen || v_pick1;
    v_cycle := v_rot.cycle_no;
  else
    -- CYCLE BOUNDARY — atomic because it happens inside the same row lock and
    -- the same statement/transaction as the attempt insert. The current cycle
    -- is exhausted: serve what is left of it, then top up from a FRESH cycle
    -- over the full pool, EXCLUDING what this attempt already holds so nothing
    -- repeats inside the attempt (520 pool / 50 per attempt -> 20 + 30).
    v_reset := true;
    select coalesce(array_agg(t.id), '{}') into v_pick2
    from (select p as id
          from unnest(v_pool) p
          where not (p = any(v_pick1))
          order by random()
          limit (v_n - v_k)) t;
    -- The carry-over questions count as consumed in the NEW cycle as well.
    -- Otherwise they would be eligible again on the very NEXT attempt, i.e. the
    -- same question in two consecutive sittings.
    v_seen  := v_pick1 || v_pick2;
    v_cycle := v_rot.cycle_no + 1;
  end if;

  -- Shuffle the union so a boundary attempt does not present the old cycle's
  -- leftovers as a leading block.
  select coalesce(array_agg(t.id), '{}') into v_qids
  from (select x as id from unnest(v_pick1 || v_pick2) x order by random()) t;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, is_rated)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, false)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  -- Mark consumption LAST, still under the row lock: if anything above raised,
  -- the whole call rolls back and nothing was consumed.
  update public.olympiad_question_rotations
     set seen_question_ids = v_seen,
         cycle_no          = v_cycle,
         attempts_drawn    = attempts_drawn + 1,
         last_drawn_at     = now()
   where id = v_rot.id;

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids),
    'cycle', v_cycle, 'cycle_reset', v_reset,
    'pool_size', cardinality(v_pool));
end;
$function$;

comment on function public.start_olympiad_attempt(uuid) is
  'Round 49/51: purchase-gated olympiad start. Serves exactly '
  'questions_per_attempt questions from the ENTITLED GRADE''s published pool '
  '(the whole pool when it is smaller), never repeating a question inside an '
  'attempt and never repeating across attempts until that student''s cycle for '
  '(package, grade) is exhausted -- then the cycle resets and a fresh one '
  'starts from the full pool. Rotation is per student, held under a '
  'SELECT ... FOR UPDATE row lock, so concurrent tabs resume one attempt '
  'instead of consuming twice. Attempts are PRACTICE-ONLY (Round 48) and are '
  'created with is_rated = false (Round 51).';


revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Round 51 (migration 090): activation validation for questions_per_attempt.
-- A package cannot be ACTIVATED (or have per-attempt raised while active)
-- unless EVERY target grade's published pool can fill one attempt. Message is
-- the owner's Azerbaijani sentence; HINT carries the stable machine key
-- (olympiad_pool_below_per_attempt) and DETAIL a JSON payload so admin-panel
-- renders the en/ru variants itself. The trigger is SECURITY DEFINER so the
-- pool count is the TRUE count (questions is RLS-protected).
-- -----------------------------------------------------------------------------
create or replace function public.assert_olympiad_pool_meets_per_attempt(
  p_package_id  uuid,
  p_per_attempt int,
  p_grade_id    uuid default null       -- null = validate EVERY target grade
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  -- Migration 107: the package-level number is only the FALLBACK now — each
  -- target grade may carry its own questions_per_attempt.
  v_fallback int := greatest(coalesce(p_per_attempt, 1), 1);
  v_need  int;
  v_pool  int;
  v_sfx   text;
  r       record;
begin
  -- Legacy grade-less package (no target-grade rows): the WHOLE published pool
  -- has to fill an attempt, because that is exactly what such a package serves.
  if not exists (select 1 from public.olympiad_package_grades g
                  where g.olympiad_package_id = p_package_id) then
    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published';
    if v_pool < v_fallback then
      raise exception
        'Paketə % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        v_pool, v_fallback, v_fallback
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', null, 'grade_id', null,
                                           'pool', v_pool, 'required', v_fallback)::text;
    end if;
    return;
  end if;

  for r in
    select g.grade_id                    as grade_id,
           gr.level::int                 as level,
           -- Migration 107: THIS grade's requirement, not the package's.
           greatest(coalesce(g.questions_per_attempt, v_fallback), 1) as need,
           (select count(*)::int
              from public.questions q
             where q.olympiad_package_id = p_package_id
               and q.status = 'published'
               and q.grade_id = g.grade_id) as pool
    from public.olympiad_package_grades g
    join public.grades gr on gr.id = g.grade_id
    where g.olympiad_package_id = p_package_id
      and (p_grade_id is null or g.grade_id = p_grade_id)
    order by gr.level
  loop
    v_need := r.need;
    if r.pool < v_need then
      -- Azerbaijani ordinal suffix by vowel harmony of the spoken numeral:
      -- üç/dörd -> cü, altı -> cı, doqquz/on -> cu, everything else -> ci.
      -- grades.level is constrained to 1..11, so this covers the whole domain.
      v_sfx := case r.level
                 when 3  then 'cü'
                 when 4  then 'cü'
                 when 6  then 'cı'
                 when 9  then 'cu'
                 when 10 then 'cu'
                 else 'ci'
               end;
      raise exception
        '%-% sinif üçün % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        r.level, v_sfx, r.pool, v_need, v_need
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', r.level, 'grade_id', r.grade_id,
                                           'pool', r.pool, 'required', v_need)::text;
    end if;
  end loop;
end;
$$;

comment on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid) is
  'Round 49 + migration 107: raises check_violation (hint '
  'olympiad_pool_below_per_attempt, DETAIL = JSON {grade_level, grade_id, pool, '
  'required}) when a target grade''s published pool cannot fill one attempt. '
  'Each grade is checked against ITS OWN questions_per_attempt, falling back to '
  'p_per_attempt. service-internal: reached through the activation guards only.';

revoke all on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  to service_role;

-- Guard fires on the ACTIVATION itself, never on unrelated edits.
-- SECURITY DEFINER so the pool count is the TRUE count: questions is an
-- RLS-protected table and the guard must never pass because rows were hidden
-- from the caller (same reasoning as get_olympiad_pool_counts). Running as the
-- owner is also what lets it call the service-role-only validator above.
create or replace function public.olympiad_activation_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- An ALREADY-active package must stay editable: changing the price, banner,
  -- sale window or event date is not an activation and must not be blocked by a
  -- pool that predates this rule. Only a transition INTO active, or a raise of
  -- questions_per_attempt while active, is re-validated.
  if tg_op = 'UPDATE'
     and old.status = new.status
     and old.questions_per_attempt = new.questions_per_attempt then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(new.id, new.questions_per_attempt);
  return new;
end;
$$;

comment on function public.olympiad_activation_pool_guard() is
  'Round 49: blocks activating (or raising questions_per_attempt on) an '
  'olympiad package whose target-grade pool cannot fill one attempt. Unrelated '
  'edits to an already-active package pass through untouched.';

-- Migration 107: the same rule for the GRADE rows. The guard above fires on
-- olympiad_packages, but per-grade counts live on olympiad_package_grades — so
-- adding a target grade to an ACTIVE package, or raising one grade's count,
-- reached no validation at all. Same philosophy as above: only a change that
-- could make an ACTIVE package unservable is checked; everything else passes.
-- SECURITY DEFINER for the same reason (questions is RLS-protected and the
-- guard must never pass because rows were hidden from the caller).
create or replace function public.olympiad_grade_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status  public.catalog_status;
  v_pkg_per int;
begin
  select p.status, p.questions_per_attempt
    into v_status, v_pkg_per
  from public.olympiad_packages p
  where p.id = new.olympiad_package_id;

  -- Not active → the package-level guard validates the whole set at activation.
  if v_status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- A RAISE is the only update that can newly break servability; lowering the
  -- count (or editing the duration) is always safe.
  if tg_op = 'UPDATE'
     and coalesce(new.questions_per_attempt, v_pkg_per, 1)
         <= coalesce(old.questions_per_attempt, v_pkg_per, 1) then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(
    new.olympiad_package_id, v_pkg_per, new.grade_id);
  return new;
end;
$$;

comment on function public.olympiad_grade_pool_guard() is
  'Migration 107: blocks adding a target grade to — or raising a grade''s '
  'questions_per_attempt on — an ACTIVE olympiad package whose published pool '
  'for that grade cannot fill one attempt. The trigger is ARMED IN 015.';

-- The trigger itself is ARMED IN 015 (after olympiad_packages exists —
-- canonical run order: 011 functions first, 015 tables later).

-- ---------------------------------------------------------------------------
-- norm_import_text (migration 108): text normalizer shared by both sides of the
-- olympiad import duplicate key (trim, collapse whitespace, lowercase).
-- Deliberately NOT `strict`: the coalesce lives INSIDE the body so a NULL folds
-- to ''. The stored side reads answer_option_translations through a LEFT JOIN
-- (the importer writes no row for a locale with neither text nor image) while
-- the incoming side reads a possibly-absent JSON key — both must produce the
-- same '' or every append would report zero duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.norm_import_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'))
$$;

comment on function public.norm_import_text(text) is
  'Migration 108: normalizes text for the olympiad import duplicate key (trim, '
  'collapse whitespace, lowercase; NULL folds to ''''). service-internal — '
  'reached only from bulk_insert_olympiad_package_questions.';

-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoking `public` alone would leave it callable.
revoke all on function public.norm_import_text(text) from public, anon, authenticated;
grant execute on function public.norm_import_text(text) to service_role;


-- ---------------------------------------------------------------------------
-- bulk_insert_olympiad_package_questions (Batch D; v2 migration 059): import
-- PRIVATE trilingual questions for one olympiad package. Same item format as
-- bulk_insert_questions but every inserted question gets olympiad_package_id =
-- p_package_id and is published immediately (the attempt engine requires
-- status='published'), so it stays out of the general pool. Subject defaults to
-- the package's subject; type optional (defaults single_choice, migration 059).
-- APPENDABLE PER GRADE since migration 108 (owner 2026-08-11 — supersedes the
-- migration-059 creation-only rule): a further upload into a grade that already
-- has questions ADDS to its pool. A row whose primary-locale body, option texts
-- and image references match one already in that (package, grade) pool is
-- reported as a per-row error and skipped, so re-uploading a file is safe. A row
-- carrying images never matches (media uuids are minted per upload), and the
-- guard is best-effort rather than a constraint — two simultaneous appends can
-- both insert. Administrator-only (audit H2); never anon-executable.
-- ---------------------------------------------------------------------------
drop function if exists public.bulk_insert_olympiad_package_questions(uuid, jsonb);

create function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb,
  p_grade_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_pkg_subj uuid;
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
  v_pool_grade uuid;
  -- Migration 101: optional pre-uploaded question image (the same field the
  -- general importer accepts). Assigned unconditionally per item below — it is
  -- loop-persistent, so leaving it unset would carry the previous question's
  -- image onto the next one.
  v_media uuid;
  -- Migration 108: content keys of THIS grade's existing pool, snapshotted once.
  v_dup_keys text[] := '{}';
  v_key      text;
begin
  -- Audit H2 (migration 035): olympiad pools are an Admin-only module (content
  -- managers must never manage Olympiad Preparation) — no permission fallback.
  if v_profile is null or not public.is_admin() then
    raise exception 'bulk_insert_olympiad_package_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_olympiad_package_questions: payload must be a JSON array';
  end if;

  select subject_id into v_pkg_subj from public.olympiad_packages where id = p_package_id;
  if not found then
    raise exception 'bulk_insert_olympiad_package_questions: package not found';
  end if;

  -- Round 34: the import targets ONE grade pool. Explicit p_grade_id (the new
  -- per-grade admin flow) or the package's legacy single grade (old callers).
  v_pool_grade := coalesce(p_grade_id,
    (select grade_id from public.olympiad_packages where id = p_package_id));
  if v_pool_grade is null then
    raise exception 'bulk_insert_olympiad_package_questions: no target grade'
      using errcode = 'check_violation', hint = 'pool_grade_missing';
  end if;
  if exists (select 1 from public.olympiad_package_grades g
              where g.olympiad_package_id = p_package_id)
     and not exists (select 1 from public.olympiad_package_grades g
                      where g.olympiad_package_id = p_package_id
                        and g.grade_id = v_pool_grade) then
    raise exception 'bulk_insert_olympiad_package_questions: grade is not a package target'
      using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
  end if;

  -- Migration 108: APPEND, duplicate-guarded (replaces the creation-only raise).
  -- ONE snapshot of the existing pool's content keys, taken before the loop, so
  -- a 500-row import costs O(pool + rows) instead of re-querying per row. The
  -- snapshot is never extended during the loop — a row is only ever compared
  -- against what was already in the pool when the call started.
  -- ARCHIVED questions are included on purpose: the row still exists, and
  -- restoring it is the right admin action for a question that is already there.
  select coalesce(array_agg(k), '{}') into v_dup_keys
  from (
    select md5(
             public.norm_import_text(qt.body) || chr(31) ||
             public.norm_import_text(qt.media_asset_id::text) || chr(31) ||
             coalesce((
               select string_agg(
                        public.norm_import_text(aot.text) || chr(29) ||
                        public.norm_import_text(aot.media_asset_id::text),
                        chr(30) order by ao.order_index)
               from public.answer_options ao
               left join public.answer_option_translations aot
                 on aot.option_id = ao.id and aot.locale = q2.primary_locale
               where ao.question_id = q2.id), '')
           ) as k
    from public.questions q2
    join public.question_translations qt
      on qt.question_id = q2.id and qt.locale = q2.primary_locale
    where q2.olympiad_package_id = p_package_id
      and q2.grade_id = v_pool_grade
  ) s;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      -- Round 34: the TARGET GRADE is authoritative for every row — a stray
      -- meta.grade_level in the file can never leak a question into another
      -- grade's pool.
      v_grade := v_pool_grade;

      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- Migration 100: the PACKAGE owns the olympiad type. `meta.olympiad_type`
      -- in an uploaded row is ignored — the admin already chose the type in the
      -- package form, and asking every question to repeat it only created a way
      -- to disagree with it (a typo produced NULL silently, since the old
      -- lookup-by-name had no not-found branch). Subject and grade were already
      -- injected the same way; this closes the last redundant field.
      select p.olympiad_type_id into v_oly
        from public.olympiad_packages p
       where p.id = p_package_id;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- Module scope (migration 050): olympiad uploads live in 'olympiad' scope —
      -- a topic name matching an exam topic yields a SEPARATE olympiad-scoped row,
      -- so nothing ever surfaces inside the Exams module.
      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic')
            and scope = 'olympiad' limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name, scope)
          values (v_subject, v_grade, v_item->'meta'->>'topic', 'olympiad') returning id into v_topic;
        end if;
        if coalesce(v_item->'meta'->>'subtopic','') <> '' then
          select id into v_subtopic from public.subtopics
            where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
          if v_subtopic is null then
            insert into public.subtopics (topic_id, name)
            values (v_topic, v_item->'meta'->>'subtopic') returning id into v_subtopic;
          end if;
        end if;
      end if;

      -- ---- optional pre-uploaded question image (migration 101) ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- Migration 108: the incoming row's content key, built exactly like the
      -- stored one above. The option ORDER must mirror the insert's
      -- coalesce(order_index, v_order) with v_order starting at 0 — ordinality
      -- is 1-based, hence ord - 1 — or the two keys diverge and nothing ever
      -- matches.
      select md5(
               public.norm_import_text(v_item->'translations'->v_pl->>'body') || chr(31) ||
               public.norm_import_text(v_media::text) || chr(31) ||
               coalesce((
                 select string_agg(
                          public.norm_import_text(o->'text'->>v_pl) || chr(29) ||
                          public.norm_import_text(o->'image'->>v_pl),
                          chr(30) order by coalesce((o->>'order_index')::int, (ord - 1)::int))
                 from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
                        with ordinality as t(o, ord)), '')
             ) into v_key;
      if v_key = any(v_dup_keys) then
        raise exception 'duplicate question already in this grade pool';
      end if;

      -- PRIVATE + published; difficulty removed (difficulty_id null).
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale,
         olympiad_package_id, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'published', v_pl::public.content_locale,
         p_package_id, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''),
                  case when v_loc = v_pl then v_media end);
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
          end if;
        end loop;
      end loop;

      -- v_key is deliberately NOT pushed back into v_dup_keys: the comparison
      -- is against the PRE-EXISTING pool only. Two identical rows inside one
      -- file both import, exactly as they did before 108 — creation and
      -- add-grade are all-or-nothing, so failing the second one would undo a
      -- package creation that used to succeed.
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) is
  'Bulk import of PRIVATE trilingual questions into ONE GRADE POOL of an '
  'olympiad package (Round 34). p_grade_id must be a package target grade '
  '(default: the legacy single package grade). APPENDABLE per grade (migration '
  '108, owner 2026-08-11 — supersedes the migration-059 creation-only rule): a '
  'row whose primary-locale body, option texts and image references already '
  'existed in that pool WHEN THE CALL STARTED is reported as a per-row error '
  'and skipped, so re-uploading a file is safe. Rows inserted by the same call '
  'are never compared against each other, so a file with two identical rows '
  'imports exactly as it did before 108. Rows carrying images are never matched '
  '(media uuids are minted per upload), and the key is bound to the primary '
  'locale on both sides — the same question re-uploaded with a different '
  'primary_locale does not match. Best-effort guard, NOT a constraint — two '
  'simultaneous appends can both insert. Administrators only.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) to authenticated, service_role;



-- -----------------------------------------------------------------------------
-- Round 9 (migration 023): REAL analytics RPCs (parent dashboard + admin
-- platform overview). On-demand aggregation over graded attempts; in-body
-- authorization (service role / admin / linked parent / the child itself);
-- EXECUTE revoked from anon.
-- -----------------------------------------------------------------------------
create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30,
  p_scope text default 'tests'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  -- Module scope (migration 051): 'tests' (default) or 'olympiads'; unknown
  -- values coerce to 'tests' so pre-051 callers keep working unchanged.
  v_scope text := case when p_scope = 'olympiads' then 'olympiads' else 'tests' end;
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  -- COALESCE is load-bearing: current_profile_id() can be NULL (no profile),
  -- which would turn the OR-chain NULL and silently skip an un-coalesced guard.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student_profile_id)
    or public.current_profile_id() = p_student_profile_id
  , false) then
    raise exception 'not allowed';
  end if;

  with graded as (
    select ta.id, ta.submitted_at,
           least(greatest(coalesce(
             extract(epoch from (ta.submitted_at - ta.started_at)) / 60.0, 0), 0), 180)
             as minutes_spent
      from public.test_attempts ta
     where ta.student_profile_id = p_student_profile_id
       and ta.status = 'graded'
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
       -- Module scope (migration 051): olympiad attempts never mix into the
       -- Subjects analytics and vice versa.
       and ((v_scope = 'olympiads' and ta.kind = 'olympiad')
         or (v_scope = 'tests' and ta.kind <> 'olympiad'))
  ),
  ans as (
    -- answered = a non-empty stored selection; empty selection = SKIPPED
    -- (migration 046 — skipped must never count as wrong).
    select a.attempt_id, a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, q.olympiad_package_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'scope', v_scope,
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'answered',  (select count(*) filter (where answered) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where answered and not is_correct) from ans),
      'skipped',   (select count(*) filter (where not answered) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*) filter (where answered), 0) * 100, 1)
                      from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      -- gap-filled last-7-days series (today inclusive)
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only (046); zero-answered days
      -- are omitted (they would otherwise chart as a false 0%).
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(answ, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) filter (where answered) answ,
                     count(*) filter (where is_correct) cor
                from ans group by 1
              having count(*) filter (where answered) > 0) t
    ),
    'per_topic', (
      -- zero-answered topics excluded (046): strongest/weakest must never rank
      -- a topic nobody actually answered.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, t.name as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
               group by a.topic_id, t.name
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select t.name as tname,
                     coalesce(st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.subtopics st on st.id = a.subtopic_id
               group by t.name, coalesce(st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    ),
    'per_package', (
      -- Olympiad scope only (051): per-package breakdown through the attempt
      -- questions' private-pool link. Title is the az translation (the UI may
      -- re-localize from its own catalog); '[]' under tests scope.
      select coalesce(jsonb_agg(jsonb_build_object(
               'package_id', z.pkg, 'title', z.title,
               'attempts', z.att, 'answered', z.answ, 'correct', z.cor,
               'wrong', z.answ - z.cor, 'skipped', z.skp,
               'accuracy', round(z.cor::numeric / nullif(z.answ, 0) * 100, 1))
               order by z.att desc, z.title), '[]'::jsonb)
        from (select a.olympiad_package_id as pkg,
                     coalesce((select tr.title from public.olympiad_package_translations tr
                                where tr.olympiad_package_id = a.olympiad_package_id
                                  and tr.locale = 'az' limit 1), '—') as title,
                     count(distinct a.attempt_id) att,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
               where v_scope = 'olympiads' and a.olympiad_package_id is not null
               group by a.olympiad_package_id) z
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int, text) is
  'Per-child analytics over graded attempts in a rolling window, module-scoped '
  '(migration 051): p_scope tests (default; kind<>olympiad) or olympiads (kind=olympiad, '
  'adds per_package). Answer states separated (046): wrong counts only answered-and-'
  'incorrect; skipped is its own metric; accuracy uses answered as the denominator. '
  'Callable by admins, the linked parent, or the child.';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int, text)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------

create or replace function public.get_admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not coalesce(auth.role() = 'service_role' or public.is_admin(), false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'children_total', (select count(*) from public.students),
    'parents_total',  (select count(*) from public.parents),
    'active_children_7d', (
      select count(distinct student_profile_id) from public.test_attempts
       where submitted_at >= now() - interval '7 days'
    ),
    'attempts_30d', (
      select count(*) from public.test_attempts
       where status = 'graded' and submitted_at >= now() - interval '30 days'
    ),
    'platform_accuracy_30d', (
      select round(count(*) filter (where a.is_correct)::numeric
                   / nullif(count(*), 0) * 100, 1)
        from public.test_attempt_answers a
        join public.test_attempts ta on ta.id = a.attempt_id
       where ta.status = 'graded'
         and ta.submitted_at >= now() - interval '30 days'
    ),
    'questions_published', (
      select count(*) from public.questions
       where status = 'published' and olympiad_package_id is null
    ),
    'active_subscriptions', (
      select count(*) from public.child_subscriptions
       where status in ('trialing', 'active', 'past_due')
    ),
    'signups_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join (select created_at::date dt, count(*) n
                     from public.students group by 1) c on c.dt = d::date
    ),
    'attempts_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 13, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from public.test_attempts
                    where status = 'graded' group by 1) c on c.dt = d::date
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_admin_platform_overview() is
  'Admin-panel platform KPIs (children/parents/actives/attempts/accuracy/questions/'
  'subscriptions) + 30-day signup and 14-day attempts trends. Admin-only (in-body check).';

revoke all on function public.get_admin_platform_overview() from public, anon;
grant execute on function public.get_admin_platform_overview() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Access lifecycle reconciliation (audit C1, migration 036). Expires live
-- subscriptions whose trial/paid period ended and syncs the students.access_status
-- display cache both directions. Scheduled hourly in 016; correctness never
-- depends on it — the attempt RPCs above check current_period_end lazily.
-- -----------------------------------------------------------------------------
create or replace function public.recompute_child_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired    int;
  v_downgraded int;
  v_restored   int;
begin
  -- 1) Expire live subscriptions whose trial/paid period has ended.
  --    Migration 109 kept this step correct WITHOUT a change, because
  --    current_period_end is defined as the MAX of the per-subject period ends
  --    ("is there any coverage left"). Do NOT "fix" it to the MIN: that would
  --    expire a whole subscription — and a paid yearly subject with it — the
  --    moment its shortest-cycle subject lapsed. Per-subject expiry is enforced
  --    where it belongs, in the attempt gates.
  update public.child_subscriptions
     set status = 'expired', updated_at = now()
   where status in ('trialing', 'active', 'past_due')
     and current_period_end is not null
     and current_period_end <= now();
  get diagnostics v_expired = row_count;

  -- 2) Downgrade students whose access flag claims access but who have no live,
  --    date-valid subscription left (canceled keeps access until the already-
  --    paid period ends — same rule as the attempt-RPC guards).
  update public.students s
     set access_status = 'expired'::public.child_access_status
   where s.access_status in ('trialing', 'active')
     and not exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active', 'canceled')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_downgraded = row_count;

  -- 3) Repair the reverse direction: a live dated subscription with a stale
  --    non-access flag.
  update public.students s
     set access_status = case when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and cs.status = 'trialing'
               and cs.current_period_end > now())
           then 'trialing'::public.child_access_status
           else 'active'::public.child_access_status end
   where s.access_status not in ('trialing', 'active')
     and exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_restored = row_count;

  return jsonb_build_object(
    'subscriptions_expired', v_expired,
    'students_downgraded',   v_downgraded,
    'students_restored',     v_restored);
end;
$$;

comment on function public.recompute_child_access() is
  'Hourly reconciliation (audit C1): expires ended subscriptions and syncs students.access_status. Access CORRECTNESS never depends on this job — the attempt RPCs check current_period_end lazily.';

revoke all on function public.recompute_child_access() from public, anon, authenticated;
grant execute on function public.recompute_child_access() to service_role;

-- -----------------------------------------------------------------------------
-- TOPIC-TEST ENGINE (migration 037; docs/plans/TEST_ENGINE_PLAN.md T0).
-- Owner decisions 2026-07-06: FIXED 25 questions, TRUE resume, unlimited
-- attempts with a fresh re-draw. Server-authoritative everything: draw,
-- grading, single-open, expiry. Answer keys are revealed ONLY by
-- get_test_review (status='graded'). Migration 057: topic tests are UNTIMED
-- PRACTICE (no deadline, never rated); rated play = daily rounds/olympiads.
-- -----------------------------------------------------------------------------

-- start_topic_test_attempt: access-guarded (same rule as start_practice_attempt),
-- topic/subtopic scope validated, 25 random published MCQ-family questions
-- (fallback to subject-wide when the scope has none). Untimed since 057.
create or replace function public.start_topic_test_attempt(
  p_subject_id   uuid,
  p_topic_ids    uuid[] default '{}',
  p_subtopic_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;    -- owner decision: fixed
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
begin
  if v_student is null then raise exception 'start_test: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_test: not a student'; end if;

  -- Access: same rule as start_practice_attempt (035 — per-subject, lazy-dated).
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
        -- Migration 109: cs.current_period_end is the MAX of the per-subject
        -- periods, so the subscription outlives its shortest-cycle subject —
        -- gating on it alone would keep serving a lapsed weekly subject. The
        -- coalesce keeps a legacy row (NULL period) behaving exactly as before.
        and coalesce(ss.current_period_end, cs.current_period_end) > now()
    ) then
      raise exception 'start_test: no active access' using errcode = 'check_violation';
    end if;
  end if;

  -- Scope validation: topics must belong to the subject; subtopics to the
  -- chosen topics (and require topics when subtopics are given).
  if cardinality(v_topics) > 50 or cardinality(v_subs) > 100 then
    raise exception 'start_test: scope too large';
  end if;
  if cardinality(v_topics) > 0 and exists (
    select 1 from unnest(v_topics) t(id)
    where not exists (select 1 from public.topics tp where tp.id = t.id and tp.subject_id = p_subject_id)
  ) then
    raise exception 'start_test: topic does not belong to subject';
  end if;
  if cardinality(v_subs) > 0 then
    if cardinality(v_topics) = 0 then
      raise exception 'start_test: subtopics given without topics';
    end if;
    if exists (
      select 1 from unnest(v_subs) s(id)
      where not exists (select 1 from public.subtopics st where st.id = s.id and st.topic_id = any (v_topics))
    ) then
      raise exception 'start_test: subtopic does not belong to the chosen topics';
    end if;
  end if;

  -- Resume: one open practice test at a time. Untimed rows (056+) resume
  -- forever (the 24h cron abandons them); legacy timed rows keep the old
  -- deadline behavior.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is null or v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', v_existing.duration_seconds);
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now()
     where id = v_existing.id;
  end if;

  -- Server-random draw, published MCQ-family, general pool, grade-matched;
  -- scoped to the selection, falling back to subject-wide when the scope has
  -- no questions.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      and (cardinality(v_topics) = 0 or q.topic_id = any (v_topics))
      and (cardinality(v_subs) = 0 or q.subtopic_id = any (v_subs))
    order by random()
    limit c_count
  ) picked;

  if cardinality(v_qids) = 0 and (cardinality(v_topics) > 0 or cardinality(v_subs) > 0) then
    select coalesce(array_agg(id), '{}') into v_qids from (
      select q.id
      from public.questions q
      where q.subject_id = p_subject_id
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.type_id in (
          select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
        )
        and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
        and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      order by random()
      limit c_count
    ) picked;
  end if;

  if cardinality(v_qids) = 0 then
    raise exception 'start_test: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  -- UNTIMED practice (migration 057): no deadline, never rated.
  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', false,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
end;
$$;
comment on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) is
  'Subject PRACTICE test (migration 057): mandatory-scope 25-question draw, UNTIMED '
  '(no deadline) and UNRATED (no points/streak/boards). Rated play = daily rounds.';

-- get_test_attempt: rehydration payload (questions + options WITHOUT is_correct,
-- saved answers + flags, server deadline → remaining seconds). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).
create or replace function public.get_test_attempt(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_loc      text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap     jsonb;
  v_result   jsonb;
begin
  select id, student_profile_id, status, kind, subject_id,
         deadline_at, duration_seconds, score, max_score, daily_round_id
    into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    -- Immutable snapshot content (migration 057) + live answer state.
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'status', v_att.status,
             'kind', v_att.kind,
             'subject_id', v_att.subject_id,
             'deadline_at', v_att.deadline_at,
             'duration_seconds', v_att.duration_seconds,
             'remaining_seconds',
               case when v_att.deadline_at is null then null
                    else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
             'score', v_att.score,
             'max_score', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'type', s.q_el->>'type',
               'topic_id', nullif(s.q_el->>'topic_id','')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'is_marked', taa.is_marked,
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'status', v_att.status,
           'kind', v_att.kind,
           'subject_id', v_att.subject_id,
           'deadline_at', v_att.deadline_at,
           'duration_seconds', v_att.duration_seconds,
           'remaining_seconds',
             case when v_att.deadline_at is null then null
                  else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
           'score', v_att.score,
           'max_score', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'topic_id', qq.topic_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'is_marked', taa.is_marked,
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.questions qq on qq.id = taa.question_id
    left join public.question_types qtp on qtp.id = qq.type_id
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- save_test_answers: idempotent autosave. Only attempt-member rows are touched;
-- rejected once the server deadline has passed.
create or replace function public.save_test_answers(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_rows     int;
  v_saved    int := 0;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'save: attempt is not in progress' using errcode = 'check_violation';
  end if;
  if v_att.deadline_at is not null and now() > v_att.deadline_at then
    raise exception 'save: deadline passed' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_n := v_n + 1;
    exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_marked = coalesce((v_item->>'is_marked')::boolean, is_marked),
           time_spent_ms = least(coalesce(nullif(v_item->>'time_spent_ms','')::bigint, time_spent_ms, 0), 86400000),
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    v_saved := v_saved + v_rows;
  end loop;

  return jsonb_build_object(
    'saved', v_saved,
    'remaining_seconds',
      case when v_att.deadline_at is null then null
           else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end);
end;
$$;

-- submit_test_attempt: merge final answers (60s grace past the deadline; later
-- answers are IGNORED, saved ones still grade), then grade FROM THE STORED ROWS
-- (never from the client array — audit-H5 posture). Idempotent when graded.
-- Migration 057: daily-round attempts grade against the round's immutable
-- SNAPSHOT correctness (bank edits after generation can never change history).
create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_answers    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_snap     jsonb;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_r        record;
  v_correct  uuid[];
  v_ok       boolean;
  v_score    numeric := 0;
  v_max      int;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  -- Idempotent: an already-graded attempt returns its stored result.
  if v_att.status = 'graded' then
    return public.test_attempt_result(p_attempt_id);
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'submit: attempt is not in progress' using errcode = 'check_violation';
  end if;

  -- Daily-round attempts grade against the round's immutable snapshot
  -- (migration 057): bank edits after generation can never change history.
  -- Round 38: per-student attempts have NO round — they grade from live
  -- options below, like topic tests (option-id stability is DB-guarded).
  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  -- Merge the final client answers only within deadline + 60s grace.
  if p_answers is not null
     and (v_att.deadline_at is null or now() <= v_att.deadline_at + interval '60 seconds') then
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_n := v_n + 1;
      exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)
      v_qid := nullif(v_item->>'question_id', '')::uuid;
      if v_qid is null or v_qid = any (v_seen) then continue; end if;
      v_seen := v_seen || v_qid;
      select coalesce(array_agg(e::uuid), '{}')
        into v_sel
        from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
      update public.test_attempt_answers
         set selected_option_ids = v_sel, updated_at = now()
       where attempt_id = p_attempt_id and question_id = v_qid;
    end loop;
  end if;

  -- Grade from the STORED rows.
  for v_r in
    select question_id, selected_option_ids
    from public.test_attempt_answers where attempt_id = p_attempt_id
  loop
    if v_snap is not null then
      select coalesce(array_agg((o->>'option_id')::uuid), '{}')
        into v_correct
        from jsonb_array_elements(v_snap) q_el
        cross join lateral jsonb_array_elements(q_el->'options') o
        where (q_el->>'question_id')::uuid = v_r.question_id
          and coalesce((o->>'is_correct')::boolean, false);
    else
      select coalesce(array_agg(ao.id), '{}')
        into v_correct
        from public.answer_options ao
        where ao.question_id = v_r.question_id and ao.is_correct;
    end if;

    v_ok := (array_length(v_correct, 1) is not null)
        and (coalesce(v_r.selected_option_ids, '{}') <@ v_correct)
        and (v_correct <@ coalesce(v_r.selected_option_ids, '{}'))
        and coalesce(array_length(v_r.selected_option_ids, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_r.question_id;
    if v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  begin
    update public.test_attempts
       set status = 'graded', score = v_score, max_score = v_max,
           submitted_at = now(), graded_at = now(), updated_at = now()
     where id = p_attempt_id;
  exception when unique_violation then
    -- Another attempt of the same subject+day was submitted first (second
    -- device). This one can never grade — surface the friendly signal; the
    -- losing attempt stays in_progress and is swept by the expiry cron.
    -- (Any state write here would be undone by this raise — savepoint
    -- semantics — so none is attempted.)
    raise exception 'daily: already attempted today' using errcode = 'unique_violation';
  end;

  return public.test_attempt_result(p_attempt_id);
end;
$$;

-- Shared result payload (score + per-question + per-topic breakdown). Internal
-- helper for submit (and re-reads); owner check lives in the callers.
create or replace function public.test_attempt_result(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'attempt_id', ta.id,
    'status', ta.status,
    'score', ta.score,
    'max', ta.max_score,
    'submitted_at', ta.submitted_at,
    'results', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question_id', taa.question_id, 'is_correct', taa.is_correct)), '[]'::jsonb)
      from public.test_attempt_answers taa where taa.attempt_id = ta.id),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', b.tid, 'name', b.tname, 'total', b.total, 'correct', b.correct)), '[]'::jsonb)
      from (
        select q.topic_id as tid, tp.name as tname,
               count(*) as total,
               count(*) filter (where taa.is_correct) as correct
        from public.test_attempt_answers taa
        join public.questions q on q.id = taa.question_id
        left join public.topics tp on tp.id = q.topic_id
        where taa.attempt_id = ta.id
        group by q.topic_id, tp.name
      ) b))
  from public.test_attempts ta
  where ta.id = p_attempt_id;
$$;

-- cancel_test_attempt: counts for NOTHING (no score, no points, no streak).
create or replace function public.cancel_test_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
begin
  select id, student_profile_id, status into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'cancel: attempt is not in progress' using errcode = 'check_violation';
  end if;

  update public.test_attempts
     set status = 'canceled', canceled_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- get_test_review: the ONLY place answer keys are revealed, and only for the
-- owner's GRADED attempt (works for practice attempts too). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).
create or replace function public.get_test_review(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap    jsonb;
  v_result  jsonb;
begin
  select id, student_profile_id, status, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'graded' then
    raise exception 'review: attempt not graded yet' using errcode = 'check_violation';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'score', v_att.score,
             'max', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'is_correct', taa.is_correct,
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'explanation', coalesce(s.q_el->'translations'->v_loc->>'explanation',
                                       s.q_el->'translations'->'az'->>'explanation'),
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'),
                                      'is_correct', coalesce((o->>'is_correct')::boolean, false))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'score', v_att.score,
           'max', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'is_correct', taa.is_correct,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'explanation', coalesce(qe.explanation_body, qe_az.explanation_body),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end,
                               'is_correct', ao.is_correct)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    left join public.question_explanations qe
      on qe.question_id = taa.question_id and qe.locale = v_loc::public.content_locale
    left join public.question_explanations qe_az
      on qe_az.question_id = taa.question_id and qe_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- expire_stale_test_attempts (cron, 016): timed attempts (legacy tests,
-- olympiads, rated daily rounds) 5 min past deadline → 'expired'; deadline-less
-- attempts (practice, untimed topic tests, previous-day replays) stuck
-- in_progress >24h → 'abandoned'. (Migration 057.)
create or replace function public.expire_stale_test_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tests int;
  v_other int;
begin
  -- Timed attempts (tests legacy, olympiads, rated daily rounds): hard-expire
  -- past the deadline (5-min grace).
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind in ('test', 'olympiad', 'daily') and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  -- Deadline-less attempts (practice, untimed topic tests, previous-day
  -- replays, legacy olympiad rows): 24h abandon.
  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily', 'test') and status = 'in_progress'
     and deadline_at is null
     and started_at < now() - interval '24 hours';
  get diagnostics v_other = row_count;

  return jsonb_build_object('tests_expired', v_tests, 'others_abandoned', v_other);
end;
$$;

-- Grants: learner-facing RPCs are authenticated (owner-checked in body);
-- the sweep + result helper are service-role only.
revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;
revoke all on function public.get_test_attempt(uuid, text) from public, anon;
grant execute on function public.get_test_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.save_test_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_test_answers(uuid, jsonb) to authenticated, service_role;
revoke all on function public.submit_test_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated, service_role;
revoke all on function public.cancel_test_attempt(uuid) from public, anon;
grant execute on function public.cancel_test_attempt(uuid) to authenticated, service_role;
revoke all on function public.get_test_review(uuid, text) from public, anon;
grant execute on function public.get_test_review(uuid, text) to authenticated, service_role;
revoke all on function public.test_attempt_result(uuid) from public, anon, authenticated;
grant execute on function public.test_attempt_result(uuid) to service_role;
revoke all on function public.expire_stale_test_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_test_attempts() to service_role;


-- -----------------------------------------------------------------------------
-- DAILY ROUNDS ENGINE (migrations 056/082/083). Round 38 model: a RATED daily
-- attempt is a PER-STUDENT subtopic-balanced random 25 (timed 25 min) drawn at
-- start; the day is consumed ONLY by SUBMIT (partial unique index on graded
-- attempts in 005) — a live attempt resumes, a lapsed one is replaced by a
-- FRESH set. Yesterday = unlimited UNTIMED practice on the student's LOCKED
-- set (daily_practice_sets: own -> peer -> legacy round -> generated), never
-- rated. daily_rounds is LEGACY storage (history + transition fallback).
-- -----------------------------------------------------------------------------

-- NOTE: this LANGUAGE SQL body reads questions.olympiad_package_id, a column
-- added by 015 (numeric run order) — skip body validation; the body is planned
-- at call time and 013 #67 covers it.
set check_function_bodies = off;
create or replace function public.draw_daily_questions(
  p_subject_id uuid, p_grade_id uuid, p_count int default 25
)
returns uuid[]
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  -- Cumulative-term pool: published, general bank, term reviewed and <= current,
  -- valid 5-option questions of this subject, for this grade OR shared
  -- (grade_id IS NULL). SUBTOPIC-BALANCED: rank randomly within each subtopic
  -- bucket, take bucket_rank round-robin, random inside a pass.
  select coalesce(array_agg(id), '{}') from (
    select p.id
    from (
      select q.id,
             row_number() over (
               partition by coalesce(q.subtopic_id, q.topic_id, q.id)
               order by random()) as bucket_rank,
             random() as tiebreak
      from public.questions q
      where q.subject_id = p_subject_id
        and (q.grade_id = p_grade_id or q.grade_id is null)
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.term is not null and q.term <= public.current_academic_term()
        and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
        and exists (select 1 from public.answer_options ao
                     where ao.question_id = q.id and ao.is_correct)
    ) p
    order by p.bucket_rank, p.tiebreak
    limit greatest(1, least(coalesce(p_count, 25), 100))
  ) picked;
$$;
comment on function public.draw_daily_questions(uuid, uuid, int) is
  'Subtopic-balanced random draw from the cumulative-term published pool '
  '(Round 38 — per-student rated sets and generated practice fallbacks).';
reset check_function_bodies;
revoke all on function public.draw_daily_questions(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.draw_daily_questions(uuid, uuid, int) to service_role;

create or replace function public.start_daily_round_attempt(
  p_subject_id uuid,
  p_day        text default 'today'   -- 'today' (rated) | 'yesterday' (practice)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_qids     uuid[];
  v_set      public.daily_practice_sets;
  v_existing record;
  v_attempt  uuid;
  v_source   text;
begin
  if v_student is null then raise exception 'daily: not authenticated'; end if;
  if coalesce(p_day, 'today') not in ('today', 'yesterday') then
    raise exception 'daily: bad day' using errcode = 'check_violation';
  end if;

  select grade_id into v_grade from public.students where profile_id = v_student;
  if not found then raise exception 'daily: not a student'; end if;
  if v_grade is null then
    raise exception 'daily: student has no grade' using errcode = 'check_violation';
  end if;

  -- Access: identical gate to the practice/test engines (per-subject).
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
        -- Migration 109: cs.current_period_end is the MAX of the per-subject
        -- periods, so the subscription outlives its shortest-cycle subject —
        -- gating on it alone would keep serving a lapsed weekly subject. The
        -- coalesce keeps a legacy row (NULL period) behaving exactly as before.
        and coalesce(ss.current_period_end, cs.current_period_end) > now()
    ) then
      raise exception 'daily: no active access' using errcode = 'check_violation';
    end if;
  end if;

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_rated then 0 else 1 end);

  if v_rated then
    -- Round 43: the day is consumed AT CREATION. Look at today's live/graded
    -- rated attempt: resume an in-progress one; block when it is completed;
    -- otherwise (no attempt yet) draw a fresh set and create it.
    select id, status, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and round_date = v_date
      and status in ('in_progress', 'submitted', 'graded')
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.status = 'in_progress' then
        -- Untimed: reopen the same attempt (refresh / other tab / resume).
        return jsonb_build_object(
          'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
          'deadline_at', null, 'duration_seconds', null,
          'count', cardinality(v_existing.question_ids));
      end if;
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- Fresh per-student subtopic-balanced draw. A short pool raises HERE, so
    -- the day is never consumed on a failed draw.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  else
    -- YESTERDAY: get-or-create the LOCKED practice set for this student.
    select * into v_set from public.daily_practice_sets
     where student_profile_id = v_student and subject_id = p_subject_id
       and for_date = v_date;
    if not found then
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      if v_qids is null then
        -- A peer's graded set (same subject + GRADE + date, COUNTRY-WIDE;
        -- earliest submit — deterministic; question ids only, no identity).
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
      if v_qids is null then
        v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
        v_source := 'generated';
        if coalesce(cardinality(v_qids), 0) < c_count then
          raise exception 'daily: no round was held yesterday' using errcode = 'no_data_found';
        end if;
      end if;
      insert into public.daily_practice_sets
        (student_profile_id, subject_id, for_date, question_ids, source)
      values (v_student, p_subject_id, v_date, v_qids, v_source)
      on conflict (student_profile_id, subject_id, for_date) do nothing;
      select * into v_set from public.daily_practice_sets
       where student_profile_id = v_student and subject_id = p_subject_id
         and for_date = v_date;
    end if;
    v_qids := v_set.question_ids;

    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;
  end if;

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status, question_ids,
     deadline_at, duration_seconds, is_rated, round_date)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
exception when unique_violation then
  -- A creation race (double tap / two tabs) collapses onto the winning row.
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 43: today = RATED per-student subtopic-balanced random 25, UNTIMED, '
  'consumed AT CREATION (uq_rated_daily_live_per_day: one live/graded attempt per '
  'subject+day — resume in-progress, block when completed); a <25 pool raises '
  'before any row is created. yesterday = unlimited UNTIMED practice on the '
  'student''s LOCKED set (own -> peer country-wide by grade -> legacy round -> '
  'generated), never rated.';
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Column protection + single writer (trigger on graded) + board reads + rollover/reset.
-- -----------------------------------------------------------------------------
-- Column protection: students_write is a ROW policy (child/parent can update
-- their own row), so the cached score/streak columns need their own guard.
create or replace function public.protect_student_progress_cols()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.points_all_time  is distinct from old.points_all_time
    or new.points_month     is distinct from old.points_month
    or new.points_month_key is distinct from old.points_month_key
    or new.last_points_at   is distinct from old.last_points_at
    or new.current_streak   is distinct from old.current_streak
    or new.best_streak      is distinct from old.best_streak
    or new.last_active_date is distinct from old.last_active_date
    or new.streak_tz        is distinct from old.streak_tz
  ) then
    raise exception 'students: leaderboard columns are server-managed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_student_progress on public.students;
create trigger trg_protect_student_progress
  before update on public.students
  for each row execute function public.protect_student_progress_cols();

--

create or replace function public.award_attempt_points(p_attempt_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $$
declare
  v_student   uuid;
  v_subject   uuid;
  v_kind      text;
  v_status    public.attempt_status;
  v_rated     boolean;
  v_tz        text;
  v_today     date;
  v_mkey      text;
  v_per       numeric := 10;
  v_kw        numeric := 1.0;
  v_correct   int := 0;
  v_answered  int := 0;
  v_presented int := 0;
  v_raw       numeric := 0;
  v_wnum0     numeric := 0;   -- difficulty-weighted, before kind weight
  v_wden0     numeric := 0;
  v_wnum      numeric := 0;
  v_wden      numeric := 0;
  v_valid     boolean := false;
  v_snapshot  jsonb;
  v_awarded   numeric := 0;
  v_rows      int;
  v_last      date;
  v_new_day   boolean := false;
begin
  select student_profile_id, subject_id, kind::text, status, is_rated
    into v_student, v_subject, v_kind, v_status, v_rated
  from public.test_attempts where id = p_attempt_id;
  if v_student is null or v_status <> 'graded' then
    return;
  end if;
  -- Migration 057: ONLY rated attempts score. Practice (topic tests,
  -- previous-day replays) never touches points/streak.
  if not coalesce(v_rated, false) then
    return;
  end if;

  -- Round 48 (owner): PURCHASED OLYMPIADS ARE PRACTICE-ONLY. An olympiad
  -- attempt is still stored, graded and reviewable for history, but it awards
  -- NO points, contributes NO percentage/ranking weight, updates NO cached
  -- leaderboard counter, records NO activity day and can never extend a
  -- streak. Returning HERE -- before the ledger insert -- is what guarantees
  -- all of that, because every one of those writes is downstream of it.
  -- Olympiads also never consume the daily rated-round slot: that is keyed on
  -- kind = 'daily', which this path never reaches.
  if v_kind = 'olympiad' then
    return;
  end if;

  select coalesce(streak_tz, 'Asia/Baku'), last_active_date
    into v_tz, v_last
  from public.students where profile_id = v_student;
  if v_tz is null then return; end if;   -- not a child row
  v_today := (now() at time zone v_tz)::date;
  v_mkey  := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');  -- board-level month key

  v_per  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.per_correct'), 10);
  -- Round 48: the olympiad multiplier is gone. Olympiads return above, so the
  -- kind weight is always 1.0 and the setting it used to read is deleted in
  -- PART B (dead config an admin could otherwise set to no effect).
  v_kw   := 1.0;

  -- ONE scan over the stored answer rows (the engine pre-creates one row per
  -- PRESENTED question; unanswered rows were graded is_correct=false):
  --   legacy points input (v_correct/v_raw - unchanged math) AND the
  --   percentage snapshot (counts + difficulty-weighted num/den).
  select count(*) filter (where a.is_correct),
         count(*) filter (where coalesce(array_length(a.selected_option_ids, 1), 0) > 0
                            or nullif(btrim(coalesce(a.answer_text, '')), '') is not null),
         count(*),
         coalesce(sum(v_per * coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_answered, v_presented, v_raw, v_wnum0, v_wden0
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id;

  -- Percentage snapshot: kind weight in BOTH numerator and denominator so the
  -- ratio can never exceed 1 (spec 17.4). With olympiads gone the weight is a
  -- constant 1.0, but the shape is kept so a future weighted kind slots in.
  v_wnum  := round(v_wnum0 * v_kw, 4);
  v_wden  := round(v_wden0 * v_kw, 4);
  v_valid := v_wden > 0;
  v_snapshot := jsonb_build_object(
    'kind', v_kind,
    'kind_weight', v_kw,
    'points_per_correct', v_per,
    'difficulty_weights',
      coalesce((select jsonb_object_agg(dl.code, dl.weight) from public.difficulty_levels dl),
               '{}'::jsonb));

  -- LEGACY points (unchanged since 057): kept for rewards/reports/history.
  v_awarded := round(v_raw, 2);

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json,
     correct_count, answered_count, presented_count,
     weighted_num, weighted_den, weights_snapshot, pct_valid)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', false),
     v_correct, v_answered, v_presented,
     v_wnum, v_wden, v_snapshot, v_valid)
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;     -- already scored

  -- Streak: single writer, LOCAL-date row + cached counters.
  insert into public.student_activity_days (student_profile_id, activity_date)
  values (v_student, v_today)
  on conflict (student_profile_id, activity_date)
    do update set attempts = public.student_activity_days.attempts + 1;
  v_new_day := (v_last is distinct from v_today);

  -- Cached counters: legacy points AND percentage aggregates roll over on the
  -- SAME points_month_key (every month-cache column below uses the identical
  -- key predicate, evaluated against the pre-update row).
  update public.students
     set points_all_time = points_all_time + v_awarded,
         points_month    = case when points_month_key is distinct from v_mkey
                                then v_awarded else points_month + v_awarded end,
         pct_num_month   = case when points_month_key is distinct from v_mkey
                                then v_wnum else pct_num_month + v_wnum end,
         pct_den_month   = case when points_month_key is distinct from v_mkey
                                then v_wden else pct_den_month + v_wden end,
         lb_correct_month   = case when points_month_key is distinct from v_mkey
                                   then v_correct else lb_correct_month + v_correct end,
         lb_presented_month = case when points_month_key is distinct from v_mkey
                                   then v_presented else lb_presented_month + v_presented end,
         lb_attempts_month  = case when points_month_key is distinct from v_mkey
                                   then (v_valid)::int else lb_attempts_month + (v_valid)::int end,
         pct_num_all      = pct_num_all + v_wnum,
         pct_den_all      = pct_den_all + v_wden,
         lb_correct_all   = lb_correct_all + v_correct,
         lb_presented_all = lb_presented_all + v_presented,
         lb_attempts_all  = lb_attempts_all + (v_valid)::int,
         points_month_key = v_mkey,
         last_points_at  = now(),
         current_streak  = case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end,
         best_streak     = greatest(best_streak, case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end),
         last_active_date = v_today,
         updated_at      = now()
   where profile_id = v_student;
end;
$$;
comment on function public.award_attempt_points(uuid) is
  'SINGLE leaderboard writer (rated attempts ONLY since migration 057): ledger row '
  '(once per graded attempt) with the Round-36 percentage snapshot (counts + weighted '
  'num/den + coefficient snapshot), legacy points (unchanged math), cached point AND '
  'percentage aggregates (lazy month rollover) and streak. Fired by '
  'trg_award_points_on_graded; never callable by clients.';
revoke all on function public.award_attempt_points(uuid) from public, anon, authenticated;
grant execute on function public.award_attempt_points(uuid) to service_role;

create or replace function public.award_attempt_points_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.award_attempt_points(new.id);
  exception when others then
    -- Points must never break grading; the ledger stays consistent (no row =
    -- not scored) and the attempt can be re-awarded by support if ever needed.
    raise warning 'award_attempt_points failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_award_points_on_graded on public.test_attempts;
create trigger trg_award_points_on_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.award_attempt_points_tg();

-- Attempt-graded notification producer (migration 068). Lives in the DB so
-- EVERY grading path notifies exactly once (web action, mobile direct RPC,
-- result-page idempotent submit, legacy grade_practice_attempt) — the web-app
-- emitter is retired. Mirrors the retired web emitter EXACTLY: recipient =
-- the attempt's student, type 'attempt_graded', fixed az title/body with
-- structured {attempt_id, score, max} in data_json (trim_scale renders
-- numeric(8,2) like a JS Number), priority 5, in_app channel, category
-- 'progress', action_url '/child/test/result/<id>' and the IDENTICAL
-- idempotency key 'attempt:<attemptId>' so a duplicate producer can never
-- double-insert. Failure-safe like the award trigger: a notification failure
-- must never abort grading.
create or replace function public.notify_attempt_graded_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Web-emitter parity: it only fired when submit returned finite score/max
  -- (grading always sets both in the same UPDATE that flips status; belt and
  -- braces for any exotic path that grades without a score).
  if new.score is null or new.max_score is null then
    return new;
  end if;
  begin
    perform public.create_notification(
      new.student_profile_id,
      'attempt_graded',
      'Nəticə hazırdır',
      'Sınağın qiymətləndirildi: ' || trim_scale(new.score)::text
        || '/' || trim_scale(new.max_score)::text || '.',
      jsonb_build_object(
        'attempt_id', new.id,
        'score', trim_scale(new.score),
        'max', trim_scale(new.max_score)),
      '{in_app}',
      'attempt:' || new.id::text,     -- EXACT web key format: attempt:<attemptId>
      5,
      '/child/test/result/' || new.id::text,
      'progress',
      null);
  exception when others then
    -- The inbox write must never break grading (mirrors award_attempt_points_tg).
    raise warning 'notify_attempt_graded failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
comment on function public.notify_attempt_graded_tg() is
  'DB producer of the attempt_graded notification (migration 068): fires on the '
  '-> graded transition for EVERY grading path (web action, mobile RPC, legacy '
  'practice). Same idempotency key (attempt:<id>) the retired web emitter used, '
  'so a duplicate producer can never double-insert. Failure-safe: warnings only.';

drop trigger if exists trg_notify_attempt_graded on public.test_attempts;
create trigger trg_notify_attempt_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_attempt_graded_tg();

--

-- Internal: full ranked set for one board/scope/period. service-internal only.
-- Migration 048: board rows carry the student's city/school/grade context and
-- get_leaderboard ALWAYS returns the "First L." display name (server-formatted;
-- the full last name and every internal id stay in the DB). Migration 058:
-- rows also carry the DISTRICT + a 'district' scope filter. Migration 064
-- (Round 21): district = the school's rayon with the rayon STORED on the
-- student as fallback (coalesce; the students trigger keeps the two in
-- agreement). Return types changed -> drop both before recreating.
drop function if exists public.get_leaderboard(text, text, uuid, text, int);
drop function if exists public.lb_rows(text, text, uuid, text);

create function public.lb_rows(
  p_board    text,          -- 'percent' | 'streak' ('points' = deprecated alias of 'percent')
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'district' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (percent only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, district_name text, school_name text, grade_level int,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_board text := case when p_board = 'points' then 'percent' else p_board end;
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  -- Round 43: eligibility is rounds-only — a single completed-attempts minimum.
  v_mina  int  := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_board not in ('percent', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'district', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if v_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  if v_board = 'streak' then
    return query
      select st.profile_id,
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             false, 0, 0, 0
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select l.student_profile_id, round(100 * l.num / l.den, 4),
             st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int,
             (l.att < v_mina), l.pres::int, l.corr::int, l.att::int
      from (
        select sl.student_profile_id,
               sum(sl.weighted_num)    as num,
               sum(sl.weighted_den)    as den,
               sum(sl.presented_count) as pres,
               sum(sl.correct_count)   as corr,
               count(*)                as att
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and sl.pct_valid
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
        having sum(sl.weighted_den) > 0
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id;
  else
    return query
      select st.profile_id,
             round(100 * (case when p_period = 'all_time' then st.pct_num_all
                               when st.points_month_key = v_mkey then st.pct_num_month
                               else 0 end)
                       / (case when p_period = 'all_time' then st.pct_den_all
                               when st.points_month_key = v_mkey then st.pct_den_month
                               else 1 end), 4),
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             ((case when p_period = 'all_time' then st.lb_attempts_all
                    when st.points_month_key = v_mkey then st.lb_attempts_month
                    else 0 end) < v_mina),
             (case when p_period = 'all_time' then st.lb_presented_all
                   when st.points_month_key = v_mkey then st.lb_presented_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_correct_all
                   when st.points_month_key = v_mkey then st.lb_correct_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_attempts_all
                   when st.points_month_key = v_mkey then st.lb_attempts_month
                   else 0 end)::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'    and st.grade_id    = p_scope_id)
             or (p_scope = 'city'     and st.district_id = p_scope_id)
             or (p_scope = 'district' and coalesce(sc.city_district_id, st.city_district_id) = p_scope_id)
             or (p_scope = 'school'   and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.pct_den_all
                  when st.points_month_key = v_mkey then st.pct_den_month
                  else 0 end) > 0;
  end if;
end;
$$;
comment on function public.lb_rows(text, text, uuid, text) is
  'Internal percentage-board row source. value = 100 x weighted correct / weighted '
  'presented over the period. Round 43: is_provisional = attempts < min_attempts '
  '(rounds-only eligibility; questions are a secondary stat only). service-internal.';
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- get_leaderboard is unchanged (reads is_provisional from lb_rows) but must be
-- recreated because lb_rows was dropped/recreated above.
create function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric, is_self boolean,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    with base as (
      select * from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
    ),
    ranked as (
      select b.*,
             rank() over (order by b.value desc)::int as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b where not b.is_provisional
    ),
    prov as (
      select b.*, null::int as rnk,
             (select count(*) from base x where not x.is_provisional)
               + row_number() over (order by b.value desc, b.profile_id) as ord
      from base b where b.is_provisional
    ),
    unioned as (
      select * from ranked
      union all
      select * from prov
    )
    select u.rnk,
           trim(coalesce(u.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(u.last_name), ''), 1) || '.', '')),
           u.city_name, u.district_name, u.school_name, u.grade_level,
           u.value, u.profile_id = v_me,
           u.is_provisional, u.questions, u.correct, u.attempts
    from unioned u
    where u.ord <= v_limit
    order by u.ord;
end;
$$;
comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live percentage board: competition rank (ties share) on the unrounded value; '
  'provisional rows (fewer than min_attempts rounds) listed after ranked ones with '
  'rank NULL. Numeric ranks only; no ids leave the server.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- "Your rank" card: caller-scoped (no student parameter — never IDOR-able).
create or replace function public.get_my_leaderboard_rank(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := public.current_profile_id();
  v_out  jsonb;
  v_mina int  := coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'leaderboard: not authenticated'; end if;
  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = v_me;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

-- Parent panel: per-child position under the active filters (migration 058).
create or replace function public.get_child_leaderboard_position(
  p_student  uuid,
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out  jsonb;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student)
    or public.current_profile_id() = p_student
  , false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = p_student;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
comment on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) is
  'Parent-panel per-child board position: rank/total/value + provisional (fewer than '
  'min_attempts rounds). Parent-link/admin/self enforced in-body.';
revoke all on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) to authenticated, service_role;

-- Landing page: anon public top-10, anonymized (migration 058).
create or replace function public.get_public_leaderboard(p_limit int default 10)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  -- Overall board = global all-time percentage; provisional (low-sample)
  -- results never appear on the public site. Names are anonymized server-side:
  -- 'Şagird XXXX' (last 4 digits of the 8-digit child id, leading zeros kept).
  return query
    select r.rnk, 'Şagird ' || coalesce(right(st.child_unique_id::text, 4), '····'),
           r.city_name, r.district_name, r.school_name, r.grade_level, r.value
    from (
      select t.*,
             rank() over (order by t.value desc)::int as rnk,
             row_number() over (order by t.value desc, t.best_streak desc,
                                t.last_points_at asc nulls last, t.profile_id) as ord
      from public.lb_rows('percent', 'global', null, 'all_time') t
      where not t.is_provisional
    ) r
    join public.students st on st.profile_id = r.profile_id
    where r.ord <= v_limit
    order by r.ord;
end;
$$;
comment on function public.get_public_leaderboard(int) is
  'PUBLIC landing-page board (Round 36): top-10 global all-time PERCENTAGE, ranked '
  '(non-provisional) students only, competition ranks, anonymized "Şagird XXXX" names. '
  'Anon-callable by design; hard-capped at 10 rows.';
revoke all on function public.get_public_leaderboard(int) from public;
grant execute on function public.get_public_leaderboard(int) to anon, authenticated, service_role;

-- Streak status (self): live state + lazy zeroing of a lost streak.
create or replace function public.get_streak_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_tz    text;
  v_cur   int;
  v_best  int;
  v_last  date;
  v_today date;
  v_state text;
  v_hours numeric;
begin
  if v_me is null then raise exception 'streak: not authenticated'; end if;
  select coalesce(streak_tz, 'Asia/Baku'), current_streak, best_streak, last_active_date
    into v_tz, v_cur, v_best, v_last
  from public.students where profile_id = v_me;
  if v_tz is null then raise exception 'streak: not a student'; end if;
  v_today := (now() at time zone v_tz)::date;

  if v_last = v_today then
    v_state := 'active'; v_hours := null;
  elsif v_last = v_today - 1 then
    v_state := 'at_risk';
    v_hours := round(extract(epoch from
      ((v_today + 1)::timestamp at time zone v_tz - now())) / 3600.0, 1);
  else
    v_state := 'lost'; v_hours := 0;
    if v_cur > 0 then
      update public.students set current_streak = 0, updated_at = now()
       where profile_id = v_me;
      v_cur := 0;
    end if;
  end if;
  return jsonb_build_object('current', v_cur, 'best', v_best,
                            'state', v_state, 'hours_until_loss', v_hours);
end;
$$;
revoke all on function public.get_streak_status() from public, anon;
grant execute on function public.get_streak_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Season rollover + admin reset
-- -----------------------------------------------------------------------------
-- Archives a CLOSED month (top 100 global, computed FROM THE LEDGER — immune to
-- lazy cache rollover) into leaderboard_periods + leaderboard_snapshots, then
-- zeroes stale points_month caches. No-ops when the month has no ledger rows.
create or replace function public.leaderboard_month_rollover(p_month_key text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text := coalesce(p_month_key,
              to_char((now() at time zone 'Asia/Baku') - interval '1 month', 'YYYY-MM'));
  v_now_key text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_start  date := to_date(v_key || '-01', 'YYYY-MM-DD');
  v_period uuid;
  v_rows   jsonb;
  v_mina   int := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  select jsonb_agg(jsonb_build_object(
           'rank', rnk, 'student_profile_id', student_profile_id,
           'pct', pct, 'questions', pres, 'correct', corr, 'points', pts,
           'metric', 'percent') order by ord)
    into v_rows
  from (
    select t.*,
           rank() over (order by t.pct desc)::int as rnk,
           row_number() over (order by t.pct desc, t.student_profile_id) as ord
    from (
      select sl.student_profile_id,
             round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
             sum(sl.presented_count) as pres,
             sum(sl.correct_count)   as corr,
             sum(sl.points)          as pts,
             count(*)                as att
      from public.student_points_ledger sl
      where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_key
        and sl.pct_valid
      group by sl.student_profile_id
      having sum(sl.weighted_den) > 0
    ) t
    where t.att >= v_mina
    order by ord
    limit 100
  ) ranked;

  if v_rows is not null then
    insert into public.leaderboard_periods (period_type, starts_at, ends_at)
    values ('monthly',
            (v_start::timestamp at time zone 'Asia/Baku'),
            ((v_start + interval '1 month')::timestamp at time zone 'Asia/Baku'))
    on conflict (period_type, starts_at, ends_at)
      do update set updated_at = now()
    returning id into v_period;
    insert into public.leaderboard_snapshots (period_id, scope_type, generated_at, metadata, entries_json)
    values (v_period, 'global', now(),
            jsonb_build_object('month', v_key, 'source', 'ledger', 'metric', 'percent'),
            v_rows);
  end if;

  update public.students
     set points_month = 0,
         pct_num_month = 0, pct_den_month = 0,
         lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
         points_month_key = v_now_key,
         updated_at = now()
   where (points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0)
     and points_month_key is distinct from v_now_key;
end;
$$;
revoke all on function public.leaderboard_month_rollover(text) from public, anon, authenticated;
grant execute on function public.leaderboard_month_rollover(text) to service_role;

-- Cron entrypoint: runs daily, acts only on the 1st (Asia/Baku).
create or replace function public.leaderboard_rollover_if_month_start()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if extract(day from now() at time zone 'Asia/Baku') = 1 then
    perform public.leaderboard_month_rollover();
  end if;
end;
$$;
revoke all on function public.leaderboard_rollover_if_month_start() from public, anon, authenticated;
grant execute on function public.leaderboard_rollover_if_month_start() to service_role;

-- Admin reset (service_role only; the admin action audits the call):
--   'season' = archive the CURRENT month now + zero month caches;
--   'hard'   = zero everything (caches + ledger + activity) — destructive, owner action.
create or replace function public.admin_reset_leaderboard(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_mode = 'season' then
    perform public.leaderboard_month_rollover(to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'));
    update public.students
       set points_month = 0,
           pct_num_month = 0, pct_den_month = 0,
           lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
           updated_at = now()
     where points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0;
  elsif p_mode = 'hard' then
    delete from public.student_points_ledger;
    delete from public.student_activity_days;
    update public.students
       set points_all_time = 0, points_month = 0, points_month_key = null,
           pct_num_month = 0, pct_den_month = 0, pct_num_all = 0, pct_den_all = 0,
           lb_correct_month = 0, lb_correct_all = 0,
           lb_presented_month = 0, lb_presented_all = 0,
           lb_attempts_month = 0, lb_attempts_all = 0,
           last_points_at = null, current_streak = 0, best_streak = 0,
           last_active_date = null, updated_at = now()
     where points_all_time <> 0 or points_month <> 0 or current_streak <> 0
        or best_streak <> 0 or last_points_at is not null
        or pct_den_all <> 0 or pct_den_month <> 0 or lb_attempts_all <> 0;
  else
    raise exception 'reset: mode must be season|hard' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function public.admin_reset_leaderboard(text) from public, anon, authenticated;
grant execute on function public.admin_reset_leaderboard(text) to service_role;

--


-- -----------------------------------------------------------------------------
-- LEADERBOARD SEASONS (backported from migrations/2026_07_07_041)
-- Seasons updated_at trigger + live-standings helper + CRUD RPCs + parent child summary.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at_seasons on public.leaderboard_seasons;
create trigger trg_set_updated_at_seasons
  before update on public.leaderboard_seasons
  for each row execute function public.set_updated_at();

-- Internal helper: top-N live standings for an [starts,ends] window from the ledger.
create or replace function public.lb_season_live(p_starts timestamptz, p_ends timestamptz, p_limit int)
returns table (rank int, student_profile_id uuid, display_name text, value numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rank() over (order by t.pct desc)::int as rank,
         t.student_profile_id,
         trim(coalesce(st.first_name,'') || ' ' ||
              coalesce(left(nullif(st.last_name,''),1) || '.', '')) as display_name,
         t.pct as value
  from (
    select sl.student_profile_id,
           round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
           count(*) as att
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends and sl.pct_valid
    group by sl.student_profile_id
    having sum(sl.weighted_den) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  -- Round 43: seasons rank students who met the ROUNDS minimum in-window.
  where t.att >= coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2)
  order by t.pct desc, t.student_profile_id
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
revoke all on function public.lb_season_live(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.lb_season_live(timestamptz, timestamptz, int) to service_role;

create or replace function public.create_leaderboard_season(
  p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name,''));
begin
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  insert into public.leaderboard_seasons (name, starts_at, ends_at, created_by)
  values (left(v_name, 120), p_starts_at, p_ends_at, public.current_profile_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_leaderboard_season(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_leaderboard_season(text, timestamptz, timestamptz) to service_role;

create or replace function public.update_leaderboard_season(
  p_id uuid, p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_name text := btrim(coalesce(p_name,'')); v_closed timestamptz;
begin
  select closed_at into v_closed from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: cannot edit a closed season' using errcode = 'check_violation'; end if;
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  update public.leaderboard_seasons
     set name = left(v_name,120), starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) to service_role;

create or replace function public.delete_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.leaderboard_seasons where id = p_id;
end;
$$;
revoke all on function public.delete_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.delete_leaderboard_season(uuid) to service_role;

create or replace function public.close_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_rows jsonb;
begin
  select starts_at, ends_at, closed_at into v_s, v_e, v_closed
    from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: already closed' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', rank, 'student_profile_id', student_profile_id,
           'display_name', display_name, 'value', value,
           'metric', 'percent') order by rank), '[]'::jsonb)
    into v_rows
  from public.lb_season_live(v_s, v_e, 100);
  update public.leaderboard_seasons
     set closed_at = now(), standings_json = v_rows, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.close_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.close_leaderboard_season(uuid) to service_role;

create or replace function public.reopen_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leaderboard_seasons
     set closed_at = null, standings_json = '[]'::jsonb, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.reopen_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.reopen_leaderboard_season(uuid) to service_role;

-- Standings for the admin viewer: live from the ledger while open, frozen json
-- once closed. service_role only (the admin action calls it after requireAdmin).
create or replace function public.get_season_standings(p_id uuid, p_limit int default 100)
returns table (rank int, display_name text, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_json jsonb;
begin
  select starts_at, ends_at, closed_at, standings_json
    into v_s, v_e, v_closed, v_json
    from public.leaderboard_seasons where id = p_id;
  if not found then return; end if;
  if v_closed is not null then
    return query
      select (e->>'rank')::int, e->>'display_name', (e->>'value')::numeric
      from jsonb_array_elements(coalesce(v_json,'[]'::jsonb)) e
      order by (e->>'rank')::int
      limit greatest(1, least(coalesce(p_limit,100), 500));
  else
    return query
      select s.rank, s.display_name, s.value
      from public.lb_season_live(v_s, v_e, p_limit) s;
  end if;
end;
$$;
revoke all on function public.get_season_standings(uuid, int) from public, anon, authenticated;
grant execute on function public.get_season_standings(uuid, int) to service_role;

-- ---- 2) Parent view: one child's leaderboard summary ------------------------
create or replace function public.get_child_leaderboard_summary(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_pts_m numeric := 0; v_pts_a numeric := 0;
  v_pct_m numeric := 0; v_pct_a numeric := 0;
  v_qm    int := 0; v_qa int := 0; v_am int := 0; v_aa int := 0;
  v_cur   int := 0; v_best int := 0; v_last date; v_tz text;
  v_rank_m int; v_tot_m int; v_rank_a int; v_streak_live int := 0;
  v_prov_m boolean := true; v_prov_a boolean := true;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  if not (public.is_admin() or public.is_parent_linked_to_student(p_student)) then
    raise exception 'summary: forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(points_all_time,0), current_streak, best_streak, last_active_date,
         coalesce(streak_tz,'Asia/Baku'),
         case when points_month_key = v_mkey then points_month else 0 end,
         case when points_month_key = v_mkey and pct_den_month > 0
              then round(100 * pct_num_month / pct_den_month, 4) else 0 end,
         case when pct_den_all > 0
              then round(100 * pct_num_all / pct_den_all, 4) else 0 end,
         case when points_month_key = v_mkey then lb_presented_month else 0 end,
         lb_presented_all,
         case when points_month_key = v_mkey then lb_attempts_month else 0 end,
         lb_attempts_all
    into v_pts_a, v_cur, v_best, v_last, v_tz, v_pts_m,
         v_pct_m, v_pct_a, v_qm, v_qa, v_am, v_aa
    from public.students where profile_id = p_student;

  -- Round 43: rounds-only eligibility.
  v_prov_m := (v_am < v_mina);
  v_prov_a := (v_aa < v_mina);

  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  if not v_prov_m then
    select r.rnk, r.total into v_rank_m, v_tot_m from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk,
             count(*) over ()::int as total
      from public.lb_rows('percent','global',null,'month') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;
  if v_tot_m is null then
    select count(*)::int into v_tot_m
    from public.lb_rows('percent','global',null,'month') t where not t.is_provisional;
  end if;
  if not v_prov_a then
    select r.rnk into v_rank_a from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk
      from public.lb_rows('percent','global',null,'all_time') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;

  return jsonb_build_object(
    'pct_month', v_pct_m, 'pct_all_time', v_pct_a,
    'questions_month', v_qm, 'questions_all_time', v_qa,
    'attempts_month', v_am, 'attempts_all_time', v_aa,
    'provisional_month', v_prov_m, 'provisional_all_time', v_prov_a,
    'min_attempts', v_mina,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a,
    'points_month', v_pts_m, 'points_all_time', v_pts_a);
end;
$$;
revoke all on function public.get_child_leaderboard_summary(uuid) from public, anon;
grant execute on function public.get_child_leaderboard_summary(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- NOTIFICATIONS ENGINE (backported from migrations/2026_07_07_042)
-- notification triggers + producer/mark-read/prefs/processor/prune RPCs.
-- -----------------------------------------------------------------------------
-- ---- retention + updated_at triggers -----------------------------------------
drop trigger if exists trg_set_updated_at_admin_notifs on public.admin_notifications;
create trigger trg_set_updated_at_admin_notifs before update on public.admin_notifications
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_notif_prefs on public.notification_preferences;
create trigger trg_set_updated_at_notif_prefs before update on public.notification_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_push_tokens on public.push_tokens;
create trigger trg_set_updated_at_push_tokens before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- create_notification — the SINGLE insert path. Idempotent; always writes the
-- in-app row, then a pending delivery per EXTRA channel the recipient allows.
-- NO end-user grant: only service_role + other DEFINER RPCs may create rows.
create or replace function public.create_notification(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text default null,
  p_data            jsonb default '{}'::jsonb,
  p_channels        text[] default '{in_app}',
  p_idempotency_key text default null,
  p_priority        int default 5,
  p_action_url      text default null,
  p_category        text default null,
  p_expires_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ch    text;
  v_email boolean;
  v_push  boolean;
begin
  if p_recipient is null then return null; end if;
  -- Respect the recipient's IN-APP preference; missing prefs = enabled.
  if coalesce((select in_app_enabled from public.notification_preferences where profile_id = p_recipient), true) = false
     and coalesce(p_priority, 5) > 1 then
    -- Priority 1 (critical: payment/security) always reaches the inbox.
    return null;
  end if;

  insert into public.notifications
    (recipient_profile_id, type, title, body, data_json, idempotency_key,
     priority, action_url, category, expires_at)
  values
    (p_recipient, p_type, left(p_title, 200), p_body,
     coalesce(p_data, '{}'::jsonb), p_idempotency_key,
     coalesce(p_priority, 5), p_action_url, p_category, p_expires_at)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;   -- deduped (already sent)

  -- Extra channels → pending deliveries, gated by global flag + user preference.
  v_email := coalesce((select email_enabled from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_email'), false);
  v_push  := coalesce((select push_enabled  from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_push'), false);

  foreach v_ch in array coalesce(p_channels, '{}')
  loop
    if v_ch = 'email' and v_email then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'email', 'pending');
    elsif v_ch = 'push' and v_push then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'push', 'pending');
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) to service_role;

-- Internal audience resolver → set of recipient profile ids. service-internal.
-- Migration 060 adds 'all_users' (parents ∪ students, deduped) and
-- 'olympiad_buyers' (active purchases of ≥1 selected package → purchasing
-- parent + entitled child, deduped; filter.package_ids uuid[]).
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_users' then
    -- Every notifiable end-user role, deduped (migration 060).
    return query
      select pr.profile_id from public.parents pr
      union
      select st.profile_id from public.students st;
  elsif p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type = 'olympiad_buyers' then
    -- ACTIVE purchases of any selected package → purchasing parent + entitled
    -- child, deduped (migration 060). Failed/canceled purchases never match.
    return query
      with pkg as (
        select e::uuid as id
        from jsonb_array_elements_text(coalesce(p_filter->'package_ids','[]'::jsonb)) e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      select distinct u.pid
      from (
        select op.owner_parent_profile_id as pid
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
        union
        select op.student_profile_id
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
      ) u
      where u.pid is not null;
  elsif p_type in ('parent', 'individual') then
    -- Multi-select: audience_filter.profile_ids (uuid array). Fallback: single profile_id (migration 044).
    if p_filter ? 'profile_ids' and jsonb_typeof(p_filter->'profile_ids') = 'array' then
      return query
        select e::uuid
        from jsonb_array_elements_text(p_filter->'profile_ids') e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    elsif (p_filter->>'profile_id') is not null then
      return query select (p_filter->>'profile_id')::uuid;
    end if;
  elsif p_type = 'by_subject' then
    return query
      select distinct cs.student_profile_id
      from public.child_subscriptions cs
      join public.subscription_subjects ss on ss.child_subscription_id = cs.id
      where ss.subject_id = (p_filter->>'subject_id')::uuid
        and cs.status in ('trialing','active');
  elsif p_type = 'administrators' then
    -- Migration 076: staff audiences for admin-directed sends.
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'administrator';
  elsif p_type = 'content_managers' then
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'content_manager';
  end if;
end;
$$;
revoke all on function public.lb_notify_audience(text, jsonb) from public, anon, authenticated;
grant execute on function public.lb_notify_audience(text, jsonb) to service_role;

-- get_target_count — admin audience preview (authenticated; admin-checked in body).
create or replace function public.get_notification_target_count(p_type text, p_filter jsonb)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from public.lb_notify_audience(p_type, coalesce(p_filter,'{}'::jsonb));
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.get_notification_target_count(text, jsonb) from public, anon;
grant execute on function public.get_notification_target_count(text, jsonb) to authenticated, service_role;

-- notify_template_kind — template code → notification (type, category) for the
-- broadcast fan-out paths (migration 067): a news_published broadcast files
-- under "news" (newspaper icon / News filter chip) instead of the generic
-- announcement pair; unknown/NULL codes keep admin_announcement/announcement.
-- The category set matches the client filter chips.
create or replace function public.notify_template_kind(
  p_template_code text,
  out n_type text,
  out n_category text
)
returns record
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case p_template_code
      when 'news_published'        then 'news_published'
      when 'olympiad_purchased'    then 'olympiad_purchased'
      when 'attempt_graded'        then 'attempt_graded'
      when 'personal_best'         then 'personal_best'
      when 'streak_milestone'      then 'streak_milestone'
      when 'subscription_canceled' then 'subscription_canceled'
      when 'subject_charge_failed' then 'subject_charge_failed'
      when 'subject_expiring'      then 'subject_expiring'
      when 'giveaway_ending'       then 'giveaway_ending'
      else 'admin_announcement'
    end,
    case p_template_code
      when 'news_published'        then 'news'
      when 'olympiad_purchased'    then 'olympiad'
      when 'attempt_graded'        then 'progress'
      when 'personal_best'         then 'progress'
      when 'streak_milestone'      then 'progress'
      when 'subscription_canceled' then 'billing'
      when 'subject_charge_failed' then 'billing'
      when 'subject_expiring'      then 'billing'
      when 'giveaway_ending'       then 'announcement'
      else 'announcement'
    end
$$;
revoke all on function public.notify_template_kind(text) from public, anon, authenticated;
grant execute on function public.notify_template_kind(text) to service_role;

-- admin_send_notification — the broadcast path. authenticated + in-body admin
-- check. Immediate send (scheduled_at null) fans out now; else stored 'scheduled'
-- and dispatched by cron. Returns the admin_notifications id + recipient count.
-- Migration 060: audience whitelist extended (all_users, olympiad_buyers);
-- olympiad_buyers requires well-formed package_ids of existing ACTIVE packages,
-- validated BEFORE anything is stored.
-- Migration 067: fan-out type/category derive from the template code.
create or replace function public.admin_send_notification(
  p_title         text,
  p_body          text,
  p_channels      text[],
  p_audience_type text,
  p_audience_filter jsonb default '{}'::jsonb,
  p_scheduled_at  timestamptz default null,
  p_template_code text default null,
  p_action_url    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_id    uuid;
  v_rec   uuid;
  v_n     int := 0;
  v_key   text;
  v_pkg_n int;
  v_kind  record;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'notify: title and body required' using errcode = 'check_violation';
  end if;
  if p_audience_type not in ('all_users','all_parents','all_children','olympiad_buyers',
                             'parent','by_subject','individual',
                             'administrators','content_managers') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
  end if;

  -- olympiad_buyers: package_ids are REQUIRED and must all be existing ACTIVE
  -- packages (migration 060) — validated before anything is stored.
  if p_audience_type = 'olympiad_buyers' then
    select count(*) into v_pkg_n
    from jsonb_array_elements_text(coalesce(p_audience_filter->'package_ids','[]'::jsonb)) e
    where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if coalesce(v_pkg_n, 0) = 0 then
      raise exception 'notify: at least one olympiad package required' using errcode = 'check_violation';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(p_audience_filter->'package_ids') e
      where not exists (
        select 1 from public.olympiad_packages op
        where op.id::text = e and op.status = 'active')
    ) then
      raise exception 'notify: invalid or inactive olympiad package' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.admin_notifications
    (actor_profile_id, title, body, template_code, channels, audience_type,
     audience_filter, status, scheduled_at)
  values
    (v_actor, left(p_title,200), left(p_body,2000), p_template_code,
     coalesce(p_channels,'{in_app}'), p_audience_type, coalesce(p_audience_filter,'{}'::jsonb),
     case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'sending' end,
     p_scheduled_at)
  returning id into v_id;

  -- Scheduled → leave for the cron dispatcher; just return the target count.
  if p_scheduled_at is not null and p_scheduled_at > now() then
    select count(*) into v_n from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb));
    update public.admin_notifications set total_recipients = coalesce(v_n,0) where id = v_id;
    return jsonb_build_object('id', v_id, 'status', 'scheduled', 'recipients', coalesce(v_n,0));
  end if;

  -- Immediate fan-out (idempotent per recipient+broadcast). Type/category come
  -- from the template so e.g. the news broadcast files under "news".
  select * into v_kind from public.notify_template_kind(p_template_code);
  for v_rec in select a.profile_id from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb)) a
  loop
    v_key := 'admin:' || v_id::text || ':' || v_rec::text;
    perform public.create_notification(
      v_rec, v_kind.n_type, p_title, p_body,
      jsonb_build_object('admin_notification_id', v_id),
      coalesce(p_channels,'{in_app}'), v_key, 3, p_action_url, v_kind.n_category, null);
    v_n := v_n + 1;
  end loop;

  update public.admin_notifications
     set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
   where id = v_id;
  return jsonb_build_object('id', v_id, 'status', 'sent', 'recipients', v_n);
end;
$$;
revoke all on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) from public, anon;
grant execute on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) to authenticated, service_role;

-- mark read / mark all / unread count / delete — owner-scoped (authenticated).
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;

create or replace function public.mark_all_notifications_read()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  update public.notifications set read_at = now()
   where recipient_profile_id = public.current_profile_id() and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;

create or replace function public.get_unread_notification_count()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.notifications
   where recipient_profile_id = public.current_profile_id() and read_at is null
     and (expires_at is null or expires_at > now());
$$;
revoke all on function public.get_unread_notification_count() from public, anon;
grant execute on function public.get_unread_notification_count() to authenticated, service_role;

create or replace function public.delete_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.notifications
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.delete_notification(uuid) from public, anon;
grant execute on function public.delete_notification(uuid) to authenticated, service_role;

-- preferences: read/write own OR a linked child's (parent-managed) OR admin.
create or replace function public.get_notification_preferences(p_profile uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id()); v_row public.notification_preferences;
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.notification_preferences where profile_id = v_target;
  return jsonb_build_object(
    'in_app_enabled', coalesce(v_row.in_app_enabled, true),
    'email_enabled',  coalesce(v_row.email_enabled, true),
    'push_enabled',   coalesce(v_row.push_enabled, true));
end; $$;
revoke all on function public.get_notification_preferences(uuid) from public, anon;
grant execute on function public.get_notification_preferences(uuid) to authenticated, service_role;

create or replace function public.set_notification_preferences(
  p_profile uuid, p_in_app boolean, p_email boolean, p_push boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id());
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into public.notification_preferences (profile_id, in_app_enabled, email_enabled, push_enabled)
  values (v_target, coalesce(p_in_app,true), coalesce(p_email,true), coalesce(p_push,true))
  on conflict (profile_id) do update
    set in_app_enabled = excluded.in_app_enabled,
        email_enabled  = excluded.email_enabled,
        push_enabled   = excluded.push_enabled,
        updated_at = now();
end; $$;
revoke all on function public.set_notification_preferences(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preferences(uuid, boolean, boolean, boolean) to authenticated, service_role;

-- push token upsert (mobile registers this; owner-scoped).
create or replace function public.upsert_push_token(p_token text, p_platform text, p_device jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'push: not authenticated'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'push: bad platform' using errcode='check_violation'; end if;
  insert into public.push_tokens (profile_id, token, platform, device_info, is_valid, last_used_at)
  values (v_me, p_token, p_platform, coalesce(p_device,'{}'::jsonb), true, now())
  on conflict (token) do update
    set profile_id = v_me, platform = excluded.platform, device_info = excluded.device_info,
        is_valid = true, failure_count = 0, last_used_at = now(), updated_at = now();
end; $$;
revoke all on function public.upsert_push_token(text, text, jsonb) from public, anon;
grant execute on function public.upsert_push_token(text, text, jsonb) to authenticated, service_role;

-- ---- processor (service-role only) -------------------------------------------
create or replace function public.claim_pending_deliveries(p_limit int default 50, p_worker text default null)
returns setof public.notification_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  update public.notification_deliveries d
     set status = 'queued', provider_ref = p_worker, updated_at = now()
   where d.id in (
     select id from public.notification_deliveries
      where status = 'pending'
      order by created_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit,50), 500))
   )
  returning d.*;
end; $$;
revoke all on function public.claim_pending_deliveries(int, text) from public, anon, authenticated;
grant execute on function public.claim_pending_deliveries(int, text) to service_role;

create or replace function public.mark_delivery_result(p_id uuid, p_status public.delivery_status, p_ref text default null, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_deliveries
     set status = p_status, provider_ref = coalesce(p_ref, provider_ref),
         error_text = p_error, updated_at = now()
   where id = p_id;
end; $$;
revoke all on function public.mark_delivery_result(uuid, public.delivery_status, text, text) from public, anon, authenticated;
grant execute on function public.mark_delivery_result(uuid, public.delivery_status, text, text) to service_role;

-- dispatch scheduled broadcasts whose time has come (cron / processor).
create or replace function public.dispatch_scheduled_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_rec uuid; v_n int; v_total int := 0; v_kind record;
begin
  for v_row in
    select * from public.admin_notifications
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.admin_notifications set status = 'sending' where id = v_row.id;
    v_n := 0;
    -- Migration 067: type/category derive from the stored template code.
    select * into v_kind from public.notify_template_kind(v_row.template_code);
    for v_rec in select a.profile_id from public.lb_notify_audience(v_row.audience_type, v_row.audience_filter) a
    loop
      perform public.create_notification(
        v_rec, v_kind.n_type, v_row.title, v_row.body,
        jsonb_build_object('admin_notification_id', v_row.id),
        v_row.channels, 'admin:' || v_row.id::text || ':' || v_rec::text, 3, null, v_kind.n_category, null);
      v_n := v_n + 1;
    end loop;
    update public.admin_notifications
       set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
     where id = v_row.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end; $$;
revoke all on function public.dispatch_scheduled_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_scheduled_notifications() to service_role;

-- retention prune: delete READ notifications older than retention_days, and trim
-- each user's inbox to max_per_user (keeping the newest). service-role / cron.
create or replace function public.prune_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_days int; v_max int; v_n int := 0; v_m int;
begin
  v_days := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.retention_days'), 180);
  v_max  := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.max_per_user'), 500);

  delete from public.notifications
   where read_at is not null and read_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;

  -- Cap per user (delete oldest READ beyond the cap; never prune unread).
  with ranked as (
    select id, row_number() over (partition by recipient_profile_id order by created_at desc) rn
    from public.notifications)
  delete from public.notifications n using ranked r
   where n.id = r.id and r.rn > v_max and n.read_at is not null;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end; $$;
revoke all on function public.prune_notifications() from public, anon, authenticated;
grant execute on function public.prune_notifications() to service_role;

-- =============================================================================
-- Notification PRODUCERS (migration 074, revised by 076): student progress
-- milestones (personal_best + streak_milestone) and the pre-expiry / giveaway-
-- ending scanners. All service-role only; all wrap create_notification so a
-- notify failure never breaks the underlying action. The two scanners are
-- scheduled by 016 (guarded on pg_cron). subject_charge_failed stays UNWIRED
-- (needs the real payment provider — see the payment backlog).
-- The R29 admin operational-alert triggers (new parent/purchase/subscription)
-- + notify_admins were REMOVED in 076 — admins now receive only notifications
-- sent TO them (composer 'administrators' audience) + package-published alerts.
-- =============================================================================
-- Student progress milestones — fires AFTER award_attempt_points on the same
-- '→ graded' transition (name order: trg_award_* < trg_notify_progress_*).
create or replace function public.notify_progress_milestones_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_streak int; v_last date; v_prev numeric; v_this numeric;
begin
  begin
    select current_streak, last_active_date into v_streak, v_last
      from public.students where profile_id = new.student_profile_id;
    if v_streak in (3, 7, 14, 30, 60, 100) then
      perform public.create_notification(
        new.student_profile_id, 'streak_milestone', 'Seriya davam edir 🔥',
        v_streak::text || ' günlük seriya! Davam et.',
        jsonb_build_object('days', v_streak),
        array['in_app'],
        'streak:' || new.student_profile_id::text || ':' || v_streak::text || ':' || coalesce(v_last::text, 'x'),
        4, '/child/leaderboard', 'progress', null);
    end if;
    if new.is_rated then
      select coalesce(max(points), 0) into v_prev
        from public.student_points_ledger
        where student_profile_id = new.student_profile_id and attempt_id <> new.id;
      select coalesce(points, 0) into v_this
        from public.student_points_ledger where attempt_id = new.id;
      if v_this > v_prev and v_prev > 0 then
        perform public.create_notification(
          new.student_profile_id, 'personal_best', 'Yeni rekord!',
          'Yeni şəxsi rekordun: ' || trim_scale(v_this)::text || ' xal 🎉',
          jsonb_build_object('points', v_this),
          array['in_app'],
          'pb:' || new.student_profile_id::text || ':' || new.id::text,
          4, '/child/leaderboard', 'progress', null);
      end if;
    end if;
  exception when others then raise warning 'notify_progress_milestones failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_progress_milestones on public.test_attempts;
create trigger trg_notify_progress_milestones
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_progress_milestones_tg();

-- Pre-expiry scanner (cron): parents whose child subscription lapses within 3
-- days. Migration 109: the scan is PER SUBJECT (each owns its own period) but
-- grouped by (subscription, period end), so a uniform plan still produces ONE
-- notice while a weekly subject can never silence a yearly one's. Idempotency
-- keyed by (subscription, period_end) → once per period.
create or replace function public.notify_expiring_subscriptions()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_days int; v_name text; v_n int := 0;
begin
  for v_row in
    select cs.id, cs.owner_parent_profile_id, ss.current_period_end as period_end,
           s.first_name, s.last_name
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s on s.profile_id = cs.student_profile_id
    where cs.status in ('trialing', 'active')
      and ss.remove_at is null
      and ss.current_period_end is not null
      and ss.current_period_end > now()
      and ss.current_period_end <= now() + interval '3 days'
      and cs.owner_parent_profile_id is not null
    group by cs.id, cs.owner_parent_profile_id, ss.current_period_end,
             s.first_name, s.last_name
  loop
    v_days := greatest(1, ceil(extract(epoch from (v_row.period_end - now())) / 86400.0)::int);
    v_name := coalesce(nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''), 'övladınız');
    perform public.create_notification(
      v_row.owner_parent_profile_id, 'subject_expiring', 'Abunə bitmək üzrədir',
      v_name || ' üçün abunə ' || v_days::text || ' gün sonra bitir.',
      jsonb_build_object('child_name', v_name, 'days', v_days, 'subscription_id', v_row.id),
      array['in_app'],
      'subexp:' || v_row.id::text || ':' || v_row.period_end::text,
      3, '/subscription', 'billing', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions() to service_role;

-- Giveaway-ending scanner (cron): warn all parents in the final 2 days of an
-- active giveaway. Idempotency keyed by (parent, window end) → once per window.
create or replace function public.notify_giveaway_ending()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start timestamptz; v_dur int; v_end timestamptz; v_days int; v_parent uuid; v_n int := 0;
begin
  if not public.is_giveaway_active() then return 0; end if;
  select nullif(value_json #>> '{}', '')::timestamptz into v_start
    from public.system_settings where key = 'giveaway.started_at';
  select nullif(value_json #>> '{}', '')::int into v_dur
    from public.system_settings where key = 'giveaway.duration_days';
  if v_start is null or coalesce(v_dur, 0) <= 0 then return 0; end if;
  v_end := v_start + make_interval(days => v_dur);
  if now() < v_end - interval '2 days' or now() >= v_end then return 0; end if;
  v_days := greatest(1, ceil(extract(epoch from (v_end - now())) / 86400.0)::int);
  for v_parent in select profile_id from public.parents loop
    perform public.create_notification(
      v_parent, 'giveaway_ending', 'Kampaniya bitir',
      'Pulsuz kampaniya ' || v_days::text || ' gün sonra başa çatır.',
      jsonb_build_object('ends_at', v_end, 'days', v_days),
      array['in_app'],
      'gvw:' || v_parent::text || ':' || v_end::text,
      4, '/services', 'announcement', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function public.notify_giveaway_ending() from public, anon, authenticated;
grant execute on function public.notify_giveaway_ending() to service_role;

-- =============================================================================
-- Admin subscription lifecycle (migration 077): the ONE centralized, self-
-- auditing entry point the Admin Panel uses to manage demo/comped
-- subscriptions. Validated transitions only (activate/cancel/expire/extend);
-- anything else raises check_violation with hint 'invalid_transition'. Also
-- reconciles students.access_status for the affected child. Administrator-only
-- via the in-body is_admin() guard. Creation stays with
-- admin_grant_child_access() / create_child_subscription().
-- =============================================================================
create or replace function public.admin_manage_child_subscription(
  p_subscription_id uuid,
  p_action          text,
  p_days            int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_profile_id();
  v_sub      public.child_subscriptions%rowtype;
  v_from     text;
  v_to       text;
  v_end      timestamptz;
  v_student  uuid;
  v_touched  int;
begin
  -- Administrator only (subscription/payment modules are Admin-only; content
  -- managers must never reach this).
  if not public.is_admin() then
    raise exception 'subscription: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('activate', 'cancel', 'expire', 'extend') then
    raise exception 'subscription: bad action' using errcode = 'check_violation',
      hint = 'unknown_action';
  end if;

  select * into v_sub from public.child_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription: not found' using errcode = 'no_data_found';
  end if;
  v_from    := v_sub.status::text;
  v_student := v_sub.student_profile_id;
  v_to      := v_from;
  v_end     := v_sub.current_period_end;

  if p_action = 'activate' then
    if v_from not in ('incomplete', 'past_due') then
      raise exception 'subscription: cannot activate from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'active';
    -- Open a period PER SUBJECT on its own cycle, where there is none / it
    -- already lapsed.
    update public.subscription_subjects ss
       set current_period_start = coalesce(ss.current_period_start, now()),
           current_period_end   = now() + case coalesce(ss.interval, v_sub.interval)
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
     where ss.child_subscription_id = p_subscription_id
       and (ss.current_period_end is null or ss.current_period_end <= now());
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'active',
           current_period_start = coalesce(current_period_start, now()),
           updated_at = now()
     where id = p_subscription_id;
    -- A subscription with no subject rows has nothing for the trigger to
    -- derive from; keep the historical direct write for that degenerate case.
    if v_touched = 0 and (v_end is null or v_end <= now()) then
      update public.child_subscriptions
         set current_period_end = now() + case v_sub.interval
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
       where id = p_subscription_id;
    end if;

  elsif p_action = 'cancel' then
    if v_from not in ('trialing', 'active', 'past_due') then
      raise exception 'subscription: cannot cancel from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'canceled';
    -- Canceled keeps access until the period end (web parity).
    update public.child_subscriptions
       set status = 'canceled', updated_at = now()
     where id = p_subscription_id;

  elsif p_action = 'expire' then
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot expire from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'expired';
    update public.subscription_subjects
       set current_period_end = now()
     where child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'expired', updated_at = now()
     where id = p_subscription_id;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end = now() where id = p_subscription_id;
    end if;

  else -- extend
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot extend from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    if p_days is null or p_days < 1 or p_days > 730 then
      raise exception 'subscription: days must be 1..730' using errcode = 'check_violation',
        hint = 'bad_days';
    end if;
    -- Extend from NOW when the subject's period already lapsed, else from its
    -- end — per subject, so a yearly subject is not pulled back to a weekly's
    -- date and vice versa.
    update public.subscription_subjects ss
       set current_period_end =
             greatest(coalesce(ss.current_period_end, now()), now())
             + make_interval(days => p_days)
     where ss.child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end =
               greatest(coalesce(v_sub.current_period_end, now()), now())
               + make_interval(days => p_days),
             updated_at = now()
       where id = p_subscription_id;
    end if;
  end if;

  -- Coverage end after the fan-out (the trigger already wrote it).
  select current_period_end into v_end
  from public.child_subscriptions where id = p_subscription_id;

  -- Reconcile the child's cached access flag for THIS student (same rules as
  -- recompute_child_access(), applied to one row so the UI is instantly right).
  update public.students s
     set access_status = case
           when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and (cs.status in ('trialing','active','past_due')
                    or (cs.status = 'canceled' and cs.current_period_end > now()))
               and (cs.current_period_end is null or cs.current_period_end > now())
           ) then (
             case when exists (
               select 1 from public.child_subscriptions cs
               where cs.student_profile_id = s.profile_id and cs.status = 'trialing'
                 and (cs.current_period_end is null or cs.current_period_end > now())
             ) then 'trialing'::public.child_access_status
             else 'active'::public.child_access_status end)
           else 'expired'::public.child_access_status
         end
   where s.profile_id = v_student;

  -- Self-auditing (same mechanism as admin_upsert_subject_price).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.subscription.' || p_action, 'child_subscriptions', p_subscription_id,
     jsonb_build_object(
       'from_status', v_from,
       'to_status', v_to,
       'days', p_days,
       'period_end', v_end,
       'student_profile_id', v_student),
     (case when p_action in ('expire', 'cancel') then 'warning' else 'info' end)::public.audit_severity,
     true);

  return jsonb_build_object(
    'id', p_subscription_id,
    'from_status', v_from,
    'status', v_to,
    'current_period_end', v_end);
exception
  when unique_violation then
    -- uq_child_subscriptions_live: this child already has another live sub.
    raise exception 'subscription: child already has a live subscription'
      using errcode = 'unique_violation', hint = 'duplicate_live_subscription';
end;
$$;
revoke all on function public.admin_manage_child_subscription(uuid, text, int) from public, anon;
grant execute on function public.admin_manage_child_subscription(uuid, text, int) to authenticated, service_role;

-- =============================================================================
-- Mid-cycle PLAN CHANGE billing (migration 078, per-subject since 109).
-- Owner-approved model:
--   ADD         -> immediate access and a FULL first cycle, charged in full.
--                  Proration is RETIRED: with per-subject periods there is no
--                  shared period left to prorate into, and the subject receives
--                  the whole cycle it pays for. subscription_changes keeps its
--                  shape (remaining_ratio = 1, period_days = null) so a charge
--                  stays reconstructible for disputes.
--   REMOVE      -> never refunds. Access runs to THAT SUBJECT'S own period end
--                  (subscription_subjects.remove_at) and the subject drops out
--                  of the next invoice.
--   PLAN CHANGE -> a different cycle for an already-paid subject is SCHEDULED
--                  into pending_interval and applies at that subject's renewal.
--                  One rule in both directions: no refund, no surprise charge.
-- quote_plan_change() is the SINGLE source of the math and apply_plan_change()
-- calls it, so the previewed price can never drift from the applied one (audit
-- H7). Amounts are never accepted from a client. quote_subject_change /
-- apply_subject_change stay as add/remove wrappers with their exact historical
-- signatures (013 pins them; the mobile BFF and shipped binaries call them).
-- =============================================================================

create or replace function public.quote_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub        public.child_subscriptions%rowtype;
  v_owner      uuid;
  v_rank       int;
  v_pct        numeric(5,2);
  v_cur_base   numeric(12,2);
  v_next_base  numeric(12,2);
  v_added_base numeric(12,2);
  v_due        numeric(12,2) := 0;
  v_items      jsonb;
  v_groups     jsonb;
  v_renewals   jsonb;
  v_removals   jsonb;
  v_changes    jsonb;
  v_ivs        int;
  v_remaining  int;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;
  v_owner := v_sub.owner_parent_profile_id;

  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- CURRENT recurring set = live subjects, each priced on ITS OWN cycle.
  select coalesce(sum(sp.price_amount), 0) into v_cur_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = coalesce(ss.interval, v_sub.interval)
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  -- ADDS = desired subjects not currently covered. Each buys a FULL first cycle
  -- (proration retired — see the file header).
  select coalesce(sum(sp.price_amount), 0) into v_added_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  where not exists (
    select 1 from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.subject_id = n.subject_id
      and ss.remove_at is null);

  -- NEXT recurring set = the desired set, priced on the desired cycles.
  select coalesce(sum(sp.price_amount), 0) into v_next_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id, 'interval', n.interval,
           'price', sp.price_amount, 'currency', v_sub.currency))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  with g as (
    select n.interval as iv, count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt, 'base', g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         count(*)::int
    into v_groups, v_ivs
  from g;

  -- due_now: the ADDS only, at the sibling rate, rounded per cycle group. A
  -- trial charges nothing (the adds ride the trial like every other subject).
  if v_sub.status <> 'trialing' then
    with g as (
      select n.interval as iv, coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
      from public.plan_items_normalize(p_items) n
      join public.subjects_pricing sp
        on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
      where not exists (
        select 1 from public.subscription_subjects ss
        where ss.child_subscription_id = v_sub.id
          and ss.subject_id = n.subject_id
          and ss.remove_at is null)
      group by n.interval)
    select coalesce(sum(g.base - round(g.base * v_pct / 100.0, 2)), 0) into v_due from g;
  end if;

  -- Per-cycle renewal sentences, built from the DESIRED basket. Reading the
  -- STORED rows here is what told a parent who had just moved a subject to
  -- yearly that they would renew at the WEEKLY amount: p_items already carries
  -- the chosen cycle (and, for an untouched subject, its pending_interval --
  -- both wrappers compose it that way), so the sentence now describes the plan
  -- the parent is about to have instead of the one they are leaving.
  -- An already-covered subject renews at ITS OWN period end; a newly added one
  -- opens a full cycle at now(), which is exactly what apply_plan_change writes.
  with r as (
    select n.interval as iv,
           min(case
                 when ss.subject_id is null
                   then now() + case n.interval
                                  when 'week'  then interval '7 days'
                                  when 'month' then interval '1 month'
                                  else              interval '1 year'
                                end
                 else coalesce(ss.current_period_end, v_sub.current_period_end)
               end) as next_at,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    left join public.subscription_subjects ss
      on ss.child_subscription_id = v_sub.id
     and ss.subject_id = n.subject_id
     and ss.remove_at is null
    group by n.interval)
  select jsonb_agg(jsonb_build_object(
           'interval', r.iv, 'next_at', r.next_at,
           'total', r.base - round(r.base * v_pct / 100.0, 2)))
    into v_renewals from r;

  -- REMOVES = covered but absent from the desired set; each keeps access to ITS
  -- OWN period end (never the subscription's).
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'remove_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_removals
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = ss.subject_id);

  -- PLAN CHANGES = covered with a different cycle; scheduled, never charged.
  -- The comparison basis is the EFFECTIVE cycle -- pending_interval when one is
  -- already scheduled -- so re-selecting the ORIGINAL cycle is itself a change
  -- (it CANCELS the schedule). Comparing against ss.interval alone locked in a
  -- parent who mis-clicked 'yearly': the diff came back empty, Save stayed
  -- disabled and nothing could unschedule the change.
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'from', coalesce(ss.pending_interval, ss.interval, v_sub.interval),
           'to', n.interval,
           'effective_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_changes
  from public.subscription_subjects ss
  join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval);

  v_remaining := greatest(0, ceil(
    extract(epoch from (coalesce(v_sub.next_renewal_at, v_sub.current_period_end, now()) - now())) / 86400.0)::int);

  return jsonb_build_object(
    'items',    coalesce(v_items, '[]'::jsonb),
    'groups',   coalesce(v_groups, '{}'::jsonb),
    'renewals', coalesce(v_renewals, '[]'::jsonb),
    'removals_effective', coalesce(v_removals, '[]'::jsonb),
    'plan_changes', coalesce(v_changes, '[]'::jsonb),
    'mixed', coalesce(v_ivs, 0) > 1,
    -- Legacy contract keys: the web/BFF/mobile parsers still read these.
    'subscription_id',        v_sub.id,
    'status',                 v_sub.status,
    'interval',               v_sub.interval,
    'currency',               v_sub.currency,
    'discount_percent',       v_pct,
    'current_recurring_total', v_cur_base - round(v_cur_base * v_pct / 100.0, 2),
    'new_recurring_total',    v_next_base - round(v_next_base * v_pct / 100.0, 2),
    'due_now',                v_due,
    'prorated',               false,
    'proration_waived',       false,
    'added_base',             v_added_base,
    'remaining_ratio',        1,
    'days_remaining',         v_remaining,
    'period_days',            null,
    -- effective_from = the NEXT CHARGE date, which is what next_renewal_at (the
    -- MIN) genuinely means; the per-subject dates a cycle change takes effect on
    -- are in plan_changes[].effective_at.
    'effective_from',         coalesce(v_sub.next_renewal_at, v_sub.current_period_end),
    -- LEGACY SCALAR, superseded by removals_effective[] above. It used to be the
    -- subscription MIN, so removing a YEARLY subject from a plan that also held
    -- a weekly one told the parent access ended in 7 days while the DB granted a
    -- year. It is now the last of the REMOVED subjects' own dates, so an
    -- already-shipped binary can only ever overstate, never cut access short.
    'removals_effective_at',  coalesce(
      (select max((e.v ->> 'remove_at')::timestamptz)
         from jsonb_array_elements(coalesce(v_removals, '[]'::jsonb)) as e(v)),
      v_sub.next_renewal_at, v_sub.current_period_end));
end;
$$;

comment on function public.quote_plan_change(uuid, jsonb) is
  'Migration 109: diffs a DESIRED full per-subject basket against the live subscription into adds / removes / plan_changes and prices it. due_now = the adds'' full first cycles at the sibling rate (proration retired); a cycle change costs nothing now and applies at that subject''s renewal.';

create or replace function public.apply_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote   jsonb;
  v_sub     public.child_subscriptions%rowtype;
  v_actor   uuid := public.current_profile_id();
  v_pct     numeric(5,2);
  v_before  numeric(12,2);
  v_after   numeric(12,2);
  v_left    int;
  v_prior   jsonb;
  v_adds    int;
  v_changes int;
  v_row     record;
begin
  -- Replay guard: the same batch key returns the original outcome untouched.
  if p_idempotency_key is not null then
    select jsonb_build_object('idempotent', true, 'applied_at', min(created_at))
      into v_prior
    from public.subscription_changes
    where idempotency_key = p_idempotency_key
      and student_profile_id = p_student_profile_id
    having count(*) > 0;
    if v_prior is not null then return v_prior; end if;
  end if;

  -- ONE source of truth for the numbers (preview == charged, audit H7).
  v_quote := public.quote_plan_change(p_student_profile_id, p_items);

  select count(*)::int into v_adds
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subscription_subjects ss
    where ss.child_subscription_id = (v_quote->>'subscription_id')::uuid
      and ss.subject_id = n.subject_id
      and ss.remove_at is null);
  v_changes := jsonb_array_length(v_quote->'plan_changes');

  -- Round 48/51 kill switch: while payments are off a parent may still REMOVE
  -- subjects (never trap someone into paying), but may not ADD one — and a
  -- cycle change is a billing change, so it is blocked too.
  if v_adds > 0 or v_changes > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub from public.child_subscriptions
  where id = (v_quote->>'subscription_id')::uuid
  for update;

  v_pct    := (v_quote->>'discount_percent')::numeric;
  v_before := (v_quote->>'current_recurring_total')::numeric;
  v_after  := (v_quote->>'new_recurring_total')::numeric;

  -- ---- removals: keep access to THIS SUBJECT'S own period end --------------
  select count(*) into v_left
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and exists (select 1 from public.plan_items_normalize(p_items) n
                 where n.subject_id = ss.subject_id);
  if v_left < 1 and v_adds < 1 then
    raise exception 'subject_change: at least one subject must remain'
      using errcode = 'check_violation', hint = 'last_subject';
  end if;

  for v_row in
    select ss.subject_id,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not exists (select 1 from public.plan_items_normalize(p_items) n
                       where n.subject_id = ss.subject_id)
  loop
    update public.subscription_subjects
       set remove_at = v_row.ends_at
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'remove',
       v_row.subject_id, v_row.iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- additions: a NEW full cycle anchored at now() -----------------------
  for v_row in
    select n.subject_id, n.interval as iv, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    where not exists (
      select 1 from public.subscription_subjects ss
      where ss.child_subscription_id = v_sub.id
        and ss.subject_id = n.subject_id
        and ss.remove_at is null)
  loop
    -- Un-schedule a pending removal instead of duplicating the row.
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub.id, v_row.subject_id, v_row.iv, v_row.price_amount, v_sub.currency,
       now(),
       now() + case v_row.iv
                 when 'week'  then interval '7 days'
                 when 'month' then interval '1 month'
                 else              interval '1 year'
               end)
    on conflict (child_subscription_id, subject_id) do update
      set remove_at            = null,
          interval             = excluded.interval,
          pending_interval     = null,
          price_amount         = excluded.price_amount,
          current_period_start = excluded.current_period_start,
          current_period_end   = excluded.current_period_end;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'add',
       v_row.subject_id, v_row.iv, now(),
       round(coalesce(v_row.price_amount, 0) * (1 - v_pct / 100.0), 2),
       v_sub.currency, v_before, v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- cycle changes: SCHEDULED only, never a refund, never a charge -------
  for v_row in
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as from_iv,
           coalesce(ss.interval, v_sub.interval) as cur_iv,
           n.interval as to_iv,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at
    from public.subscription_subjects ss
    join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval)
  loop
    -- Choosing the cycle the subject is ALREADY paid on CANCELS a scheduled
    -- change rather than scheduling a no-op, which is the only way back for a
    -- parent who picked the wrong cycle.
    update public.subscription_subjects
       set pending_interval =
             case when v_row.to_iv = v_row.cur_iv then null else v_row.to_iv end
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'plan_change',
       v_row.subject_id, v_row.to_iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- TODO(real-provider): capture (v_quote->>'due_now') through the PSP HERE,
  -- inside this transaction's boundary, then write the resulting payment id
  -- back onto the ledger rows and insert the matching public.payments row.
  -- NEVER accept the amount from a client.

  return v_quote || jsonb_build_object('applied', true, 'charged', false);
end;
$$;

comment on function public.apply_plan_change(uuid, jsonb, text) is
  'Migration 109: applies a DESIRED full per-subject basket atomically — adds open their own now()-anchored cycle, removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers; assert_payments_enabled() gates adds and cycle changes while removals stay legal.';

-- ---- the boundary job: a scheduled cycle actually takes effect --------------
-- Without this, pending_interval is WRITE-ONLY: apply_plan_change stores the
-- parent's choice and nothing in the platform ever moves it into
-- subscription_subjects.interval, so "Riyaziyyat aylıq -> illik" is remembered
-- and never applied. This is the job that applies it, at that subject's own
-- period boundary.
--
-- DELIBERATELY NOT A RENEWAL. There is no payment provider yet (every path here
-- ends at the TODO(real-provider) seam and returns 'charged', false), so this
-- never extends a period, never grants access and never writes a payment --
-- doing so would silently turn every plan into a free perpetual one. It
-- promotes the scheduled cycle and re-freezes the price at the moment the paid
-- period ends, which is precisely the state the future charge has to read.
create or replace function public.apply_due_plan_changes()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_price numeric(12,2);
  v_n     int := 0;
begin
  for v_row in
    select ss.child_subscription_id, ss.subject_id, ss.pending_interval,
           ss.current_period_end, cs.student_profile_id,
           cs.owner_parent_profile_id, cs.currency, cs.sibling_discount_percent
    from public.subscription_subjects ss
    join public.child_subscriptions cs on cs.id = ss.child_subscription_id
    where ss.pending_interval is not null
      and ss.remove_at is null
      and ss.current_period_end is not null
      and ss.current_period_end <= now()
      and cs.status in ('trialing', 'active', 'past_due')
  loop
    select sp.price_amount into v_price
    from public.subjects_pricing sp
    where sp.subject_id = v_row.subject_id
      and sp.interval = v_row.pending_interval
      and sp.status = 'active';
    -- Pricing for the new cycle was archived: LEAVE the schedule in place. Both
    -- alternatives are worse -- dropping it discards the parent's decision, and
    -- promoting it anyway would freeze a NULL price into the next invoice.
    if v_price is null then continue; end if;

    update public.subscription_subjects
       set interval         = v_row.pending_interval,
           pending_interval = null,
           price_amount     = v_price
     where child_subscription_id = v_row.child_subscription_id
       and subject_id = v_row.subject_id;

    -- Ledger row, keyed on the (subject, period end) that fell due, so a second
    -- run inside the same boundary is a no-op instead of a duplicate.
    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency,
       discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_row.child_subscription_id, v_row.student_profile_id,
       v_row.owner_parent_profile_id, 'plan_change', v_row.subject_id,
       v_row.pending_interval, v_row.current_period_end, 0, v_row.currency,
       coalesce(v_row.sibling_discount_percent, 0), 1, null,
       'planroll:' || v_row.child_subscription_id::text || ':'
         || v_row.subject_id::text || ':' || v_row.current_period_end::text,
       null)
    on conflict do nothing;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function public.apply_due_plan_changes() is
  'Migration 109: promotes each subject''s SCHEDULED cycle (pending_interval -> interval, price re-frozen) once its own paid period ends. Scheduled hourly in 016. It never extends a period or grants access -- renewal/charging is the unimplemented provider seam -- so its only effect is that a parent''s cycle choice is no longer stored and forgotten.';

revoke all on function public.apply_due_plan_changes() from public, anon, authenticated;
grant execute on function public.apply_due_plan_changes() to service_role;

create or replace function public.quote_subject_change(
  p_student_profile_id uuid,
  p_add                uuid[] default '{}',
  p_remove             uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   public.child_subscriptions%rowtype;
  v_items jsonb;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;

  -- Compose the DESIRED full set from the live coverage + the add/remove diff,
  -- keeping every kept subject on ITS OWN cycle so a mixed plan is not
  -- flattened by an old caller.
  select jsonb_agg(jsonb_build_object('subject_id', x.sid, 'interval', x.iv))
    into v_items
  from (
    select ss.subject_id as sid,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not (ss.subject_id = any (coalesce(p_remove, '{}')))
    union
    select s.sid, v_sub.interval
    from unnest(coalesce(p_add, '{}')) s(sid)
  ) x;

  return public.quote_plan_change(p_student_profile_id, coalesce(v_items, '[]'::jsonb));
end;
$$;
revoke all on function public.quote_subject_change(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.quote_subject_change(uuid, uuid[], uuid[]) to service_role;
revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 4) apply_subject_change — atomic: adds get immediate access + a prorated
--    top-up, removals are SCHEDULED for the period end, the recurring rate is
--    recomputed, and every change is written to the ledger.
-- ----------------------------------------------------------------------------
create or replace function public.apply_subject_change(
  p_student_profile_id uuid,
  p_add                uuid[] default '{}',
  p_remove             uuid[] default '{}',
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   public.child_subscriptions%rowtype;
  v_items jsonb;
begin
  -- Round 48 kill switch: adds are paid, removals stay legal.
  if coalesce(array_length(p_add, 1), 0) > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;

  select jsonb_agg(jsonb_build_object('subject_id', x.sid, 'interval', x.iv))
    into v_items
  from (
    select ss.subject_id as sid,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not (ss.subject_id = any (coalesce(p_remove, '{}')))
    union
    select s.sid, v_sub.interval
    from unnest(coalesce(p_add, '{}')) s(sid)
  ) x;

  return public.apply_plan_change(
    p_student_profile_id, coalesce(v_items, '[]'::jsonb), p_idempotency_key);
end;
$$;
revoke all on function public.apply_subject_change(uuid, uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.apply_subject_change(uuid, uuid[], uuid[], text) to service_role;
revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- Migration 098: deleting a parent must not leave orphaned children.
--
-- The FK graph cascades everything except the child itself — `parents` cascades
-- `parent_student_links` away, while `students.created_by_parent_profile_id` is
-- only SET NULL, so the student's profile, credentials and auth user all
-- survive with no link to anyone. The account becomes invisible to every parent
-- surface yet can still sign in. Both existing students were already in exactly
-- that state when this was written.
--
-- Application code (admin `deleteParent`, web `deleteParentAccountCore`) already
-- deleted children first and still does; it simply is not the only route — the
-- Supabase dashboard and psql bypass it entirely. The rule belongs where the
-- deletion happens.
--
-- BEFORE DELETE, not AFTER: the link rows are cascaded away by this very delete,
-- so an AFTER trigger would run with the evidence already gone.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cascade_delete_parent_children()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_children uuid[];
begin
  select coalesce(array_agg(distinct child), '{}')
    into v_children
  from (
    select s.profile_id as child
      from public.students s
     where s.created_by_parent_profile_id = old.profile_id
    union
    select l.student_profile_id
      from public.parent_student_links l
     where l.parent_profile_id = old.profile_id
  ) q
  -- Shared children are KEPT and merely unlinked: deleting a live account
  -- because a co-parent left would be worse than the orphan this fixes.
  where not exists (
    select 1
      from public.parent_student_links l2
     where l2.student_profile_id = q.child
       and l2.parent_profile_id <> old.profile_id
  )
  and q.child <> old.profile_id;

  if array_length(v_children, 1) is null then
    return old;
  end if;

  -- Preferred path: the auth user cascades profiles -> students ->
  -- child_credentials -> links, and leaves nothing in auth.users either.
  -- Best-effort: if the owning role ever loses rights here, an exception would
  -- abort the parent's deletion entirely. The public-schema delete below is the
  -- guarantee.
  begin
    delete from auth.users u
     where u.id in (
       select p.auth_user_id
         from public.profiles p
        where p.id = any(v_children)
          and p.auth_user_id is not null
     );
  exception
    when insufficient_privilege or undefined_table then
      null;
  end;

  delete from public.profiles p where p.id = any(v_children);

  return old;
end;
$fn$;

comment on function public.fn_cascade_delete_parent_children() is
  'Migration 098: deletes a departing parent''s children (profiles + auth users) '
  'so no orphan child account survives, whatever route deleted the parent. '
  'Children still linked to another parent are kept.';

drop trigger if exists trg_parents_cascade_children on public.parents;
create trigger trg_parents_cascade_children
  before delete on public.parents
  for each row
  execute function public.fn_cascade_delete_parent_children();

-- -----------------------------------------------------------------------------
-- Migration 099: authoritative "is this email already taken?".
--
-- Reading it off the signUp RESPONSE is not sufficient: GoTrue only obfuscates a
-- duplicate (empty `identities`) when the existing account is CONFIRMED. An
-- UNCONFIRMED one is treated as a resend and comes back looking exactly like a
-- first registration — which is how duplicates kept getting through.
--
-- Performance: one equality probe against `idx_users_email` / the unique
-- `users_email_partial_key`. `lower()` is applied to the PARAMETER, never the
-- column — `lower(u.email) = …` would discard the plain index. Verified plan:
-- Index Only Scan.
--
-- Service_role ONLY: this is an account-existence oracle. anon/authenticated are
-- revoked EXPLICITLY because Supabase's default privileges grant EXECUTE on new
-- functions to both.
-- -----------------------------------------------------------------------------
create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from auth.users u
     where u.email = lower(trim(coalesce(p_email, '')))
  );
$$;

comment on function public.email_is_registered(text) is
  'Migration 099: true when an auth user already holds this email, CONFIRMED or '
  'not. Service-role only (account-existence oracle). Soft-deleted users still '
  'count — their row keeps the unique index entry, so the address is genuinely '
  'unavailable and reporting it free would only move the failure later.';

revoke all on function public.email_is_registered(text) from public, anon, authenticated;
grant execute on function public.email_is_registered(text) to service_role;

-- =============================================================================
-- End of 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
