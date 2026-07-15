-- =============================================================================
-- 2026_07_13_065_round_readiness_pool_counts.sql
-- Round 21 items 3/4:
--
-- 1) Daily-round pool GRADE PARITY: the rated pool now also accepts questions
--    with grade_id IS NULL (shared across grades) — the same rule the practice
--    engine has always used (start_topic_test_attempt). Exact-grade questions
--    and shared questions mix; everything else (published, general bank,
--    reviewed term <= current, exactly 5 options, has a correct flag) is
--    unchanged. daily_round_readiness() counts with the same predicate.
--
-- 2) get_my_round_readiness(): student-facing pre-flight for the Tests page.
--    For the CALLING student's grade it returns one row per active subject:
--    round_exists (today's round already generated), attempted (student already
--    played it rated), ready (round exists OR the pool can generate one). Lets
--    the UI render an honest "not ready yet" state instead of click-bouncing
--    Start into an error redirect. Leaks only booleans about the caller's own
--    grade.
--
-- 3) get_olympiad_pool_counts(uuid[]): the REAL published-question count per
--    olympiad package. The web/mobile cards used to show
--    olympiad_packages.questions_per_attempt (display-legacy, default 25, never
--    written by the admin form) — a 50-question package still said "25". RLS-
--    proof (SECURITY DEFINER) so parents/children get correct counts without
--    exposing pool content; returns counts only.
--
-- Backports: 011 (all three + readiness). Validation: 013 #67.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) round generation: grade parity --------------------------------------------------
create or replace function public.get_or_create_daily_round(
  p_subject_id uuid, p_grade_id uuid, p_date date
)
returns public.daily_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count constant int := 25;
  v_term  smallint := public.current_academic_term();
  v_qids  uuid[];
  v_row   public.daily_rounds;
begin
  select * into v_row from public.daily_rounds
   where round_date = p_date and subject_id = p_subject_id and grade_id = p_grade_id;
  if found then return v_row; end if;

  -- Cumulative-term pool: published, general bank, term reviewed and <= current,
  -- valid 5-option questions of this subject, for this grade OR shared
  -- (grade_id IS NULL — practice-engine parity, Round 21). Random draw = the mixture.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and (q.grade_id = p_grade_id or q.grade_id is null)
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.term is not null and q.term <= v_term
      and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
      and exists (select 1 from public.answer_options ao
                   where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit c_count
  ) picked;

  if coalesce(cardinality(v_qids), 0) < c_count then
    raise exception 'daily round: not enough eligible questions (subject %, grade %, terms 1..%: have %, need %)',
      p_subject_id, p_grade_id, v_term, coalesce(cardinality(v_qids), 0), c_count
      using errcode = 'no_data_found';
  end if;

  insert into public.daily_rounds
    (round_date, subject_id, grade_id, term_at_generation, question_ids, content_snapshot)
  values
    (p_date, p_subject_id, p_grade_id, v_term, v_qids, public.build_round_snapshot(v_qids))
  on conflict (round_date, subject_id, grade_id) do nothing;

  select * into v_row from public.daily_rounds
   where round_date = p_date and subject_id = p_subject_id and grade_id = p_grade_id;
  return v_row;
end;
$$;
revoke all on function public.get_or_create_daily_round(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_or_create_daily_round(uuid, uuid, date) to service_role;

-- Admin readiness: same predicate as generation (keep the two in lockstep).
create or replace function public.daily_round_readiness()
returns table (subject_id uuid, subject_name text, grade_id uuid, grade_level int,
               eligible int, required int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.name, g.id, g.level::int,
         (select count(*)::int
            from public.questions q
           where q.subject_id = s.id
             and (q.grade_id = g.id or q.grade_id is null)
             and q.status = 'published' and q.olympiad_package_id is null
             and q.term is not null and q.term <= public.current_academic_term()
             and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
             and exists (select 1 from public.answer_options ao
                          where ao.question_id = q.id and ao.is_correct)),
         25
  from public.subjects s
  cross join public.grades g
  where s.status = 'active'
  order by s.name, g.level;
$$;
revoke all on function public.daily_round_readiness() from public, anon;
grant execute on function public.daily_round_readiness() to authenticated, service_role;
-- (authenticated needed for the admin panel; the fn leaks only counts.)

-- ---- 2) student-facing pre-flight -------------------------------------------------------
create or replace function public.get_my_round_readiness()
returns table (subject_id uuid, round_exists boolean, attempted boolean, ready boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_grade   uuid;
  v_today   date := (now() at time zone 'Asia/Baku')::date;
  v_term    smallint := public.current_academic_term();
begin
  select st.grade_id into v_grade
    from public.students st where st.profile_id = v_student;
  if v_student is null or v_grade is null then
    return;   -- no student / no grade → empty set; UI shows its no-grade state
  end if;

  return query
    select s.id,
           (dr.id is not null),
           exists (select 1 from public.test_attempts ta
                    where ta.student_profile_id = v_student
                      and ta.daily_round_id = dr.id and ta.is_rated),
           (dr.id is not null) or (
             select count(*)
               from public.questions q
              where q.subject_id = s.id
                and (q.grade_id = v_grade or q.grade_id is null)
                and q.status = 'published'
                and q.olympiad_package_id is null
                and q.term is not null and q.term <= v_term
                and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
                and exists (select 1 from public.answer_options ao
                             where ao.question_id = q.id and ao.is_correct)
           ) >= 25
    from public.subjects s
    left join public.daily_rounds dr
           on dr.subject_id = s.id and dr.grade_id = v_grade and dr.round_date = v_today
    where s.status = 'active';
end;
$$;
comment on function public.get_my_round_readiness() is
  'Tests-page pre-flight (Round 21): per active subject for the CALLING student — '
  'today''s round exists / already played rated / can be started (round exists or '
  'the pool can generate one). Booleans only; nothing about other grades leaks.';
revoke all on function public.get_my_round_readiness() from public, anon;
grant execute on function public.get_my_round_readiness() to authenticated, service_role;

-- ---- 3) real olympiad pool counts --------------------------------------------------------
create or replace function public.get_olympiad_pool_counts(p_package_ids uuid[])
returns table (package_id uuid, question_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_package_ids is null or cardinality(p_package_ids) = 0 then
    return;
  end if;
  if cardinality(p_package_ids) > 100 then
    raise exception 'olympiad pool counts: too many package ids' using errcode = 'check_violation';
  end if;
  return query
    select q.olympiad_package_id, count(*)::int
    from public.questions q
    where q.olympiad_package_id = any(p_package_ids)
      and q.status = 'published'
    group by q.olympiad_package_id;
end;
$$;
comment on function public.get_olympiad_pool_counts(uuid[]) is
  'Real published pool size per olympiad package (Round 21) — replaces the '
  'display-legacy questions_per_attempt on every card. Counts only; RLS-proof.';
revoke all on function public.get_olympiad_pool_counts(uuid[]) from public, anon;
grant execute on function public.get_olympiad_pool_counts(uuid[]) to authenticated, service_role;

-- ---- self-verify --------------------------------------------------------------------------
do $$
begin
  if position('grade_id is null' in
       pg_get_functiondef('public.get_or_create_daily_round(uuid,uuid,date)'::regprocedure)) = 0 then
    raise exception 'daily pool lacks grade parity';
  end if;
  if position('grade_id is null' in
       pg_get_functiondef('public.daily_round_readiness()'::regprocedure)) = 0 then
    raise exception 'readiness predicate diverged from generation';
  end if;
  if to_regprocedure('public.get_my_round_readiness()') is null
     or not has_function_privilege('authenticated', 'public.get_my_round_readiness()', 'EXECUTE') then
    raise exception 'get_my_round_readiness missing or not callable';
  end if;
  if to_regprocedure('public.get_olympiad_pool_counts(uuid[])') is null
     or not has_function_privilege('authenticated', 'public.get_olympiad_pool_counts(uuid[])', 'EXECUTE') then
    raise exception 'get_olympiad_pool_counts missing or not callable';
  end if;
  if has_function_privilege('anon', 'public.get_olympiad_pool_counts(uuid[])', 'EXECUTE') then
    raise exception 'pool counts must not be anon-callable';
  end if;
  raise notice 'round readiness + pool counts self-verify PASS';
end $$;

commit;
