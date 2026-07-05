-- =============================================================================
-- 2026_07_04_027_giveaway_attempt_access.sql
-- Round 11 (item 6, follow-through) — the attempt engine must honor the
-- GIVEAWAY window at the DATABASE layer.
--
-- start_practice_attempt requires access_status in ('trialing','active') and
-- start_olympiad_attempt requires an active purchase — both checks live INSIDE
-- the SECURITY DEFINER RPCs, so an app-side override cannot open them. During
-- an active giveaway window "full platform functionality" must be free:
--   * new helper is_giveaway_active() — evaluates flag + started_at +
--     duration_days entirely server-side (an elapsed window is INACTIVE even
--     while the flag is still on, so expiry needs no job);
--   * start_practice_attempt : giveaway bypasses the access_status gate;
--   * start_olympiad_attempt : giveaway allows attempts on ACTIVE-catalog
--     packages without a purchase (archived packages stay purchaser-only;
--     no lifetime purchase rows are minted by the free window).
--
-- Backport: helper + both function edits → canonical 011; check #37 → 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- is_giveaway_active() — single DB-side source of truth for the free window.
-- SECURITY DEFINER because feature_flags / system_settings are admin-only under
-- RLS while this must be evaluable from child-session RPCs. Exception-safe: any
-- malformed setting means "not active" (a config hiccup must never open or
-- extend a free-access window).
-- -----------------------------------------------------------------------------
create or replace function public.is_giveaway_active()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_started timestamptz;
  v_days    int;
begin
  select enabled into v_enabled from public.feature_flags where key = 'giveaway_period';
  if not coalesce(v_enabled, false) then return false; end if;

  begin
    select nullif(value_json #>> '{}', '')::timestamptz into v_started
    from public.system_settings where key = 'giveaway.started_at';
    select floor((value_json #>> '{}')::numeric)::int into v_days
    from public.system_settings where key = 'giveaway.duration_days';
  exception when others then
    return false;
  end;

  if v_started is null or coalesce(v_days, 0) < 1 then return false; end if;
  return now() < v_started + make_interval(days => v_days);
end;
$$;

comment on function public.is_giveaway_active() is
  'True while the admin giveaway window (giveaway_period flag + giveaway.started_at + giveaway.duration_days) is running. Elapsed window = false even if the flag is still on.';

revoke all on function public.is_giveaway_active() from public, anon, authenticated;
grant execute on function public.is_giveaway_active() to service_role;

-- -----------------------------------------------------------------------------
-- start_practice_attempt — giveaway bypasses the access_status gate only; the
-- question selection, grading and everything else is unchanged.
-- -----------------------------------------------------------------------------
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_access  public.child_access_status;
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select access_status, grade_id into v_access, v_grade
  from public.students where profile_id = v_student;
  if v_access is null then raise exception 'start_practice: not a student'; end if;
  -- Round 11: an active GIVEAWAY window grants access without a subscription.
  if v_access not in ('trialing', 'active') and not public.is_giveaway_active() then
    raise exception 'start_practice: no active access' using errcode = 'check_violation';
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  -- Random selection of published, objective, auto-gradable GENERAL questions for
  -- the subject (grade-matched when the child has a grade). Difficulty is NOT
  -- chosen. PRIVATE olympiad-package questions are excluded (olympiad_package_id IS NULL).
  with picked as (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
    order by random()
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

-- -----------------------------------------------------------------------------
-- start_olympiad_attempt — giveaway allows attempts on ACTIVE-catalog packages
-- without a purchase. Archived packages stay purchaser-only (lifetime access);
-- the giveaway never mints purchase rows.
-- -----------------------------------------------------------------------------
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
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    -- Round 11: an active GIVEAWAY window opens ACTIVE-catalog packages for free.
    if not (public.is_giveaway_active() and exists (
      select 1 from public.olympiad_packages
      where id = p_package_id and catalog_status = 'active'
    )) then
      raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
    end if;
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

commit;

-- =============================================================================
-- End of 2026_07_04_027_giveaway_attempt_access.sql
-- =============================================================================
