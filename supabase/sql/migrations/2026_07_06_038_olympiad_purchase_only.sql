-- =============================================================================
-- 2026_07_06_038_olympiad_purchase_only.sql
-- Owner ruling (2026-07-06): olympiad packages are SOLD SEPARATELY in every
-- mode. Free Access intervals, trials, and the GIVEAWAY window grant free
-- SUBJECT access only (registration + subject practice/tests) — they never
-- open olympiad packages. Olympiad attempts therefore require an ACTIVE
-- purchase row, full stop.
--
-- What changes:
--   * start_olympiad_attempt : the Round-11/12 fallback (giveaway OR free-access
--     interval opened ACTIVE-catalog packages without a purchase) is REMOVED.
--     The guard is purchase-only again, as originally shipped in migration 014.
--   * start_practice_attempt : UNCHANGED — subjects stay free under
--     giveaway/free-access, per the owner ruling.
--   * is_giveaway_active() / is_free_access_active_for_student(): UNCHANGED
--     (still used by the practice guard and app-side subject gating).
--
-- App-side counterpart (same change set): the child olympiads tab no longer
-- merges free-play packages, and parent purchase actions allow buying during
-- a giveaway window (previously blocked because access was free).
--
-- Backport: function body → canonical 011; checks #37/#42 flipped in 013
-- (helpers must appear in start_practice_attempt and must NOT appear in
-- start_olympiad_attempt).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

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
  -- Purchase-only (owner ruling 2026-07-06): free-access/trial/giveaway windows
  -- cover SUBJECTS only — olympiad packages are always bought. Lifetime access
  -- flows exclusively through an active olympiad_purchases row.
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

-- Privileges unchanged (re-asserted for idempotence): the authenticated child
-- calls this directly; the guard lives inside the DEFINER body.
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verify: the olympiad guard must be purchase-only again (no giveaway /
-- free-access reference), while the practice guard KEEPS both helpers.
-- ---------------------------------------------------------------------------
do $$
declare
  v_oly  text := pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure);
  v_prac text := pg_get_functiondef('public.start_practice_attempt(uuid,int)'::regprocedure);
begin
  if v_oly like '%is_giveaway_active%' or v_oly like '%is_free_access_active_for_student%' then
    raise exception 'self-verify: start_olympiad_attempt still references a free-window helper';
  end if;
  if v_oly not like '%no active purchase%' then
    raise exception 'self-verify: start_olympiad_attempt lost its purchase guard';
  end if;
  if v_prac not like '%is_giveaway_active%'
     or v_prac not like '%is_free_access_active_for_student%' then
    raise exception 'self-verify: start_practice_attempt must keep the free-window helpers (subjects stay free)';
  end if;
  raise notice 'migration 038 self-verify PASS: olympiad = purchase-only; practice keeps free windows';
end $$;

commit;
