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
-- Timed topic tests (migration 037): one open test per child + expiry sweep.
create unique index if not exists uq_test_attempts_open_test
  on public.test_attempts (student_profile_id)
  where kind = 'test' and status = 'in_progress';
create index if not exists idx_test_attempts_deadline
  on public.test_attempts (deadline_at)
  where status = 'in_progress';

create index if not exists idx_dtp_publish on public.daily_task_packages (publish_date, status);
create index if not exists idx_sdtp_student on public.student_daily_task_progress (student_profile_id);
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
    'districts','schools','grades','subjects','topics','subtopics',
    'question_types','difficulty_levels','olympiad_types','sources',
    'questions','question_translations','answer_options','answer_option_translations',
    'question_explanations','tests',
    'test_attempts','test_attempt_answers','daily_task_packages',
    'student_daily_task_progress','progress_snapshots',
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

drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after update on public.subscriptions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments
  after update on public.payments
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

drop trigger if exists trg_audit_daily_task_packages on public.daily_task_packages;
create trigger trg_audit_daily_task_packages
  after insert or update or delete on public.daily_task_packages
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
  v_real     := coalesce((v_flags->>'payments')::boolean, true);
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
        'email', coalesce((select value_json->>0 from public.system_settings where key='contact.support_email'), ''),
        'phone', coalesce((select value_json->>0 from public.system_settings where key='contact.support_phone'), '')),
    'social', jsonb_build_object(
        'facebook',  coalesce((select value_json->>0 from public.system_settings where key='social.facebook'), ''),
        'instagram', coalesce((select value_json->>0 from public.system_settings where key='social.instagram'), ''),
        'youtube',   coalesce((select value_json->>0 from public.system_settings where key='social.youtube'), ''),
        'tiktok',    coalesce((select value_json->>0 from public.system_settings where key='social.tiktok'), '')),
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
drop trigger if exists trg_audit_child_subscriptions on public.child_subscriptions;
create trigger trg_audit_child_subscriptions
  after update on public.child_subscriptions
  for each row execute function public.fn_audit_row();

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

-- create_child_account : atomic, server-side child provisioning WITHOUT a login ID.
-- The Auth user (p_auth_user_id) is created first by the service layer; the
-- on_auth_user_created trigger has already inserted a base profiles row. This
-- function promotes that profile to an active child, creates the student row
-- (optional structured p_grade_id + p_district_id/p_school_id), assigns the Student
-- role, records the credential mapping with a NULL child_unique_id, and auto-links
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
  p_school_id         uuid default null
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
  --    Structured district_id/school_id are stored alongside the free-text
  --    city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_school_id,
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

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning WITHOUT a login ID (allocated later on subscribe). Optional structured grade/city(district)/school stored on students. service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.
revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) to service_role;

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

-- bulk_insert_questions : atomic, per-item fault-tolerant batch insert across the
-- normalized trilingual question tables. Resolves taxonomy by code/level/name and
-- auto-creates missing topics/subtopics/sources. Each item runs in its own
-- subtransaction (BEGIN..EXCEPTION): a bad item is skipped + reported, good items
-- persist. Returns {total, successful, failed, errors[]}.
--
-- Item shape (JSON):
-- {
--   "primary_locale": "az",
--   "meta": { "subject","grade_level","type",
--             "olympiad_type"?, "topic"?, "subtopic"?, "source"? },
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
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
  -- AuthZ (DEFINER bypasses RLS, so we must check the caller's permission here).
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
      -- ---- resolve taxonomy by code/level (required) ----
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

      -- Per-type structure rules (migration 037): active type + exact option /
      -- correct-option counts (MCQ = 4 options, exactly 1 correct).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- difficulty removed from the platform (difficulty_id left null).

      -- ---- optional taxonomy (resolve-or-create) ----
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

      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic') limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name)
          values (v_subject, v_grade, v_item->'meta'->>'topic') returning id into v_topic;
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

      -- ---- primary locale + required body ----
      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- ---- question row ----
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'in_review', v_pl::public.content_locale, v_profile, v_profile)
      returning id into v_qid;

      -- ---- translations (+ optional explanation) for every provided locale ----
      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      -- ---- answer options (+ per-locale option text) ----
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
          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      -- per-item rollback to savepoint; record and continue.
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
  'Atomic per-item bulk question import (az/en/ru). Caller must hold content.create (checked internally). created_by derived from session. Not anon-executable.';

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
-- Child subscription engine (Stage 11, increment 1).
-- Backported from migrations/2026_06_28_012_child_subscription_engine.sql. Placed
-- at the END of this file so the function-privilege REVOKEs below run AFTER 010's
-- blanket grants — otherwise anon/authenticated's EXECUTE grant would remain.
-- Server-side pricing + subscription creation: price = sum(subject pricing for the
-- interval); sibling discount (2nd 15% / 3rd+ 20%) and trial length are computed
-- HERE, never by the client. quote_* is read-only (preview); create_* writes the
-- subscription as a 7-day trial and flips the child to access 'trialing'. Real
-- charge/webhook is provider-specific and out of scope until a provider is chosen.
-- SECURITY DEFINER; service_role EXECUTE only (called from the parent server
-- action's admin client after it authorizes the parent + child). create_* calls
-- quote_*, so quote_* is defined first.
-- -----------------------------------------------------------------------------

-- Read-only price quote (base, sibling discount, total, trial length).
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
declare
  v_owner   uuid;
  v_base    numeric(12,2);
  v_rank    int;
  v_pct     numeric(5,2);
  v_amt     numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_missing int;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'quote: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every selected subject must have active pricing for the interval.
  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (p_subject_ids) and sp.interval = p_interval and sp.status = 'active';

  -- Sibling rank = (this parent's OTHER children already on a live subscription) + 1.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');

  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;
  v_amt := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN');
end;
$$;

-- Create the subscription as a trial (computes amounts via quote; writes rows).
-- Batch H: ALSO allocates the deferred 8-digit login ID on the FIRST subscription
-- for a child that still has none, backfills child_credentials, and returns
-- new_child_unique_id + auth_user_id so the server action sets the synthetic email.
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
declare
  v_owner   uuid;
  v_q       jsonb;
  v_sub     uuid;
  v_sid     uuid;
  v_trial   int;
  v_child   text;
  v_auth    uuid;
  v_had_any boolean;
  v_status  public.subscription_status;
  v_end     timestamptz;
begin
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

  v_q := public.quote_child_subscription(p_student_profile_id, p_interval, p_subject_ids);

  -- Trial once per child: any prior subscription row (canceled/expired included)
  -- means no new free trial — the new plan starts as a paid period (audit C2).
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
  );
  if v_had_any then
    v_trial  := 0;
    v_status := 'active';
    v_end    := now() + case p_interval
                          when 'week'  then interval '7 days'
                          when 'month' then interval '1 month'
                          else              interval '1 year'
                        end;
  else
    v_trial  := (v_q->>'trial_days')::int;
    v_status := 'trialing';
    v_end    := now() + (v_trial || ' days')::interval;
  end if;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_end end,
     now(), v_end,
     (v_q->>'base')::numeric, (v_q->>'discount_percent')::numeric,
     (v_q->>'discount')::numeric, (v_q->>'total')::numeric, 'AZN', 'none')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child has
  -- none, and backfill the credential mapping so child login works.
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
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
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
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  if not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active'
  ) then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects (child_subscription_id, subject_id)
  values (v_sub, p_subject_id) on conflict do nothing;

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match; the percent is stored back.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
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
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_count    int;
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
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

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
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

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount,
     currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'active',
     now(), now() + (v_days || ' days')::interval,
     0, 0, 0, 0, 'AZN', 'admin_grant')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  v_ids := public.activate_child_login_id(p_student_profile_id);

  update public.students set access_status = 'active'
   where profile_id = p_student_profile_id;

  return jsonb_build_object(
    'subscription_id', v_sub, 'status', 'active', 'days', v_days,
    'current_period_end', to_jsonb(now() + (v_days || ' days')::interval))
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
                               'text', coalesce(aot.text, aot_az.text))
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
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
  v_owner     uuid;
  v_price     numeric(10,2);
  v_currency  text;
  v_status    public.catalog_status;
  v_event     timestamptz;
  v_existing  uuid;
  v_ex_status text;
  v_id        uuid;
begin
  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, event_starts_at
    into v_price, v_currency, v_status, v_event
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Audit M12 (migration 035): past-event packages are treated as archived for sale.
  if v_status <> 'active' or (v_event is not null and v_event <= now()) then
    raise exception 'purchase: package not available' using errcode = 'check_violation';
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT price/date.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none')
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active', 'existing', false);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. service_role only (payment stubbed). Past-event packages are not sellable.';

create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_subject uuid;
  v_n_per   int;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;
  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  -- The Round-11/12 free-play fallback (giveaway or free-access interval opened
  -- ACTIVE-catalog packages without a purchase) was removed.
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select subject_id, questions_per_attempt into v_subject, v_n_per
  from public.olympiad_packages where id = p_package_id;
  v_n_per := coalesce(v_n_per, 25);

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, v_subject, 'olympiad', 'in_progress')
  returning id into v_attempt;

  -- PRIVATE pool: questions assigned to this package only (Batch D).
  with picked as (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit greatest(1, v_n_per)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

comment on function public.start_olympiad_attempt(uuid) is
  'Child starts an olympiad attempt on a PURCHASED package (25 random from the package''s private pool). Purchase-only in every mode — free-access/trial/giveaway never open packages (owner ruling 2026-07-06).';

revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- bulk_insert_olympiad_package_questions (Batch D): import PRIVATE trilingual
-- questions for one olympiad package. Same item format as bulk_insert_questions
-- but every inserted question gets olympiad_package_id = p_package_id and is
-- published immediately (the attempt engine requires status='published'), so it
-- stays out of the general pool. Subject defaults to the package's subject; type
-- resolved by name. Administrator-only (audit H2); never anon-executable.
-- ---------------------------------------------------------------------------
create or replace function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb
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

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

      -- Per-type structure rules (migration 037).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

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

      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic') limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name)
          values (v_subject, v_grade, v_item->'meta'->>'topic') returning id into v_topic;
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

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
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
          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));
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
          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) is
  'Bulk import of PRIVATE trilingual questions for one olympiad package (sets questions.olympiad_package_id, status published). Administrators only (checked internally). Not anon-executable.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Round 9 (migration 023): REAL analytics RPCs (parent dashboard + admin
-- platform overview). On-demand aggregation over graded attempts; in-body
-- authorization (service role / admin / linked parent / the child itself);
-- EXECUTE revoked from anon.
-- -----------------------------------------------------------------------------
create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
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
  ),
  ans as (
    select a.is_correct, q.topic_id, q.subtopic_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where not is_correct) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*), 0) * 100, 1) from ans)
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
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(tot, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) tot,
                     count(*) filter (where is_correct) cor
                from ans group by 1) t
    ),
    'per_topic', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.tot, 'correct', x.cor, 'wrong', x.tot - x.cor,
               'accuracy', round(x.cor::numeric / nullif(x.tot, 0) * 100, 1))
               order by x.tot desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, t.name as tname, count(*) tot,
                     count(*) filter (where a.is_correct) cor
                from ans a
                join public.topics t on t.id = a.topic_id
               group by a.topic_id, t.name) x
    ),
    'mistakes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.tot, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select t.name as tname,
                     coalesce(st.name, '—') as sname,
                     count(*) tot,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.subtopics st on st.id = a.subtopic_id
               group by t.name, coalesce(st.name, '—')
              having count(*) filter (where not a.is_correct) > 0
               order by count(*) filter (where not a.is_correct) desc
               limit 10) y
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int) is
  'Per-child (optionally per-subject) analytics over graded attempts in a rolling window: '
  'totals/accuracy/time/last-activity + 7-day activity, accuracy trend, per-topic rows, '
  'mistakes breakdown. Callable by admins, the linked parent, or the child (in-body check).';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int)
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
-- TIMED TOPIC-TEST ENGINE (migration 037; docs/plans/TEST_ENGINE_PLAN.md T0).
-- Owner decisions 2026-07-06: FIXED 25 questions / 25 minutes, TRUE resume,
-- unlimited attempts with a fresh re-draw. Server-authoritative everything:
-- draw, deadline, grading, single-open, expiry. Answer keys are revealed ONLY
-- by get_test_review (status='graded').
-- -----------------------------------------------------------------------------

-- start_topic_test_attempt: access-guarded (same rule as start_practice_attempt),
-- topic/subtopic scope validated, 25 random published MCQ-family questions
-- (fallback to subject-wide when the scope has none), deadline = now()+25min.
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
  c_duration constant int := 1500;  -- 25 minutes (60s/question)
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
  v_deadline timestamptz;
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

  -- TRUE resume: one open timed test at a time. Still-running → return it;
  -- past-deadline → expire it and start fresh.
  select id, deadline_at into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at, 'duration_seconds', c_duration);
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

  v_deadline := now() + make_interval(secs => c_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, v_deadline, c_duration, v_topics, v_subs)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', c_duration,
    'count', cardinality(v_qids));
end;
$$;

-- get_test_attempt: rehydration payload (questions + options WITHOUT is_correct,
-- saved answers + flags, server deadline → remaining seconds).
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
  v_result   jsonb;
begin
  select id, student_profile_id, status, kind, subject_id,
         deadline_at, duration_seconds, score, max_score
    into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
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
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'is_marked', taa.is_marked,
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text))
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
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
    exit when v_n > 100;  -- payload cap
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
  select id, student_profile_id, status, deadline_at, score, max_score into v_att
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

  -- Merge the final client answers only within deadline + 60s grace.
  if p_answers is not null
     and (v_att.deadline_at is null or now() <= v_att.deadline_at + interval '60 seconds') then
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_n := v_n + 1;
      exit when v_n > 100;
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
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao
      where ao.question_id = v_r.question_id and ao.is_correct;

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
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

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
-- owner's GRADED attempt (works for practice attempts too).
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
  v_result  jsonb;
begin
  select id, student_profile_id, status, score, max_score into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'graded' then
    raise exception 'review: attempt not graded yet' using errcode = 'check_violation';
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
        'is_correct', taa.is_correct,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'explanation', coalesce(qe.explanation_body, qe_az.explanation_body),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               'is_correct', ao.is_correct)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.question_explanations qe
      on qe.question_id = taa.question_id and qe.locale = v_loc::public.content_locale
    left join public.question_explanations qe_az
      on qe_az.question_id = taa.question_id and qe_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- expire_stale_test_attempts (cron, 016): timed tests 5 min past deadline →
-- 'expired'; practice/olympiad attempts stuck in_progress >24h → 'abandoned'.
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
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind = 'test' and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily') and status = 'in_progress'
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
  v_tz        text;
  v_today     date;
  v_mkey      text;
  v_per       numeric := 10;
  v_cap       numeric := 150;
  v_mult      numeric := 1.5;
  v_correct   int := 0;
  v_raw       numeric := 0;
  v_used      numeric := 0;
  v_awarded   numeric := 0;
  v_rows      int;
  v_last      date;
  v_new_day   boolean := false;
begin
  select student_profile_id, subject_id, kind::text, status
    into v_student, v_subject, v_kind, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_student is null or v_status <> 'graded'
     or v_kind not in ('practice', 'test', 'olympiad', 'daily') then
    return;
  end if;

  select coalesce(streak_tz, 'Asia/Baku'), last_active_date
    into v_tz, v_last
  from public.students where profile_id = v_student;
  if v_tz is null then return; end if;   -- not a child row
  v_today := (now() at time zone v_tz)::date;
  v_mkey  := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');  -- board-level month key

  -- Config (exception-safe defaults; the trigger wrapper also guards).
  v_per  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.per_correct'), 10);
  v_cap  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.practice_daily_cap_per_subject'), 150);
  v_mult := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.olympiad_multiplier'), 1.5);

  -- Difficulty-weighted raw points over CORRECT stored answers (server truth).
  select count(*), coalesce(sum(v_per * coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_raw
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id and a.is_correct;

  if v_kind = 'olympiad' then
    v_awarded := round(v_raw * v_mult, 2);
  else
    -- practice + topic tests share the per-subject daily anti-grind cap.
    select coalesce(sum(points), 0) into v_used
    from public.student_points_ledger
    where student_profile_id = v_student
      and subject_id is not distinct from v_subject
      and kind in ('practice', 'test', 'daily')
      and (created_at at time zone v_tz)::date = v_today;
    v_awarded := round(least(v_raw, greatest(0, v_cap - v_used)), 2);
  end if;

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', v_awarded < v_raw))
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;     -- already scored

  -- Streak: single writer, LOCAL-date row + cached counters.
  insert into public.student_activity_days (student_profile_id, activity_date)
  values (v_student, v_today)
  on conflict (student_profile_id, activity_date)
    do update set attempts = public.student_activity_days.attempts + 1;
  v_new_day := (v_last is distinct from v_today);

  update public.students
     set points_all_time = points_all_time + v_awarded,
         points_month    = case when points_month_key is distinct from v_mkey
                                then v_awarded else points_month + v_awarded end,
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
  'SINGLE leaderboard writer: ledger row (once per graded attempt), cached points (lazy month rollover) and streak. Fired by trg_award_points_on_graded; never callable by clients.';
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

--

-- Internal: full ranked set for one board/scope/period. service-internal only.
create or replace function public.lb_rows(
  p_board    text,          -- 'points' | 'streak'
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (points only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text, child_unique_id text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mkey text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
begin
  if p_board not in ('points', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if p_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  if p_board = 'streak' then
    return query
      select st.profile_id,
             -- lazy expiry: a streak is live only if active today or yesterday (local)
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name, st.child_unique_id
      from public.students st
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    -- per-subject points come from the ledger (month filter on the board tz)
    return query
      select st.profile_id, l.pts, st.best_streak, st.last_points_at,
             st.first_name, st.last_name, st.child_unique_id
      from (
        select sl.student_profile_id, sum(sl.points) as pts
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      where l.pts > 0;
  else
    return query
      select st.profile_id,
             case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name, st.child_unique_id
      from public.students st
      where (p_scope = 'global'
             or (p_scope = 'grade'  and st.grade_id    = p_scope_id)
             or (p_scope = 'city'   and st.district_id = p_scope_id)
             or (p_scope = 'school' and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end) > 0;
  end if;
end;
$$;
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- Public board read: top-N, deterministic tie-break, privacy applied server-side.
create or replace function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, anon_tag text, value numeric, is_self boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := public.current_profile_id();
  v_public boolean := coalesce((select nullif(value_json #>> '{}', '')::boolean
                                  from public.system_settings
                                 where key = 'leaderboard.public_display_names'), true);
  v_limit  int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    select r.rn::int,
           case when v_public or r.profile_id = v_me
                then trim(coalesce(r.first_name, '') || ' ' ||
                          coalesce(left(nullif(r.last_name, ''), 1) || '.', ''))
                else null end,
           case when v_public or r.profile_id = v_me then null
                else right(coalesce(r.child_unique_id, '0000'), 4) end,
           r.value, r.profile_id = v_me
    from (
      select t.*, row_number() over (
               order by t.value desc, t.best_streak desc,
                        t.last_points_at asc nulls last, t.profile_id) as rn
      from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
    ) r
    where r.rn <= v_limit
    order by r.rn;
end;
$$;
comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live privacy-filtered board (points month/all_time per scope; streak global). Non-self rows are anonymized to a 4-digit tag when leaderboard.public_display_names is off. No client aggregation.';
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
  v_me uuid := public.current_profile_id();
  v_out jsonb;
begin
  if v_me is null then raise exception 'leaderboard: not authenticated'; end if;
  select jsonb_build_object('rank', r.rn, 'total', r.total, 'value', r.value)
    into v_out
  from (
    select profile_id, value,
           row_number() over (order by value desc, best_streak desc,
                              last_points_at asc nulls last, profile_id) as rn,
           count(*) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
  ) r
  where r.profile_id = v_me;
  return coalesce(v_out, jsonb_build_object('rank', null, 'total',
    (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period)), 'value', 0));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

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
  v_start  date := to_date(v_key || '-01', 'YYYY-MM-DD');
  v_period uuid;
  v_rows   jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'rank', rn, 'student_profile_id', student_profile_id, 'points', pts))
    into v_rows
  from (
    select sl.student_profile_id, sum(sl.points) as pts,
           row_number() over (order by sum(sl.points) desc, sl.student_profile_id) as rn
    from public.student_points_ledger sl
    where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_key
    group by sl.student_profile_id
    having sum(sl.points) > 0
    order by rn
    limit 100
  ) t;

  if v_rows is not null then
    insert into public.leaderboard_periods (period_type, starts_at, ends_at)
    values ('monthly',
            (v_start::timestamp at time zone 'Asia/Baku'),
            ((v_start + interval '1 month')::timestamp at time zone 'Asia/Baku'))
    on conflict (period_type, starts_at, ends_at)
      do update set updated_at = now()
    returning id into v_period;
    insert into public.leaderboard_snapshots (period_id, scope_type, generated_at, metadata, entries_json)
    values (v_period, 'global', now(), jsonb_build_object('month', v_key, 'source', 'ledger'), v_rows);
  end if;

  update public.students
     set points_month = 0, points_month_key = to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'),
         updated_at = now()
   where points_month <> 0
     and points_month_key is distinct from to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
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
    update public.students set points_month = 0, updated_at = now() where points_month <> 0;
  elsif p_mode = 'hard' then
    delete from public.student_points_ledger;
    delete from public.student_activity_days;
    update public.students
       set points_all_time = 0, points_month = 0, points_month_key = null,
           last_points_at = null, current_streak = 0, best_streak = 0,
           last_active_date = null, updated_at = now()
     where points_all_time <> 0 or points_month <> 0 or current_streak <> 0
        or best_streak <> 0 or last_points_at is not null;
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
  select row_number() over (order by t.pts desc, t.student_profile_id)::int as rank,
         t.student_profile_id,
         trim(coalesce(st.first_name,'') || ' ' ||
              coalesce(left(nullif(st.last_name,''),1) || '.', '')) as display_name,
         t.pts as value
  from (
    select sl.student_profile_id, sum(sl.points) as pts
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends
    group by sl.student_profile_id
    having sum(sl.points) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  order by t.pts desc, t.student_profile_id
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
           'display_name', display_name, 'value', value) order by rank), '[]'::jsonb)
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
  v_pts_m numeric := 0; v_pts_a numeric := 0;
  v_cur   int := 0; v_best int := 0; v_last date; v_tz text;
  v_rank_m int; v_tot_m int; v_rank_a int; v_streak_live int := 0;
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  -- Only the LINKED parent (or an admin) may read a child's summary.
  if not (public.is_admin() or public.is_parent_linked_to_student(p_student)) then
    raise exception 'summary: forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(points_all_time,0), current_streak, best_streak, last_active_date,
         coalesce(streak_tz,'Asia/Baku'),
         case when points_month_key = to_char(now() at time zone 'Asia/Baku','YYYY-MM')
              then points_month else 0 end
    into v_pts_a, v_cur, v_best, v_last, v_tz, v_pts_m
    from public.students where profile_id = p_student;

  -- live streak (lazy loss)
  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  select r.rn, r.total into v_rank_m, v_tot_m from (
    select profile_id, row_number() over (order by value desc, best_streak desc,
             last_points_at asc nulls last, profile_id) as rn, count(*) over () as total
    from public.lb_rows('points','global',null,'month')
  ) r where r.profile_id = p_student;

  select r.rn into v_rank_a from (
    select profile_id, row_number() over (order by value desc, best_streak desc,
             last_points_at asc nulls last, profile_id) as rn
    from public.lb_rows('points','global',null,'all_time')
  ) r where r.profile_id = p_student;

  return jsonb_build_object(
    'points_month', v_pts_m, 'points_all_time', v_pts_a,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a);
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
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
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

-- admin_send_notification — the broadcast path. authenticated + in-body admin
-- check. Immediate send (scheduled_at null) fans out now; else stored 'scheduled'
-- and dispatched by cron. Returns the admin_notifications id + recipient count.
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
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'notify: title and body required' using errcode = 'check_violation';
  end if;
  if p_audience_type not in ('all_parents','all_children','parent','by_subject','individual') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
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

  -- Immediate fan-out (idempotent per recipient+broadcast).
  for v_rec in select a.profile_id from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb)) a
  loop
    v_key := 'admin:' || v_id::text || ':' || v_rec::text;
    perform public.create_notification(
      v_rec, 'admin_announcement', p_title, p_body,
      jsonb_build_object('admin_notification_id', v_id),
      coalesce(p_channels,'{in_app}'), v_key, 3, p_action_url, 'announcement', null);
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
declare v_row record; v_rec uuid; v_n int; v_total int := 0;
begin
  for v_row in
    select * from public.admin_notifications
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.admin_notifications set status = 'sending' where id = v_row.id;
    v_n := 0;
    for v_rec in select a.profile_id from public.lb_notify_audience(v_row.audience_type, v_row.audience_filter) a
    loop
      perform public.create_notification(
        v_rec, 'admin_announcement', v_row.title, v_row.body,
        jsonb_build_object('admin_notification_id', v_row.id),
        v_row.channels, 'admin:' || v_row.id::text || ':' || v_rec::text, 3, null, 'announcement', null);
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
-- End of 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
