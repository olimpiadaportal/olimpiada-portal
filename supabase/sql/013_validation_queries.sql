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
    ('parents'),('students'),('parent_student_links'),('child_login_attempts'),
    ('districts'),('schools'),('grades'),('subjects'),('topics'),('subtopics'),
    ('question_types'),('difficulty_levels'),('olympiad_types'),('sources'),
    ('questions'),('question_translations'),('answer_options'),
    ('answer_option_translations'),('question_explanations'),('tests'),('test_questions'),
    ('question_imports'),
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
         ('media_visibility'),('scoring_policy'),('child_access_status')
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
         ('is_parent_linked_to_student'),('set_updated_at'),('fn_audit_row'),
         ('allocate_child_unique_id'),('create_child_account'),
         ('is_child_login_locked'),('record_child_login_attempt'),
         ('bulk_insert_questions'),('setup_parent'),
         ('quote_child_subscription'),('create_child_subscription'),
         ('add_subscription_subject'),('remove_subscription_subject'),
         ('start_practice_attempt'),('get_practice_attempt'),('grade_practice_attempt'),
         ('purchase_olympiad'),('start_olympiad_attempt'),
         ('bulk_insert_olympiad_package_questions'),
         ('advance_student_grades')
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

-- 11) Storage buckets exist (8 expected incl. Stage 7 wallpaper/news/olympiad). --
select '11_storage_buckets' as check_name,
       coalesce(string_agg(b.id, ', ' order by b.id), '(none)') as buckets,
       case when count(*) = 8 then 'PASS' else 'FAIL' end as status
from storage.buckets b
where b.id in ('question-media','explanation-media','profile-avatars','admin-imports','reports',
               'wallpaper-assets','news-media','olympiad-media');

-- 12) Grades 1..11 and starter subjects seeded. ---------------------------------
select '12_taxonomy_seed' as check_name,
       (select count(*) from public.grades)   as grades_count,
       (select count(*) from public.subjects) as subjects_count,
       case when (select count(*) from public.grades) = 11
             and (select count(*) from public.subjects) >= 1
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 7 — Business-Model Database Foundation checks (child accounts,
-- subscriptions/payments, News, Olympiad Preparation).
-- -----------------------------------------------------------------------------

-- 13) Child-account tables + the parent-created student columns exist. -----------
with expected(name) as (
  values ('child_unique_ids'),('child_credentials'),('wallpapers'),('child_wallpaper_selections')
)
select '13_child_account_tables' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_tables,
       case when count(*) = 0
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='child_unique_id')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='created_by_parent_profile_id')
            then 'PASS' else 'FAIL' end as status
from expected e
left join information_schema.tables t
  on t.table_schema='public' and t.table_name=e.name
where t.table_name is null;

-- 14) Child subscription/payment tables + the 3 payments link columns exist. -----
with expected(name) as (
  values ('subjects_pricing'),('launch_promo_config'),('child_subscriptions'),
         ('subscription_subjects'),('checkout_sessions'),('sibling_discounts')
)
select '14_subscription_tables' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_tables,
       case when count(*) = 0
             and (select count(*) from information_schema.columns
                   where table_schema='public' and table_name='payments'
                     and column_name in
                     ('child_subscription_id','checkout_session_id','olympiad_purchase_id')) = 3
            then 'PASS' else 'FAIL' end as status
from expected e
left join information_schema.tables t
  on t.table_schema='public' and t.table_name=e.name
where t.table_name is null;

-- 15) News module tables + news-media bucket exist. ------------------------------
with expected(name) as ( values ('news'),('news_translations') )
select '15_news_module' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_tables,
       case when count(*) = 0
             and exists (select 1 from storage.buckets where id='news-media')
            then 'PASS' else 'FAIL' end as status
from expected e
left join information_schema.tables t
  on t.table_schema='public' and t.table_name=e.name
where t.table_name is null;

-- 16) Olympiad module tables + bucket + purchased-package lifetime FK (RESTRICT). -
with expected(name) as (
  values ('olympiad_packages'),('olympiad_package_translations'),
         ('olympiad_package_questions'),('olympiad_purchases')
)
select '16_olympiad_module' as check_name,
       coalesce(string_agg(e.name, ', '), '(none)') as missing_tables,
       case when count(*) = 0
             and exists (select 1 from storage.buckets where id='olympiad-media')
             and exists (select 1 from pg_constraint con
                          join pg_class child on child.oid = con.conrelid
                          join pg_class parent on parent.oid = con.confrelid
                          join pg_namespace n on n.oid = child.relnamespace
                          where n.nspname='public'
                            and child.relname='olympiad_purchases'
                            and parent.relname='olympiad_packages'
                            and con.confdeltype='r')  -- on delete restrict
            then 'PASS' else 'FAIL' end as status
from expected e
left join information_schema.tables t
  on t.table_schema='public' and t.table_name=e.name
where t.table_name is null;

-- -----------------------------------------------------------------------------
-- Stage 8 — Child Authentication & Account Model checks (provisioning security).
-- -----------------------------------------------------------------------------

-- 17) Child provisioning is secure: the lockout log table exists AND the atomic
--     create_child_account() function is NOT EXECUTE-grantable by clients
--     (authenticated/anon) — it is service_role only.
select '17_child_provisioning_secure' as check_name,
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='child_login_attempts')
             and has_function_privilege('authenticated',
                   'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 6 — Bulk question import checks (import-history + secure DEFINER RPC).
-- -----------------------------------------------------------------------------

-- 18) Bulk import is secure: the question_imports history table exists AND the
--     bulk_insert_questions() DEFINER function is NOT EXECUTE-grantable by anon
--     (content authors run it as authenticated; never anon/public).
select '18_bulk_import_secure' as check_name,
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='question_imports')
             and has_function_privilege('anon',
                   'public.bulk_insert_questions(jsonb,text)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 10 — Parent self-registration checks (secure DEFINER RPC).
-- -----------------------------------------------------------------------------

-- 19) Parent setup is secure: the atomic setup_parent() function is NOT
--     EXECUTE-grantable by clients (authenticated/anon) — it is service_role
--     only (the web-app registration server action runs it as service_role,
--     after admin.createUser).
select '19_parent_setup_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.setup_parent(uuid,text)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.setup_parent(uuid,text)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 11 — Child subscription engine checks (secure DEFINER pricing/creation).
-- -----------------------------------------------------------------------------

-- 20) Subscription engine is secure: the atomic create_child_subscription()
--     function is NOT EXECUTE-grantable by clients (authenticated/anon) — it is
--     service_role only (the parent server action runs it as service_role, after
--     authorizing the parent + child). Pricing/discount/trial are computed here.
select '20_subscription_engine_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.create_child_subscription(uuid,public.plan_interval,uuid[])', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.create_child_subscription(uuid,public.plan_interval,uuid[])', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 13 — Test & daily task engine checks (secure DEFINER grading RPC).
-- -----------------------------------------------------------------------------

-- 21) Test engine is secure: the auto-grading grade_practice_attempt() function
--     is NOT EXECUTE-grantable by anon — only the authenticated student (whose
--     ownership is verified inside) and service_role may run it, so scores are
--     never client-forgeable via an anonymous session.
select '21_test_engine_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.grade_practice_attempt(uuid,jsonb)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Stage 14 — Olimpiada Preparation engine checks (secure DEFINER purchase RPC).
-- -----------------------------------------------------------------------------

-- 22) Olympiad engine is secure: the one-time LIFETIME purchase_olympiad()
--     function is NOT EXECUTE-grantable by clients (authenticated/anon) — it is
--     service_role only (the parent server action runs it as service_role, after
--     authorizing the parent + child). Payment is stubbed until a provider is
--     chosen, so a purchase must never be client-activated.
select '22_olympiad_engine_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.purchase_olympiad(uuid,uuid)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.purchase_olympiad(uuid,uuid)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 23) Olympiad PRIVATE pool (Batch D): questions.olympiad_package_id column +
--     index exist, and the private-pool bulk importer is content-gated (not
--     anon-executable). Private questions are kept out of the general pool by
--     the start_practice_attempt / admin-list filters (behavioral, tested in UI).
select '23_olympiad_private_pool' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='questions'
                            and column_name='olympiad_package_id')
             and exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='idx_questions_olympiad_package')
             and has_function_privilege('anon',
                   'public.bulk_insert_olympiad_package_questions(uuid,jsonb)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.bulk_insert_olympiad_package_questions(uuid,jsonb)', 'EXECUTE') = true
            then 'PASS' else 'FAIL' end as status;

-- -----------------------------------------------------------------------------
-- Cities + Schools + Grade Promotion + structured Add-Child (migration 017).
-- -----------------------------------------------------------------------------

-- 24) Cities/schools/promotion foundation: students.graduated column exists, the
--     service-role-only advance_student_grades() function exists, the districts
--     table is seeded with cities (Bakı present), and schools.district_id is
--     MANDATORY (NOT NULL — a school must belong to a city).
select '24_cities_schools_grade_promotion' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='graduated')
             and exists (select 1 from pg_proc p
                          join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='advance_student_grades')
             and exists (select 1 from public.districts
                          where country_code='AZ' and name='Bakı' and status='active')
             and (select is_nullable from information_schema.columns
                   where table_schema='public' and table_name='schools'
                     and column_name='district_id') = 'NO'
            then 'PASS' else 'FAIL' end as status;

-- 25) Grade promotion is secure: advance_student_grades() is NOT EXECUTE-grantable
--     by clients (authenticated/anon) — it is service_role only (it mutates every
--     student's grade and must run only from the scheduled service-role job).
select '25_grade_promotion_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.advance_student_grades()', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.advance_student_grades()', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- =============================================================================
-- End of 013_validation_queries.sql
-- =============================================================================
