-- =============================================================================
-- 2026_07_07_041_leaderboard_seasons_and_parent_summary.sql
-- Leaderboard follow-ups (owner rulings 2026-07-07):
--   1) SEASONS: full admin CRUD for named date-range seasons, ADDITIVE to the
--      existing monthly/all-time child boards (which are unchanged). A season's
--      live standings are computed from the points ledger by date range; closing
--      a season freezes the top-100 into standings_json. Seasons never touch the
--      live points caches — they are an independent archive/competition layer.
--   2) PARENT VIEW: get_child_leaderboard_summary(child) lets a LINKED parent (or
--      admin) read one child's rank/points/streak for the dashboard + analytics.
--   3) Make the leaderboard visible: enable the 'leaderboard' feature flag.
--
-- Backports: table -> 006; RLS -> 010; RPCs -> 011; flag default -> 012;
-- checks #52/#53 -> 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) Seasons -------------------------------------------------------------
create table if not exists public.leaderboard_seasons (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  closed_at      timestamptz,                 -- null = open; non-null = archived
  standings_json jsonb not null default '[]'::jsonb,  -- frozen top-100 on close
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_season_range check (ends_at > starts_at)
);
comment on table public.leaderboard_seasons is
  'Admin-managed named competition seasons (date ranges). Live standings come from the points ledger; closing freezes top-100 into standings_json. Independent of the monthly/all-time boards.';
create index if not exists idx_leaderboard_seasons_starts on public.leaderboard_seasons (starts_at desc);

drop trigger if exists trg_set_updated_at_seasons on public.leaderboard_seasons;
create trigger trg_set_updated_at_seasons
  before update on public.leaderboard_seasons
  for each row execute function public.set_updated_at();

alter table public.leaderboard_seasons enable row level security;
drop policy if exists lseasons_admin on public.leaderboard_seasons;
create policy lseasons_admin on public.leaderboard_seasons for select to authenticated
  using (public.is_admin());   -- writes go through the service-role RPCs below

-- Internal helper: top-N live standings for an [starts,ends] window from the ledger.
create or replace function public.lb_season_live(p_starts timestamptz, p_ends timestamptz, p_limit int)
returns table (rank int, student_profile_id uuid, display_name text, value numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select row_number() over (order by t.pts desc, t.student_profile_id)::int as rank,
         t.student_profile_id,
         trim(coalesce(st.first_name,'') || ' ' ||
              coalesce(left(nullif(st.last_name,''),1) || '.', '')) as display_name,
         t.pts as value
  from (
    select sl.student_profile_id, sum(sl.points) as pts
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends
    group by sl.student_profile_id
    having sum(sl.points) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  order by t.pts desc, t.student_profile_id
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
revoke all on function public.lb_season_live(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.lb_season_live(timestamptz, timestamptz, int) to service_role;

create or replace function public.create_leaderboard_season(
  p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name,''));
begin
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  insert into public.leaderboard_seasons (name, starts_at, ends_at, created_by)
  values (left(v_name, 120), p_starts_at, p_ends_at, public.current_profile_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_leaderboard_season(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_leaderboard_season(text, timestamptz, timestamptz) to service_role;

create or replace function public.update_leaderboard_season(
  p_id uuid, p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_name text := btrim(coalesce(p_name,'')); v_closed timestamptz;
begin
  select closed_at into v_closed from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: cannot edit a closed season' using errcode = 'check_violation'; end if;
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  update public.leaderboard_seasons
     set name = left(v_name,120), starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) to service_role;

create or replace function public.delete_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.leaderboard_seasons where id = p_id;
end;
$$;
revoke all on function public.delete_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.delete_leaderboard_season(uuid) to service_role;

create or replace function public.close_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_rows jsonb;
begin
  select starts_at, ends_at, closed_at into v_s, v_e, v_closed
    from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: already closed' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', rank, 'student_profile_id', student_profile_id,
           'display_name', display_name, 'value', value) order by rank), '[]'::jsonb)
    into v_rows
  from public.lb_season_live(v_s, v_e, 100);
  update public.leaderboard_seasons
     set closed_at = now(), standings_json = v_rows, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.close_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.close_leaderboard_season(uuid) to service_role;

create or replace function public.reopen_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leaderboard_seasons
     set closed_at = null, standings_json = '[]'::jsonb, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.reopen_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.reopen_leaderboard_season(uuid) to service_role;

-- Standings for the admin viewer: live from the ledger while open, frozen json
-- once closed. service_role only (the admin action calls it after requireAdmin).
create or replace function public.get_season_standings(p_id uuid, p_limit int default 100)
returns table (rank int, display_name text, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_json jsonb;
begin
  select starts_at, ends_at, closed_at, standings_json
    into v_s, v_e, v_closed, v_json
    from public.leaderboard_seasons where id = p_id;
  if not found then return; end if;
  if v_closed is not null then
    return query
      select (e->>'rank')::int, e->>'display_name', (e->>'value')::numeric
      from jsonb_array_elements(coalesce(v_json,'[]'::jsonb)) e
      order by (e->>'rank')::int
      limit greatest(1, least(coalesce(p_limit,100), 500));
  else
    return query
      select s.rank, s.display_name, s.value
      from public.lb_season_live(v_s, v_e, p_limit) s;
  end if;
end;
$$;
revoke all on function public.get_season_standings(uuid, int) from public, anon, authenticated;
grant execute on function public.get_season_standings(uuid, int) to service_role;

-- ---- 2) Parent view: one child's leaderboard summary ------------------------
create or replace function public.get_child_leaderboard_summary(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_pts_m numeric := 0; v_pts_a numeric := 0;
  v_cur   int := 0; v_best int := 0; v_last date; v_tz text;
  v_rank_m int; v_tot_m int; v_rank_a int; v_streak_live int := 0;
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  -- Only the LINKED parent (or an admin) may read a child's summary.
  if not (public.is_admin() or public.is_parent_linked_to_student(p_student)) then
    raise exception 'summary: forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(points_all_time,0), current_streak, best_streak, last_active_date,
         coalesce(streak_tz,'Asia/Baku'),
         case when points_month_key = to_char(now() at time zone 'Asia/Baku','YYYY-MM')
              then points_month else 0 end
    into v_pts_a, v_cur, v_best, v_last, v_tz, v_pts_m
    from public.students where profile_id = p_student;

  -- live streak (lazy loss)
  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  select r.rn, r.total into v_rank_m, v_tot_m from (
    select profile_id, row_number() over (order by value desc, best_streak desc,
             last_points_at asc nulls last, profile_id) as rn, count(*) over () as total
    from public.lb_rows('points','global',null,'month')
  ) r where r.profile_id = p_student;

  select r.rn into v_rank_a from (
    select profile_id, row_number() over (order by value desc, best_streak desc,
             last_points_at asc nulls last, profile_id) as rn
    from public.lb_rows('points','global',null,'all_time')
  ) r where r.profile_id = p_student;

  return jsonb_build_object(
    'points_month', v_pts_m, 'points_all_time', v_pts_a,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a);
end;
$$;
revoke all on function public.get_child_leaderboard_summary(uuid) from public, anon;
grant execute on function public.get_child_leaderboard_summary(uuid) to authenticated, service_role;

-- ---- 3) Make the leaderboard visible ----------------------------------------
update public.feature_flags set enabled = true, updated_at = now() where key = 'leaderboard';

-- ---- self-verify ------------------------------------------------------------
do $$
begin
  if to_regclass('public.leaderboard_seasons') is null then
    raise exception 'self-verify: leaderboard_seasons missing';
  end if;
  if has_function_privilege('authenticated','public.create_leaderboard_season(text,timestamptz,timestamptz)','EXECUTE')
     or has_function_privilege('authenticated','public.get_season_standings(uuid,int)','EXECUTE')
     or has_function_privilege('anon','public.get_child_leaderboard_summary(uuid)','EXECUTE') then
    raise exception 'self-verify: season/summary privileges leaked';
  end if;
  if has_function_privilege('authenticated','public.get_child_leaderboard_summary(uuid)','EXECUTE') = false then
    raise exception 'self-verify: parent summary not callable by authenticated';
  end if;
  if not (select enabled from public.feature_flags where key = 'leaderboard') then
    raise exception 'self-verify: leaderboard flag not enabled';
  end if;
  raise notice 'migration 041 self-verify PASS';
end $$;

commit;
