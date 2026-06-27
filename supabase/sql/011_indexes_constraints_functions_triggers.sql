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

-- -----------------------------------------------------------------------------
-- Indexes (foreign-key lookups, status filters, search).
-- -----------------------------------------------------------------------------
create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profile_roles_role on public.profile_roles (role_id);
create index if not exists idx_role_permissions_perm on public.role_permissions (permission_id);

create index if not exists idx_students_grade on public.students (grade_id);
create index if not exists idx_students_school on public.students (school_id);
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

-- =============================================================================
-- End of 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
