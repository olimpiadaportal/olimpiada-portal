-- =============================================================================
-- 013_validation_queries.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 013 of 013.
--
-- Responsibility : Read-only validation and smoke checks for the schema, RLS,
--                  seeds, security helpers, and storage.
-- Run order      : Last. After 001-012.
-- Safe to rerun  : Yes. READ-ONLY. No INSERT/UPDATE/DELETE/DDL.
-- Usage          : Run in the Supabase SQL editor (or psql) after applying
--                  001-012 to a development/staging project. Each query returns a
--                  labelled result; investigate any row whose "status" is 'FAIL'
--                  or whose list of problems is non-empty.
--
-- These are diagnostics only. Full RLS behavior (student A vs student B, parent
-- linked vs unlinked, content manager denial) must additionally be tested with
-- real authenticated sessions per the RLS Testing Checklist in
-- docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md.
-- =============================================================================

-- 1) Core tables exist (expect every name listed, missing => problem). -----------
with expected(name) as (
  values
    ('profiles'),('roles'),('permissions'),('role_permissions'),('profile_roles'),
    ('parents'),('students'),('parent_student_links'),
    ('districts'),('schools'),('grades'),('subjects'),('topics'),('subtopics'),
    ('question_types'),('difficulty_levels'),('olympiad_types'),('sources'),
    ('questions'),('question_translations'),('answer_options'),
    ('answer_option_translations'),('question_explanations'),('tests'),('test_questions'),
    ('test_attempts'),('test_attempt_answers'),('daily_task_packages'),('daily_task_items'),
    ('student_daily_task_progress'),('progress_snapshots'),
    ('leaderboard_periods'),('leaderboard_entries'),('leaderboard_snapshots'),
    ('achievements'),('student_achievements'),('question_analytics'),
    ('subscription_plans'),('subscriptions'),('payments'),('payment_events'),
    ('coupons'),('coupon_redemptions'),
    ('media_assets'),('notification_templates'),('notifications'),('notification_deliveries'),
    ('support_requests'),('audit_logs'),('admin_actions'),('content_reviews'),
    ('system_settings'),('feature_flags')
)
select '1_missing_tables' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_tables,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from expected e
left join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = e.name
where t.table_name is null;

-- 2) RLS enabled on all public tables (any with rls off => problem). -------------
select '2_rls_disabled_tables' as check_name,
       coalesce(string_agg(c.relname, ', '), '(none)') as tables_without_rls,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false;

-- 3) Every public table has at least one policy. ---------------------------------
select '3_tables_without_policies' as check_name,
       coalesce(string_agg(c.relname, ', '), '(none)') as tables_without_policy,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  );

-- 4) Expected enum types exist. --------------------------------------------------
with expected(name) as (
  values ('account_status'),('content_locale'),('catalog_status'),('link_status'),
         ('content_status'),('review_status'),('attempt_status'),('task_progress_status'),
         ('subscription_status'),('payment_status'),('plan_interval'),('discount_type'),
         ('notification_channel'),('delivery_status'),('leaderboard_period_type'),
         ('leaderboard_scope_type'),('support_status'),('audit_severity'),
         ('media_visibility'),('scoring_policy')
)
select '4_missing_enums' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_enums,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from expected e
left join pg_type t on t.typname = e.name
where t.typname is null;

-- 5) Security helper functions exist. --------------------------------------------
with expected(name) as (
  values ('current_profile_id'),('has_role'),('is_admin'),('has_permission'),
         ('is_parent_linked_to_student'),('set_updated_at'),('fn_audit_row')
)
select '5_missing_functions' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_functions,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from expected e
left join pg_proc p on p.proname = e.name
left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname is null;

-- 6) Seed: 4 system roles and 18 permissions present. ---------------------------
select '6_seed_roles_permissions' as check_name,
       (select count(*) from public.roles)       as roles_count,
       (select count(*) from public.permissions) as permissions_count,
       case when (select count(*) from public.roles) >= 4
             and (select count(*) from public.permissions) >= 18
            then 'PASS' else 'FAIL' end as status;

-- 7) Administrator role is granted every permission. -----------------------------
select '7_admin_has_all_permissions' as check_name,
       (select count(*) from public.permissions) as total_permissions,
       (select count(*) from public.role_permissions rp
          join public.roles r on r.id = rp.role_id where r.code = 'administrator') as admin_grants,
       case when (select count(*) from public.role_permissions rp
                    join public.roles r on r.id = rp.role_id where r.code = 'administrator')
               = (select count(*) from public.permissions)
            then 'PASS' else 'FAIL' end as status;

-- 8) Content Manager has NO sensitive permissions (payments/settings/audit/etc). -
select '8_content_manager_boundary' as check_name,
       coalesce(string_agg(p.code, ', '), '(none)') as leaked_permissions,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id
where r.code = 'content_manager'
  and p.code in ('payments.read','payments.manage','subscriptions.manage',
                 'settings.manage','feature_flags.manage','audit.read',
                 'users.manage','content.publish');

-- 9) Payment webhook idempotency: UNIQUE(provider, event_id) exists. -------------
select '9_payment_event_idempotency' as check_name,
       case when exists (
         select 1 from pg_constraint where conname = 'uq_payment_event'
       ) then 'PASS' else 'FAIL' end as status;

-- 10) Leaderboard NULL-safe unique index exists. --------------------------------
select '10_leaderboard_unique_index' as check_name,
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'uq_leaderboard_entry_scope'
       ) then 'PASS' else 'FAIL' end as status;

-- 11) Storage buckets exist (5 expected). ---------------------------------------
select '11_storage_buckets' as check_name,
       coalesce(string_agg(b.id, ', ' order by b.id), '(none)') as buckets,
       case when count(*) = 5 then 'PASS' else 'FAIL' end as status
from storage.buckets b
where b.id in ('question-media','explanation-media','profile-avatars','admin-imports','reports');

-- 12) Grades 1..11 and starter subjects seeded. ---------------------------------
select '12_taxonomy_seed' as check_name,
       (select count(*) from public.grades)   as grades_count,
       (select count(*) from public.subjects) as subjects_count,
       case when (select count(*) from public.grades) = 11
             and (select count(*) from public.subjects) >= 1
            then 'PASS' else 'FAIL' end as status;

-- =============================================================================
-- End of 013_validation_queries.sql
-- =============================================================================
