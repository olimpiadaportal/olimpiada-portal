-- =============================================================================
-- 2026_07_12_058_leaderboard_district_public_parent.sql
-- Round 20 items 4/6.5/8/14 — the leaderboard cluster:
--   * DISTRICT everywhere: board rows carry the student's district derived
--     STRICTLY through the school (students → schools.city_district_id →
--     city_districts; never stored separately) + a new 'district' scope filter.
--     Column order contract for UIs: Rank → Participant → City → District →
--     School → Grade → Score.
--   * get_child_leaderboard_position: parent-panel per-child position cards —
--     rank/total/value for ONE linked child under the active filters
--     (parent-link/admin/self enforced in-body; never IDOR-able).
--   * get_public_leaderboard: the LANDING page top-10 (anon-callable, global
--     all-time points). Privacy: names are 'Şagird XXXX' (last 4 digits of the
--     8-digit child id, leading zeros kept) — no real names, no ids, no
--     contacts ever leave the server.
--
-- lb_rows/get_leaderboard return types change → DROP + recreate + re-grant.
-- get_my_leaderboard_rank needs no change (total already included; the new
-- 'district' scope flows through lb_rows validation).
-- Backports: 011. Validation: 013 #62.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

drop function if exists public.get_leaderboard(text, text, uuid, text, int);
drop function if exists public.lb_rows(text, text, uuid, text);

create function public.lb_rows(
  p_board    text,          -- 'points' | 'streak'
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'district' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (points only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, district_name text, school_name text, grade_level int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mkey text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
begin
  if p_board not in ('points', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'district', 'school')
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
             d.name, cd.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = sc.city_district_id
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select st.profile_id, l.pts, st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int
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
      left join public.city_districts cd on cd.id = sc.city_district_id
      left join public.grades    g on g.id = st.grade_id
      where l.pts > 0;
  else
    return query
      select st.profile_id,
             case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = sc.city_district_id
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'    and st.grade_id    = p_scope_id)
             or (p_scope = 'city'     and st.district_id = p_scope_id)
             or (p_scope = 'district' and sc.city_district_id = p_scope_id)
             or (p_scope = 'school'   and st.school_id   = p_scope_id))
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
returns table (rank int, display_name text, city text, district text, school text,
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
           trim(coalesce(r.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(r.last_name), ''), 1) || '.', '')),
           r.city_name, r.district_name, r.school_name, r.grade_level,
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
  'Live board: rank, "First L." name, city/DISTRICT/school/grade context (district '
  'derives from the school — migration 058), value, is_self. Scopes: global/subject/'
  'grade/city/district/school. Numeric ranks only; no ids leave the server.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- ---- parent panel: per-child position under the active filters ------------------------
create or replace function public.get_child_leaderboard_position(
  p_student  uuid,
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student)
    or public.current_profile_id() = p_student
  , false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object('rank', r.rn, 'total', r.total, 'value', r.value)
    into v_out
  from (
    select profile_id, value,
           row_number() over (order by value desc, best_streak desc,
                              last_points_at asc nulls last, profile_id) as rn,
           count(*) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
  ) r
  where r.profile_id = p_student;
  -- Not on the board under these filters → rank null (UI renders the honest
  -- "not participating under this filter" state, never a fake 0).
  return coalesce(v_out, jsonb_build_object('rank', null, 'total',
    (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period)), 'value', 0));
end;
$$;
comment on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) is
  'Parent-panel per-child board position (migration 058): rank/total/value for one '
  'LINKED child under the active filters. Parent-link/admin/self enforced in-body.';
revoke all on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) to authenticated, service_role;

-- ---- landing page: anon public top-10, anonymized ------------------------------------
create or replace function public.get_public_leaderboard(p_limit int default 10)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  -- Overall board = global all-time points. Names are anonymized server-side:
  -- 'Şagird XXXX' (last 4 digits of the 8-digit child id, leading zeros kept).
  -- No real names, ids, or contact data in the payload.
  return query
    select r.rn::int,
           'Şagird ' || coalesce(right(st.child_unique_id::text, 4), '····'),
           r.city_name, r.district_name, r.school_name, r.grade_level, r.value
    from (
      select t.*, row_number() over (
               order by t.value desc, t.best_streak desc,
                        t.last_points_at asc nulls last, t.profile_id) as rn
      from public.lb_rows('points', 'global', null, 'all_time') t
    ) r
    join public.students st on st.profile_id = r.profile_id
    where r.rn <= v_limit
    order by r.rn;
end;
$$;
comment on function public.get_public_leaderboard(int) is
  'PUBLIC landing-page board (migration 058): top-10 global all-time points, '
  'anonymized "Şagird XXXX" names (last 4 id digits), city/district/school/grade '
  'context only. Anon-callable by design; hard-capped at 10 rows.';
revoke all on function public.get_public_leaderboard(int) from public;
grant execute on function public.get_public_leaderboard(int) to anon, authenticated, service_role;

-- ---- self-verify --------------------------------------------------------------------
do $$
declare v jsonb;
begin
  if pg_get_function_result('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)
     not like '%district%' then
    raise exception 'get_leaderboard missing district column';
  end if;
  if not has_function_privilege('anon', 'public.get_public_leaderboard(int)', 'EXECUTE') then
    raise exception 'public leaderboard not anon-callable';
  end if;
  -- shape probe as service role
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select public.get_child_leaderboard_position(
           coalesce((select profile_id from public.students limit 1), gen_random_uuid()),
           'points', 'global', null, 'month') into v;
  if not (v ? 'rank' and v ? 'total' and v ? 'value') then
    raise exception 'child position shape wrong: %', v;
  end if;
  if exists (select 1 from public.get_public_leaderboard(10)
              where display_name !~ '^Şagird ') then
    raise exception 'public board leaked a non-anonymized name';
  end if;
  raise notice 'leaderboard cluster self-verify PASS';
end $$;

commit;
