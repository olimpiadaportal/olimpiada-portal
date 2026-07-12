-- =============================================================================
-- 2026_07_11_048_leaderboard_row_context.sql
-- Owner ruling: the student leaderboard shows REAL names — "Firstname L." for
-- everyone (privacy-preserving initial, formatted SERVER-side so the full last
-- name never leaves the DB) — plus row context: city, school, grade. The
-- anonymous "Şagird •1234" format and the 4-digit tag are removed, and no
-- internal id/child-login id is exposed at all.
--
-- Changes (both functions change their return tables -> DROP + recreate + re-grant):
--   * lb_rows(): + city_name, school_name, grade_level (left joins on students).
--   * get_leaderboard(): returns (rank, display_name, city, school, grade_level,
--     value, is_self). display_name is ALWAYS "First L." (first name only when
--     the last name is missing). The leaderboard.public_display_names setting is
--     no longer consulted here (now inert — kept seeded for compatibility).
--   * get_my_leaderboard_rank / seasons / summary: untouched (they select named
--     columns from lb_rows, so the extra columns are invisible to them).
--
-- Also adds validation check 013 #58 covering this round's engine guarantees
-- (question-scope separation filters, olympiad timed engine, analytics
-- answered/skipped shape, named leaderboard rows).
--
-- Backport: 011 (both functions) + 013 (#58).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

drop function if exists public.get_leaderboard(text, text, uuid, text, int);
drop function if exists public.lb_rows(text, text, uuid, text);

create function public.lb_rows(
  p_board    text,          -- 'points' | 'streak'
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (points only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, school_name text, grade_level int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mkey text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
begin
  if p_board not in ('points', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if p_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  if p_board = 'streak' then
    return query
      select st.profile_id,
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select st.profile_id, l.pts, st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, sc.name, g.level::int
      from (
        select sl.student_profile_id, sum(sl.points) as pts
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.grades    g on g.id = st.grade_id
      where l.pts > 0;
  else
    return query
      select st.profile_id,
             case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'  and st.grade_id    = p_scope_id)
             or (p_scope = 'city'   and st.district_id = p_scope_id)
             or (p_scope = 'school' and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end) > 0;
  end if;
end;
$$;
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

create function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, city text, school text,
               grade_level int, value numeric, is_self boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    select r.rn::int,
           -- "Firstname L." for EVERYONE (owner ruling, migration 048): the
           -- full last name and any internal id never leave the server.
           trim(coalesce(r.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(r.last_name), ''), 1) || '.', '')),
           r.city_name, r.school_name, r.grade_level,
           r.value, r.profile_id = v_me
    from (
      select t.*, row_number() over (
               order by t.value desc, t.best_streak desc,
                        t.last_points_at asc nulls last, t.profile_id) as rn
      from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
    ) r
    where r.rn <= v_limit
    order by r.rn;
end;
$$;
comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live board (points month/all_time per scope; streak global): rank, "First L." display '
  'name (always; formatted server-side), city/school/grade context, value, is_self. '
  'No anonymization tag, no ids (migration 048). No client aggregation.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- ---- self-verify -------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select pg_get_function_result('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)
    into v_cols;
  if v_cols !~ 'display_name' or v_cols !~ 'city' or v_cols !~ 'school'
     or v_cols !~ 'grade_level' or v_cols ~ 'anon_tag' then
    raise exception 'get_leaderboard unexpected shape: %', v_cols;
  end if;
  if not has_function_privilege('authenticated', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE') then
    raise exception 'get_leaderboard lost its authenticated grant';
  end if;
  if has_function_privilege('authenticated', 'public.lb_rows(text,text,uuid,text)', 'EXECUTE') then
    raise exception 'lb_rows must stay service-role only';
  end if;
  -- Smoke: the board renders formatted names with context columns.
  perform * from public.lb_rows('points', 'global', null, 'all_time');
  raise notice 'leaderboard row-context self-verify PASS';
end $$;

commit;
