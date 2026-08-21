-- =============================================================================
-- STAGING SMOKE SEED — synthetic content so the PAID OLYMPIAD rail can be
-- exercised end to end against AzeriCard's test terminal.
--
-- RUN IT LIKE THIS, AND ONLY LIKE THIS:
--     psql "$OLIMPIADA_STAGING_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/seed/staging_smoke_seed.sql
--
--   * `-1` matters: the JWT claims this script sets are TRANSACTION-LOCAL, so
--     without it `bulk_insert_olympiad_package_questions` sees no administrator
--     and refuses. There is deliberately no `begin;`/`commit;` inside the file —
--     a self-transacting SQL file is the exact shape that destroyed this
--     project's production data once (see CLAUDE.md, migration 2026_07_29_095).
--   * NEVER against `OLIMPIADA_PROD_DB_URL`. The guard below refuses anyway.
--
-- WHY THIS FILE EXISTS. The admin panel is not deployed to staging, so there is
-- no UI route to create an olympiad package or upload a question pool there.
-- Migration 127 put the paid olympiad purchase on the checkout-intent rail and
-- nothing has ever exercised it — a package with a real pool is the minimum
-- that makes that test possible.
--
-- WHY IT GOES THROUGH THE ADMIN RPC RATHER THAN RAW INSERTS. Pool questions
-- carry translations, options, option translations, a topic in the `olympiad`
-- scope, a duplicate-content key and a published status. Hand-writing those
-- inserts would seed a pool no real import could ever produce, and the first
-- thing it would prove is that the seed is wrong. So the script mints a
-- synthetic ADMINISTRATOR identity, presents it as JWT claims, and calls the
-- same `bulk_insert_olympiad_package_questions` the admin panel calls.
--
-- The synthetic identity has NO PASSWORD and no confirmed email, so it cannot
-- be signed into. It exists to satisfy the `profiles.auth_user_id` foreign key
-- and to be the `created_by` on the rows it writes.
--
-- IDEMPOTENT: re-running is a no-op once the package exists (the pool import is
-- skipped rather than appended to, so the count stays at 30).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GUARD — refuse to run against a database that holds real people.
--
-- Keyed on DATA, not on a connection string, because the connection string is
-- the thing a tired operator gets wrong. Production carries students and
-- payments; a staging database seeded from canonical SQL carries neither. If
-- this ever fires, the answer is NOT to weaken it.
-- -----------------------------------------------------------------------------
do $$
declare
  v_students int;
  v_payments int;
  v_profiles int;
begin
  select count(*) into v_students from public.students;
  select count(*) into v_payments from public.payments;
  select count(*) into v_profiles from public.profiles where display_name <> 'Staging Seed Operator';

  if v_students > 0 or v_payments > 0 or v_profiles > 0 then
    raise exception
      'REFUSING: this database holds real data (% students, % payments, % human profiles). staging_smoke_seed.sql is STAGING-ONLY.',
      v_students, v_payments, v_profiles
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 — the synthetic administrator, and the claims that make it current.
-- -----------------------------------------------------------------------------
do $$
declare
  v_auth uuid := '00000000-0000-4000-8000-00000000ad11';
  v_profile uuid;
  v_role uuid;
begin
  insert into auth.users (id, email)
  values (v_auth, 'staging-seed@olympiq.invalid')
  on conflict (id) do nothing;

  select id into v_profile from public.profiles where auth_user_id = v_auth;
  if v_profile is null then
    insert into public.profiles (auth_user_id, display_name, email, status)
    values (v_auth, 'Staging Seed Operator', 'staging-seed@olympiq.invalid', 'active')
    returning id into v_profile;
  end if;

  select id into v_role from public.roles where code = 'administrator';
  if v_role is null then
    raise exception 'no administrator role — is this database bootstrapped from canonical SQL?';
  end if;

  insert into public.profile_roles (profile_id, role_id)
  values (v_profile, v_role)
  on conflict do nothing;
end $$;

-- `is_local := true` — these claims die with the transaction, which is why the
-- whole file must run under `psql -1`.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000ad11","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ad11', true);
select set_config('role', 'authenticated', true);

do $$
begin
  if not public.is_admin() then
    raise exception 'claims did not take: public.is_admin() is false. Did you forget psql -1?';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2 — the package, its target grade, and its trilingual listing.
--
-- Created `inactive`. Activation happens at the END, after the pool exists, so
-- `trg_olympiad_activation_pool_guard` has something to approve — that guard is
-- the DB half of the Round-51 rule that a package may not be activated while a
-- target grade's published pool is smaller than `questions_per_attempt`.
-- -----------------------------------------------------------------------------
do $$
declare
  v_pkg     uuid;
  v_subject uuid;
  v_type    uuid;
  v_grade   uuid;
  v_admin   uuid;
begin
  select id into v_admin from public.profiles where auth_user_id = '00000000-0000-4000-8000-00000000ad11';
  select id into v_subject from public.subjects where code = 'math';
  select id into v_type from public.olympiad_types order by created_at limit 1;
  select id into v_grade from public.grades where name = '5. sinif';

  if v_subject is null or v_type is null or v_grade is null then
    raise exception 'missing reference data (subject=%, type=%, grade=%)', v_subject, v_type, v_grade;
  end if;

  select id into v_pkg from public.olympiad_packages where code = 'STG-MATH-SMOKE';
  if v_pkg is null then
    insert into public.olympiad_packages
      (code, subject_id, grade_id, olympiad_type_id, price_amount, currency,
       questions_per_attempt, duration_minutes, status, created_by)
    values
      ('STG-MATH-SMOKE', v_subject, v_grade, v_type, 5.00, 'AZN',
       25, 30, 'inactive', v_admin)
    returning id into v_pkg;
  end if;

  insert into public.olympiad_package_grades
    (olympiad_package_id, grade_id, questions_per_attempt, duration_minutes)
  values (v_pkg, v_grade, 25, 30)
  on conflict do nothing;

  insert into public.olympiad_package_translations (olympiad_package_id, locale, title, description)
  values
    (v_pkg, 'az', 'Riyaziyyat sınaq paketi (staging)',
     'Yalnız sınaq mühiti üçün nəzərdə tutulmuş süni məzmun. Real olimpiada materialı deyil.'),
    (v_pkg, 'en', 'Mathematics test package (staging)',
     'Synthetic content for the staging environment only. Not real olympiad material.'),
    (v_pkg, 'ru', 'Тестовый пакет по математике (staging)',
     'Синтетический контент только для тестовой среды. Не является реальным олимпиадным материалом.')
  on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- 3 — 30 published questions in the 5th-grade pool.
--
-- 30, not 25, so the Round-51 per-student non-repeating rotation has headroom:
-- a second attempt must be able to draw questions the first one did not, and a
-- pool of exactly `questions_per_attempt` makes every attempt identical and
-- proves nothing about the rotation.
--
-- Each row is a single-choice multiplication question with EXACTLY 5 options
-- (Round 20) and exactly one correct answer, in all three locales including
-- explanations. The correct option's slot rotates with the row index, so a
-- client that always picks A scores 20%, not 100% — an attempt UI that looks
-- right against an always-A pool is not actually tested.
-- -----------------------------------------------------------------------------
do $$
declare
  v_pkg   uuid;
  v_grade uuid;
  v_have  int;
  v_json  jsonb;
  v_res   jsonb;
begin
  select id into v_pkg from public.olympiad_packages where code = 'STG-MATH-SMOKE';
  select id into v_grade from public.grades where name = '5. sinif';

  select count(*) into v_have
  from public.questions
  where olympiad_package_id = v_pkg and grade_id = v_grade;

  if v_have > 0 then
    raise notice 'pool already holds % question(s) — skipping import (this script is idempotent)', v_have;
    return;
  end if;

  with n as (
    select i,
           (i % 8) + 3           as a,   -- 3..10
           ((i * 3) % 7) + 4     as b    -- 4..10
    from generate_series(1, 30) as i
  ),
  q as (
    select i, a, b, a * b as correct, i % 5 as correct_slot from n
  ),
  o as (
    select q.i,
           slot,
           (slot = q.correct_slot) as is_correct,
           case
             when slot = q.correct_slot           then q.correct
             when slot = (q.correct_slot + 1) % 5 then q.correct + 1
             when slot = (q.correct_slot + 2) % 5 then q.correct - 1
             when slot = (q.correct_slot + 3) % 5 then q.correct + 10
             else                                      q.correct + 100
           end as val
    from q cross join generate_series(0, 4) as slot
  ),
  packed as (
    select q.i,
           jsonb_build_object(
             'primary_locale', 'az',
             -- No `meta.type`: the importer resolves that key by question_types
             -- **name** ("Single choice"), while its no-key default resolves by
             -- **code** ('single_choice'). Sending the code as a name is the
             -- one spelling that fails, so the default is both correct and the
             -- thing a real upload does.
             'meta', jsonb_build_object(
               'topic', 'Ədədlər və əməllər',
               'subtopic', 'Vurma'
             ),
             'translations', jsonb_build_object(
               'az', jsonb_build_object(
                 'body', format('%s × %s hasilini hesablayın.', q.a, q.b),
                 'explanation', format('%s × %s = %s.', q.a, q.b, q.correct)),
               'en', jsonb_build_object(
                 'body', format('Calculate %s × %s.', q.a, q.b),
                 'explanation', format('%s × %s = %s.', q.a, q.b, q.correct)),
               'ru', jsonb_build_object(
                 'body', format('Вычислите %s × %s.', q.a, q.b),
                 'explanation', format('%s × %s = %s.', q.a, q.b, q.correct))
             ),
             'options', (
               select jsonb_agg(
                        jsonb_build_object(
                          'is_correct', o.is_correct,
                          'order_index', o.slot,
                          'text', jsonb_build_object(
                            'az', o.val::text, 'en', o.val::text, 'ru', o.val::text)
                        ) order by o.slot)
               from o where o.i = q.i
             )
           ) as item
    from q
  )
  select jsonb_agg(item order by i) into v_json from packed;

  v_res := public.bulk_insert_olympiad_package_questions(v_pkg, v_json, v_grade);
  raise notice 'bulk import result: %', v_res;

  -- The importer answers {total, successful, failed, errors[]}. Assert on
  -- `successful` and refuse anything short of a full attempt's worth: a partial
  -- import leaves a pool that cannot serve `questions_per_attempt`, and the
  -- activation guard in step 4 would then fail with a much less obvious message.
  if coalesce((v_res->>'successful')::int, 0) < 25 then
    raise exception 'pool import did not produce at least 25 questions: %', v_res;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4 — activate, and let the DB guard prove the pool is big enough.
-- -----------------------------------------------------------------------------
update public.olympiad_packages
   set status = 'active'
 where code = 'STG-MATH-SMOKE'
   and status <> 'active';

-- -----------------------------------------------------------------------------
-- 5 — what the operator should see.
-- -----------------------------------------------------------------------------
select p.code,
       p.status,
       p.price_amount || ' ' || p.currency          as price,
       p.questions_per_attempt                      as per_attempt,
       (select count(*) from public.questions q
         where q.olympiad_package_id = p.id
           and q.status = 'published')              as published_pool
  from public.olympiad_packages p
 where p.code = 'STG-MATH-SMOKE';
