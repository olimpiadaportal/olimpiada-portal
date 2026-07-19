-- =============================================================================
-- 013_validation_queries.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 013 of 013.
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
    ('districts'),('city_districts'),('schools'),('grades'),('subjects'),('topics'),('subtopics'),
    ('question_types'),('difficulty_levels'),('olympiad_types'),('sources'),
    ('questions'),('question_translations'),('answer_options'),
    ('answer_option_translations'),('question_explanations'),('tests'),('test_questions'),
    ('question_imports'),
    ('test_attempts'),('test_attempt_answers'),('daily_rounds'),('progress_snapshots'),
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
         ('advance_student_grades'),
         ('get_child_subject_dashboard'),
         ('get_admin_platform_overview'),
         ('get_mobile_config'),
         ('get_mobile_content')
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
--     (authenticated/anon) — it is service_role only. (Signature = the 11-arg
--     Round-21 v2 with p_city_district_id.)
select '17_child_provisioning_secure' as check_name,
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='child_login_attempts')
             and has_function_privilege('authenticated',
                   'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE') = false
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

-- 26) News view counter: column exists + bump_news_view present and callable by
--     readers (anon + authenticated) so public "Most Viewed" can register views.
select '26_news_view_count' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='news'
                            and column_name='view_count')
             and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='bump_news_view')
             and has_function_privilege('anon', 'public.bump_news_view(uuid)', 'EXECUTE')
            then 'PASS' else 'FAIL' end as status;

-- 27) News likes (Round 6, migration 019): news_likes table with RLS ON + its 3
--     own-row policies, like_count column, counter trigger present, and the
--     Round-6 settings/flags seeds in place (maintenance mode + launch_promo/
--     news_public/olympiad_module flags). No anon INSERT privilege on likes.
select '27_news_likes_round6' as check_name,
       case when exists (select 1 from pg_tables where schemaname='public'
                          and tablename='news_likes' and rowsecurity)
             and (select count(*) from pg_policies
                   where schemaname='public' and tablename='news_likes') = 3
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='news'
                            and column_name='like_count')
             and exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                          where c.relname='news_likes' and t.tgname='trg_news_like_count')
             and has_table_privilege('anon', 'public.news_likes', 'INSERT') = false
             and exists (select 1 from public.system_settings
                          where key='platform.maintenance_mode')
             and (select count(*) from public.feature_flags
                   where key in ('launch_promo','news_public','olympiad_module')) = 3
            then 'PASS' else 'FAIL' end as status;

-- 28) Scheduled jobs (016): report-only. NOTE: plain SQL cannot reference
--     cron.job on databases where pg_cron is absent (missing relation fails at
--     PLAN time even inside an untaken CASE branch), so this check reports the
--     extension's presence; the actual job row is asserted manually on dev:
--       select jobname, schedule from cron.job
--        where jobname = 'olympiq_advance_student_grades';   -- renamed R12 (migration 032)
select '28_pg_cron_grade_promotion' as check_name,
       case when exists (select 1 from pg_extension where extname='pg_cron')
            then 'PASS (pg_cron present; job managed by 016)'
            else 'SKIP (pg_cron absent — 016 skipped safely)' end as status;

-- 29) Round 8 (migration 021): olympiad event date column + the 6 playful
--     gradient wallpaper presets for the student background selector.
select '29_round8_olympiad_event_wallpaper_presets' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='olympiad_packages'
                            and column_name='event_starts_at')
             and (select count(*) from public.wallpapers
                   where code in ('preset_race','preset_space','preset_ocean',
                                  'preset_jungle','preset_candy','preset_night_drive')) = 6
            then 'PASS' else 'FAIL' end as status;

-- 30) Round 9 (migration 022): EXACTLY ONE foreign key between wallpapers and
--     media_assets. A duplicate FK makes every PostgREST embed on that pair
--     ambiguous (PGRST201) and silently breaks the admin Wallpapers list and
--     the student background picker.
select '30_wallpapers_single_media_fk' as check_name,
       case when (select count(*) from pg_constraint c
                   where c.contype = 'f'
                     and c.conrelid = 'public.wallpapers'::regclass
                     and c.confrelid = 'public.media_assets'::regclass) = 1
            then 'PASS' else 'FAIL' end as status;

-- 31) Round 9 (migration 023): analytics RPCs exist (checked in #5) and are NOT
--     executable by anon.
select '31_analytics_rpcs_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.get_child_subject_dashboard(uuid,uuid,int,text)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.get_admin_platform_overview()', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 32) Round 10 (migration 024): verified Bakı schools seeded from the official
--     BŞTİ list (≥ 300 rows) + the per-district duplicate guard index.
select '32_baku_schools_seed' as check_name,
       case when (select count(*) from public.schools s
                    join public.districts d on d.id = s.district_id
                   where d.country_code = 'AZ'
                     and s.name like 'Bak% n%mr%li tam orta m%kt%b') >= 300
             and exists (select 1 from pg_indexes
                          where schemaname = 'public'
                            and indexname = 'uq_schools_district_name')
            then 'PASS' else 'FAIL' end as status;

-- 33) Round 11 (migration 025): payment-mode trio seeded + exclusivity trigger
--     present. The DB — not the UI — guarantees at most one of payments /
--     demo_payments / giveaway_period is enabled.
select '33_payment_mode_exclusivity' as check_name,
       case when (select count(*) from public.feature_flags
                   where key in ('payments','demo_payments','giveaway_period')) = 3
             and (select count(*) from public.feature_flags
                   where key in ('payments','demo_payments','giveaway_period')
                     and enabled) <= 1
             and exists (select 1 from pg_trigger
                          where tgname = 'trg_payment_mode_exclusivity'
                            and tgrelid = 'public.feature_flags'::regclass)
             and (select count(*) from public.system_settings
                   where key in ('giveaway.duration_days','giveaway.started_at')) = 2
            then 'PASS' else 'FAIL' end as status;

-- 34) Round 11 (migration 025): free-access grant RPCs exist and are NOT
--     executable by anon/authenticated (service_role only).
select '34_admin_grant_rpcs_secure' as check_name,
       case when has_function_privilege('anon',
                   'public.admin_grant_child_access(uuid,public.plan_interval,uuid[],int)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.admin_grant_child_access(uuid,public.plan_interval,uuid[],int)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.activate_child_login_id(uuid)', 'EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 35) Round 11 (migration 025): profiles.phone exists with the E.164 check
--     constraint (parent registration stores +<country><number> only).
select '35_profiles_phone_e164' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'profiles'
                            and column_name = 'phone')
             and exists (select 1 from pg_constraint
                          where conname = 'chk_profiles_phone_e164'
                            and conrelid = 'public.profiles'::regclass)
            then 'PASS' else 'FAIL' end as status;

-- 36) Round 11 (migration 026; threshold raised to 6 in migration 028):
--     Character Sticker schema — 3 tables with RLS, both guard triggers
--     enforcing the min-SIX rule (asserted in the function bodies), EXACTLY ONE
--     sticker_images→media_assets FK (duplicate-FK/PGRST201 guard, same class as
--     #30), and the sticker-assets bucket restricted to transparent-capable
--     types (png/webp only).
select '36_sticker_themes' as check_name,
       case when (select count(*) from pg_tables
                   where schemaname = 'public'
                     and tablename in ('sticker_themes','sticker_images','child_sticker_selections')) = 3
             and (select bool_and(rowsecurity) from pg_tables
                   where schemaname = 'public'
                     and tablename in ('sticker_themes','sticker_images','child_sticker_selections'))
             and exists (select 1 from pg_trigger
                          where tgname = 'trg_sticker_theme_enable_guard'
                            and tgrelid = 'public.sticker_themes'::regclass)
             and exists (select 1 from pg_trigger
                          where tgname = 'trg_sticker_image_delete_guard'
                            and tgrelid = 'public.sticker_images'::regclass)
             and pg_get_functiondef('public.fn_sticker_theme_enable_guard()'::regprocedure)
                 like '%< 6%'
             and pg_get_functiondef('public.fn_sticker_image_delete_guard()'::regprocedure)
                 like '%< 6%'
             and (select count(*) from pg_constraint
                   where contype = 'f'
                     and conrelid = 'public.sticker_images'::regclass
                     and confrelid = 'public.media_assets'::regclass) = 1
             and exists (select 1 from storage.buckets
                          where id = 'sticker-assets'
                            and allowed_mime_types = array['image/png','image/webp'])
            then 'PASS' else 'FAIL' end as status;

-- 37) Round 11 (migration 027) + owner ruling (migration 038): the giveaway
--     window opens SUBJECTS only — is_giveaway_active() exists (anon cannot
--     execute), the PRACTICE guard references it, and the OLYMPIAD guard does
--     NOT (olympiad packages are purchase-only in every mode).
select '37_giveaway_attempt_access' as check_name,
       case when has_function_privilege('anon', 'public.is_giveaway_active()', 'EXECUTE') = false
             and pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure)
                 like '%is_giveaway_active%'
             and pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)
                 not like '%is_giveaway_active%'
            then 'PASS' else 'FAIL' end as status;

-- 38) Round 12 (migration 029): schools carry is_private + numeric school_number,
--     the display-ordering index exists, private schools are seeded, and the
--     numeric sort key is backfilled (so "2" sorts before "10", not lexically).
select '38_schools_private_and_number' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='schools'
                            and column_name='is_private')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='schools'
                            and column_name='school_number')
             and exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='ix_schools_display_order')
             and (select count(*) from public.schools where is_private) >= 1
             and (select count(*) from public.schools where school_number is not null) >= 300
            then 'PASS' else 'FAIL' end as status;

-- 39) Round 12 (migration 030): students.palette exists with the 5-value CHECK
--     whitelist (server-side guard for the child light-mode palette picker).
select '39_student_palette' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='palette')
             and exists (select 1 from pg_constraint
                          where conname='students_palette_chk'
                            and conrelid='public.students'::regclass)
            then 'PASS' else 'FAIL' end as status;

-- 40) Round 12 (migration 031): admin-managed Site Content & Design — site_content
--     table with RLS ON + admin-only policy, and the 7 design.* token settings.
select '40_site_content_and_design' as check_name,
       case when to_regclass('public.site_content') is not null
             and (select relrowsecurity from pg_class where oid='public.site_content'::regclass)
             and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='site_content'
                            and policyname='site_content_admin')
             -- Round 12 (migration 033): hierarchical section/menu columns added.
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='site_content' and column_name='section')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='site_content' and column_name='menu')
            then 'PASS' else 'FAIL' end as status;

-- 41) Round 12 (migration 033): the design/font/colour editor was REMOVED — the
--     Website Content Management module is TEXT-ONLY, so no design.* settings exist.
select '41_design_tokens_removed' as check_name,
       case when (select count(*) from public.system_settings where key like 'design.%') = 0
            then 'PASS' else 'FAIL' end as status;

-- 42) Round 12 (migration 033): per-parent/child free-access intervals — table with
--     RLS ON + admin-only policy; the SECURITY DEFINER helpers are NOT anon-executable;
--     the PRACTICE guard honors is_free_access_active_for_student() while the
--     OLYMPIAD guard does NOT (migration 038: packages are purchase-only).
select '42_free_access_intervals' as check_name,
       case when to_regclass('public.free_access_intervals') is not null
             and (select relrowsecurity from pg_class where oid='public.free_access_intervals'::regclass)
             and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='free_access_intervals'
                            and policyname='fai_admin')
             and has_function_privilege('anon','public.is_free_access_active_for_student(uuid)','EXECUTE') = false
             -- Round 12 pass-2 (migration 034): base helper is not even authenticated-executable;
             -- the caller-scoped is_child_free_access_active is the authenticated entrypoint.
             and has_function_privilege('authenticated','public.is_free_access_active_for_student(uuid)','EXECUTE') = false
             and has_function_privilege('anon','public.is_child_free_access_active(uuid)','EXECUTE') = false
             and has_function_privilege('anon','public.current_parent_free_access()','EXECUTE') = false
             and pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure)
                 like '%is_free_access_active_for_student%'
             and pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)
                 not like '%is_free_access_active_for_student%'
            then 'PASS' else 'FAIL' end as status;

-- 43) Audit Batch 1 (migration 035, H1+M26): the 8-digit ID allocator is
--     service-role only — the ONE DEFINER RPC that previously had no revoke.
select '43_child_id_allocator_locked' as check_name,
       case when has_function_privilege('anon','public.allocate_child_unique_id(uuid)','EXECUTE') = false
             and has_function_privilege('authenticated','public.allocate_child_unique_id(uuid)','EXECUTE') = false
             and has_function_privilege('service_role','public.allocate_child_unique_id(uuid)','EXECUTE') = true
            then 'PASS' else 'FAIL' end as status;

-- 44) Audit Batch 1 (migration 035, H2+H4): the olympiad bulk-pool RPC is
--     Administrator-only (no content.create fallback a content manager holds),
--     and no attempt RPC references the phantom catalog_status column.
select '44_olympiad_rpc_hardening' as check_name,
       case when position('content.create' in
                 pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb)'::regprocedure)) = 0
             and position('catalog_status = ' in
                 pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) = 0
            then 'PASS' else 'FAIL' end as status;

-- 45) Audit Batch 1 (migration 035, H3): learners cannot SELECT answer_options
--     (is_correct is the answer key) — the read policy no longer opens published
--     rows; options reach students only via the DEFINER attempt RPCs.
select '45_answer_key_not_readable' as check_name,
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='answer_options'
                            and policyname='aopt_select'
                            and qual not like '%published%')
            then 'PASS' else 'FAIL' end as status;

-- 46) Audit Batch 1 (migration 035, C2+H6): one live subscription per child is
--     DB-enforced, and start_practice_attempt gates on subscription_subjects
--     (per-subject access) + current_period_end (lazy expiry).
select '46_subscription_invariants' as check_name,
       case when exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='uq_child_subscriptions_live')
             and pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure)
                 like '%subscription_subjects%'
             and pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure)
                 like '%current_period_end%'
            then 'PASS' else 'FAIL' end as status;

-- 47) Audit Batch 1 (migration 035, M23+L12): questions list indexes exist, and
--     leaderboard entries/snapshots are no longer world-readable.
select '47_indexes_and_leaderboard_rls' as check_name,
       case when exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_questions_pool_created')
             and exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_questions_type')
             and exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_questions_subtopic')
             and not exists (select 1 from pg_policies
                              where schemaname='public' and tablename='leaderboard_entries'
                                and policyname='leaderboard_entries_select' and qual = 'true')
             and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='leaderboard_snapshots'
                            and policyname='leaderboard_snapshots_select' and qual like '%is_admin%')
            then 'PASS' else 'FAIL' end as status;

-- 48) Audit Batch 2 (migration 036, C1+M13): the access-lifecycle recompute
--     function exists (service-role only), and financial records survive account
--     deletion (payments/olympiad_purchases FKs are ON DELETE SET NULL).
select '48_access_lifecycle_and_retention' as check_name,
       case when to_regprocedure('public.recompute_child_access()') is not null
             and has_function_privilege('authenticated','public.recompute_child_access()','EXECUTE') = false
             and exists (select 1 from pg_constraint
                          where conname = 'payments_profile_id_fkey' and confdeltype = 'n')
             and exists (select 1 from pg_constraint
                          where conname = 'olympiad_purchases_student_profile_id_fkey' and confdeltype = 'n')
             and exists (select 1 from pg_constraint
                          where conname = 'olympiad_purchases_owner_parent_profile_id_fkey' and confdeltype = 'n')
            then 'PASS' else 'FAIL' end as status;

-- 49) Test engine T0 + MCQ-only launch (migration 037; single_choice = the
--     5-option MCQ since migration 055): the six learner RPCs + expiry sweep
--     exist with the right grant posture; the single-open index and attempt
--     columns exist; the MCQ (single_choice) is the ONLY active question type
--     (exactly 5 options / 1 correct) and both bulk RPCs enforce the per-type
--     structure rules.
select '49_test_engine_and_mcq_rules' as check_name,
       case when to_regprocedure('public.start_topic_test_attempt(uuid,uuid[],uuid[])') is not null
             and to_regprocedure('public.get_test_attempt(uuid,text)') is not null
             and to_regprocedure('public.save_test_answers(uuid,jsonb)') is not null
             and to_regprocedure('public.submit_test_attempt(uuid,jsonb)') is not null
             and to_regprocedure('public.cancel_test_attempt(uuid)') is not null
             and to_regprocedure('public.get_test_review(uuid,text)') is not null
             and has_function_privilege('anon','public.start_topic_test_attempt(uuid,uuid[],uuid[])','EXECUTE') = false
             and has_function_privilege('authenticated','public.expire_stale_test_attempts()','EXECUTE') = false
             and has_function_privilege('authenticated','public.test_attempt_result(uuid)','EXECUTE') = false
             and exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='uq_test_attempts_open_test')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='test_attempts' and column_name='deadline_at')
             and exists (select 1 from public.question_types
                          where code='single_choice' and status='active'
                            and options_required=5 and correct_required=1)
             and not exists (select 1 from public.question_types
                              where code <> 'single_choice' and status='active')
             and position('assert_question_type_rules' in
                   pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) > 0
             and position('assert_question_type_rules' in
                   pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 50) Leaderboard engine (migration 039) — ledger + activity tables with RLS ON,
--     the once-per-attempt uniqueness, the single-writer trigger on the graded
--     transition, and the students column-protection trigger (row RLS alone
--     cannot protect the cached points/streak columns).
select '50_leaderboard_engine' as check_name,
       case when to_regclass('public.student_points_ledger') is not null
             and to_regclass('public.student_activity_days') is not null
             and (select relrowsecurity from pg_class where oid='public.student_points_ledger'::regclass)
             and (select relrowsecurity from pg_class where oid='public.student_activity_days'::regclass)
             and exists (select 1 from pg_constraint
                          where conname='uq_points_per_attempt'
                            and conrelid='public.student_points_ledger'::regclass)
             and exists (select 1 from pg_trigger
                          where tgname='trg_award_points_on_graded'
                            and tgrelid='public.test_attempts'::regclass)
             and exists (select 1 from pg_trigger
                          where tgname='trg_protect_student_progress'
                            and tgrelid='public.students'::regclass)
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='points_all_time')
            then 'PASS' else 'FAIL' end as status;

-- 51) Leaderboard privileges + config — board reads are authenticated-only (not
--     anon); the writer and admin reset are service-role only; the 3 formula
--     settings are seeded (difficulty weights come from difficulty_levels.weight).
select '51_leaderboard_privileges' as check_name,
       case when has_function_privilege('anon', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE') = true
             and has_function_privilege('anon', 'public.get_my_leaderboard_rank(text,text,uuid,text)', 'EXECUTE') = false
             and has_function_privilege('anon', 'public.get_streak_status()', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.award_attempt_points(uuid)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.admin_reset_leaderboard(text)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.lb_rows(text,text,uuid,text)', 'EXECUTE') = false
             and (select count(*) from public.system_settings where key like 'leaderboard.points.%') >= 3
            then 'PASS' else 'FAIL' end as status;

-- 52) Content lifecycle = 3 statuses (migration 040): questions & news default
--     to 'in_review'; MCQ (multiple_choice) requires exactly 4 options / 1 correct.
select '52_status_and_mcq' as check_name,
       case when (select column_default from information_schema.columns
                   where table_schema='public' and table_name='questions' and column_name='status')
                 like '%in_review%'
             and (select column_default from information_schema.columns
                   where table_schema='public' and table_name='news' and column_name='status')
                 like '%in_review%'
             and (select options_required from public.question_types where code='multiple_choice') = 4
             and (select correct_required from public.question_types where code='multiple_choice') = 1
             and pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure) like '%''in_review''%'
            then 'PASS' else 'FAIL' end as status;

-- 53) Leaderboard seasons (migration 041): table with admin-only RLS; season CRUD
--     RPCs are service-role only; the parent child-summary RPC is authenticated
--     (not anon); the 'leaderboard' feature flag is enabled.
select '53_leaderboard_seasons' as check_name,
       case when to_regclass('public.leaderboard_seasons') is not null
             and (select relrowsecurity from pg_class where oid='public.leaderboard_seasons'::regclass)
             and exists (select 1 from pg_policies where schemaname='public'
                          and tablename='leaderboard_seasons' and policyname='lseasons_admin')
             and has_function_privilege('authenticated','public.create_leaderboard_season(text,timestamptz,timestamptz)','EXECUTE') = false
             and has_function_privilege('authenticated','public.close_leaderboard_season(uuid)','EXECUTE') = false
             and has_function_privilege('authenticated','public.get_season_standings(uuid,int)','EXECUTE') = false
             and has_function_privilege('anon','public.get_child_leaderboard_summary(uuid)','EXECUTE') = false
             and has_function_privilege('authenticated','public.get_child_leaderboard_summary(uuid)','EXECUTE') = true
             and (select enabled from public.feature_flags where key='leaderboard') = true
            then 'PASS' else 'FAIL' end as status;

-- 54) Notifications engine (migration 042): new tables + non-forgeable posture —
--     no client INSERT/UPDATE policy on notifications; the producer + processor
--     RPCs are service-role only; end-user mark-read is authenticated.
select '54_notifications_engine' as check_name,
       case when to_regclass('public.admin_notifications') is not null
             and to_regclass('public.notification_preferences') is not null
             and to_regclass('public.push_tokens') is not null
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='notifications' and column_name='idempotency_key')
             and not exists (select 1 from pg_policies where schemaname='public'
                              and tablename='notifications' and policyname in ('notif_insert','notif_update'))
             and has_function_privilege('authenticated','public.create_notification(uuid,text,text,text,jsonb,text[],text,int,text,text,timestamptz)','EXECUTE') = false
             and has_function_privilege('authenticated','public.claim_pending_deliveries(int,text)','EXECUTE') = false
             and has_function_privilege('anon','public.mark_notification_read(uuid)','EXECUTE') = false
             and has_function_privilege('authenticated','public.mark_notification_read(uuid)','EXECUTE') = true
            then 'PASS' else 'FAIL' end as status;

-- 55) Notifications config: 'notifications.send' permission exists (admin has it,
--     content_manager does NOT); flags 'notifications'(on)/'notifications_push'(off);
--     retention settings + trilingual templates seeded; 'push' channel enum value.
select '55_notifications_config' as check_name,
       case when exists (select 1 from public.permissions where code='notifications.send')
             and exists (select 1 from public.role_permissions rp
                          join public.roles r on r.id=rp.role_id
                          join public.permissions p on p.id=rp.permission_id
                          where r.code='administrator' and p.code='notifications.send')
             and not exists (select 1 from public.role_permissions rp
                          join public.roles r on r.id=rp.role_id
                          join public.permissions p on p.id=rp.permission_id
                          where r.code='content_manager' and p.code='notifications.send')
             and (select enabled from public.feature_flags where key='notifications') = true
             and exists (select 1 from public.feature_flags where key='notifications_push')
             and exists (select 1 from public.system_settings where key='notifications.retention_days')
             and (select count(*) from public.notification_templates where code='attempt_graded') >= 3
             and 'push' = any (enum_range(null::public.notification_channel)::text[])
            then 'PASS' else 'FAIL' end as status;

-- 56) Mobile control plane (Stage M1, migration 045): mobile_app_versions exists
--     with RLS + the admin-only policy + both platforms seeded; the two whitelist
--     readers exist and are ANON-executable (the mobile app has no service role);
--     the table itself has no anon path (RLS admin policy only).
select '56_mobile_control_plane' as check_name,
       case when to_regclass('public.mobile_app_versions') is not null
             and (select relrowsecurity from pg_class where oid='public.mobile_app_versions'::regclass)
             and exists (select 1 from pg_policies where schemaname='public'
                          and tablename='mobile_app_versions' and policyname='mobile_app_versions_admin')
             and (select count(*) from pg_policies where schemaname='public'
                          and tablename='mobile_app_versions') = 1
             and (select count(*) from public.mobile_app_versions where platform in ('ios','android')) = 2
             and has_function_privilege('anon','public.get_mobile_config()','EXECUTE') = true
             and has_function_privilege('anon','public.get_mobile_content(text)','EXECUTE') = true
            then 'PASS' else 'FAIL' end as status;

-- 57) get_mobile_config() whitelist shape: EXACTLY the seven documented top-level
--     keys, a complete per-platform version block, and a valid resolved payment
--     mode — the function must never grow into a `select *` settings dump.
select '57_mobile_config_shape' as check_name,
       case when (select array_agg(k order by k)
                    from jsonb_object_keys(public.get_mobile_config()) k)
               = array['contact','flags','locales','maintenance','payment','social','version']
             and public.get_mobile_config()->'version'->'ios' is not null
             and public.get_mobile_config()->'version'->'android' is not null
             and (public.get_mobile_config()->'payment'->>'mode') in ('real','demo','giveaway','off')
            then 'PASS' else 'FAIL' end as status;

-- 58) Round 18 engine guarantees (migrations 046/047/048): question-scope
--     separation filters stay in BOTH general draw RPCs and the olympiad draw
--     stays package-scoped; olympiad attempts are TIMED (jsonb return + package
--     duration column); analytics separates answered/skipped; leaderboard rows
--     are named with context (no anonymization tag).
select '58_round18_engine_guarantees' as check_name,
       case when position('olympiad_package_id is null'
                          in pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure)) > 0
             and position('olympiad_package_id is null'
                          in pg_get_functiondef('public.start_topic_test_attempt(uuid,uuid[],uuid[])'::regprocedure)) > 0
             and position('olympiad_package_id = p_package_id'
                          in pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
             and pg_get_function_result('public.start_olympiad_attempt(uuid)'::regprocedure) = 'jsonb'
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='olympiad_packages'
                            and column_name='duration_minutes')
             and position('skipped' in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text)'::regprocedure)) > 0
             and pg_get_function_result('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure) not like '%anon_tag%'
             and pg_get_function_result('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure) like '%grade_level%'
            then 'PASS' else 'FAIL' end as status;

-- 59) Taxonomy module scope (migration 050): topics.scope exists; the general
--     bulk import resolves/creates ONLY exam-scoped topics and the olympiad
--     package import ONLY olympiad-scoped ones; no olympiad-scoped topic may
--     ever be referenced by a general-bank question.
select '59_taxonomy_module_scope' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='topics'
                            and column_name='scope')
             and position('scope = ''exam'''
                          in pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) > 0
             and position('scope = ''olympiad'''
                          in pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb)'::regprocedure)) > 0
             and not exists (select 1
                               from public.topics t
                               join public.questions q on q.topic_id = t.id
                              where t.scope = 'olympiad'
                                and q.olympiad_package_id is null)
            then 'PASS' else 'FAIL' end as status;

-- 60) Analytics module scope (migration 051): exactly ONE dashboard signature
--     (PostgREST rejects ambiguous overloads); it filters attempts by kind per
--     scope, defaults unknown scopes to 'tests', and carries the olympiad
--     per_package breakdown.
select '60_analytics_module_scope' as check_name,
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname = 'get_child_subject_dashboard') = 1
             and position('ta.kind = ''olympiad'''
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text)'::regprocedure)) > 0
             and position('ta.kind <> ''olympiad'''
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text)'::regprocedure)) > 0
             and position('per_package'
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 61) Daily rounds engine (migrations 052/056/057): the daily_rounds table +
--     start_daily_round_attempt exist; ONE rated attempt per student per round
--     is DB-enforced (partial unique index); points fire only for RATED
--     attempts; topic tests are UNTIMED practice (no c_duration constant) and
--     olympiad attempts draw the WHOLE package pool (no 'limit greatest' cap).
select '61_daily_rounds_engine' as check_name,
       case when to_regclass('public.daily_rounds') is not null
             and to_regprocedure('public.start_daily_round_attempt(uuid,text)') is not null
             and exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='uq_rated_attempt_per_round')
             and position('is_rated' in
                   pg_get_functiondef('public.award_attempt_points(uuid)'::regprocedure)) > 0
             and position('c_duration' in
                   pg_get_functiondef('public.start_topic_test_attempt(uuid,uuid[],uuid[])'::regprocedure)) = 0
             and position('limit greatest' in
                   pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) = 0
            then 'PASS' else 'FAIL' end as status;

-- 62) City districts + leaderboard cluster (migrations 053/058): city_districts
--     table + schools.city_district_id exist; board rows carry the DISTRICT
--     column (derived through the school); the landing-page top-10 is
--     anon-callable; the city/district consistency guard trigger is attached.
select '62_city_districts_and_leaderboard' as check_name,
       case when to_regclass('public.city_districts') is not null
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='schools'
                            and column_name='city_district_id')
             and pg_get_function_result('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)
                 like '%district%'
             and has_function_privilege('anon','public.get_public_leaderboard(int)','EXECUTE') = true
             and exists (select 1 from pg_trigger
                          where tgname='trg_school_district_guard'
                            and tgrelid='public.schools'::regclass)
            then 'PASS' else 'FAIL' end as status;

-- 63) Academic terms + five options (migrations 054/055/059): term columns on
--     topics + questions; single_choice requires exactly 5 options; the term
--     guard/cascade + taxonomy guard triggers are attached; the bulk import
--     REQUIRES a term (1..4) on every item.
select '63_terms_and_five_options' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='topics'
                            and column_name='term')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='questions'
                            and column_name='term')
             and (select options_required from public.question_types where code='single_choice') = 5
             and exists (select 1 from pg_trigger
                          where tgname='trg_question_term_guard'
                            and tgrelid='public.questions'::regclass)
             and exists (select 1 from pg_trigger
                          where tgname='trg_topic_term_cascade'
                            and tgrelid='public.topics'::regclass)
             and exists (select 1 from pg_trigger
                          where tgname='trg_question_taxonomy_guard'
                            and tgrelid='public.questions'::regclass)
             and position('term (1..4) is required' in
                   pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 64) Notification audiences (migration 060): the resolver serves the two new
--     Round-20 audiences ('all_users' deduped union; 'olympiad_buyers' from
--     active purchases) and the composer whitelists + validates olympiad_buyers
--     package ids before anything is stored.
select '64_notification_audiences' as check_name,
       case when position('all_users' in
                   pg_get_functiondef('public.lb_notify_audience(text,jsonb)'::regprocedure)) > 0
             and position('olympiad_buyers' in
                   pg_get_functiondef('public.lb_notify_audience(text,jsonb)'::regprocedure)) > 0
             and position('olympiad_buyers' in
                   pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 65) Question delete guard (migration 063): answered questions can never be
--     hard-deleted (attempt history would cascade away); the guard trigger is
--     attached and its lookup index exists.
select '65_question_delete_guard' as check_name,
       case when exists (select 1 from pg_trigger
                          where tgname='trg_question_delete_guard'
                            and tgrelid='public.questions'::regclass)
             and to_regclass('public.idx_answers_question') is not null
            then 'PASS' else 'FAIL' end as status;

-- 66) Student city-district (migration 064): the rayon is stored on students
--     with the consistency guard attached; create_child_account is the 11-arg
--     v2 (rayon validated + required when the city has rayons) and stays
--     service-role-only; leaderboard rows fall back to the stored rayon.
select '66_student_city_district' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='city_district_id')
             and exists (select 1 from pg_trigger
                          where tgname='trg_student_district_guard'
                            and tgrelid='public.students'::regclass)
             and to_regprocedure('public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)') is not null
             and to_regprocedure('public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid)') is null
             and has_function_privilege('authenticated',
                   'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)','EXECUTE') = false
             and position('st.city_district_id' in
                   pg_get_functiondef('public.lb_rows(text,text,uuid,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 67) Round readiness + pool counts (migration 065): the daily pool accepts
--     shared (grade NULL) questions with the readiness fn in lockstep; the
--     student pre-flight and the real olympiad pool-count RPCs exist and are
--     callable by authenticated (counts/booleans only).
select '67_round_readiness_pool_counts' as check_name,
       case when position('grade_id is null' in
                   pg_get_functiondef('public.get_or_create_daily_round(uuid,uuid,date)'::regprocedure)) > 0
             and position('grade_id is null' in
                   pg_get_functiondef('public.daily_round_readiness()'::regprocedure)) > 0
             and to_regprocedure('public.get_my_round_readiness()') is not null
             and has_function_privilege('authenticated','public.get_my_round_readiness()','EXECUTE')
             and to_regprocedure('public.get_olympiad_pool_counts(uuid[])') is not null
             and has_function_privilege('authenticated','public.get_olympiad_pool_counts(uuid[])','EXECUTE')
             and has_function_privilege('anon','public.get_olympiad_pool_counts(uuid[])','EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 68) Notification template kind (migration 067): broadcast fan-outs derive
--     type/category from the template code (news broadcasts file under "news"),
--     both the immediate and the scheduled path use the mapping, the mapping
--     itself resolves news_published → news, and the helper stays out of
--     client reach.
select '68_notification_template_kind' as check_name,
       case when to_regprocedure('public.notify_template_kind(text)') is not null
             and position('notify_template_kind' in
                   pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) > 0
             and position('notify_template_kind' in
                   pg_get_functiondef('public.dispatch_scheduled_notifications()'::regprocedure)) > 0
             and (select k.n_type = 'news_published' and k.n_category = 'news'
                    from public.notify_template_kind('news_published') k)
             and has_function_privilege('authenticated','public.notify_template_kind(text)','EXECUTE') = false
             and has_function_privilege('anon','public.notify_template_kind(text)','EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 69) Attempt-graded notification trigger (migration 068): grading notifies
--     from the DB so EVERY grading path (web action, mobile direct RPC, legacy
--     practice) notifies exactly once. The trigger is attached to
--     test_attempts on the -> 'graded' transition, references the DEFINER
--     trigger fn, and the fn keeps web parity: the IDENTICAL idempotency key
--     format ('attempt:' || new.id::text), the attempt_graded type, the
--     result-page action_url and the progress category, all through
--     create_notification.
select '69_attempt_graded_trigger' as check_name,
       case when exists (select 1 from pg_trigger
                          where tgname='trg_notify_attempt_graded'
                            and tgrelid='public.test_attempts'::regclass
                            and tgfoid='public.notify_attempt_graded_tg()'::regprocedure)
             and to_regprocedure('public.notify_attempt_graded_tg()') is not null
             and position('''attempt:'' || new.id::text' in
                   pg_get_functiondef('public.notify_attempt_graded_tg()'::regprocedure)) > 0
             and position('attempt_graded' in
                   pg_get_functiondef('public.notify_attempt_graded_tg()'::regprocedure)) > 0
             and position('/child/test/result/' in
                   pg_get_functiondef('public.notify_attempt_graded_tg()'::regprocedure)) > 0
             and position('create_notification' in
                   pg_get_functiondef('public.notify_attempt_graded_tg()'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 70) Admin subject pricing RPC (migration 069): the ONLY admin write path
--     into subjects_pricing exists, anon can never execute it, and the body
--     carries the Administrator-only guard (is_admin — content managers never
--     pass) plus the audit_logs write.
select '70_admin_subject_pricing' as check_name,
       case when to_regprocedure('public.admin_upsert_subject_price(uuid,text,numeric)') is not null
             and has_function_privilege('anon','public.admin_upsert_subject_price(uuid,text,numeric)','EXECUTE') = false
             and has_function_privilege('authenticated','public.admin_upsert_subject_price(uuid,text,numeric)','EXECUTE') = true
             and position('is_admin' in
                   pg_get_functiondef('public.admin_upsert_subject_price(uuid,text,numeric)'::regprocedure)) > 0
             and position('audit_logs' in
                   pg_get_functiondef('public.admin_upsert_subject_price(uuid,text,numeric)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 71) Olympiad sales window (migration 070; extended by 072): the window
--     columns + sanity CHECK exist; the canonical predicate, the shared
--     visibility helper and the anon-callable public listing RPC are all
--     present (anon EXECUTE on the listing; the helper feeds BOTH select
--     policies so packages and translations can never drift);
--     purchase_olympiad carries the package_not_on_sale guard;
--     start_olympiad_attempt stays window-free (purchasers keep LIFETIME
--     attempts after the window). Plus the contact.support_whatsapp config
--     surfaced by get_mobile_config. Migration 072: the listing RPC is the
--     SINGLE (p_limit int default null) function — the zero-arg overload is
--     gone, so no-args callers resolve via the default — with the
--     least(p_limit, 100) cap; and contact.support_address is seeded +
--     surfaced by get_mobile_config alongside email/phone/whatsapp.
select '71_olympiad_sales_window' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='olympiad_packages'
                            and column_name='sale_starts_at')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='olympiad_packages'
                            and column_name='sale_ends_at')
             and exists (select 1 from pg_constraint
                          where conname='chk_olympiad_sales_window'
                            and conrelid='public.olympiad_packages'::regclass)
             and to_regprocedure('public.olympiad_package_on_sale(public.catalog_status,timestamptz,timestamptz)') is not null
             and to_regprocedure('public.get_public_olympiad_packages(integer)') is not null
             and to_regprocedure('public.get_public_olympiad_packages()') is null
             and (select count(*) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public'
                    and p.proname='get_public_olympiad_packages') = 1
             and has_function_privilege('anon','public.get_public_olympiad_packages(integer)','EXECUTE') = true
             and position('olympiad_package_on_sale' in
                   pg_get_functiondef('public.get_public_olympiad_packages(integer)'::regprocedure)) > 0
             and position('least(p_limit, 100)' in
                   pg_get_functiondef('public.get_public_olympiad_packages(integer)'::regprocedure)) > 0
             and position('package_not_on_sale' in
                   pg_get_functiondef('public.purchase_olympiad(uuid,uuid)'::regprocedure)) > 0
             and position('olympiad_package_on_sale' in
                   pg_get_functiondef('public.can_view_olympiad_package(uuid)'::regprocedure)) > 0
             and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='olympiad_packages'
                            and policyname='olympiad_packages_select'
                            and qual like '%can_view_olympiad_package%')
             and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='olympiad_package_translations'
                            and policyname='olympiad_pkg_tr_select'
                            and qual like '%can_view_olympiad_package%')
             and position('olympiad_package_on_sale' in
                   pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) = 0
             and exists (select 1 from public.system_settings where key='contact.support_whatsapp')
             and position('contact.support_whatsapp' in
                   pg_get_functiondef('public.get_mobile_config()'::regprocedure)) > 0
             -- 072: address seeded as a JSON string (non-empty by default;
             -- admins may later blank it, so only shape is asserted here).
             and exists (select 1 from public.system_settings
                          where key='contact.support_address'
                            and jsonb_typeof(value_json) = 'string')
             and position('contact.support_address' in
                   pg_get_functiondef('public.get_mobile_config()'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 72) Child avatars (migration 071): the students avatar columns + kind CHECK
--     exist; the child-avatars bucket is PRIVATE; all four family-gated
--     storage policies are present and none is reachable by anon (the DEFINER
--     path/ownership helper is also out of anon reach).
select '72_child_avatars' as check_name,
       case when (select count(*) from information_schema.columns
                   where table_schema='public' and table_name='students'
                     and column_name in ('avatar_kind','avatar_key','avatar_media_path')) = 3
             and exists (select 1 from pg_constraint
                          where conname='chk_students_avatar_kind'
                            and conrelid='public.students'::regclass)
             and exists (select 1 from storage.buckets
                          where id='child-avatars' and public = false)
             and (select count(*) from pg_policies
                   where schemaname='storage' and tablename='objects'
                     and policyname in ('read child-avatars','insert child-avatars',
                                        'update child-avatars','delete child-avatars')) = 4
             and not exists (select 1 from pg_policies
                              where schemaname='storage' and tablename='objects'
                                and policyname like '%child-avatars%'
                                and roles::text[] && array['anon','public'])
             and to_regprocedure('public.can_access_child_avatar(text,boolean)') is not null
             and has_function_privilege('anon','public.can_access_child_avatar(text,boolean)','EXECUTE') = false
             and has_function_privilege('authenticated','public.can_access_child_avatar(text,boolean)','EXECUTE') = true
            then 'PASS' else 'FAIL' end as status;

-- 73) Audit trigger coverage (migration 073): the money trail (subscriptions,
--     payments, child_subscriptions), payment sessions, accounts (students,
--     profiles, child_credentials) and config (system_settings, feature_flags,
--     subjects_pricing) all carry an audit trigger firing on INSERT or UPDATE;
--     the three money-trail triggers specifically now fire on INSERT (they were
--     UPDATE-only before), so new subscription/payment rows are captured.
select '73_audit_trigger_coverage' as check_name,
       case when (select count(*) from pg_trigger
                   where tgname in ('trg_audit_subscriptions','trg_audit_payments',
                     'trg_audit_child_subscriptions','trg_audit_checkout_sessions',
                     'trg_audit_students','trg_audit_profiles','trg_audit_child_credentials',
                     'trg_audit_system_settings','trg_audit_feature_flags','trg_audit_subjects_pricing')
                     and (tgtype & 4 > 0 or tgtype & 16 > 0)) = 10
             -- money-trail INSERT is now captured (was UPDATE-only)
             and (select bool_and(tgtype & 4 > 0) from pg_trigger
                   where tgname in ('trg_audit_subscriptions','trg_audit_payments',
                                    'trg_audit_child_subscriptions'))
            then 'PASS' else 'FAIL' end as status;

-- 74) Notification producers (migration 074; revised by 076): the progress-
--     milestones trigger + the two cron scanner functions exist and stay
--     service-role only. The R74 admin operational-alert triggers + notify_admins
--     were REMOVED in 076 — assert they are GONE (admins get self-scoped sends).
select '74_notification_producers' as check_name,
       case when to_regprocedure('public.notify_expiring_subscriptions()') is not null
             and to_regprocedure('public.notify_giveaway_ending()') is not null
             and to_regprocedure('public.notify_admins(text,text,text,jsonb,text,text,text,int)') is null
             and has_function_privilege('authenticated','public.notify_expiring_subscriptions()','EXECUTE') = false
             and exists (select 1 from pg_trigger where tgname='trg_notify_progress_milestones'
                          and tgrelid='public.test_attempts'::regclass)
             and not exists (select 1 from pg_trigger where tgname in
                   ('trg_notify_admin_new_parent','trg_notify_admin_new_purchase','trg_notify_admin_new_subscription'))
            then 'PASS' else 'FAIL' end as status;

-- 75) Contact map (migration 075): the precise-map setting is seeded and
--     get_mobile_config surfaces it under contact.map_query.
select '75_contact_map' as check_name,
       case when exists (select 1 from public.system_settings where key='contact.support_map_query')
             and (public.get_mobile_config()->'contact') ? 'map_query'
            then 'PASS' else 'FAIL' end as status;

-- 76) Admin notification scope (migration 076): notif_select is self-only (no
--     is_admin leak), the staff audiences are wired into both the resolver and
--     the composer whitelist, and the package-published trigger is attached.
select '76_admin_notification_scope' as check_name,
       case when (select position('is_admin' in pg_get_expr(polqual, polrelid)) = 0
                    from pg_policy where polname='notif_select')
             and position('administrators' in pg_get_functiondef('public.lb_notify_audience(text,jsonb)'::regprocedure)) > 0
             and position('content_managers' in pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) > 0
             and exists (select 1 from pg_trigger where tgname='trg_notify_package_published'
                          and tgrelid='public.olympiad_packages'::regclass)
            then 'PASS' else 'FAIL' end as status;

-- =============================================================================
-- End of 013_validation_queries.sql
-- =============================================================================
