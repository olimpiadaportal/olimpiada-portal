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
    ('topic_translations'),('subtopic_translations'),
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
                   'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') = true
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
                   'public.get_child_subject_dashboard(uuid,uuid,int,text,text)', 'EXECUTE') = false
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

-- 39) Migration 110 (widened from 030): students.palette exists and its CHECK
--     whitelist really carries the 26-slug catalogue. Both a NEW slug and an
--     OLD one are probed, so a half-applied migration fails here instead of
--     silently rejecting a palette the UI offers.
select '39_student_palette' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='palette')
             and (select position('graphite' in pg_get_constraintdef(oid)) > 0
                     and position('sky' in pg_get_constraintdef(oid)) > 0
                    from pg_constraint
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
                 pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) = 0
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
             and to_regprocedure('public.submit_test_attempt(uuid,jsonb,text)') is not null
             and to_regprocedure('public.cancel_test_attempt(uuid)') is not null
             and to_regprocedure('public.get_test_review(uuid,text)') is not null
             and has_function_privilege('anon','public.start_topic_test_attempt(uuid,uuid[],uuid[])','EXECUTE') = false
             and has_function_privilege('authenticated','public.expire_stale_test_attempts()','EXECUTE') = false
             and has_function_privilege('authenticated','public.test_attempt_result(uuid,text)','EXECUTE') = false
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
                   pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) > 0
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
--     anon); the writer and admin reset are service-role only; the formula
--     settings are seeded (difficulty weights come from difficulty_levels.weight).
--     Round 48 (migration 088): the floor dropped 3 -> 2 because
--     leaderboard.points.olympiad_multiplier was DELETED — purchased olympiads
--     are practice-only, so the multiplier could only ever be dead config.
select '51_leaderboard_privileges' as check_name,
       case when has_function_privilege('anon', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE') = true
             and has_function_privilege('anon', 'public.get_my_leaderboard_rank(text,text,uuid,text)', 'EXECUTE') = false
             and has_function_privilege('anon', 'public.get_streak_status()', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.award_attempt_points(uuid)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.admin_reset_leaderboard(text)', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.lb_rows(text,text,uuid,text)', 'EXECUTE') = false
             and (select count(*) from public.system_settings where key like 'leaderboard.points.%') >= 2
             and not exists (select 1 from public.system_settings
                              where key = 'leaderboard.points.olympiad_multiplier')
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

-- 57) get_mobile_config() whitelist shape: EXACTLY the eight documented top-level
--     keys, a complete per-platform version block, and a valid resolved payment
--     mode — the function must never grow into a `select *` settings dump.
--     `privacy` joined the list in migration 097.
select '57_mobile_config_shape' as check_name,
       case when (select array_agg(k order by k)
                    from jsonb_object_keys(public.get_mobile_config()) k)
               = array['contact','flags','locales','maintenance','payment','privacy','social','version']
             and public.get_mobile_config()->'version'->'ios' is not null
             and public.get_mobile_config()->'version'->'android' is not null
             and (public.get_mobile_config()->'payment'->>'mode') in ('real','demo','giveaway','off')
            then 'PASS' else 'FAIL' end as status;

-- 57e) Migration 100 — the olympiad PACKAGE owns the olympiad type. The pool
--      importer must derive it from olympiad_packages and must NOT read
--      meta.olympiad_type from the uploaded rows; the GENERAL importer keeps
--      that lookup, because it has no package to inherit from.
select '57e_olympiad_type_from_package' as check_name,
       -- The needle is CONCATENATED on purpose. Spelled as one literal, the
       -- Supabase SQL Editor's linter reads the "into v_oly" inside it as a
       -- SELECT ... INTO — which in plain SQL CREATES A TABLE — and blocks
       -- every run of this file behind an "enable RLS?" dialog. 013 creates
       -- nothing; it is read-only. The concatenation produces the identical
       -- needle at runtime while keeping that token pair out of the source.
       case when position('olympiad_type_id ' || 'into v_oly' in
                pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) > 0
             and position('where name = (v_item->''meta''->>''olympiad_type'')' in
                pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) = 0
             and position('where name = (v_item->''meta''->>''olympiad_type'')' in
                pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 57d) Migration 099 — the duplicate-email check exists, answers correctly, and
--      is NOT reachable by anon/authenticated (it is an account-existence
--      oracle; Supabase's default privileges would otherwise publish it).
select '57d_email_is_registered' as check_name,
       case when to_regprocedure('public.email_is_registered(text)') is not null
             and has_function_privilege('service_role','public.email_is_registered(text)','EXECUTE')
             and not has_function_privilege('anon','public.email_is_registered(text)','EXECUTE')
             and not has_function_privilege('authenticated','public.email_is_registered(text)','EXECUTE')
             and public.email_is_registered('nobody-9f3a2b@example.invalid') = false
            then 'PASS' else 'FAIL' end as status;

-- 57c) Migration 098 — no orphaned children. The cascade trigger is armed, and
--      no student is unreachable (a student with neither a creator nor a parent
--      link cannot be listed by any parent or admin surface, yet can still sign
--      in — which is precisely the state the trigger exists to prevent).
select '57c_parent_child_cascade' as check_name,
       case when exists (
              select 1 from pg_trigger
               where tgname = 'trg_parents_cascade_children'
                 and tgrelid = 'public.parents'::regclass
                 and not tgisinternal)
             and not exists (
              select 1 from public.students s
               where s.created_by_parent_profile_id is null
                 and not exists (select 1 from public.parent_student_links l
                                  where l.student_profile_id = s.profile_id))
            then 'PASS' else 'FAIL' end as status;

-- 57b) Migration 097 — privacy metadata. The eight admin-owned facts are seeded
--      and exposed, and the two DERIVED booleans agree with the switches they
--      describe. That agreement is the whole reason they are not settings: a
--      free-typed copy could tell parents no push data is collected while the
--      pipeline is live. `payments_live` is 'real' ONLY — demo and giveaway move
--      no money, so §8 must keep describing payments in the future tense.
select '57b_privacy_metadata' as check_name,
       case when (select count(*) from public.system_settings where key like 'privacy.%') = 8
             and (select array_agg(k order by k)
                    from jsonb_object_keys(public.get_mobile_config()->'privacy') k)
               = array['backup_retention','contact_email','effective_date','hosting_region',
                       'last_updated','learning_data_retention','payments_live','push_live',
                       'server_log_retention','website_url']
             and (public.get_mobile_config()->'privacy'->>'push_live')::boolean
                 = (public.get_mobile_config()->'flags'->>'notifications_push')::boolean
             and (public.get_mobile_config()->'privacy'->>'payments_live')::boolean
                 = (public.get_mobile_config()->'payment'->>'mode' = 'real')
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
             and position('skipped' in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text,text)'::regprocedure)) > 0
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
                          in pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) > 0
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
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text,text)'::regprocedure)) > 0
             and position('ta.kind <> ''olympiad'''
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text,text)'::regprocedure)) > 0
             and position('per_package'
                          in pg_get_functiondef('public.get_child_subject_dashboard(uuid,uuid,int,text,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 61) Daily rounds engine (migrations 052/056/057/083): per-student rated
--     rounds — the graded-only consumption index exists, the legacy
--     any-outcome index is GONE, the locked practice-set table exists,
--     points fire only for RATED attempts; topic tests stay untimed and
--     olympiad attempts draw the whole pool.
select '61_daily_rounds_engine' as check_name,
       case when to_regclass('public.daily_rounds') is not null
             and to_regclass('public.daily_practice_sets') is not null
             and to_regprocedure('public.start_daily_round_attempt(uuid,text)') is not null
             and exists (select 1 from pg_indexes
                          where schemaname='public' and indexname='uq_rated_daily_live_per_day')
             and not exists (select 1 from pg_indexes
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

-- 67) Daily-round draw + pool counts (migrations 065/082/083): the per-attempt
--     draw accepts shared (grade NULL) questions and is SUBTOPIC-BALANCED; the
--     retired shared-generation/readiness fns are GONE; RLS lets a student read
--     only their own locked practice sets; the olympiad pool-count RPC keeps
--     its Round-34 posture.
select '67_daily_round_pool_counts' as check_name,
       case when position('grade_id is null' in
                   pg_get_functiondef('public.draw_daily_questions(uuid,uuid,int)'::regprocedure)) > 0
             and position('bucket_rank' in
                   pg_get_functiondef('public.draw_daily_questions(uuid,uuid,int)'::regprocedure)) > 0
             and to_regprocedure('public.get_or_create_daily_round(uuid,uuid,date)') is null
             and to_regprocedure('public.build_round_snapshot(uuid[])') is null
             and to_regprocedure('public.get_my_round_readiness()') is null
             and to_regprocedure('public.daily_round_readiness()') is null
             and exists (select 1 from pg_policies where schemaname='public'
                          and tablename='daily_practice_sets'
                          and policyname='daily_practice_sets_select_own')
             and to_regprocedure('public.get_olympiad_pool_counts(uuid[],uuid)') is not null
             and to_regprocedure('public.get_olympiad_pool_counts(uuid[])') is null
             and has_function_privilege('authenticated','public.get_olympiad_pool_counts(uuid[],uuid)','EXECUTE')
             and has_function_privilege('anon','public.get_olympiad_pool_counts(uuid[],uuid)','EXECUTE') = false
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

-- 77) Admin subscription lifecycle (migration 077): the centralized admin RPC
--     exists, is NOT anon-executable, carries the is_admin guard + transition
--     validation + its own audit write.
select '77_admin_subscription_lifecycle' as check_name,
       case when to_regprocedure('public.admin_manage_child_subscription(uuid,text,int)') is not null
             and has_function_privilege('anon','public.admin_manage_child_subscription(uuid,text,int)','EXECUTE') = false
             and has_function_privilege('authenticated','public.admin_manage_child_subscription(uuid,text,int)','EXECUTE') = true
             and position('is_admin' in pg_get_functiondef('public.admin_manage_child_subscription(uuid,text,int)'::regprocedure)) > 0
             and position('invalid_transition' in pg_get_functiondef('public.admin_manage_child_subscription(uuid,text,int)'::regprocedure)) > 0
             and position('audit_logs' in pg_get_functiondef('public.admin_manage_child_subscription(uuid,text,int)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 78) Mid-cycle plan-change billing (migration 078, per-subject since 109):
--     the scheduled-removal column and the immutable change ledger (+ its
--     self-scoped RLS and replay guard).
--
--     The two RPCs this check used to pin — quote_subject_change and
--     apply_subject_change — were DROPPED by migration 118 with the proration
--     model they implemented. Check 105 now asserts they stay gone and that
--     the plan pair which replaced them keeps its posture.
select '78_subject_change_ledger' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='subscription_subjects'
                            and column_name='remove_at')
             and to_regclass('public.subscription_changes') is not null
             and exists (select 1 from pg_policies where schemaname='public'
                          and tablename='subscription_changes' and policyname='sub_changes_select')
             and to_regclass('public.uq_sub_changes_idem') is not null
            then 'PASS' else 'FAIL' end as status;


-- 79) Round 34 (migration 079): multi-grade olympiad packages — the grades
--     join table + legacy-sync/pool-guard triggers, the purchase grade
--     snapshot, per-grade RPC signatures (old overloads GONE — ambiguity),
--     the role-aware catalog RPC (never anon), and the backfill invariants.
select '79_olympiad_multigrade' as check_name,
       case when to_regclass('public.olympiad_package_grades') is not null
             and exists (select 1 from pg_trigger where tgname='trg_sync_oly_legacy_grade'
                          and tgrelid='public.olympiad_package_grades'::regclass)
             and exists (select 1 from pg_trigger where tgname='trg_olympiad_pool_grade_guard'
                          and tgrelid='public.questions'::regclass)
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='olympiad_purchases'
                            and column_name='grade_id')
             and to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)') is not null
             and to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb)') is null
             and to_regprocedure('public.get_olympiad_pool_counts(uuid[],uuid)') is not null
             and to_regprocedure('public.get_olympiad_pool_counts(uuid[])') is null
             and to_regprocedure('public.get_my_olympiad_catalog(uuid)') is not null
             and to_regprocedure('public.get_my_olympiad_catalog()') is null
             and has_function_privilege('anon','public.get_my_olympiad_catalog(uuid)','EXECUTE') = false
             and to_regprocedure('public.remove_olympiad_package_grade(uuid,uuid)') is not null
             and has_function_privilege('anon','public.remove_olympiad_package_grade(uuid,uuid)','EXECUTE') = false
             and position('grade_levels' in pg_get_functiondef('public.get_public_olympiad_packages(int)'::regprocedure)) > 0
             and position('package_not_for_grade' in pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
             and position('package_not_for_grade' in pg_get_functiondef('public.purchase_olympiad(uuid,uuid)'::regprocedure)) > 0
             and not exists (select 1 from public.olympiad_packages p
                              where p.grade_id is not null
                                and not exists (select 1 from public.olympiad_package_grades g
                                                 where g.olympiad_package_id = p.id
                                                   and g.grade_id = p.grade_id))
             and not exists (select 1 from public.olympiad_packages p
                              where p.grade_id is not null
                                and (select count(*) from public.olympiad_package_grades g
                                      where g.olympiad_package_id = p.id) <> 1)
            then 'PASS' else 'FAIL' end as status;


-- 80) Public media metadata (migration 080): anon reads ONLY public-visibility
--     media_assets rows (news/olympiad covers on the logged-out website); the
--     authenticated policy is untouched.
select '80_public_media_anon_read' as check_name,
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='media_assets'
                            and policyname='media_select_anon'
                            and roles = '{anon}'
                            and qual like '%visibility%public%')
            then 'PASS' else 'FAIL' end as status;


-- 81) Round 36 (migration 081): percentage leaderboard — ledger snapshot
--     columns, student caches, participation settings, rewritten board fns
--     (percent value + provisional + competition ranks), percent season/
--     rollover standings, grant posture, and the num<=den invariant.
select '81_percentage_leaderboard' as check_name,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='student_points_ledger'
                            and column_name='weighted_den')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='pct_den_all')
             and exists (select 1 from public.system_settings where key='leaderboard.rank.min_attempts')
             and not exists (select 1 from public.system_settings where key='leaderboard.rank.min_questions')
             and to_regprocedure('public.lb_rows(text,text,uuid,text)') is not null
             and has_function_privilege('authenticated','public.lb_rows(text,text,uuid,text)','EXECUTE') = false
             and position('is_provisional' in pg_get_functiondef('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)) > 0
             and position('rank() over' in pg_get_functiondef('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)) > 0
             and position('weighted_num' in pg_get_functiondef('public.award_attempt_points(uuid)'::regprocedure)) > 0
             and position('percent' in pg_get_functiondef('public.get_public_leaderboard(int)'::regprocedure)) > 0
             and position('metric' in pg_get_functiondef('public.close_leaderboard_season(uuid)'::regprocedure)) > 0
             and not exists (select 1 from public.student_points_ledger
                              where pct_valid and weighted_num > weighted_den)
            then 'PASS' else 'FAIL' end as status;


-- 82) Round 39 (migration 084): mandatory Rüb — the merged term guard enforces
--     the general-bank requirement (bank questions can never end up termless;
--     olympiad pool exempt) on top of the 054 inheritance/mismatch rules; the
--     daily-pool index exists; taxonomy term columns stay in place.
select '82_mandatory_term' as check_name,
       case when exists (select 1 from pg_trigger where tgname='trg_question_term_guard'
                          and tgrelid='public.questions'::regclass)
             and position('required for bank questions' in
                   pg_get_functiondef('public.question_term_guard()'::regprocedure)) > 0
             and position('v_topic_term' in
                   pg_get_functiondef('public.question_term_guard()'::regprocedure)) > 0
             and exists (select 1 from pg_indexes where schemaname='public'
                          and indexname='idx_questions_daily_pool')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='topics' and column_name='term')
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='subtopics' and column_name='term')
            then 'PASS' else 'FAIL' end as status;

-- 83) Round 48 (migration 088): purchased olympiads are PRACTICE-ONLY. The
--     award function must bail out for kind='olympiad' BEFORE the ledger
--     insert (everything else - percentage weight, cached counters, activity
--     day, streak - is downstream of it), no olympiad row may survive in the
--     points ledger, and the now-dead olympiad multiplier setting must be gone.
select '83_olympiads_practice_only' as check_name,
       case when position('v_kind = ''olympiad''' in
                   pg_get_functiondef('public.award_attempt_points(uuid)'::regprocedure)) > 0
             and position('olympiad_multiplier' in
                   pg_get_functiondef('public.award_attempt_points(uuid)'::regprocedure)) = 0
             and not exists (select 1 from public.student_points_ledger where kind = 'olympiad')
             and not exists (select 1 from public.system_settings
                              where key = 'leaderboard.points.olympiad_multiplier')
            then 'PASS' else 'FAIL' end as status;

-- 84) Round 48 (migration 089): the PAYMENTS KILL SWITCH is enforced in the
--     database, not only in TypeScript. current_payment_mode() exists and is
--     not anon-callable, assert_payments_enabled() is service-role only, and
--     every paid mutation calls it. apply_plan_change guards ADDS and CYCLE
--     changes only — a removal stays legal, so a parent can always stop paying.
select '84_payments_kill_switch' as check_name,
       case when has_function_privilege('anon', 'public.current_payment_mode()', 'EXECUTE') = false
             and has_function_privilege('authenticated', 'public.assert_payments_enabled()', 'EXECUTE') = false
             and position('assert_payments_enabled' in
                   pg_get_functiondef('public.create_child_subscription(uuid,plan_interval,uuid[])'::regprocedure)) > 0
             and position('assert_payments_enabled' in
                   pg_get_functiondef('public.purchase_olympiad(uuid,uuid)'::regprocedure)) > 0
             and position('assert_payments_enabled' in
                   pg_get_functiondef('public.add_subscription_subject(uuid,uuid)'::regprocedure)) > 0
             and position('v_adds > 0 or v_changes > 0' in
                   pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 85) Round 51 (migrations 090/092): olympiad question ROTATION. The rotation
--     table + its NULLS NOT DISTINCT lock-key index exist, the activation
--     pool guard is armed on olympiad_packages, start_olympiad_attempt draws
--     under a row lock (for update) with the live per-attempt count
--     (v_pkg.n_per) and creates PRACTICE attempts (is_rated = false — no
--     legacy rated olympiad row may survive), and questions_per_attempt is
--     bounded 1..500.
select '85_olympiad_question_rotation' as check_name,
       case when to_regclass('public.olympiad_question_rotations') is not null
             and exists (select 1 from pg_indexes where schemaname='public'
                          and indexname='uq_olympiad_rotation_student_pkg_grade')
             and exists (select 1 from pg_trigger
                          where tgname='trg_olympiad_activation_pool_guard'
                            and tgrelid='public.olympiad_packages'::regclass)
             and position('for update' in
                   pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
             and position('v_pkg.n_per' in
                   pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
             and position('v_duration, false' in
                   pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
             and not exists (select 1 from public.test_attempts
                              where kind = 'olympiad' and is_rated = true)
             and exists (select 1 from pg_constraint
                          where conrelid='public.olympiad_packages'::regclass
                            and conname='olympiad_packages_questions_per_attempt_check'
                            and pg_get_constraintdef(oid) like '%500%')
            then 'PASS' else 'FAIL' end as status;

-- 86) Round 51 (migration 091): payment-mode PARITY. The two SQL resolvers
--     (current_payment_mode and get_mobile_config) must agree on the mode for
--     the CURRENT flag state, and the kill switch must raise with the stable
--     hint the app error mappers translate (payments_disabled).
select '86_payment_mode_parity' as check_name,
       case when public.current_payment_mode()
                 = (public.get_mobile_config()->'payment'->>'mode')
             and position('payments_disabled' in
                   pg_get_functiondef('public.assert_payments_enabled()'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status;

-- 87) Round 52 (migration 093): the server-side answer PAYLOAD CAP clears the
--     500-question questions_per_attempt ceiling in BOTH writer RPCs, and the
--     old 100 cap — which silently discarded every answer past item 100 with a
--     200 OK — is gone from both.
select '87_answer_payload_cap' as check_name,
       case when position('v_n > 1000;' in
                 pg_get_functiondef('public.submit_test_attempt(uuid,jsonb,text)'::regprocedure)) > 0
             and position('v_n > 1000;' in
                 pg_get_functiondef('public.save_test_answers(uuid,jsonb)'::regprocedure)) > 0
             and position('v_n > 100;' in
                 pg_get_functiondef('public.submit_test_attempt(uuid,jsonb,text)'::regprocedure)) = 0
             and position('v_n > 100;' in
                 pg_get_functiondef('public.save_test_answers(uuid,jsonb)'::regprocedure)) = 0
            then 'PASS' else 'FAIL' end as status;

-- 88) Import-media orphans (Round 53). Bulk-import images are uploaded BEFORE
--     the questions that reference them exist, so an abandoned or failed import
--     can leave assets nobody points at. Two independent counts, because they
--     mean different things:
--
--       row_orphans    media_assets rows under imports/ that no consumer
--                      references — an import was verified but never submitted.
--       object_orphans storage objects under imports/ with no media_assets row
--                      at all — the verify step failed AFTER the upload. These
--                      are invisible to any join, so they are counted here or
--                      not at all.
--
--     A one-off non-zero count is normal (an admin abandoned an import); the
--     signal is a count that GROWS. The 24h floor keeps a concurrently-open
--     import out of the numbers. Read-only — safe against either database.
--
--     Every media_assets consumer is checked, not just question_translations
--     (option images via answer_option_translations included since migration 102 —
--     omitting them counted LIVE option images as orphans and failed on healthy data):
--     the FKs are ON DELETE SET NULL, so treating a referenced row as an orphan
--     would silently blank a live image rather than fail.
select '88_import_media_orphans' as check_name,
       case when (
              select count(*) from public.media_assets ma
               where ma.bucket = 'question-media'
                 and ma.path like 'imports/%'
                 and ma.created_at < now() - interval '24 hours'
                 and not exists (select 1 from public.question_translations x where x.media_asset_id = ma.id)
                 and not exists (select 1 from public.question_explanations x where x.media_asset_id = ma.id)
                 and not exists (select 1 from public.answer_option_translations x where x.media_asset_id = ma.id)
                 and not exists (select 1 from public.profiles x where x.avatar_media_id = ma.id)
                 and not exists (select 1 from public.wallpapers x where x.media_asset_id = ma.id)
                 and not exists (select 1 from public.sticker_images x where x.media_asset_id = ma.id)
                 and not exists (select 1 from public.news x where x.cover_media_id = ma.id)
                 and not exists (select 1 from public.olympiad_packages x where x.cover_media_id = ma.id)
            ) = 0
            and (
              select count(*) from storage.objects o
               where o.bucket_id = 'question-media'
                 and o.name like 'imports/%'
                 and o.created_at < now() - interval '24 hours'
                 and not exists (
                   select 1 from public.media_assets ma
                    where ma.bucket = 'question-media' and ma.path = o.name)
            ) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.media_assets ma
         where ma.bucket = 'question-media'
           and ma.path like 'imports/%'
           and ma.created_at < now() - interval '24 hours'
           and not exists (select 1 from public.question_translations x where x.media_asset_id = ma.id)
           and not exists (select 1 from public.question_explanations x where x.media_asset_id = ma.id)
           and not exists (select 1 from public.answer_option_translations x where x.media_asset_id = ma.id)
           and not exists (select 1 from public.profiles x where x.avatar_media_id = ma.id)
           and not exists (select 1 from public.wallpapers x where x.media_asset_id = ma.id)
           and not exists (select 1 from public.sticker_images x where x.media_asset_id = ma.id)
           and not exists (select 1 from public.news x where x.cover_media_id = ma.id)
           and not exists (select 1 from public.olympiad_packages x where x.cover_media_id = ma.id)
       ) as row_orphans,
       (select count(*) from storage.objects o
         where o.bucket_id = 'question-media'
           and o.name like 'imports/%'
           and o.created_at < now() - interval '24 hours'
           and not exists (
             select 1 from public.media_assets ma
              where ma.bucket = 'question-media' and ma.path = o.name)
       ) as object_orphans;

-- 89. Per-grade olympiad config (migrations 106/107) — READ-ONLY.
--
--     Four things have to hold together, and each one has broken in practice:
--
--     a) the resolver exists — every reader coalesces through it, so its
--        absence means the attempt engine and the guards are free to disagree;
--     b) start_olympiad_attempt actually CALLS it after resolving the entitled
--        grade. It used to read both numbers from the package BEFORE knowing
--        which grade's pool applied, which is why every grade shared one
--        question count and one clock;
--     c) the validator checks each grade against ITS OWN count, not one number
--        for all of them — otherwise a 40-question grade with a 12-question
--        pool can go ACTIVE and fails at ATTEMPT time instead;
--     d) the grade rows are guarded, since per-grade counts live on a table the
--        package-level activation trigger never fires for.
select '89_per_grade_olympiad_config' as check_name,
       case when to_regprocedure('public.olympiad_grade_config(uuid,uuid)') is not null
             and position('olympiad_grade_config(p_package_id, v_pool_grade)' in
                   replace(pg_get_functiondef(
                     'public.start_olympiad_attempt(uuid)'::regprocedure), chr(13), '')) > 0
             and position('coalesce(g.questions_per_attempt, v_fallback)' in
                   replace(pg_get_functiondef(
                     'public.assert_olympiad_pool_meets_per_attempt(uuid,int,uuid)'::regprocedure),
                     chr(13), '')) > 0
             and exists (
                   select 1 from pg_trigger
                    where tgname = 'trg_olympiad_grade_pool_guard'
                      and tgrelid = 'public.olympiad_package_grades'::regclass
                      and not tgisinternal)
            then 'PASS' else 'FAIL' end as status,
       (to_regprocedure('public.olympiad_grade_config(uuid,uuid)') is not null) as resolver_exists,
       (position('olympiad_grade_config(p_package_id, v_pool_grade)' in
          replace(pg_get_functiondef(
            'public.start_olympiad_attempt(uuid)'::regprocedure), chr(13), '')) > 0)
         as attempt_uses_grade_config,
       (position('coalesce(g.questions_per_attempt, v_fallback)' in
          replace(pg_get_functiondef(
            'public.assert_olympiad_pool_meets_per_attempt(uuid,int,uuid)'::regprocedure),
            chr(13), '')) > 0) as guard_is_per_grade,
       (select count(*) from pg_trigger
         where tgname = 'trg_olympiad_grade_pool_guard'
           and tgrelid = 'public.olympiad_package_grades'::regclass
           and not tgisinternal) as grade_row_guard_armed;

-- 90. No target grade may promise more questions than its pool can serve
--     (migration 107). The guards make this unreachable going forward; this
--     catches an ACTIVE package whose pool was emptied afterwards — the
--     2026-07-30 curriculum purge did exactly that to eight packages, and a
--     student opening one gets a failed attempt, not an empty screen.
--
--     Only ACTIVE packages count: a draft with an unfinished pool is normal.
select '90_active_grade_pool_serves_attempt' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as short_grades
from public.olympiad_package_grades g
join public.olympiad_packages p on p.id = g.olympiad_package_id
where p.status = 'active'
  and (select count(*) from public.questions q
        where q.olympiad_package_id = p.id
          and q.status = 'published'
          and q.grade_id = g.grade_id)
      < greatest(coalesce(g.questions_per_attempt, p.questions_per_attempt, 1), 1);

-- 91. Per-subject billing (migration 109) — SCHEMA + WIRING.
--
--     Six things have to hold together here, and five of them have a specific
--     way of going wrong:
--
--     a) the columns exist at all — everything else reads through them;
--     b) subscription_changes accepts 'plan_change', or a scheduled cycle
--        change fails at write time instead of at review time;
--     c) trg_sync_subscription_period is armed. It is the SINGLE writer of
--        child_subscriptions' current_period_end / next_renewal_at /
--        base / discount / total_amount — unarmed, those five silently freeze;
--     d) the four RPCs exist and are NOT reachable by anon/authenticated (they
--        are service-role only; every caller authorizes the parent first);
--     e) the two SUBSCRIPTION-level legacy signatures still exist
--        (quote_child_subscription / create_child_subscription, which checks
--        20/46 pin). The subject-CHANGE wrappers are deliberately NOT here any
--        more: migration 118 dropped them, and check 105 asserts their absence;
--     f) the per-subject expiry is actually WIRED into the attempt gate. The
--        subscription now outlives its shortest-cycle subject, so the
--        subscription-level date alone over-grants.
select '91_per_subject_billing_interval' as check_name,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'subscription_subjects'
                     and column_name in ('interval','pending_interval','price_amount',
                                         'current_period_start','current_period_end')) = 5
             and exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'child_subscriptions'
                            and column_name = 'next_renewal_at')
             and exists (select 1 from pg_constraint
                          where conname = 'subscription_changes_change_type_check'
                            and conrelid = 'public.subscription_changes'::regclass
                            and position('plan_change' in pg_get_constraintdef(oid)) > 0)
             and exists (select 1 from pg_trigger
                          where tgname = 'trg_sync_subscription_period'
                            and tgrelid = 'public.subscription_subjects'::regclass
                            and not tgisinternal)
             and to_regprocedure('public.quote_child_plan(uuid,jsonb)') is not null
             and to_regprocedure('public.create_child_plan(uuid,jsonb)') is not null
             and to_regprocedure('public.quote_plan_change(uuid,jsonb)') is not null
             and to_regprocedure('public.apply_plan_change(uuid,jsonb,text)') is not null
             and has_function_privilege('authenticated',
                   'public.create_child_plan(uuid,jsonb)', 'EXECUTE') = false
             and has_function_privilege('authenticated',
                   'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.quote_child_plan(uuid,jsonb)', 'EXECUTE') = false
             and has_function_privilege('anon',
                   'public.quote_plan_change(uuid,jsonb)', 'EXECUTE') = false
             and to_regprocedure('public.quote_child_subscription(uuid,public.plan_interval,uuid[])') is not null
             and to_regprocedure('public.create_child_subscription(uuid,public.plan_interval,uuid[])') is not null
             and position('coalesce(ss.current_period_end' in
                   replace(pg_get_functiondef(
                     'public.start_practice_attempt(uuid,int)'::regprocedure), chr(13), '')) > 0
            then 'PASS' else 'FAIL' end as status,
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'subscription_subjects'
            and column_name in ('interval','pending_interval','price_amount',
                                'current_period_start','current_period_end')) = 5
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'child_subscriptions'
                       and column_name = 'next_renewal_at')) as columns_present,
       exists (select 1 from pg_constraint
                where conname = 'subscription_changes_change_type_check'
                  and conrelid = 'public.subscription_changes'::regclass
                  and position('plan_change' in pg_get_constraintdef(oid)) > 0)
         as plan_change_allowed,
       exists (select 1 from pg_trigger
                where tgname = 'trg_sync_subscription_period'
                  and tgrelid = 'public.subscription_subjects'::regclass
                  and not tgisinternal) as period_trigger_armed,
       (to_regprocedure('public.quote_child_plan(uuid,jsonb)') is not null
        and to_regprocedure('public.create_child_plan(uuid,jsonb)') is not null
        and to_regprocedure('public.quote_plan_change(uuid,jsonb)') is not null
        and to_regprocedure('public.apply_plan_change(uuid,jsonb,text)') is not null
        and has_function_privilege('authenticated',
              'public.create_child_plan(uuid,jsonb)', 'EXECUTE') = false
        and has_function_privilege('authenticated',
              'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE') = false
        and has_function_privilege('anon',
              'public.quote_child_plan(uuid,jsonb)', 'EXECUTE') = false
        and has_function_privilege('anon',
              'public.quote_plan_change(uuid,jsonb)', 'EXECUTE') = false) as plan_rpcs_locked,
       (to_regprocedure('public.quote_child_subscription(uuid,public.plan_interval,uuid[])') is not null
        and to_regprocedure('public.create_child_subscription(uuid,public.plan_interval,uuid[])') is not null)
         as legacy_subscribe_wrappers_intact,
       (position('coalesce(ss.current_period_end' in
          replace(pg_get_functiondef(
            'public.start_practice_attempt(uuid,int)'::regprocedure), chr(13), '')) > 0)
         as per_subject_expiry_wired;

-- 92. Per-subject period INTEGRITY (migration 109) — READ-ONLY data check, and
--     the drift alarm for trg_sync_subscription_period.
--
--     Three ways this goes wrong, all silent:
--       * a live subject row with NO period of its own while its subscription
--         HAS one — it would inherit through coalesce and outlive its cycle;
--       * child_subscriptions.current_period_end drifting off the MAX. If it
--         ever became the MIN, recompute_child_access would expire a whole
--         subscription — a paid yearly subject with it — the moment the
--         shortest-cycle subject lapsed;
--       * next_renewal_at drifting off the MIN, i.e. the wrong charge date and
--         the wrong "next invoice" amount everywhere it is displayed.
--     A subject cannot carry an interval outside the enum (the column IS the
--     enum), so what is checked instead is the only remaining contradiction: a
--     subject period reaching PAST its subscription's coverage end.
select '92_subject_period_integrity' as check_name,
       case when (select count(*) from public.subscription_subjects ss
                   join public.child_subscriptions cs on cs.id = ss.child_subscription_id
                  where cs.status in ('trialing','active','past_due')
                    and cs.current_period_end is not null
                    and ss.current_period_end is null) = 0
             and (select count(*) from public.child_subscriptions cs
                   where cs.status in ('trialing','active','past_due')
                     and exists (select 1 from public.subscription_subjects ss
                                  where ss.child_subscription_id = cs.id)
                     and (cs.current_period_end is distinct from
                            (select max(ss.current_period_end)
                               from public.subscription_subjects ss
                              where ss.child_subscription_id = cs.id)
                          or cs.next_renewal_at is distinct from
                            (select min(ss.current_period_end)
                               from public.subscription_subjects ss
                              where ss.child_subscription_id = cs.id
                                and ss.remove_at is null))) = 0
             and (select count(*) from public.subscription_subjects ss
                   join public.child_subscriptions cs on cs.id = ss.child_subscription_id
                  where ss.current_period_end > cs.current_period_end) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.subscription_subjects ss
         join public.child_subscriptions cs on cs.id = ss.child_subscription_id
        where cs.status in ('trialing','active','past_due')
          and cs.current_period_end is not null
          and ss.current_period_end is null) as live_rows_without_period,
       (select count(*) from public.child_subscriptions cs
         where cs.status in ('trialing','active','past_due')
           and exists (select 1 from public.subscription_subjects ss
                        where ss.child_subscription_id = cs.id)
           and (cs.current_period_end is distinct from
                  (select max(ss.current_period_end)
                     from public.subscription_subjects ss
                    where ss.child_subscription_id = cs.id)
                or cs.next_renewal_at is distinct from
                  (select min(ss.current_period_end)
                     from public.subscription_subjects ss
                    where ss.child_subscription_id = cs.id
                      and ss.remove_at is null))) as trigger_drift,
       (select count(*) from public.subscription_subjects ss
         join public.child_subscriptions cs on cs.id = ss.child_subscription_id
        where ss.current_period_end > cs.current_period_end) as subject_past_coverage;

-- 93. Migration 108: an olympiad grade pool is APPENDABLE (the creation-only
--     raise is gone) and the append is duplicate-guarded against the
--     PRE-EXISTING pool only — the snapshot must never be extended inside the
--     row loop, or two identical rows in one file would collide and roll back a
--     package creation that used to succeed. norm_import_text is the key's text
--     normalizer and must stay service-internal — Supabase's default privileges
--     hand EXECUTE to anon/authenticated unless revoked.
select '93_olympiad_bulk_append' as check_name,
       case when position('can only be bulk uploaded once' in
                 pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) = 0
             and position('v_dup_keys' in
                 pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) > 0
             and position('v_dup_keys || v_key' in
                 pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure)) = 0
             and to_regprocedure('public.norm_import_text(text)') is not null
             and has_function_privilege('anon','public.norm_import_text(text)','EXECUTE') = false
             and has_function_privilege('authenticated','public.norm_import_text(text)','EXECUTE') = false
            then 'PASS' else 'FAIL' end as status;

-- 94. Migration 110: the palette whitelist matches the shipped catalogue (26
--     slugs), no student holds a palette outside it, and the SECOND appearance
--     preference exists as its own NOT NULL, CHECK-guarded column. The two are
--     deliberately independent: dark mode overrides a palette visually and must
--     never clear it.
--
--     Note on the last column: it is REPORT-ONLY, not a PASS/FAIL input. It is 0
--     immediately after the migration's intent backfill, but a child may
--     legitimately re-enable dark afterwards while keeping their palette — a
--     later non-zero value is normal, not a failure.
with cat(slug) as (
  select unnest(array[
    'sky','ocean','cyan','aqua','teal','arctic','navy','indigo','violet',
    'lavender','rainbow','aurora','bubblegum','sakura','rose','berry','coral',
    'peach','sunset','amber','sand','lime','mint','emerald','forest','graphite'])
), def(d) as (
  select pg_get_constraintdef(oid)
    from pg_constraint
   where conname='students_palette_chk'
     and conrelid='public.students'::regclass
)
select '94_palette_catalogue_and_theme_pref' as check_name,
       case when (select count(*) from def) = 1
             -- every catalogue slug is accepted …
             and (select count(*) from cat, def where position(cat.slug in def.d) = 0) = 0
             -- … and the whitelist is EXACTLY the catalogue size: each slug
             -- contributes two single quotes to the rendered definition, so a
             -- 26-slug whitelist renders exactly 52 of them. A stale extra slug
             -- would pass the containment test above but fails here.
             and (select (length(d) - length(replace(d, '''', ''))) from def) = 26 * 2
             and (select count(*) from public.students s
                   where s.palette is not null
                     and not exists (select 1 from cat where cat.slug = s.palette)) = 0
             and exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='students'
                            and column_name='theme_pref' and is_nullable='NO')
             and exists (select 1 from pg_constraint
                          where conname='students_theme_pref_chk'
                            and conrelid='public.students'::regclass)
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.students
         where palette is not null and theme_pref <> 'light') as palette_rows_now_dark;


-- 95. Migration 109: a SCHEDULED cycle change is not write-only. pending_interval
--     is written by apply_plan_change and promoted into subscription_subjects.
--     interval by apply_due_plan_changes() at the subject's OWN period boundary;
--     016 schedules it hourly. Without that function the column is stored and
--     never applied, which is the single defect this check exists to catch.
--
--     Deliberately does NOT read cron.job — see check 28: a missing relation
--     fails at PARSE time on databases without pg_cron, so the schedule itself
--     is verified by hand there:
--       select jobname, schedule from cron.job where jobname like 'olympiq_%';
--
--     The last two columns are REPORT-ONLY. A positive overdue_promotions with a
--     live cron job simply means the job has not run since the boundary passed.
select '95_pending_interval_rollover' as check_name,
       case when to_regprocedure('public.apply_due_plan_changes()') is not null
             and has_function_privilege('anon','public.apply_due_plan_changes()','EXECUTE') = false
             and has_function_privilege('authenticated','public.apply_due_plan_changes()','EXECUTE') = false
             -- The CANCEL branch: choosing the cycle a subject is already paid
             -- on must CLEAR the schedule, never store a no-op — otherwise a
             -- mis-clicked 'yearly' can never be undone.
             and position('then null else v_row.to_iv end' in
                   pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure)) > 0
             -- Renewal sentences must be priced from the DESIRED basket. The
             -- left join onto the stored rows only supplies each subject's own
             -- period end; reading those rows for the CYCLE is what quoted the
             -- pre-change amount back to the parent.
             and position('left join public.subscription_subjects ss' in
                   pg_get_functiondef('public.quote_plan_change(uuid,jsonb)'::regprocedure)) > 0
             -- The clause that used to sit here probed apply_subject_change for
             -- "coalesce(ss.pending_interval, ss.interval, v_sub.interval)" — the
             -- rule that an add/remove must carry a SCHEDULED cycle through
             -- instead of silently cancelling it. Migration 118 dropped that
             -- wrapper (pg_get_functiondef on it now RAISES, which would fail
             -- this whole file), and the rule moved into TypeScript, where it is
             -- covered by subscriptionCore's derivation tests. What remains
             -- database-side is quote_plan_change's own use of the scheduled
             -- cycle as the comparison basis, asserted just above.
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.subscription_subjects
         where pending_interval is not null) as scheduled_changes,
       (select count(*) from public.subscription_subjects ss
         join public.child_subscriptions cs on cs.id = ss.child_subscription_id
        where ss.pending_interval is not null
          and ss.remove_at is null
          and ss.current_period_end is not null
          and ss.current_period_end <= now()
          and cs.status in ('trialing','active','past_due')) as overdue_promotions;

-- 96. Migration 111: the guarded-deletion surface exists, is shaped the way the
--     panel assumes, and still enforces every finding the review raised.
--
--     PART ONE — CONFIGURATION, for each of the twelve functions:
--       * SECURITY DEFINER — questions, test_attempts and subscription_subjects
--         are RLS-protected, so a blocking count taken as the caller could come
--         back 0 because rows were HIDDEN. A silent 0 here deletes a subject
--         somebody is paying for;
--       * a pinned search_path — on a definer function an unpinned one is
--         privilege escalation, not a style preference;
--       * anon reaches none of them;
--       * the split between the eight admin RPCs (called AS the signed-in
--         admin, so 'authenticated' is required and is_admin() inside is the
--         real gate) and the four service-internal helpers ('authenticated'
--         must NOT reach those — purge_question_set deletes questions).
--
--     PART TWO — BEHAVIOUR, probed inside the SHIPPED body with
--     pg_get_functiondef, so a later hand-edit in the Dashboard SQL editor
--     cannot quietly undo a review finding while leaving the signature intact.
--     Each probe is one sentence a data query cannot catch until after the
--     damage is done:
--       * the two operations that destroy the MOST rows — a subject's entire
--         general question bank, and a whole olympiad grade pool — demand the
--         row's own code, exactly like the two container deletes. Both are
--         granted to 'authenticated', i.e. both are PostgREST endpoints an
--         admin session can POST directly, so the dialog is not the control;
--       * the subject preview reports how many children are actively
--         subscribed. The purge is deliberately NOT blocked by a subscription
--         (curriculum replacement is its legitimate use), but an emptied bank
--         leaves draw_daily_questions unable to assemble a set and
--         start_daily_round_attempt raising no_data_found for every one of
--         those children — so the number has to reach the admin;
--       * subject deletion blocks on TOPICS and on GENERAL-BANK QUESTIONS.
--         These are the only two blocks that also fire for a seeded,
--         never-played subject — precisely the state in which the CASCADE would
--         otherwise take the whole curriculum tree and SET NULL the bank;
--       * an attempt pinned to one of the subject's daily rounds is a COUNTED
--         reason. daily_rounds.subject_id is CASCADE while
--         test_attempts.daily_round_id is RESTRICT, so without the block the
--         delete aborts on a bare 23503 with no hint — the generic "server
--         error" migration 111 exists to remove;
--       * the orphaned-media list considers EVERY media_assets consumer. The
--         caller hands that array to a Storage delete and every one of those
--         columns is ON DELETE SET NULL, so a missing consumer does not fail —
--         it sweeps a live avatar, wallpaper, sticker or news cover out of the
--         bucket;
--       * the DESTRUCTIVE grade path counts purchases in ANY status while the
--         restorable archive path keeps its active-only predicate. Asserted in
--         BOTH directions, because "copy the safe path" is exactly what caused
--         the bug: olympiad_purchases also allows 'pending' and 'refunded', and
--         purchase_olympiad re-activates a refunded row IN PLACE keeping its
--         grade_id — onto a pool that would no longer exist.
with fns (sig, admin_facing) as (values
  ('public.admin_preview_olympiad_package_deletion(uuid)', true),
  ('public.admin_preview_olympiad_grade_pool_deletion(uuid,uuid)', true),
  ('public.admin_preview_subject_deletion(uuid)', true),
  ('public.admin_delete_olympiad_package(uuid)', true),
  ('public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)', true),
  ('public.admin_purge_subject_questions(uuid,text)', true),
  ('public.admin_delete_subject(uuid,text)', true),
  ('public.admin_unarchive_olympiad_package(uuid)', true),
  ('public.purge_question_set(uuid[])', false),
  ('public.subject_deletion_blocks(uuid)', false),
  ('public.olympiad_package_deletion_blocks(uuid)', false),
  ('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', false)
), probes (sig, needle, must_exist) as (values
  ('public.admin_purge_subject_questions(uuid,text)', 'confirmation_mismatch', true),
  ('public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)', 'confirmation_mismatch', true),
  ('public.admin_preview_subject_deletion(uuid)', 'subject_purge_active_subscribers', true),
  ('public.subject_deletion_blocks(uuid)', 'subject_has_topics', true),
  ('public.subject_deletion_blocks(uuid)', 'subject_has_questions', true),
  ('public.subject_deletion_blocks(uuid)', 'subject_has_round_attempts', true),
  ('public.purge_question_set(uuid[])', 'x.avatar_media_id = c.m', true),
  ('public.purge_question_set(uuid[])', 'public.wallpapers', true),
  ('public.purge_question_set(uuid[])', 'public.sticker_images', true),
  ('public.purge_question_set(uuid[])', 'public.news', true),
  ('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', 'pu.status = ''active''', false),
  ('public.remove_olympiad_package_grade(uuid,uuid)', 'pu.status = ''active''', true),
  -- The token-less arities must be GONE, not merely unused: an overload that
  -- destroys the same rows without a confirmation is the bypass itself.
  ('public.admin_purge_subject_questions(uuid)', '', false),
  ('public.admin_delete_olympiad_grade_pool(uuid,uuid,boolean)', '', false)
), fn_ok as (
  select f.sig,
         -- CASE, not AND: has_function_privilege() errors on a missing
         -- function, and this check has to REPORT that, not abort the file.
         case when to_regprocedure(f.sig) is null then false
              else (select p.prosecdef
                      and coalesce(p.proconfig, '{}'::text[])
                            @> array['search_path=public, pg_temp']
                      and not has_function_privilege('anon', p.oid, 'EXECUTE')
                      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                          = f.admin_facing
                    from pg_proc p where p.oid = to_regprocedure(f.sig))
         end as ok
  from fns f
), probe_ok as (
  select p.sig, p.needle,
         -- An absent function makes a must_exist probe fail and an absent-arity
         -- probe (needle '') pass, which is exactly the intent in both cases.
         case when to_regprocedure(p.sig) is null then not p.must_exist
              else (position(p.needle in
                      pg_get_functiondef(to_regprocedure(p.sig))) > 0) = p.must_exist
         end as ok
  from probes p
)
select '96_guarded_deletion_functions' as check_name,
       case when (select count(*) filter (where ok) from fn_ok) = 12
             and (select count(*) filter (where not ok) from probe_ok) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) filter (where to_regprocedure(sig) is null) from fns)
         as missing_functions,
       (select count(*) filter (where not ok) from fn_ok) as misconfigured,
       (select count(*) filter (where not ok) from probe_ok) as failed_invariants;

-- 97. The three BEFORE DELETE guards are ARMED (migration 111 + Round 21).
--
--     tgenabled is checked, not just existence: 'D' (disabled) leaves the
--     trigger in the catalog while it stops firing, which is exactly what a
--     hurried `alter table … disable trigger` during a data fix leaves behind.
--     CLAUDE.md bans that manoeuvre precisely because it also suspends FK
--     enforcement — this check is how a forgotten re-enable gets caught.
--
--     trg_question_delete_guard is the load-bearing one: every destructive path
--     in migration 111 hard-deletes only the UNANSWERED questions of a set and
--     archives the rest, and it is this guard that turns a mistake in that split
--     into an aborted transaction instead of silently destroyed graded history.
--     The function-body probe catches a rewrite that keeps the trigger but drops
--     the raise.
select '97_deletion_guard_triggers_armed' as check_name,
       case when count(*) filter (where armed) = 3
             and position('question_has_attempts' in
                   pg_get_functiondef('public.question_delete_guard()'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status,
       count(*) filter (where not armed) as missing_or_disabled,
       (position('question_has_attempts' in
          pg_get_functiondef('public.question_delete_guard()'::regprocedure)) > 0)
         as answered_questions_still_protected
from (values
  ('trg_question_delete_guard', 'public.questions'),
  ('trg_subject_delete_guard', 'public.subjects'),
  ('trg_olympiad_package_delete_guard', 'public.olympiad_packages')
) as t(tg, tbl)
cross join lateral (
  select exists (select 1 from pg_trigger g
                  where g.tgname = t.tg
                    and g.tgrelid = t.tbl::regclass
                    and not g.tgisinternal
                    and g.tgenabled = 'O') as armed
) a;

-- 98. Orphaned question references — REPORT-ONLY except for the last column.
--
--     questions.subject_id is ON DELETE SET NULL, so a subject deleted around
--     the guards leaves the bank silently untagged rather than failing loudly.
--     admin_delete_subject purges the general bank itself so this stays 0 by
--     construction; a non-zero count means something deleted a subject another
--     way. It is reported, not FAILed, because a subject-less question is a
--     legitimate transient state during import repair.
--
--     The last column IS a failure: olympiad_package_questions rows whose
--     question is gone would make a pool count questions that cannot be served.
select '98_no_orphaned_questions' as check_name,
       case when (select count(*) from public.olympiad_package_questions opq
                   where not exists (select 1 from public.questions q
                                      where q.id = opq.question_id)) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.questions
         where subject_id is null and olympiad_package_id is null)
         as general_bank_without_subject,
       (select count(*) from public.questions
         where topic_id is null and olympiad_package_id is null)
         as general_bank_without_topic,
       (select count(*) from public.olympiad_package_questions opq
         where not exists (select 1 from public.questions q
                            where q.id = opq.question_id)) as pool_rows_without_question;

-- 99. Lifetime access survived (CLAUDE.md, non-negotiable). Every purchase must
--     still resolve to a package row.
--
--     olympiad_purchases.olympiad_package_id is ON DELETE RESTRICT and migration
--     111 adds trg_olympiad_package_delete_guard in front of it, so this is
--     doubly unreachable by design — which is exactly why it is worth asserting:
--     the failure it would catch (a purchaser whose package evaporated) is
--     invisible until that parent opens the app.
--
--     The second column is the GRADE-level version of the same harm and is
--     REPORT-ONLY. admin_delete_olympiad_grade_pool can detach a grade, and it
--     now blocks on a purchase entitled to that grade in ANY status — because
--     purchase_olympiad re-activates a refunded row IN PLACE, keeping its
--     grade_id, so a dormant purchase becomes a live entitlement onto a pool
--     that must therefore still exist. It is reported rather than FAILed
--     because remove_olympiad_package_grade (the older, archive-only path)
--     only ever blocked on ACTIVE purchases, so a pre-111 estate can hold rows
--     this column counts and none of them is a new defect. A number that GROWS
--     after 111 is.
select '99_purchased_packages_intact' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as purchases_without_package,
       (select count(*) from public.olympiad_purchases pu
         where pu.grade_id is not null
           and exists (select 1 from public.olympiad_packages p
                        where p.id = pu.olympiad_package_id)
           and not exists (select 1 from public.olympiad_package_grades pg
                            where pg.olympiad_package_id = pu.olympiad_package_id
                              and pg.grade_id = pu.grade_id)) as purchases_off_target_grade
from public.olympiad_purchases pu
where not exists (select 1 from public.olympiad_packages p
                   where p.id = pu.olympiad_package_id);

-- 100. Subscription baskets are intact — the exact corruption a CASCADEd
--      subject delete produces (migration 111).
--
--      subscription_subjects.subject_id is ON DELETE CASCADE, so deleting a
--      subject removes the paid line item and leaves the subscription itself
--      behind. The result is a LIVE subscription covering nothing: the parent
--      keeps being billed, the child sees no subject, and nothing errors.
--      Only trialing/active/past_due count — an ended subscription legitimately
--      keeps no rows.
select '100_subscription_subjects_intact' as check_name,
       case when (select count(*) from public.subscription_subjects ss
                   where not exists (select 1 from public.subjects s
                                      where s.id = ss.subject_id)) = 0
             and (select count(*) from public.child_subscriptions cs
                   where cs.status in ('trialing', 'active', 'past_due')
                     and not exists (select 1 from public.subscription_subjects ss
                                      where ss.child_subscription_id = cs.id)) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from public.subscription_subjects ss
         where not exists (select 1 from public.subjects s
                            where s.id = ss.subject_id)) as lines_without_subject,
       (select count(*) from public.child_subscriptions cs
         where cs.status in ('trialing', 'active', 'past_due')
           and not exists (select 1 from public.subscription_subjects ss
                            where ss.child_subscription_id = cs.id)) as live_subs_without_subjects;

-- 101. The olympiad BULK question purge is scoped, confirmed, and still
--      delegates (migration 112).
--
--      admin_delete_olympiad_questions exists for exactly one reason:
--      purge_question_set applies the answered-question policy to ANY question
--      in the platform, takes a bare uuid[] and knows nothing about packages or
--      callers. The wrapper is what binds an admin-supplied id list to ONE
--      olympiad package. Five things have to hold, and none of them is visible
--      in a browser click-through:
--
--        * purge_question_set must stay unreachable by `authenticated`. The
--          moment a signed-in session can call it, the scope check above it is
--          decoration and any admin session can POST an arbitrary array straight
--          at PostgREST. It is asserted here as well as in check 96 so this
--          check stands on its own;
--        * the wrapper must still CALL it. A body that inlined the split would
--          be a SECOND definition of the one policy CLAUDE.md pins — and the
--          copy is the one that quietly starts hard-deleting answered questions.
--          The negative probe is the same claim from the other side: the only
--          rows this function may remove itself are rotation cache rows, so a
--          question delete in its own body is the drift, not an optimisation;
--        * THE TOKEN-LESS ARITY MUST BE GONE, not merely unused. Adding
--          p_expected_code created a new OVERLOAD rather than replacing the
--          signature, and the old one destroys the same 500 rows with no
--          confirmation at all — the bypass, sitting next to the control;
--        * THE PURCHASED-POOL RULE MUST STILL BE APPLIED, and it must be applied
--          from the SHARED predicate. CLAUDE.md: purchasers keep lifetime
--          access, and emptying a purchased grade's pool revokes it silently.
--          olympiad_grade_pool_blocks refuses that for a whole pool; this
--          function must refuse the selection that reaches the same end state.
--          Check 96 probes olympiad_grade_pool_blocks for the active-only
--          purchase predicate it must NOT carry — a probe that now passes
--          trivially because the predicate MOVED into
--          olympiad_grade_purchase_count. So the delegation is asserted from
--          both sides here, and the any-status rule is re-asserted on the
--          helper that now owns it;
--        * the per-row Delete button must go through the same body. A guarded
--          bulk path next to an unguarded single-row path is not a guard.
--
--      is_admin() is probed too: olympiad pools are an Admin-only module, and a
--      body that lost its gate would still work for every admin who tested it.
with fns (sig, admin_facing) as (values
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', true),
  ('public.admin_delete_olympiad_pool_question(uuid,uuid)', true),
  ('public.purge_question_set(uuid[])', false),
  ('public.olympiad_grade_purchase_count(uuid,uuid)', false),
  ('public.olympiad_pool_purchase_blocks(uuid,uuid[])', false)
), probes (sig, needle, must_exist) as (values
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'public.is_admin()', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'public.purge_question_set(', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'question_not_in_package', true),
  -- A stale id and a foreign id are different accidents; conflating them sends
  -- the admin hunting a selection bug that does not exist.
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'question_gone', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'too_many_questions', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'confirmation_mismatch', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'public.olympiad_pool_purchase_blocks(', true),
  ('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', 'delete from public.questions', false),
  -- The per-row button is a wrapper, never a second implementation.
  ('public.admin_delete_olympiad_pool_question(uuid,uuid)', 'public.admin_delete_olympiad_questions(', true),
  ('public.admin_delete_olympiad_pool_question(uuid,uuid)', 'delete from public.questions', false),
  -- ONE definition of "what counts as a purchase", asserted from both callers…
  ('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', 'public.olympiad_grade_purchase_count(', true),
  ('public.olympiad_pool_purchase_blocks(uuid,uuid[])', 'public.olympiad_grade_purchase_count(', true),
  -- …and ANY status still counts, now that the predicate lives in the helper.
  ('public.olympiad_grade_purchase_count(uuid,uuid)', 'pu.status', false),
  -- ONE definition of the per-grade requirement too: migration 106's override
  -- is resolved by olympiad_grade_config, and a hand-rolled coalesce would
  -- silently ignore it.
  ('public.olympiad_pool_purchase_blocks(uuid,uuid[])', 'public.olympiad_grade_config(', true),
  -- The token-less arity must be GONE. Empty needle: an existing function
  -- trivially contains '' and therefore FAILS this must_exist = false probe,
  -- while an absent one is reported as missing by the CASE below.
  ('public.admin_delete_olympiad_questions(uuid,uuid[])', '', false)
), fn_ok as (
  select f.sig,
         -- CASE, not AND: has_function_privilege() errors on a missing function,
         -- and this check has to REPORT that, not abort the file.
         case when to_regprocedure(f.sig) is null then false
              else (select p.prosecdef
                      and coalesce(p.proconfig, '{}'::text[])
                            @> array['search_path=public, pg_temp']
                      and not has_function_privilege('anon', p.oid, 'EXECUTE')
                      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                          = f.admin_facing
                    from pg_proc p where p.oid = to_regprocedure(f.sig))
         end as ok
  from fns f
), probe_ok as (
  select p.sig, p.needle,
         -- A missing function fails every POSITIVE probe — an absent wrapper is
         -- not a passing result — but SATISFIES a negative one, which is how the
         -- token-less-arity row above reports "correctly gone".
         case when to_regprocedure(p.sig) is null then not p.must_exist
              else (position(p.needle in
                      pg_get_functiondef(to_regprocedure(p.sig))) > 0) = p.must_exist
         end as ok
  from probes p
)
select '101_olympiad_bulk_purge_scoped' as check_name,
       case when (select count(*) filter (where ok) from fn_ok) = 5
             and (select count(*) filter (where not ok) from probe_ok) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) filter (where to_regprocedure(sig) is null) from fns)
         as missing_functions,
       (select count(*) filter (where not ok) from fn_ok) as misconfigured,
       (select count(*) filter (where not ok) from probe_ok) as failed_invariants;

-- 102) Trilingual curriculum (migration 114). topics.name / subtopics.name stay
--      the AZ source of truth; topic_translations / subtopic_translations carry
--      EN and RU only. What each part of this check defends:
--
--        * the two tables must exist WITH RLS and the SAME public-read /
--          admin-write posture as their parent tables — a narrower SELECT would
--          make anon and public surfaces silently fall back to Azerbaijani,
--          which is precisely the bug 114 exists to fix;
--        * ck_*_not_az is the whole "one home per locale" design. An az row here
--          would be a second, drifting copy of topics.name — and the fallback
--          would then depend on which copy a reader happened to hit;
--        * ck_*_name_not_blank is what makes coalesce(tr.name, base.name) unable
--          to render an EMPTY label (the admin action deletes an emptied EN/RU
--          field instead of storing '');
--        * HALF a translation is worse than none: a node carrying en but no ru
--          reads correctly in English and silently Azerbaijani in Russian, and
--          nothing in the product reports it;
--        * the three RPCs must exist at their NEW arities AND actually join the
--          translations tables. A body that kept the signature but lost the join
--          passes every signature probe and still returns Azerbaijani. The OLD
--          arities must be gone: a defaulted parameter ADDS an overload, and
--          every existing caller then fails with "function is not unique".
with cons (c) as (values
  ('uq_topic_locale'), ('ck_topic_tr_not_az'), ('ck_topic_tr_name_not_blank'),
  ('uq_subtopic_locale'), ('ck_subtopic_tr_not_az'), ('ck_subtopic_tr_name_not_blank')
), fns (sig, auth_exec) as (values
  -- test_attempt_result stays service-role only; the other two are learner /
  -- parent facing and are authorized in-body.
  ('public.test_attempt_result(uuid,text)', false),
  ('public.submit_test_attempt(uuid,jsonb,text)', true),
  ('public.get_child_subject_dashboard(uuid,uuid,int,text,text)', true)
), old_sigs (sig) as (values
  ('public.test_attempt_result(uuid)'),
  ('public.submit_test_attempt(uuid,jsonb)'),
  ('public.get_child_subject_dashboard(uuid,uuid,int,text)')
), probes (sig, needle) as (values
  ('public.test_attempt_result(uuid,text)', 'topic_translations'),
  ('public.get_child_subject_dashboard(uuid,uuid,int,text,text)', 'topic_translations'),
  ('public.get_child_subject_dashboard(uuid,uuid,int,text,text)', 'subtopic_translations'),
  -- The mistakes breakdown must group on IDS: a name-based key is
  -- locale-dependent and merges two distinct same-named subtopics.
  ('public.get_child_subject_dashboard(uuid,uuid,int,text,text)', 'group by t.id, st.id'),
  -- submit does not join anything itself — it must PASS the locale on.
  ('public.submit_test_attempt(uuid,jsonb,text)', 'test_attempt_result(p_attempt_id, p_locale)')
), fn_ok as (
  select f.sig,
         -- CASE, not AND: has_function_privilege() errors on a missing function,
         -- and this check has to REPORT that, not abort the file.
         case when to_regprocedure(f.sig) is null then false
              else (select not has_function_privilege('anon', p.oid, 'EXECUTE')
                      and has_function_privilege('authenticated', p.oid, 'EXECUTE') = f.auth_exec
                    from pg_proc p where p.oid = to_regprocedure(f.sig))
         end as ok
  from fns f
), probe_ok as (
  select p.sig, p.needle,
         case when to_regprocedure(p.sig) is null then false
              else position(p.needle in pg_get_functiondef(to_regprocedure(p.sig))) > 0
         end as ok
  from probes p
)
select '102_curriculum_translations' as check_name,
       case when to_regclass('public.topic_translations') is not null
             and to_regclass('public.subtopic_translations') is not null
             and (select count(*) from pg_class c
                    join pg_namespace ns on ns.oid = c.relnamespace
                   where ns.nspname = 'public'
                     and c.relname in ('topic_translations', 'subtopic_translations')
                     and c.relrowsecurity) = 2
             and (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('topic_translations', 'subtopic_translations')) = 4
             and (select count(*) from cons
                   where exists (select 1 from pg_constraint pc where pc.conname = cons.c)) = 6
             -- az lives in topics.name / subtopics.name and nowhere else.
             and not exists (select 1 from public.topic_translations where locale = 'az')
             and not exists (select 1 from public.subtopic_translations where locale = 'az')
             -- No empty label can reach a reader.
             and not exists (select 1 from public.topic_translations where btrim(name) = '')
             and not exists (select 1 from public.subtopic_translations where btrim(name) = '')
             -- Every translated node carries BOTH en and ru.
             and not exists (select 1 from public.topic_translations
                              group by topic_id having count(distinct locale) <> 2)
             and not exists (select 1 from public.subtopic_translations
                              group by subtopic_id having count(distinct locale) <> 2)
             -- Coverage of the 2026 curriculum tree (260 / 1077). Olympiad-scoped
             -- topics are importer artefacts and are deliberately NOT counted.
             and (select count(*) from public.topics t
                   where t.scope = 'exam'
                     and exists (select 1 from public.topic_translations tr
                                  where tr.topic_id = t.id and tr.locale = 'en')
                     and exists (select 1 from public.topic_translations tr
                                  where tr.topic_id = t.id and tr.locale = 'ru')) >= 260
             and (select count(*) from public.subtopics st
                    join public.topics t on t.id = st.topic_id and t.scope = 'exam'
                   where exists (select 1 from public.subtopic_translations sr
                                  where sr.subtopic_id = st.id and sr.locale = 'en')
                     and exists (select 1 from public.subtopic_translations sr
                                  where sr.subtopic_id = st.id and sr.locale = 'ru')) >= 1077
             and (select count(*) filter (where ok) from fn_ok) = 3
             and (select count(*) filter (where not ok) from probe_ok) = 0
             and (select count(*) from old_sigs
                   where to_regprocedure(old_sigs.sig) is not null) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) filter (where not ok) from fn_ok)    as rpc_misconfigured,
       (select count(*) filter (where not ok) from probe_ok) as failed_invariants,
       (select count(*) from old_sigs
         where to_regprocedure(old_sigs.sig) is not null)    as stale_overloads;


-- 103) Question reports (migration 115). The feature's whole safety argument is
--      that the CLIENT supplies only a question id, a message and two
--      enum-constrained hints, so this check defends the machinery that makes
--      that true:
--
--        * both enums must carry EXACTLY their label sets. Application code
--          whitelists against these values and nothing else, so a widened enum
--          is a widened trust boundary;
--        * RLS must be on with EXACTLY three policies and NO delete policy, and
--          `authenticated` must not hold the blanket DELETE grant 010 hands out
--          — a report is evidence, and its subject is the person who filed it;
--        * uq_question_reports_open_per_reporter must keep its
--          status in ('new','in_review') PREDICATE. Without it the index still
--          exists and still looks right, but it blocks a second report on the
--          same question FOREVER, long after the first was resolved;
--        * both triggers must be ATTACHED. A dropped derive trigger fails
--          nothing visible: inserts keep succeeding and every context column
--          becomes whatever the client sent, reporter_profile_id included;
--        * question_report_derive and submit_question_report must stay SECURITY
--          DEFINER with a pinned search_path and no anon EXECUTE (derive reads
--          questions/test_attempts with RLS bypassed, which is exactly why).
--          question_report_freeze is deliberately NOT definer — it touches no
--          table — but its search_path is pinned all the same;
--        * body probes, because a body can lose a guard while keeping its
--          signature: current_profile_id( proves the reporter is still resolved
--          server-side, 'rate limited' proves the throttle survived, and
--          old.message proves an admin still cannot rewrite a report.
with enums (typname, labels) as (values
  ('question_report_status', 'dismissed,in_review,new,resolved'),
  ('report_platform', 'android,ios,web')
), enum_ok as (
  select e.typname,
         coalesce((select string_agg(l.enumlabel, ',' order by l.enumlabel)
                     from pg_enum l
                     join pg_type ty on ty.oid = l.enumtypid
                     join pg_namespace ns on ns.oid = ty.typnamespace
                    where ns.nspname = 'public' and ty.typname = e.typname), '')
           = e.labels as ok
  from enums e
), fns (sig, definer) as (values
  ('public.submit_question_report(uuid,uuid,text,text,text,text)', true),
  ('public.question_report_derive()', true),
  -- Least privilege: the freeze trigger reads no table, so it stays INVOKER.
  ('public.question_report_freeze()', false)
), fn_ok as (
  select f.sig,
         -- CASE, not AND: has_function_privilege() errors on a missing
         -- function, and this check has to REPORT that, not abort the file.
         case when to_regprocedure(f.sig) is null then false
              else (select p.prosecdef = f.definer
                      and coalesce(p.proconfig, '{}'::text[])
                            @> array['search_path=public, pg_temp']
                      and not has_function_privilege('anon', p.oid, 'EXECUTE')
                    from pg_proc p where p.oid = to_regprocedure(f.sig))
         end as ok
  from fns f
), probes (sig, needle) as (values
  ('public.question_report_derive()', 'current_profile_id('),
  ('public.question_report_derive()', 'rate limited'),
  ('public.question_report_freeze()', 'old.message')
), probe_ok as (
  select p.sig, p.needle,
         case when to_regprocedure(p.sig) is null then false
              else position(p.needle in pg_get_functiondef(to_regprocedure(p.sig))) > 0
         end as ok
  from probes p
), tbl_ok as (
  -- has_table_privilege() RAISES on a missing table, so it is guarded the
  -- same way: a missing table has to FAIL this check, not abort the file.
  select case when to_regclass('public.question_reports') is null then false
              else not has_table_privilege('authenticated',
                                           'public.question_reports', 'DELETE')
         end as ok
)
select '103_question_reports_hardened' as check_name,
       case when to_regclass('public.question_reports') is not null
             and (select count(*) filter (where not ok) from enum_ok) = 0
             and (select count(*) from pg_class c
                    join pg_namespace ns on ns.oid = c.relnamespace
                   where ns.nspname = 'public'
                     and c.relname = 'question_reports'
                     and c.relrowsecurity) = 1
             and (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'question_reports') = 3
             and (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'question_reports'
                     and policyname in
                         ('qreports_select','qreports_insert','qreports_update')) = 3
             and not exists (select 1 from pg_policies
                              where schemaname = 'public'
                                and tablename = 'question_reports' and cmd = 'DELETE')
             and (select ok from tbl_ok)
             -- The partial predicate IS the duplicate rule.
             and exists (select 1 from pg_indexes
                          where schemaname = 'public'
                            and indexname = 'uq_question_reports_open_per_reporter'
                            and indexdef like '%in_review%')
             and (select count(*) from pg_trigger
                   where tgrelid = to_regclass('public.question_reports')
                     and tgname in ('trg_question_report_derive',
                                    'trg_question_report_freeze',
                                    'trg_set_updated_at')) = 3
             and (select count(*) filter (where not ok) from fn_ok) = 0
             and (select count(*) filter (where not ok) from probe_ok) = 0
             -- The one function an app is supposed to call.
             and to_regprocedure(
                   'public.submit_question_report(uuid,uuid,text,text,text,text)')
                 is not null
             and has_function_privilege('authenticated',
                   'public.submit_question_report(uuid,uuid,text,text,text,text)',
                   'EXECUTE')
            then 'PASS' else 'FAIL' end as status,
       (select count(*) filter (where not ok) from enum_ok)  as bad_enums,
       (select count(*) filter (where not ok) from fn_ok)    as misconfigured_functions,
       (select count(*) filter (where not ok) from probe_ok) as failed_invariants,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'question_reports') as policy_count;


-- 104) Bug reports WITHDRAWN + the question-report reply loop (migration 117).
--      This check previously asserted that public.bug_reports existed and was
--      hardened. The owner retired that feature on 2026-08-17 — the platform
--      keeps ONE reports section, question reports ("Sual bildirişləri"), and a
--      report never sends outbound email — so the check is INVERTED. It now
--      proves three things:
--
--        * THE REMOVAL HAPPENED. A half-applied withdrawal is invisible: a
--          surviving bug_report_derive() or a surviving bug_report_status enum
--          breaks nothing at runtime and is therefore never noticed — until
--          someone reads 001 or 008, finds the leftovers, and rebuilds a
--          feature the owner deliberately removed;
--        * IT TOOK NOTHING ELSE WITH IT. public.report_platform is the casualty
--          this removal invites: migration 116's rollback notes name it as one
--          of "its" types, but it belongs to migration 115 and
--          question_reports.platform is defined on it — dropping it breaks the
--          feature the withdrawal exists to keep. The two contact settings are
--          asserted for the opposite reason: the website's mailto links are now
--          the ONLY way to write in, so a blank address is worse after this
--          change than it was before it, and get_mobile_config() must still
--          carry info_email or the mobile contact screen can never show it;
--        * THE REPLACEMENT IS ARMED. The in-app reply loop is the entire
--          user-visible half of the change: taking a report into review,
--          resolving it or dismissing it notifies the reporter. It must be
--          attached to question_reports, go through create_notification (the
--          single insert path), keep its per-(report, status) idempotency key
--          so one transition is one notification, skip reports whose reporter
--          profile is NULL (anonymous, or an account since deleted), and carry
--          all three languages. Its posture matters as much as its presence:
--          SECURITY DEFINER because create_notification is service-role only
--          while the administrator firing the trigger is `authenticated`,
--          search_path pinned, and NO end-user EXECUTE — a caller who could
--          invoke a trigger function directly could forge its notification.
with gone_types (typname) as (values
  ('bug_report_status'), ('bug_report_priority'), ('report_reporter_role')
), gone_fns (sig) as (values
  ('public.submit_bug_report(text,text,text,text,text,text,text,text,text,text,text,text)'),
  ('public.bug_report_derive()'),
  ('public.bug_report_freeze()')
), settings (key) as (values
  ('contact.info_email'), ('contact.support_email')
), setting_ok as (
  -- Present AND non-blank. Migration 019 seeded support_email as '""', and that
  -- blank is what the placeholder address on the live contact page was.
  select s.key,
         coalesce((select btrim(coalesce(ss.value_json->>0, ''))
                     from public.system_settings ss
                    where ss.key = s.key), '') <> '' as ok
  from settings s
), notifier as (
  select to_regprocedure('public.notify_question_report_status_tg()') as fn
), notifier_ok as (
  -- CASE, not AND: has_function_privilege() errors on a missing function, and
  -- this check has to REPORT that, not abort the file.
  select case when (select fn from notifier) is null then false
              else (select p.prosecdef
                      and coalesce(p.proconfig, '{}'::text[])
                            @> array['search_path=public, pg_temp']
                      and not has_function_privilege('anon', p.oid, 'EXECUTE')
                      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    from pg_proc p where p.oid = (select fn from notifier))
         end as ok
), probes (needle) as (values
  -- The single insert path, never a second one.
  ('create_notification'),
  -- The idempotency key format IS the once-per-transition guarantee.
  ('''qreport:'' || new.id::text'),
  -- An anonymous or deleted reporter has no inbox to write to.
  ('reporter_profile_id is null'),
  -- One needle per language: copy that lost a branch is not trilingual copy.
  ('Bildirişin'), ('Your report'), ('сообщение')
), probe_ok as (
  select p.needle,
         case when (select fn from notifier) is null then false
              else position(p.needle in
                     pg_get_functiondef((select fn from notifier))) > 0
         end as ok
  from probes p
)
select '104_bug_reports_withdrawn' as check_name,
       case when to_regclass('public.bug_reports') is null
             and not exists (select 1 from pg_type t
                               join pg_namespace n on n.oid = t.typnamespace
                              where n.nspname = 'public'
                                and t.typname in (select g.typname from gone_types g))
             and (select count(*) from gone_fns g
                   where to_regprocedure(g.sig) is not null) = 0
             and not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'bug_reports')
             -- The survivor half.
             and (select string_agg(l.enumlabel, ',' order by l.enumlabel)
                    from pg_enum l
                    join pg_type ty on ty.oid = l.enumtypid
                    join pg_namespace ns on ns.oid = ty.typnamespace
                   where ns.nspname = 'public' and ty.typname = 'report_platform')
                 = 'android,ios,web'
             and to_regclass('public.question_reports') is not null
             and exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'question_reports'
                            and column_name = 'platform'
                            and udt_name = 'report_platform')
             and to_regprocedure(
                   'public.submit_question_report(uuid,uuid,text,text,text,text)')
                 is not null
             and (select count(*) filter (where not ok) from setting_ok) = 0
             and (public.get_mobile_config()->'contact' ? 'info_email')
             -- The replacement half.
             and exists (select 1 from pg_trigger
                          where tgname = 'trg_notify_question_report_status'
                            and tgrelid = to_regclass('public.question_reports')
                            and tgfoid = (select fn from notifier)
                            and not tgisinternal)
             and (select ok from notifier_ok)
             and (select count(*) filter (where not ok) from probe_ok) = 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from pg_type t
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public'
           and t.typname in (select g.typname from gone_types g)) as surviving_bug_enums,
       (select count(*) from gone_fns g
         where to_regprocedure(g.sig) is not null)                 as surviving_bug_functions,
       (select count(*) filter (where not ok) from setting_ok)     as blank_contact_settings,
       (select count(*) filter (where not ok) from probe_ok)       as failed_invariants;

-- 105. PRORATION AND THE SHARED CHILD CYCLE ARE RETIRED (owner, 2026-08-17;
--      migration 118). Every subject is billed on its OWN cycle, starting the
--      day it is added.
--
--      This check exists because the retired model is easy to bring back by
--      accident. Its two functions were thin wrappers, so re-creating either
--      one looks harmless in review — and the moment it exists, a caller that
--      omits the per-subject cycles reaches it again, composes a basket by a
--      SECOND rule, and mis-bills silently. So: they must be gone, under any
--      overload, and the pair that replaced them must still be locked down and
--      still behave the way the parent-facing copy promises.
--
--      The three body probes are the promises the UI now prints:
--        * adds and CYCLE CHANGES are gated by the payment kill switch while a
--          removal stays legal (a parent can always stop paying);
--        * an added subject opens a FULL period at now() — "the cycle starts
--          today and is charged in full" is false if this ever changes;
--        * the quote reports prorated = false, i.e. the preview and the charge
--          agree that nothing is split by days.
--
--      prorated_add_rows is REPORT-ONLY: ledger rows written BEFORE this
--      decision legitimately carry a fractional remaining_ratio and must stay
--      readable exactly as they were. A rising count on a live database is the
--      signal that a prorating writer came back.
select '105_subject_change_proration_retired' as check_name,
       case when to_regprocedure('public.quote_subject_change(uuid,uuid[],uuid[])') is null
             and to_regprocedure('public.apply_subject_change(uuid,uuid[],uuid[],text)') is null
             and not exists (select 1 from pg_proc p
                               join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public'
                                and p.proname in ('quote_subject_change',
                                                  'apply_subject_change'))
             and to_regprocedure('public.quote_plan_change(uuid,jsonb)') is not null
             and to_regprocedure('public.apply_plan_change(uuid,jsonb,text)') is not null
             and has_function_privilege('anon','public.quote_plan_change(uuid,jsonb)','EXECUTE') = false
             and has_function_privilege('authenticated','public.apply_plan_change(uuid,jsonb,text)','EXECUTE') = false
             and position('v_adds > 0 or v_changes > 0' in
                   pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure)) > 0
             and position('now() + case v_row.iv' in
                   pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure)) > 0
             and position('''prorated'',               false' in
                   pg_get_functiondef('public.quote_plan_change(uuid,jsonb)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end as status,
       (select count(*) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('quote_subject_change','apply_subject_change'))
         as surviving_wrappers,
       (select count(*) from public.subscription_changes
         where change_type = 'add'
           and (remaining_ratio is distinct from 1 or period_days is not null))
         as prorated_add_rows;


-- 106) TRILINGUAL EXPLANATIONS (migration 119). question_explanations has been
--      trilingual BY SHAPE since 004 -- per-locale rows, a unique (question,
--      locale) key, locale-agnostic RLS. What was missing was a write path that
--      preserved a translation and a read path that admitted when it had none.
--
--      This check pins three things that are individually invisible when they
--      break:
--
--        * THE IMPORTER MUST NOT COUPLE EXPLANATION TO BODY. Both bulk RPCs
--          used to nest the question_explanations insert inside the
--          `... and translations->loc->>'body' <> ''` guard, so a row carrying
--          an en explanation but no en body lost it with NO row and NO error --
--          not even an entry in the per-item errors array. That is the failure
--          mode worth pinning: a silent drop looks exactly like a successful
--          import, and the loss is only discovered by a reader months later.
--
--        * get_test_review MUST DISCLOSE THE FALLBACK IN BOTH BRANCHES. It
--          resolves reader-locale-then-az from the live tables AND from a
--          daily round's frozen content_snapshot. One hit instead of two means
--          half the readers are shown Azerbaijani text labelled as their own
--          language. The az fallback itself is pinned too: 'fixing' the
--          disclosure by serving only the reader's locale would blank the
--          explanation for every en/ru reader.
--
--        * THE PAYLOAD SHAPE MUST NOT MOVE. `explanation` stays a nullable
--          STRING. The shipped mobile binary casts this payload without
--          validating it, and expo-updates cannot reach a build whose
--          runtimeVersion differs from the app version -- reshaping the key
--          into an object would strand every installed app with no way back.
--          The new keys are additive for exactly that reason.
--
--      The az/en/ru counts are REPORT-ONLY and never gate PASS: on a from-zero
--      rebuild they are all 0, and on a live database they are the coverage
--      gap this work exists to close (they moved from 2897/0/0 the moment real
--      translations landed). Read them from an ADMIN session -- qexpl_select
--      hides another author's in-review explanations from a Content Manager
--      without content.review, so a non-admin undercount is RLS doing its job,
--      not missing data.
with sigs(sig) as (
  values ('public.bulk_insert_questions(jsonb,text)'),
         ('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'),
         ('public.get_test_review(uuid,text)')
),
fn_ok as (
  select sig,
         to_regprocedure(sig) is not null as present,
         -- Guarded exactly like checks 103/104: has_function_privilege raises
         -- on a missing function, so a regression would abort 013 instead of
         -- reporting FAIL.
         case when to_regprocedure(sig) is null then false
              else not has_function_privilege('anon', sig, 'EXECUTE') end as anon_blocked,
         case when to_regprocedure(sig) is null then false
              else has_function_privilege('authenticated', sig, 'EXECUTE')
               and has_function_privilege('service_role', sig, 'EXECUTE') end as granted
  from sigs
),
importers as (
  select sig,
         case when to_regprocedure(sig) is null then null
              else pg_get_functiondef(sig::regprocedure) end as def
  from sigs where sig <> 'public.get_test_review(uuid,text)'
),
importer_ok as (
  select sig,
         coalesce(
           def is not null
         -- the OLD coupled guard is gone ...
         and position($p$'az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body'$p$
                      in def) = 0
         -- ... the explanation is still written ...
         and position('insert into public.question_explanations' in def) > 0
         -- ... and the payload contract is unchanged, so legacy az-only files
         -- still import exactly as they always did.
         and position($p$->'translations'->v_loc->>'explanation'$p$ in def) > 0,
           false) as ok
  from importers
),
review as (
  select case when to_regprocedure('public.get_test_review(uuid,text)') is null then null
              else pg_get_functiondef('public.get_test_review(uuid,text)'::regprocedure)
         end as def
),
review_ok as (
  select coalesce(
           def is not null
         -- two branches: live tables + frozen daily-round snapshot
         and (length(def) - length(replace(def, 'explanation_is_fallback', '')))
             / length('explanation_is_fallback') = 2
         and (length(def) - length(replace(def, 'explanation_locale', '')))
             / length('explanation_locale') = 2
         and position('e.loc_ex, e.az_ex' in def) > 0
         and position($p$'explanation', coalesce(e.loc_ex, e.az_ex)$p$ in def) > 0,
           false) as ok
  from review
),
cov as (
  select count(*) filter (where qe.locale = 'az') as az_rows,
         count(*) filter (where qe.locale = 'en') as en_rows,
         count(*) filter (where qe.locale = 'ru') as ru_rows
    from public.question_explanations qe
    join public.questions q on q.id = qe.question_id
   where q.olympiad_package_id is null   -- general bank only, as the admin UI counts
)
select '106_trilingual_explanations' as check_name,
       case when (select count(*) filter (where not present) from fn_ok) = 0
             and (select count(*) filter (where not anon_blocked) from fn_ok) = 0
             and (select count(*) filter (where not granted) from fn_ok) = 0
             and (select count(*) filter (where not ok) from importer_ok) = 0
             and (select ok from review_ok)
             -- The abuse ceiling. Inline+VALID from 004 on a fresh build,
             -- NOT VALID when migration 119 added it to a live database, so
             -- convalidated deliberately is NOT asserted -- only that it exists.
             and exists (select 1 from pg_constraint
                          where conrelid = 'public.question_explanations'::regclass
                            and conname = 'ck_qexpl_body_len')
            then 'PASS' else 'FAIL' end as status,
       (select count(*) filter (where not present or not anon_blocked or not granted)
          from fn_ok)                                as misconfigured_functions,
       (select count(*) filter (where not ok) from importer_ok) as coupled_importers,
       (select az_rows from cov)                     as explanations_az,
       (select en_rows from cov)                     as explanations_en,
       (select ru_rows from cov)                     as explanations_ru;

-- =============================================================================
-- End of 013_validation_queries.sql
-- =============================================================================
