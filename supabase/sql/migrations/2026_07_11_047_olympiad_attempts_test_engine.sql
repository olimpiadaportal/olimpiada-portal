-- =============================================================================
-- 2026_07_11_047_olympiad_attempts_test_engine.sql
-- Owner request: purchased-olympiad attempts must run on the SAME timed test
-- engine as regular topic tests (countdown, autosave, palette, resume,
-- deadline auto-submit) — one engine, two entry points.
--
-- What changes:
--   1) olympiad_packages.duration_minutes (admin-configurable per package,
--      default 25, 5..240) — the countdown source.
--   2) start_olympiad_attempt is rebuilt on the test-engine contract:
--      * RETURN TYPE uuid -> jsonb {attempt_id, resumed, deadline_at,
--        duration_seconds, count} (same shape as start_topic_test_attempt),
--        so the function is DROPPED and recreated (+ re-granted).
--      * TRUE resume: one open olympiad attempt at a time — still-running
--        returns it; past-deadline is expired and a fresh one starts.
--      * Sets deadline_at/duration_seconds; pre-inserts the answer rows.
--      * Purchase-only gate and the PRIVATE package pool draw are UNCHANGED.
--      The existing get_test_attempt / save_test_answers / submit_test_attempt /
--      cancel_test_attempt / get_test_review RPCs are kind-agnostic (owner +
--      status + deadline checks only) and need no changes; grading still fires
--      the leaderboard trigger, which already applies the olympiad multiplier.
--   3) expire_stale_test_attempts: deadline-carrying olympiad attempts expire
--      exactly like tests (5-min grace); legacy deadline-less olympiad rows
--      keep the old 24h abandon sweep.
--
-- Backports: 015 (column) + 011 (both functions). Validation: 013 #58 (048).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) per-package duration ---------------------------------------------------
alter table public.olympiad_packages
  add column if not exists duration_minutes int not null default 25
    check (duration_minutes between 5 and 240);

comment on column public.olympiad_packages.duration_minutes is
  'Attempt time limit in minutes (migration 047). Drives deadline_at on olympiad attempts.';

-- ---- 2) start_olympiad_attempt on the test-engine contract ----------------------
-- Return type changes (uuid -> jsonb): CREATE OR REPLACE cannot do that.
drop function if exists public.start_olympiad_attempt(uuid);

create function public.start_olympiad_attempt(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_pkg      record;
  v_duration int;
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
  v_deadline timestamptz;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select id, subject_id, coalesce(questions_per_attempt, 25) as n_per,
         coalesce(duration_minutes, 25) as dur_min
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  v_duration := v_pkg.dur_min * 60;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  -- Still-running -> return it; past-deadline -> expire it and start fresh.
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

  -- PRIVATE pool: questions assigned to this package only (Batch D — unchanged).
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit greatest(1, v_pkg.n_per)
  ) picked;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids));
end;
$$;

comment on function public.start_olympiad_attempt(uuid) is
  'Child starts/resumes a TIMED olympiad attempt on a PURCHASED package (server-random '
  'draw from the package''s private pool; deadline from olympiad_packages.duration_minutes; '
  'test-engine contract — the get/save/submit/cancel/review test RPCs drive the attempt). '
  'Purchase-only in every mode (owner ruling 2026-07-06).';

revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- ---- 3) expiry sweep covers timed olympiad attempts ------------------------------
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
  -- Timed attempts (tests AND olympiads since 047): hard-expire past deadline.
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind in ('test', 'olympiad') and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  -- Deadline-less attempts (practice, daily, legacy olympiad rows): 24h abandon.
  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily') and status = 'in_progress'
     and deadline_at is null
     and started_at < now() - interval '24 hours';
  get diagnostics v_other = row_count;

  return jsonb_build_object('tests_expired', v_tests, 'others_abandoned', v_other);
end;
$$;
revoke all on function public.expire_stale_test_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_test_attempts() to service_role;

-- ---- self-verify ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='olympiad_packages'
                    and column_name='duration_minutes') then
    raise exception 'duration_minutes missing';
  end if;
  if (select pg_get_function_result('public.start_olympiad_attempt(uuid)'::regprocedure)) <> 'jsonb' then
    raise exception 'start_olympiad_attempt does not return jsonb';
  end if;
  if not has_function_privilege('authenticated', 'public.start_olympiad_attempt(uuid)', 'EXECUTE') then
    raise exception 'start_olympiad_attempt lost its authenticated grant';
  end if;
  if position('deadline_at is null' in pg_get_functiondef('public.expire_stale_test_attempts()'::regprocedure)) = 0 then
    raise exception 'expire sweep missing the deadline-less guard';
  end if;
  raise notice 'olympiad test-engine self-verify PASS';
end $$;

commit;
