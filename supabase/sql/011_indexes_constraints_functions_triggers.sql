-- =============================================================================
-- 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 011 of 013.
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
-- trigram search over localized question bodies (pg_trgm from 001).
create index if not exists idx_qtrans_body_trgm
  on public.question_translations using gin (body gin_trgm_ops);

create index if not exists idx_answer_options_question on public.answer_options (question_id);
create index if not exists idx_tests_status on public.tests (status);
create index if not exists idx_test_questions_question on public.test_questions (question_id);

create index if not exists idx_attempts_student on public.test_attempts (student_profile_id);
create index if not exists idx_attempts_test on public.test_attempts (test_id);
create index if not exists idx_attempts_status on public.test_attempts (status);
create index if not exists idx_answers_attempt on public.test_attempt_answers (attempt_id);

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
-- RLS-protected registry; never trust a client-provided ID.
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
      -- loop and retry
    end;
  end loop;
end;
$$;

-- updated_at triggers for the child-account tables (not in the bulk array above).
drop trigger if exists trg_set_updated_at on public.child_credentials;
create trigger trg_set_updated_at before update on public.child_credentials
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.wallpapers;
create trigger trg_set_updated_at before update on public.wallpapers
  for each row execute function public.set_updated_at();

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

-- create_child_account : atomic, server-side child provisioning.
-- The Auth user (p_auth_user_id) is created first by the service layer; the
-- on_auth_user_created trigger has already inserted a base profiles row. This
-- function promotes that profile to an active child, creates the student row,
-- allocates the 8-digit ID, assigns the Student role, records the credential
-- mapping, and auto-links the child to the creating parent — all in one txn.
-- SECURITY DEFINER; EXECUTE restricted to service_role (the parent server action
-- runs this with the service role, after admin.createUser). Never client-callable.
-- (drop first: renaming the RETURNS TABLE columns changes the return signature)
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null
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
  v_child_id        text;
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

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row (parent-created child; no paid access yet).
  insert into public.students (profile_id, created_by_parent_profile_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Allocate the collision-safe 8-digit ID (also sets students.child_unique_id).
  v_child_id := public.allocate_child_unique_id(v_profile_id);

  -- 4) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 5) Record the credential mapping (password lives ONLY in Supabase Auth).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, v_child_id, p_auth_user_id, p_parent_profile_id, now());

  -- 6) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  return query select v_profile_id, v_child_id;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text) is
  'Atomic parent-created child provisioning. service_role EXECUTE only. Run AFTER admin.createUser (synthetic c<8digits>@children.invalid).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.
revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text) to service_role;

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

-- =============================================================================
-- End of 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
