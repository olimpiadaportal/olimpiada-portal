-- =============================================================================
-- supabase/sql/tests/rls_behavioral_tests.sql
-- =============================================================================
-- Stage 3 behavioral verification of the RLS / RBAC "Done When" criteria.
-- NOT a canonical schema file and NOT a migration: it is a repeatable test.
--
-- It seeds throwaway users/data, simulates each role by setting the Supabase
-- `request.jwt.claims` GUC + `set role authenticated`, asserts visibility, and
-- ROLLS BACK at the end so nothing persists. Run against dev/staging only:
--   psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/tests/rls_behavioral_tests.sql
--
-- Each result row prints PASS/FAIL. Investigate any FAIL.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

-- ----- Setup (as table owner; RLS bypassed) ----------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','a@test.local'),
  ('22222222-2222-2222-2222-222222222222','b@test.local'),
  ('33333333-3333-3333-3333-333333333333','p@test.local'),
  ('44444444-4444-4444-4444-444444444444','admin@test.local'),
  ('55555555-5555-5555-5555-555555555555','cm@test.local');

-- handle_new_user trigger has created the profiles; activate them.
update public.profiles set status='active'
 where auth_user_id in (
   '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
   '55555555-5555-5555-5555-555555555555');

insert into public.students (profile_id) select id from public.profiles where auth_user_id='11111111-1111-1111-1111-111111111111';
insert into public.students (profile_id) select id from public.profiles where auth_user_id='22222222-2222-2222-2222-222222222222';
insert into public.parents  (profile_id) select id from public.profiles where auth_user_id='33333333-3333-3333-3333-333333333333';

insert into public.profile_roles (profile_id, role_id)
 select p.id, r.id from public.profiles p join public.roles r on r.code='student'
 where p.auth_user_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
insert into public.profile_roles (profile_id, role_id)
 select p.id, r.id from public.profiles p join public.roles r on r.code='parent'
 where p.auth_user_id='33333333-3333-3333-3333-333333333333';
insert into public.profile_roles (profile_id, role_id)
 select p.id, r.id from public.profiles p join public.roles r on r.code='administrator'
 where p.auth_user_id='44444444-4444-4444-4444-444444444444';
insert into public.profile_roles (profile_id, role_id)
 select p.id, r.id from public.profiles p join public.roles r on r.code='content_manager'
 where p.auth_user_id='55555555-5555-5555-5555-555555555555';

-- parent linked to student A (active)
insert into public.parent_student_links (parent_profile_id, student_profile_id, status, verified_at)
 select pp.id, sp.id, 'active', now()
 from public.profiles pp, public.profiles sp
 where pp.auth_user_id='33333333-3333-3333-3333-333333333333'
   and sp.auth_user_id='11111111-1111-1111-1111-111111111111';

insert into public.tests (id, title, status)
 values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','RLS Test','published');
insert into public.test_attempts (test_id, student_profile_id)
 select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id from public.profiles where auth_user_id='11111111-1111-1111-1111-111111111111';
insert into public.test_attempts (test_id, student_profile_id)
 select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id from public.profiles where auth_user_id='22222222-2222-2222-2222-222222222222';

insert into public.payments (profile_id, amount)
 select id, 9.99 from public.profiles where auth_user_id='44444444-4444-4444-4444-444444444444';

-- ----- Scenario: Student A ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
set local role authenticated;
select 'A1 student A sees only own attempt' as check,
       case when (select count(*) from public.test_attempts) = 1 then 'PASS' else 'FAIL' end as status;
reset role;

-- ----- Scenario: Student B ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;
select 'B1 student B cannot see student A attempt' as check,
       case when (select count(*) from public.test_attempts ta
                  join public.profiles p on p.id = ta.student_profile_id
                  where p.auth_user_id='11111111-1111-1111-1111-111111111111') = 0
            then 'PASS' else 'FAIL' end as status;
reset role;

-- ----- Scenario: Parent linked to A ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
set local role authenticated;
select 'P1 parent sees linked student A attempt' as check,
       case when (select count(*) from public.test_attempts ta
                  join public.profiles p on p.id = ta.student_profile_id
                  where p.auth_user_id='11111111-1111-1111-1111-111111111111') = 1
            then 'PASS' else 'FAIL' end as status;
select 'P2 parent cannot see unlinked student B attempt' as check,
       case when (select count(*) from public.test_attempts ta
                  join public.profiles p on p.id = ta.student_profile_id
                  where p.auth_user_id='22222222-2222-2222-2222-222222222222') = 0
            then 'PASS' else 'FAIL' end as status;
reset role;

-- ----- Scenario: Administrator -----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
set local role authenticated;
select 'AD1 admin sees both attempts' as check,
       case when (select count(*) from public.test_attempts) = 2 then 'PASS' else 'FAIL' end as status;
select 'AD2 admin can read payments' as check,
       case when (select count(*) from public.payments) >= 1 then 'PASS' else 'FAIL' end as status;
select 'AD3 admin can read audit_logs' as check,
       case when (select count(*) from public.audit_logs) >= 1 then 'PASS' else 'FAIL' end as status;
with u as (update public.audit_logs set severity = 'info' returning 1)
select 'AD4 audit_logs is immutable (no UPDATE policy)' as check,
       case when (select count(*) from u) = 0 then 'PASS' else 'FAIL' end as status;
reset role;

-- ----- Scenario: Content Manager ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
set local role authenticated;
select 'CM1 content manager cannot read payments' as check,
       case when (select count(*) from public.payments) = 0 then 'PASS' else 'FAIL' end as status;
select 'CM2 content manager cannot read audit_logs' as check,
       case when (select count(*) from public.audit_logs) = 0 then 'PASS' else 'FAIL' end as status;
select 'CM3 content manager cannot read system_settings' as check,
       case when (select count(*) from public.system_settings) = 0 then 'PASS' else 'FAIL' end as status;
select 'CM4 content manager cannot read student attempts' as check,
       case when (select count(*) from public.test_attempts) = 0 then 'PASS' else 'FAIL' end as status;
reset role;

-- ----- Scenario: Anonymous ---------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select 'AN1 anon cannot read attempts' as check,
       case when (select count(*) from public.test_attempts) = 0 then 'PASS' else 'FAIL' end as status;
select 'AN2 anon cannot read profiles' as check,
       case when (select count(*) from public.profiles) = 0 then 'PASS' else 'FAIL' end as status;
reset role;

rollback;
-- All test data above is discarded by ROLLBACK.
