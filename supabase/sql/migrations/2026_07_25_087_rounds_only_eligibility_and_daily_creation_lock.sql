-- =============================================================================
-- 2026_07_25_087_rounds_only_eligibility_and_daily_creation_lock.sql
-- =============================================================================
-- Round 43 — two owner corrections:
--
--  ITEM 1: leaderboard eligibility is ROUNDS-ONLY. The minimum-questions gate
--          (Round 36's leaderboard.rank.min_questions, default 25) is removed
--          from every eligibility computation — a student is RANKED once they
--          reach leaderboard.rank.min_attempts completed rounds (default 2).
--          question/answer counts stay in payloads as SECONDARY stats but no
--          longer decide provisional status anywhere. The min_questions setting
--          row is removed.
--
--  ITEM 3: the daily round attempt is consumed AT CREATION (supersedes the
--          Round-38/42 "consumed only at submit"). A LIVE unique index
--          guarantees one open-or-graded rated daily attempt per student +
--          subject + Baku day; start resumes an in-progress attempt, blocks
--          when one is already completed, and draws a fresh set only when the
--          student has no attempt for the day. Refreshes / multiple tabs / a
--          creation race all collapse onto the one row. A <25-question pool
--          still raises BEFORE any row is created (the day is not consumed on
--          a failed draw). Rounds stay UNTIMED (Round 42).
--
-- Rerun-safe: yes. Backports: 005 (index), 011 (functions), 013 (#61/#81).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ITEM 1 — remove the min-questions setting; it is no longer read.
-- -----------------------------------------------------------------------------
delete from public.system_settings where key = 'leaderboard.rank.min_questions';

-- -----------------------------------------------------------------------------
-- ITEM 1 — lb_rows: provisional = attempts-only (drop the min-questions gate).
--          Return types unchanged; questions/correct stay as secondary stats.
-- -----------------------------------------------------------------------------
drop function if exists public.get_leaderboard(text, text, uuid, text, int);
drop function if exists public.lb_rows(text, text, uuid, text);

create function public.lb_rows(
  p_board    text,          -- 'percent' | 'streak' ('points' = deprecated alias of 'percent')
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'district' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (percent only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, district_name text, school_name text, grade_level int,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_board text := case when p_board = 'points' then 'percent' else p_board end;
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  -- Round 43: eligibility is rounds-only — a single completed-attempts minimum.
  v_mina  int  := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_board not in ('percent', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'district', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if v_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  if v_board = 'streak' then
    return query
      select st.profile_id,
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             false, 0, 0, 0
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select l.student_profile_id, round(100 * l.num / l.den, 4),
             st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int,
             (l.att < v_mina), l.pres::int, l.corr::int, l.att::int
      from (
        select sl.student_profile_id,
               sum(sl.weighted_num)    as num,
               sum(sl.weighted_den)    as den,
               sum(sl.presented_count) as pres,
               sum(sl.correct_count)   as corr,
               count(*)                as att
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and sl.pct_valid
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
        having sum(sl.weighted_den) > 0
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id;
  else
    return query
      select st.profile_id,
             round(100 * (case when p_period = 'all_time' then st.pct_num_all
                               when st.points_month_key = v_mkey then st.pct_num_month
                               else 0 end)
                       / (case when p_period = 'all_time' then st.pct_den_all
                               when st.points_month_key = v_mkey then st.pct_den_month
                               else 1 end), 4),
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             ((case when p_period = 'all_time' then st.lb_attempts_all
                    when st.points_month_key = v_mkey then st.lb_attempts_month
                    else 0 end) < v_mina),
             (case when p_period = 'all_time' then st.lb_presented_all
                   when st.points_month_key = v_mkey then st.lb_presented_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_correct_all
                   when st.points_month_key = v_mkey then st.lb_correct_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_attempts_all
                   when st.points_month_key = v_mkey then st.lb_attempts_month
                   else 0 end)::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'    and st.grade_id    = p_scope_id)
             or (p_scope = 'city'     and st.district_id = p_scope_id)
             or (p_scope = 'district' and coalesce(sc.city_district_id, st.city_district_id) = p_scope_id)
             or (p_scope = 'school'   and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.pct_den_all
                  when st.points_month_key = v_mkey then st.pct_den_month
                  else 0 end) > 0;
  end if;
end;
$$;
comment on function public.lb_rows(text, text, uuid, text) is
  'Internal percentage-board row source. value = 100 x weighted correct / weighted '
  'presented over the period. Round 43: is_provisional = attempts < min_attempts '
  '(rounds-only eligibility; questions are a secondary stat only). service-internal.';
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- get_leaderboard is unchanged (reads is_provisional from lb_rows) but must be
-- recreated because lb_rows was dropped/recreated above.
create function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric, is_self boolean,
               is_provisional boolean, questions int, correct int, attempts int)
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
    with base as (
      select * from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
    ),
    ranked as (
      select b.*,
             rank() over (order by b.value desc)::int as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b where not b.is_provisional
    ),
    prov as (
      select b.*, null::int as rnk,
             (select count(*) from base x where not x.is_provisional)
               + row_number() over (order by b.value desc, b.profile_id) as ord
      from base b where b.is_provisional
    ),
    unioned as (
      select * from ranked
      union all
      select * from prov
    )
    select u.rnk,
           trim(coalesce(u.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(u.last_name), ''), 1) || '.', '')),
           u.city_name, u.district_name, u.school_name, u.grade_level,
           u.value, u.profile_id = v_me,
           u.is_provisional, u.questions, u.correct, u.attempts
    from unioned u
    where u.ord <= v_limit
    order by u.ord;
end;
$$;
comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live percentage board: competition rank (ties share) on the unrounded value; '
  'provisional rows (fewer than min_attempts rounds) listed after ranked ones with '
  'rank NULL. Numeric ranks only; no ids leave the server.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ITEM 1 — my-rank / child-position: drop min_questions from the payload.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_leaderboard_rank(
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
  v_me   uuid := public.current_profile_id();
  v_out  jsonb;
  v_mina int  := coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'leaderboard: not authenticated'; end if;
  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = v_me;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

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
  v_out  jsonb;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student)
    or public.current_profile_id() = p_student
  , false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = p_student;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
comment on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) is
  'Parent-panel per-child board position: rank/total/value + provisional (fewer than '
  'min_attempts rounds). Parent-link/admin/self enforced in-body.';
revoke all on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ITEM 1 — season live standings: rounds-only eligibility.
-- -----------------------------------------------------------------------------
create or replace function public.lb_season_live(p_starts timestamptz, p_ends timestamptz, p_limit int)
returns table (rank int, student_profile_id uuid, display_name text, value numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rank() over (order by t.pct desc)::int as rank,
         t.student_profile_id,
         trim(coalesce(st.first_name,'') || ' ' ||
              coalesce(left(nullif(st.last_name,''),1) || '.', '')) as display_name,
         t.pct as value
  from (
    select sl.student_profile_id,
           round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
           count(*) as att
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends and sl.pct_valid
    group by sl.student_profile_id
    having sum(sl.weighted_den) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  -- Round 43: seasons rank students who met the ROUNDS minimum in-window.
  where t.att >= coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2)
  order by t.pct desc, t.student_profile_id
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
revoke all on function public.lb_season_live(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.lb_season_live(timestamptz, timestamptz, int) to service_role;

-- -----------------------------------------------------------------------------
-- ITEM 1 — month rollover archive: rounds-only eligibility.
-- -----------------------------------------------------------------------------
create or replace function public.leaderboard_month_rollover(p_month_key text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text := coalesce(p_month_key,
              to_char((now() at time zone 'Asia/Baku') - interval '1 month', 'YYYY-MM'));
  v_now_key text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_start  date := to_date(v_key || '-01', 'YYYY-MM-DD');
  v_period uuid;
  v_rows   jsonb;
  v_mina   int := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  select jsonb_agg(jsonb_build_object(
           'rank', rnk, 'student_profile_id', student_profile_id,
           'pct', pct, 'questions', pres, 'correct', corr, 'points', pts,
           'metric', 'percent') order by ord)
    into v_rows
  from (
    select t.*,
           rank() over (order by t.pct desc)::int as rnk,
           row_number() over (order by t.pct desc, t.student_profile_id) as ord
    from (
      select sl.student_profile_id,
             round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
             sum(sl.presented_count) as pres,
             sum(sl.correct_count)   as corr,
             sum(sl.points)          as pts,
             count(*)                as att
      from public.student_points_ledger sl
      where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_key
        and sl.pct_valid
      group by sl.student_profile_id
      having sum(sl.weighted_den) > 0
    ) t
    where t.att >= v_mina
    order by ord
    limit 100
  ) ranked;

  if v_rows is not null then
    insert into public.leaderboard_periods (period_type, starts_at, ends_at)
    values ('monthly',
            (v_start::timestamp at time zone 'Asia/Baku'),
            ((v_start + interval '1 month')::timestamp at time zone 'Asia/Baku'))
    on conflict (period_type, starts_at, ends_at)
      do update set updated_at = now()
    returning id into v_period;
    insert into public.leaderboard_snapshots (period_id, scope_type, generated_at, metadata, entries_json)
    values (v_period, 'global', now(),
            jsonb_build_object('month', v_key, 'source', 'ledger', 'metric', 'percent'),
            v_rows);
  end if;

  update public.students
     set points_month = 0,
         pct_num_month = 0, pct_den_month = 0,
         lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
         points_month_key = v_now_key,
         updated_at = now()
   where (points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0)
     and points_month_key is distinct from v_now_key;
end;
$$;
revoke all on function public.leaderboard_month_rollover(text) from public, anon, authenticated;
grant execute on function public.leaderboard_month_rollover(text) to service_role;

-- -----------------------------------------------------------------------------
-- ITEM 1 — parent summary: rounds-only provisional; drop min_questions.
-- -----------------------------------------------------------------------------
create or replace function public.get_child_leaderboard_summary(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_pts_m numeric := 0; v_pts_a numeric := 0;
  v_pct_m numeric := 0; v_pct_a numeric := 0;
  v_qm    int := 0; v_qa int := 0; v_am int := 0; v_aa int := 0;
  v_cur   int := 0; v_best int := 0; v_last date; v_tz text;
  v_rank_m int; v_tot_m int; v_rank_a int; v_streak_live int := 0;
  v_prov_m boolean := true; v_prov_a boolean := true;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  if not (public.is_admin() or public.is_parent_linked_to_student(p_student)) then
    raise exception 'summary: forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(points_all_time,0), current_streak, best_streak, last_active_date,
         coalesce(streak_tz,'Asia/Baku'),
         case when points_month_key = v_mkey then points_month else 0 end,
         case when points_month_key = v_mkey and pct_den_month > 0
              then round(100 * pct_num_month / pct_den_month, 4) else 0 end,
         case when pct_den_all > 0
              then round(100 * pct_num_all / pct_den_all, 4) else 0 end,
         case when points_month_key = v_mkey then lb_presented_month else 0 end,
         lb_presented_all,
         case when points_month_key = v_mkey then lb_attempts_month else 0 end,
         lb_attempts_all
    into v_pts_a, v_cur, v_best, v_last, v_tz, v_pts_m,
         v_pct_m, v_pct_a, v_qm, v_qa, v_am, v_aa
    from public.students where profile_id = p_student;

  -- Round 43: rounds-only eligibility.
  v_prov_m := (v_am < v_mina);
  v_prov_a := (v_aa < v_mina);

  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  if not v_prov_m then
    select r.rnk, r.total into v_rank_m, v_tot_m from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk,
             count(*) over ()::int as total
      from public.lb_rows('percent','global',null,'month') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;
  if v_tot_m is null then
    select count(*)::int into v_tot_m
    from public.lb_rows('percent','global',null,'month') t where not t.is_provisional;
  end if;
  if not v_prov_a then
    select r.rnk into v_rank_a from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk
      from public.lb_rows('percent','global',null,'all_time') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;

  return jsonb_build_object(
    'pct_month', v_pct_m, 'pct_all_time', v_pct_a,
    'questions_month', v_qm, 'questions_all_time', v_qa,
    'attempts_month', v_am, 'attempts_all_time', v_aa,
    'provisional_month', v_prov_m, 'provisional_all_time', v_prov_a,
    'min_attempts', v_mina,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a,
    'points_month', v_pts_m, 'points_all_time', v_pts_a);
end;
$$;
revoke all on function public.get_child_leaderboard_summary(uuid) from public, anon;
grant execute on function public.get_child_leaderboard_summary(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ITEM 3 — daily attempt consumed AT CREATION.
--   The LIVE unique index allows exactly one in-progress-or-graded rated daily
--   attempt per student+subject+Baku day. Expired/abandoned rows are excluded
--   so legacy duplicates (Round-38 timer lapses) never block the index, and —
--   because untimed rounds never expire same-day — a created attempt occupies
--   the slot until it is graded: the day is consumed at creation in practice.
-- -----------------------------------------------------------------------------
drop index if exists public.uq_rated_daily_graded_per_day;
create unique index if not exists uq_rated_daily_live_per_day
  on public.test_attempts (student_profile_id, subject_id, round_date)
  where kind = 'daily' and is_rated
    and status in ('in_progress', 'submitted', 'graded');

create or replace function public.start_daily_round_attempt(
  p_subject_id uuid,
  p_day        text default 'today'   -- 'today' (rated) | 'yesterday' (practice)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_qids     uuid[];
  v_set      public.daily_practice_sets;
  v_existing record;
  v_attempt  uuid;
  v_source   text;
begin
  if v_student is null then raise exception 'daily: not authenticated'; end if;
  if coalesce(p_day, 'today') not in ('today', 'yesterday') then
    raise exception 'daily: bad day' using errcode = 'check_violation';
  end if;

  select grade_id into v_grade from public.students where profile_id = v_student;
  if not found then raise exception 'daily: not a student'; end if;
  if v_grade is null then
    raise exception 'daily: student has no grade' using errcode = 'check_violation';
  end if;

  -- Access: identical gate to the practice/test engines (per-subject).
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
    ) then
      raise exception 'daily: no active access' using errcode = 'check_violation';
    end if;
  end if;

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_rated then 0 else 1 end);

  if v_rated then
    -- Round 43: the day is consumed AT CREATION. Look at today's live/graded
    -- rated attempt: resume an in-progress one; block when it is completed;
    -- otherwise (no attempt yet) draw a fresh set and create it.
    select id, status, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and round_date = v_date
      and status in ('in_progress', 'submitted', 'graded')
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.status = 'in_progress' then
        -- Untimed: reopen the same attempt (refresh / other tab / resume).
        return jsonb_build_object(
          'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
          'deadline_at', null, 'duration_seconds', null,
          'count', cardinality(v_existing.question_ids));
      end if;
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- Fresh per-student subtopic-balanced draw. A short pool raises HERE, so
    -- the day is never consumed on a failed draw.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  else
    -- YESTERDAY: get-or-create the LOCKED practice set for this student.
    select * into v_set from public.daily_practice_sets
     where student_profile_id = v_student and subject_id = p_subject_id
       and for_date = v_date;
    if not found then
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      if v_qids is null then
        -- A peer's graded set (same subject + GRADE + date, COUNTRY-WIDE;
        -- earliest submit — deterministic; question ids only, no identity).
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
      if v_qids is null then
        v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
        v_source := 'generated';
        if coalesce(cardinality(v_qids), 0) < c_count then
          raise exception 'daily: no round was held yesterday' using errcode = 'no_data_found';
        end if;
      end if;
      insert into public.daily_practice_sets
        (student_profile_id, subject_id, for_date, question_ids, source)
      values (v_student, p_subject_id, v_date, v_qids, v_source)
      on conflict (student_profile_id, subject_id, for_date) do nothing;
      select * into v_set from public.daily_practice_sets
       where student_profile_id = v_student and subject_id = p_subject_id
         and for_date = v_date;
    end if;
    v_qids := v_set.question_ids;

    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;
  end if;

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status, question_ids,
     deadline_at, duration_seconds, is_rated, round_date)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
exception when unique_violation then
  -- A creation race (double tap / two tabs) collapses onto the winning row.
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 43: today = RATED per-student subtopic-balanced random 25, UNTIMED, '
  'consumed AT CREATION (uq_rated_daily_live_per_day: one live/graded attempt per '
  'subject+day — resume in-progress, block when completed); a <25 pool raises '
  'before any row is created. yesterday = unlimited UNTIMED practice on the '
  'student''s LOCKED set (own -> peer country-wide by grade -> legacy round -> '
  'generated), never rated.';
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

-- =============================================================================
-- End of 2026_07_25_087_rounds_only_eligibility_and_daily_creation_lock.sql
-- =============================================================================
