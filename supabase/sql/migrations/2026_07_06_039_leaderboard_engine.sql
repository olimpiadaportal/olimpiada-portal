-- =============================================================================
-- 2026_07_06_039_leaderboard_engine.sql
-- Leaderboard L0 — points + streak engine (owner decisions 2026-07-06):
--   * Points = per-correct × difficulty weight (from difficulty_levels.weight,
--     already admin-editable) computed ONLY from graded attempts; olympiad
--     attempts × multiplier; practice/topic-test points share a per-subject
--     DAILY CAP (anti-grind). All numbers admin-configurable via system_settings.
--   * Scopes v1: global, subject, grade, city (districts double as the city
--     catalog since migration 017), school. Streak board is global-only.
--   * Eligibility: all graded attempt kinds (practice/test/olympiad). Access
--     gating is inherited from the attempt-start guards (children without live
--     access cannot START attempts, so they cannot earn) — no double check here.
--   * Period: monthly (points_month, Asia/Baku month key) + all-time. Prior
--     month archived to leaderboard_snapshots FROM THE LEDGER (race-immune).
--
-- Anti-manipulation:
--   * student_points_ledger is append-only with UNIQUE(attempt_id) — an attempt
--     scores at most once, replay/regrade-safe.
--   * SINGLE WRITER: one AFTER UPDATE trigger on test_attempts fires
--     award_attempt_points() exactly on the -> 'graded' transition. This
--     deviates from the plan's "call from each grading RPC" wording on purpose:
--     one trigger covers every grading path (practice, olympiad, topic test,
--     future) with zero duplication of those function bodies, and it is still
--     exactly one writer. The trigger body is exception-safe so a points
--     failure can never break grading itself.
--   * Clients cannot write ANY score/streak column: the ledger/activity tables
--     have no client write policies, and a BEFORE UPDATE trigger on students
--     rejects changes to the cached points/streak columns from client roles
--     (the existing students_write ROW policy would otherwise let a child
--     UPDATE its own points_all_time — row RLS cannot protect columns).
--
-- Backports: students columns → 002; tables → 006; RLS → 010; functions,
-- triggers + indexes → 011; settings seeds → 012; cron → 016; checks #50/#51 → 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tables + cached columns
-- -----------------------------------------------------------------------------
create table if not exists public.student_points_ledger (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  attempt_id         uuid not null references public.test_attempts (id) on delete cascade,
  subject_id         uuid references public.subjects (id) on delete set null,
  kind               text not null check (kind in ('practice', 'test', 'olympiad', 'daily')),
  points             numeric(10,2) not null default 0,
  breakdown_json     jsonb not null default '{}'::jsonb,   -- {correct, raw, cap_applied}
  created_at         timestamptz not null default now(),
  constraint uq_points_per_attempt unique (attempt_id)
);
comment on table public.student_points_ledger is
  'Append-only leaderboard points ledger. One row per GRADED attempt (UNIQUE attempt_id — scored at most once). Written only by award_attempt_points(); clients have read-own access and no write path.';

create index if not exists idx_points_ledger_student_created
  on public.student_points_ledger (student_profile_id, created_at);
create index if not exists idx_points_ledger_subject_student
  on public.student_points_ledger (subject_id, student_profile_id, created_at);

create table if not exists public.student_activity_days (
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  activity_date      date not null,           -- LOCAL date in the child's streak_tz
  attempts           int not null default 1,
  created_at         timestamptz not null default now(),
  primary key (student_profile_id, activity_date)
);
comment on table public.student_activity_days is
  'Streak ground truth: one row per child per LOCAL active day (graded attempt). Single writer = award_attempt_points().';

alter table public.students
  add column if not exists points_all_time  numeric(12,2) not null default 0,
  add column if not exists points_month     numeric(12,2) not null default 0,
  add column if not exists points_month_key text,
  add column if not exists last_points_at   timestamptz,
  add column if not exists current_streak   int not null default 0,
  add column if not exists best_streak      int not null default 0,
  add column if not exists last_active_date date,
  add column if not exists streak_tz        text not null default 'Asia/Baku';

-- Column protection: students_write is a ROW policy (child/parent can update
-- their own row), so the cached score/streak columns need their own guard.
create or replace function public.protect_student_progress_cols()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.points_all_time  is distinct from old.points_all_time
    or new.points_month     is distinct from old.points_month
    or new.points_month_key is distinct from old.points_month_key
    or new.last_points_at   is distinct from old.last_points_at
    or new.current_streak   is distinct from old.current_streak
    or new.best_streak      is distinct from old.best_streak
    or new.last_active_date is distinct from old.last_active_date
    or new.streak_tz        is distinct from old.streak_tz
  ) then
    raise exception 'students: leaderboard columns are server-managed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_student_progress on public.students;
create trigger trg_protect_student_progress
  before update on public.students
  for each row execute function public.protect_student_progress_cols();

-- -----------------------------------------------------------------------------
-- 2) Config seeds (admin-editable; difficulty weights live in difficulty_levels.weight)
-- -----------------------------------------------------------------------------
-- per_correct: base points per correct answer (× difficulty_levels.weight);
-- practice_daily_cap_per_subject: max practice+topic-test points per subject per
-- local day (anti-grind; olympiads uncapped); olympiad_multiplier: olympiad boost.
insert into public.system_settings (key, value_json)
values
  ('leaderboard.points.per_correct', '10'::jsonb),
  ('leaderboard.points.practice_daily_cap_per_subject', '150'::jsonb),
  ('leaderboard.points.olympiad_multiplier', '1.5'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 3) The single writer
-- -----------------------------------------------------------------------------
create or replace function public.award_attempt_points(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student   uuid;
  v_subject   uuid;
  v_kind      text;
  v_status    public.attempt_status;
  v_tz        text;
  v_today     date;
  v_mkey      text;
  v_per       numeric := 10;
  v_cap       numeric := 150;
  v_mult      numeric := 1.5;
  v_correct   int := 0;
  v_raw       numeric := 0;
  v_used      numeric := 0;
  v_awarded   numeric := 0;
  v_rows      int;
  v_last      date;
  v_new_day   boolean := false;
begin
  select student_profile_id, subject_id, kind::text, status
    into v_student, v_subject, v_kind, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_student is null or v_status <> 'graded'
     or v_kind not in ('practice', 'test', 'olympiad', 'daily') then
    return;
  end if;

  select coalesce(streak_tz, 'Asia/Baku'), last_active_date
    into v_tz, v_last
  from public.students where profile_id = v_student;
  if v_tz is null then return; end if;   -- not a child row
  v_today := (now() at time zone v_tz)::date;
  v_mkey  := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');  -- board-level month key

  -- Config (exception-safe defaults; the trigger wrapper also guards).
  v_per  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.per_correct'), 10);
  v_cap  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.practice_daily_cap_per_subject'), 150);
  v_mult := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.olympiad_multiplier'), 1.5);

  -- Difficulty-weighted raw points over CORRECT stored answers (server truth).
  select count(*), coalesce(sum(v_per * coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_raw
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id and a.is_correct;

  if v_kind = 'olympiad' then
    v_awarded := round(v_raw * v_mult, 2);
  else
    -- practice + topic tests share the per-subject daily anti-grind cap.
    select coalesce(sum(points), 0) into v_used
    from public.student_points_ledger
    where student_profile_id = v_student
      and subject_id is not distinct from v_subject
      and kind in ('practice', 'test', 'daily')
      and (created_at at time zone v_tz)::date = v_today;
    v_awarded := round(least(v_raw, greatest(0, v_cap - v_used)), 2);
  end if;

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', v_awarded < v_raw))
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;     -- already scored

  -- Streak: single writer, LOCAL-date row + cached counters.
  insert into public.student_activity_days (student_profile_id, activity_date)
  values (v_student, v_today)
  on conflict (student_profile_id, activity_date)
    do update set attempts = public.student_activity_days.attempts + 1;
  v_new_day := (v_last is distinct from v_today);

  update public.students
     set points_all_time = points_all_time + v_awarded,
         points_month    = case when points_month_key is distinct from v_mkey
                                then v_awarded else points_month + v_awarded end,
         points_month_key = v_mkey,
         last_points_at  = now(),
         current_streak  = case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end,
         best_streak     = greatest(best_streak, case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end),
         last_active_date = v_today,
         updated_at      = now()
   where profile_id = v_student;
end;
$$;
comment on function public.award_attempt_points(uuid) is
  'SINGLE leaderboard writer: ledger row (once per graded attempt), cached points (lazy month rollover) and streak. Fired by trg_award_points_on_graded; never callable by clients.';
revoke all on function public.award_attempt_points(uuid) from public, anon, authenticated;
grant execute on function public.award_attempt_points(uuid) to service_role;

create or replace function public.award_attempt_points_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.award_attempt_points(new.id);
  exception when others then
    -- Points must never break grading; the ledger stays consistent (no row =
    -- not scored) and the attempt can be re-awarded by support if ever needed.
    raise warning 'award_attempt_points failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_award_points_on_graded on public.test_attempts;
create trigger trg_award_points_on_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.award_attempt_points_tg();

-- -----------------------------------------------------------------------------
-- 4) Board reads (internal row source + public wrappers)
-- -----------------------------------------------------------------------------
-- Internal: full ranked set for one board/scope/period. service-internal only.
create or replace function public.lb_rows(
  p_board    text,          -- 'points' | 'streak'
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (points only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text, child_unique_id text)
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
             -- lazy expiry: a streak is live only if active today or yesterday (local)
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name, st.child_unique_id
      from public.students st
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    -- per-subject points come from the ledger (month filter on the board tz)
    return query
      select st.profile_id, l.pts, st.best_streak, st.last_points_at,
             st.first_name, st.last_name, st.child_unique_id
      from (
        select sl.student_profile_id, sum(sl.points) as pts
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      where l.pts > 0;
  else
    return query
      select st.profile_id,
             case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name, st.child_unique_id
      from public.students st
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

-- Public board read: top-N, deterministic tie-break, privacy applied server-side.
create or replace function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, anon_tag text, value numeric, is_self boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := public.current_profile_id();
  v_public boolean := coalesce((select nullif(value_json #>> '{}', '')::boolean
                                  from public.system_settings
                                 where key = 'leaderboard.public_display_names'), true);
  v_limit  int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    select r.rn::int,
           case when v_public or r.profile_id = v_me
                then trim(coalesce(r.first_name, '') || ' ' ||
                          coalesce(left(nullif(r.last_name, ''), 1) || '.', ''))
                else null end,
           case when v_public or r.profile_id = v_me then null
                else right(coalesce(r.child_unique_id, '0000'), 4) end,
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
  'Live privacy-filtered board (points month/all_time per scope; streak global). Non-self rows are anonymized to a 4-digit tag when leaderboard.public_display_names is off. No client aggregation.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- "Your rank" card: caller-scoped (no student parameter — never IDOR-able).
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
  v_me uuid := public.current_profile_id();
  v_out jsonb;
begin
  if v_me is null then raise exception 'leaderboard: not authenticated'; end if;
  select jsonb_build_object('rank', r.rn, 'total', r.total, 'value', r.value)
    into v_out
  from (
    select profile_id, value,
           row_number() over (order by value desc, best_streak desc,
                              last_points_at asc nulls last, profile_id) as rn,
           count(*) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
  ) r
  where r.profile_id = v_me;
  return coalesce(v_out, jsonb_build_object('rank', null, 'total',
    (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period)), 'value', 0));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

-- Streak status (self): live state + lazy zeroing of a lost streak.
create or replace function public.get_streak_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_tz    text;
  v_cur   int;
  v_best  int;
  v_last  date;
  v_today date;
  v_state text;
  v_hours numeric;
begin
  if v_me is null then raise exception 'streak: not authenticated'; end if;
  select coalesce(streak_tz, 'Asia/Baku'), current_streak, best_streak, last_active_date
    into v_tz, v_cur, v_best, v_last
  from public.students where profile_id = v_me;
  if v_tz is null then raise exception 'streak: not a student'; end if;
  v_today := (now() at time zone v_tz)::date;

  if v_last = v_today then
    v_state := 'active'; v_hours := null;
  elsif v_last = v_today - 1 then
    v_state := 'at_risk';
    v_hours := round(extract(epoch from
      ((v_today + 1)::timestamp at time zone v_tz - now())) / 3600.0, 1);
  else
    v_state := 'lost'; v_hours := 0;
    if v_cur > 0 then
      update public.students set current_streak = 0, updated_at = now()
       where profile_id = v_me;
      v_cur := 0;
    end if;
  end if;
  return jsonb_build_object('current', v_cur, 'best', v_best,
                            'state', v_state, 'hours_until_loss', v_hours);
end;
$$;
revoke all on function public.get_streak_status() from public, anon;
grant execute on function public.get_streak_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Season rollover + admin reset
-- -----------------------------------------------------------------------------
-- Archives a CLOSED month (top 100 global, computed FROM THE LEDGER — immune to
-- lazy cache rollover) into leaderboard_periods + leaderboard_snapshots, then
-- zeroes stale points_month caches. No-ops when the month has no ledger rows.
create or replace function public.leaderboard_month_rollover(p_month_key text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text := coalesce(p_month_key,
              to_char((now() at time zone 'Asia/Baku') - interval '1 month', 'YYYY-MM'));
  v_start  date := to_date(v_key || '-01', 'YYYY-MM-DD');
  v_period uuid;
  v_rows   jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'rank', rn, 'student_profile_id', student_profile_id, 'points', pts))
    into v_rows
  from (
    select sl.student_profile_id, sum(sl.points) as pts,
           row_number() over (order by sum(sl.points) desc, sl.student_profile_id) as rn
    from public.student_points_ledger sl
    where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_key
    group by sl.student_profile_id
    having sum(sl.points) > 0
    order by rn
    limit 100
  ) t;

  if v_rows is not null then
    insert into public.leaderboard_periods (period_type, starts_at, ends_at)
    values ('monthly',
            (v_start::timestamp at time zone 'Asia/Baku'),
            ((v_start + interval '1 month')::timestamp at time zone 'Asia/Baku'))
    on conflict (period_type, starts_at, ends_at)
      do update set updated_at = now()
    returning id into v_period;
    insert into public.leaderboard_snapshots (period_id, scope_type, generated_at, metadata, entries_json)
    values (v_period, 'global', now(), jsonb_build_object('month', v_key, 'source', 'ledger'), v_rows);
  end if;

  update public.students
     set points_month = 0, points_month_key = to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'),
         updated_at = now()
   where points_month <> 0
     and points_month_key is distinct from to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
end;
$$;
revoke all on function public.leaderboard_month_rollover(text) from public, anon, authenticated;
grant execute on function public.leaderboard_month_rollover(text) to service_role;

-- Cron entrypoint: runs daily, acts only on the 1st (Asia/Baku).
create or replace function public.leaderboard_rollover_if_month_start()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if extract(day from now() at time zone 'Asia/Baku') = 1 then
    perform public.leaderboard_month_rollover();
  end if;
end;
$$;
revoke all on function public.leaderboard_rollover_if_month_start() from public, anon, authenticated;
grant execute on function public.leaderboard_rollover_if_month_start() to service_role;

-- Admin reset (service_role only; the admin action audits the call):
--   'season' = archive the CURRENT month now + zero month caches;
--   'hard'   = zero everything (caches + ledger + activity) — destructive, owner action.
create or replace function public.admin_reset_leaderboard(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_mode = 'season' then
    perform public.leaderboard_month_rollover(to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'));
    update public.students set points_month = 0, updated_at = now() where points_month <> 0;
  elsif p_mode = 'hard' then
    delete from public.student_points_ledger;
    delete from public.student_activity_days;
    update public.students
       set points_all_time = 0, points_month = 0, points_month_key = null,
           last_points_at = null, current_streak = 0, best_streak = 0,
           last_active_date = null, updated_at = now()
     where points_all_time <> 0 or points_month <> 0 or current_streak <> 0
        or best_streak <> 0 or last_points_at is not null;
  else
    raise exception 'reset: mode must be season|hard' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function public.admin_reset_leaderboard(text) from public, anon, authenticated;
grant execute on function public.admin_reset_leaderboard(text) to service_role;

-- -----------------------------------------------------------------------------
-- 6) RLS (no client write path on either table)
-- -----------------------------------------------------------------------------
alter table public.student_points_ledger enable row level security;
alter table public.student_activity_days enable row level security;

drop policy if exists spl_select on public.student_points_ledger;
create policy spl_select on public.student_points_ledger for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());

drop policy if exists sad_select on public.student_activity_days;
create policy sad_select on public.student_activity_days for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());

-- -----------------------------------------------------------------------------
-- 7) pg_cron (guarded like 016)
-- -----------------------------------------------------------------------------
do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if v_has_cron then
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_leaderboard_rollover';
    perform cron.schedule('olympiq_leaderboard_rollover', '25 20 * * *',   -- 00:25 Asia/Baku
                          'select public.leaderboard_rollover_if_month_start();');
    raise notice 'cron olympiq_leaderboard_rollover scheduled';
  else
    raise notice 'pg_cron not available here — skipped scheduling (run 016-pattern re-schedule on Supabase)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 8) Self-verify
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.student_points_ledger') is null
     or to_regclass('public.student_activity_days') is null then
    raise exception 'self-verify: leaderboard tables missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_award_points_on_graded'
                    and tgrelid = 'public.test_attempts'::regclass) then
    raise exception 'self-verify: award trigger missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_protect_student_progress'
                    and tgrelid = 'public.students'::regclass) then
    raise exception 'self-verify: students column-protection trigger missing';
  end if;
  if has_function_privilege('anon', 'public.get_leaderboard(text,text,uuid,text,int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_reset_leaderboard(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.award_attempt_points(uuid)', 'EXECUTE') then
    raise exception 'self-verify: leaderboard function privileges leaked';
  end if;
  if (select count(*) from public.system_settings where key like 'leaderboard.points.%') < 3 then
    raise exception 'self-verify: leaderboard settings missing';
  end if;
  raise notice 'migration 039 self-verify PASS';
end $$;

commit;
