-- =============================================================================
-- 2026_07_24_081_percentage_leaderboard.sql
-- =============================================================================
-- Round 36: replace the points-based leaderboard ranking with a normalized,
-- weighted, question-level PERCENTAGE (owner spec 17.1-17.19).
--
-- The formula (per rated graded attempt, per PRESENTED question q):
--     w_q          = difficulty_levels.weight(q) x kind_weight
--     kind_weight  = leaderboard.points.olympiad_multiplier for kind='olympiad',
--                    1.0 for daily rounds
--     weighted_num = SUM(w_q) over CORRECT answers
--     weighted_den = SUM(w_q) over ALL presented questions
-- Board value for any period/filter = 100 x SUM(num)/SUM(den) over the matching
-- ledger rows (never an average of percentages). Because num <= den per row with
-- identical weights, the result is structurally 0..100; coefficients act as
-- QUESTION WEIGHTS in both numerator and denominator, never as multipliers of
-- the final percentage. A perfect attempt is exactly 100% at any coefficient.
--
-- Unanswered-but-presented questions: the engine PRE-CREATES one answer row per
-- presented question at attempt start and grading marks unanswered rows
-- is_correct=false - so they already sit in the denominator (spec 17.11).
-- Never-graded attempts (in_progress/expired/abandoned/canceled) never reach the
-- ledger and never affect any board (unchanged lifecycle, documented).
--
-- LEGACY POINTS ARE PRESERVED: award_attempt_points keeps computing and storing
-- points EXACTLY as before (ledger.points + students.points_month/all_time) for
-- any legacy/reward/report use. Only the RANKING metric changes.
--
-- One-attempt-per-day stays enforced by uq_rated_attempt_per_round (unique
-- index) + uq_points_per_attempt (ledger); this migration does not touch them.
--
-- Backfill: existing ledger rows are recalculated from the STORED answer rows
-- using the CURRENT difficulty weights and CURRENT olympiad multiplier - an
-- explicit, intentional migration (spec 17.15; per-attempt coefficient
-- snapshots did not exist before this round, and neither knob has ever been
-- changed from its seeded default). Rows whose attempt has no stored answer
-- rows cannot be recalculated: they keep pct_valid=false, are EXCLUDED from
-- percentage ranking, and are counted in the migration report printed at the
-- end. No point history is modified or destroyed.
--
-- Rerun-safe: yes (add column if not exists / create or replace / on conflict /
-- idempotent recomputation).
-- Backports: 002 (students cache columns), 006 (ledger columns),
--            011 (functions), 012 (settings seeds), 013 (checks).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ledger: per-attempt normalized snapshot (spec 17.5)
-- -----------------------------------------------------------------------------
alter table public.student_points_ledger
  add column if not exists correct_count    int not null default 0,
  add column if not exists answered_count   int not null default 0,
  add column if not exists presented_count  int not null default 0,
  add column if not exists weighted_num     numeric(14,4) not null default 0,
  add column if not exists weighted_den     numeric(14,4) not null default 0,
  add column if not exists weights_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pct_valid        boolean not null default false;

comment on column public.student_points_ledger.weighted_num is
  'SUM(difficulty_weight x kind_weight) over CORRECT answers, snapshotted at grading.';
comment on column public.student_points_ledger.weighted_den is
  'SUM(difficulty_weight x kind_weight) over ALL presented questions, snapshotted at grading.';
comment on column public.student_points_ledger.weights_snapshot is
  'Coefficients active when the attempt was scored (kind weight, olympiad multiplier, difficulty weight map).';
comment on column public.student_points_ledger.pct_valid is
  'Row carries enough question-level data for percentage ranking (weighted_den > 0). '
  'false = legacy row with no recalculable answer data - excluded from percentage boards.';

-- -----------------------------------------------------------------------------
-- 2) Students: cached percentage aggregates (same lazy month-rollover pattern
--    as points_month/points_all_time; points_month_key governs BOTH).
-- -----------------------------------------------------------------------------
alter table public.students
  add column if not exists pct_num_month      numeric(14,4) not null default 0,
  add column if not exists pct_den_month      numeric(14,4) not null default 0,
  add column if not exists pct_num_all        numeric(16,4) not null default 0,
  add column if not exists pct_den_all        numeric(16,4) not null default 0,
  add column if not exists lb_correct_month   int not null default 0,
  add column if not exists lb_correct_all     int not null default 0,
  add column if not exists lb_presented_month int not null default 0,
  add column if not exists lb_presented_all   int not null default 0,
  add column if not exists lb_attempts_month  int not null default 0,
  add column if not exists lb_attempts_all    int not null default 0;

comment on column public.students.pct_num_all is
  'Cached all-time weighted numerator (percentage leaderboard). Single writer = award_attempt_points().';
comment on column public.students.pct_den_all is
  'Cached all-time weighted denominator (percentage leaderboard). value = 100*num/den.';

-- -----------------------------------------------------------------------------
-- 3) Provisional-ranking thresholds (spec 17.9; admin-configurable)
-- -----------------------------------------------------------------------------
-- A student is RANKED only after reaching BOTH minimums within the selected
-- period/filter; below them the percentage shows as provisional (rank NULL).
-- min_questions compares against PRESENTED (counted) questions - the same
-- number that forms the denominator; min_attempts against pct-valid attempts.
insert into public.system_settings (key, value_json)
values
  ('leaderboard.rank.min_questions', '25'::jsonb),
  ('leaderboard.rank.min_attempts',  '2'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 4) award_attempt_points v2 - unchanged points math + percentage snapshot
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
  v_rated     boolean;
  v_tz        text;
  v_today     date;
  v_mkey      text;
  v_per       numeric := 10;
  v_mult      numeric := 1.5;
  v_kw        numeric := 1.0;
  v_correct   int := 0;
  v_answered  int := 0;
  v_presented int := 0;
  v_raw       numeric := 0;
  v_wnum0     numeric := 0;   -- difficulty-weighted, before kind weight
  v_wden0     numeric := 0;
  v_wnum      numeric := 0;
  v_wden      numeric := 0;
  v_valid     boolean := false;
  v_snapshot  jsonb;
  v_awarded   numeric := 0;
  v_rows      int;
  v_last      date;
  v_new_day   boolean := false;
begin
  select student_profile_id, subject_id, kind::text, status, is_rated
    into v_student, v_subject, v_kind, v_status, v_rated
  from public.test_attempts where id = p_attempt_id;
  if v_student is null or v_status <> 'graded' then
    return;
  end if;
  -- Migration 057: ONLY rated attempts (daily rounds, olympiads) score.
  -- Practice (topic tests, previous-day replays) never touches points/streak.
  if not coalesce(v_rated, false) then
    return;
  end if;

  select coalesce(streak_tz, 'Asia/Baku'), last_active_date
    into v_tz, v_last
  from public.students where profile_id = v_student;
  if v_tz is null then return; end if;   -- not a child row
  v_today := (now() at time zone v_tz)::date;
  v_mkey  := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');  -- board-level month key

  v_per  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.per_correct'), 10);
  v_mult := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.olympiad_multiplier'), 1.5);
  v_kw   := case when v_kind = 'olympiad' then v_mult else 1.0 end;

  -- ONE scan over the stored answer rows (the engine pre-creates one row per
  -- PRESENTED question; unanswered rows were graded is_correct=false):
  --   legacy points input (v_correct/v_raw - unchanged math) AND the
  --   percentage snapshot (counts + difficulty-weighted num/den).
  select count(*) filter (where a.is_correct),
         count(*) filter (where coalesce(array_length(a.selected_option_ids, 1), 0) > 0
                            or nullif(btrim(coalesce(a.answer_text, '')), '') is not null),
         count(*),
         coalesce(sum(v_per * coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_answered, v_presented, v_raw, v_wnum0, v_wden0
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id;

  -- Percentage snapshot: kind weight in BOTH numerator and denominator - an
  -- olympiad coefficient raises the attempt's WEIGHT in mixed aggregations but
  -- can never push the ratio above 1 (spec 17.4).
  v_wnum  := round(v_wnum0 * v_kw, 4);
  v_wden  := round(v_wden0 * v_kw, 4);
  v_valid := v_wden > 0;
  v_snapshot := jsonb_build_object(
    'kind', v_kind,
    'kind_weight', v_kw,
    'olympiad_multiplier', v_mult,
    'points_per_correct', v_per,
    'difficulty_weights',
      coalesce((select jsonb_object_agg(dl.code, dl.weight) from public.difficulty_levels dl),
               '{}'::jsonb));

  -- LEGACY points (unchanged since 057): kept for rewards/reports/history.
  if v_kind = 'olympiad' then
    v_awarded := round(v_raw * v_mult, 2);
  else
    v_awarded := round(v_raw, 2);
  end if;

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json,
     correct_count, answered_count, presented_count,
     weighted_num, weighted_den, weights_snapshot, pct_valid)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', false),
     v_correct, v_answered, v_presented,
     v_wnum, v_wden, v_snapshot, v_valid)
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;     -- already scored

  -- Streak: single writer, LOCAL-date row + cached counters.
  insert into public.student_activity_days (student_profile_id, activity_date)
  values (v_student, v_today)
  on conflict (student_profile_id, activity_date)
    do update set attempts = public.student_activity_days.attempts + 1;
  v_new_day := (v_last is distinct from v_today);

  -- Cached counters: legacy points AND percentage aggregates roll over on the
  -- SAME points_month_key (every month-cache column below uses the identical
  -- key predicate, evaluated against the pre-update row).
  update public.students
     set points_all_time = points_all_time + v_awarded,
         points_month    = case when points_month_key is distinct from v_mkey
                                then v_awarded else points_month + v_awarded end,
         pct_num_month   = case when points_month_key is distinct from v_mkey
                                then v_wnum else pct_num_month + v_wnum end,
         pct_den_month   = case when points_month_key is distinct from v_mkey
                                then v_wden else pct_den_month + v_wden end,
         lb_correct_month   = case when points_month_key is distinct from v_mkey
                                   then v_correct else lb_correct_month + v_correct end,
         lb_presented_month = case when points_month_key is distinct from v_mkey
                                   then v_presented else lb_presented_month + v_presented end,
         lb_attempts_month  = case when points_month_key is distinct from v_mkey
                                   then (v_valid)::int else lb_attempts_month + (v_valid)::int end,
         pct_num_all      = pct_num_all + v_wnum,
         pct_den_all      = pct_den_all + v_wden,
         lb_correct_all   = lb_correct_all + v_correct,
         lb_presented_all = lb_presented_all + v_presented,
         lb_attempts_all  = lb_attempts_all + (v_valid)::int,
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
  'SINGLE leaderboard writer (rated attempts ONLY since migration 057): ledger row '
  '(once per graded attempt) with the Round-36 percentage snapshot (counts + weighted '
  'num/den + coefficient snapshot), legacy points (unchanged math), cached point AND '
  'percentage aggregates (lazy month rollover) and streak. Fired by '
  'trg_award_points_on_graded; never callable by clients.';
revoke all on function public.award_attempt_points(uuid) from public, anon, authenticated;
grant execute on function public.award_attempt_points(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5) lb_rows v2 - percentage row source (return type changes -> drop first)
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
  v_minq  int  := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_questions'), 25);
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
    -- Subject boards aggregate the ledger: value = 100 x SUM(num)/SUM(den) over
    -- the period's pct-valid rows (question-level, never averaged percentages).
    return query
      select l.student_profile_id, round(100 * l.num / l.den, 4),
             st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int,
             (l.pres < v_minq or l.att < v_mina), l.pres::int, l.corr::int, l.att::int
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
    -- Other scopes read the cached aggregates (same architecture the points
    -- board used; single writer = award_attempt_points, lazy month rollover).
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
             ((case when p_period = 'all_time' then st.lb_presented_all
                    when st.points_month_key = v_mkey then st.lb_presented_month
                    else 0 end) < v_minq
              or (case when p_period = 'all_time' then st.lb_attempts_all
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
  'Internal percentage-board row source (Round 36): value = 100 x weighted correct / '
  'weighted presented over the period (question-level normalization). Rows below the '
  'configurable participation minimums carry is_provisional=true. board ''points'' is '
  'a deprecated alias of ''percent''; the streak board is unchanged. service-internal only.';
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 6) get_leaderboard v2 - competition ranks over the UNROUNDED value;
--    provisional rows listed AFTER every ranked row with rank NULL (spec 17.9/17.10)
-- -----------------------------------------------------------------------------
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
      -- Competition ranking (1,1,3) on the UNROUNDED value ONLY: equal
      -- percentages share a rank regardless of volume. The secondary ordering
      -- below is display order within a tie and never changes the rank.
      select b.*,
             rank() over (order by b.value desc)::int as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b where not b.is_provisional
    ),
    prov as (
      -- Provisional results are never official placements: rank NULL, always
      -- listed after the last ranked row.
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
  'Live percentage board (Round 36): competition rank (ties share) on the unrounded '
  'value, "First L." name, city/district/school/grade context, provisional rows after '
  'ranked ones with rank NULL + their question/attempt counts. Numeric ranks only; '
  'no ids leave the server.';
revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) "Your rank" card (self) - now percentage + provisional progress
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
  v_minq int  := coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_questions'), 25);
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
           'min_questions', v_minq, 'min_attempts', v_mina)
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
    'min_questions', v_minq, 'min_attempts', v_mina));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8) Parent panel: per-child position (same percentage semantics)
-- -----------------------------------------------------------------------------
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
  v_minq int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_questions'), 25);
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
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

  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_questions', v_minq, 'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = p_student;
  -- Not on the board under these filters -> rank null (UI renders the honest
  -- "not participating under this filter" state, never a fake 0).
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_questions', v_minq, 'min_attempts', v_mina));
end;
$$;
comment on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) is
  'Parent-panel per-child board position (Round 36 percentage): rank/total/value + '
  'provisional progress for one LINKED child under the active filters. '
  'Parent-link/admin/self enforced in-body.';
revoke all on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9) Public landing top-10 - percentage, RANKED students only
-- -----------------------------------------------------------------------------
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
  -- Overall board = global all-time percentage; provisional (low-sample)
  -- results never appear on the public site. Names are anonymized server-side:
  -- 'Şagird XXXX' (last 4 digits of the 8-digit child id, leading zeros kept).
  return query
    select r.rnk, 'Şagird ' || coalesce(right(st.child_unique_id::text, 4), '····'),
           r.city_name, r.district_name, r.school_name, r.grade_level, r.value
    from (
      select t.*,
             rank() over (order by t.value desc)::int as rnk,
             row_number() over (order by t.value desc, t.best_streak desc,
                                t.last_points_at asc nulls last, t.profile_id) as ord
      from public.lb_rows('percent', 'global', null, 'all_time') t
      where not t.is_provisional
    ) r
    join public.students st on st.profile_id = r.profile_id
    where r.ord <= v_limit
    order by r.ord;
end;
$$;
comment on function public.get_public_leaderboard(int) is
  'PUBLIC landing-page board (Round 36): top-10 global all-time PERCENTAGE, ranked '
  '(non-provisional) students only, competition ranks, anonymized "Şagird XXXX" names. '
  'Anon-callable by design; hard-capped at 10 rows.';
revoke all on function public.get_public_leaderboard(int) from public;
grant execute on function public.get_public_leaderboard(int) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10) Parent summary - percentage primary, legacy points kept (deprecated)
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
  v_minq int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_questions'), 25);
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  -- Only the LINKED parent (or an admin) may read a child's summary.
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

  v_prov_m := (v_qm < v_minq or v_am < v_mina);
  v_prov_a := (v_qa < v_minq or v_aa < v_mina);

  -- live streak (lazy loss)
  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  -- Ranks among RANKED (non-provisional) students only; provisional -> null.
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
    'min_questions', v_minq, 'min_attempts', v_mina,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a,
    -- Deprecated legacy fields (points are no longer a ranking metric; kept for
    -- backward compatibility until every consumer reads pct_*):
    'points_month', v_pts_m, 'points_all_time', v_pts_a);
end;
$$;
revoke all on function public.get_child_leaderboard_summary(uuid) from public, anon;
grant execute on function public.get_child_leaderboard_summary(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11) Seasons - live standings + close switch to percentage (ranked only)
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
           sum(sl.presented_count) as pres,
           count(*) as att
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends and sl.pct_valid
    group by sl.student_profile_id
    having sum(sl.weighted_den) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  -- Seasons rank ONLY students who met the participation minimums in-window.
  where t.pres >= coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_questions'), 25)
    and t.att  >= coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2)
  order by t.pct desc, t.student_profile_id
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
revoke all on function public.lb_season_live(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.lb_season_live(timestamptz, timestamptz, int) to service_role;

-- Close: freeze percentage standings; 'metric' marks post-Round-36 snapshots so
-- the admin viewer can format them as % (older frozen seasons stored points).
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
           'display_name', display_name, 'value', value,
           'metric', 'percent') order by rank), '[]'::jsonb)
    into v_rows
  from public.lb_season_live(v_s, v_e, 100);
  update public.leaderboard_seasons
     set closed_at = now(), standings_json = v_rows, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.close_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.close_leaderboard_season(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 12) Month rollover - archive percentage standings + zero BOTH cache families
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
  v_minq   int := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_questions'), 25);
  v_mina   int := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  -- Archive the month's top-100 RANKED percentage standings from the ledger
  -- (legacy points included per row for auditability; never used for ranking).
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
    where t.pres >= v_minq and t.att >= v_mina
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

  -- Zero stale month caches (points AND percentage roll on the same key).
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
-- 13) Admin reset - zero the percentage caches alongside the point caches
-- -----------------------------------------------------------------------------
create or replace function public.admin_reset_leaderboard(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_mode = 'season' then
    perform public.leaderboard_month_rollover(to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'));
    update public.students
       set points_month = 0,
           pct_num_month = 0, pct_den_month = 0,
           lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
           updated_at = now()
     where points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0;
  elsif p_mode = 'hard' then
    delete from public.student_points_ledger;
    delete from public.student_activity_days;
    update public.students
       set points_all_time = 0, points_month = 0, points_month_key = null,
           pct_num_month = 0, pct_den_month = 0, pct_num_all = 0, pct_den_all = 0,
           lb_correct_month = 0, lb_correct_all = 0,
           lb_presented_month = 0, lb_presented_all = 0,
           lb_attempts_month = 0, lb_attempts_all = 0,
           last_points_at = null, current_streak = 0, best_streak = 0,
           last_active_date = null, updated_at = now()
     where points_all_time <> 0 or points_month <> 0 or current_streak <> 0
        or best_streak <> 0 or last_points_at is not null
        or pct_den_all <> 0 or pct_den_month <> 0 or lb_attempts_all <> 0;
  else
    raise exception 'reset: mode must be season|hard' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function public.admin_reset_leaderboard(text) from public, anon, authenticated;
grant execute on function public.admin_reset_leaderboard(text) to service_role;

-- -----------------------------------------------------------------------------
-- 14) BACKFILL - recalculate history from stored answer rows (spec 17.15)
-- -----------------------------------------------------------------------------
do $$
declare
  v_mult numeric := coalesce((select nullif(value_json #>> '{}', '')::numeric
                              from public.system_settings
                              where key = 'leaderboard.points.olympiad_multiplier'), 1.5);
  v_mkey text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_snapshot jsonb;
begin
  v_snapshot := jsonb_build_object(
    'backfill', true,
    'olympiad_multiplier', v_mult,
    'difficulty_weights',
      coalesce((select jsonb_object_agg(dl.code, dl.weight) from public.difficulty_levels dl),
               '{}'::jsonb));

  -- Recalculate every ledger row that still lacks its percentage snapshot.
  -- Uses CURRENT difficulty weights + CURRENT olympiad multiplier (documented
  -- intentional recalculation; per-attempt snapshots did not exist before).
  update public.student_points_ledger sl
     set correct_count    = agg.corr,
         answered_count   = agg.ans,
         presented_count  = agg.pres,
         weighted_num     = round(agg.wnum * (case when sl.kind = 'olympiad' then v_mult else 1.0 end), 4),
         weighted_den     = round(agg.wden * (case when sl.kind = 'olympiad' then v_mult else 1.0 end), 4),
         pct_valid        = agg.wden > 0,
         weights_snapshot = v_snapshot
           || jsonb_build_object('kind', sl.kind,
                                 'kind_weight', case when sl.kind = 'olympiad' then v_mult else 1.0 end)
    from (
      select a.attempt_id,
             count(*)::int as pres,
             (count(*) filter (where coalesce(array_length(a.selected_option_ids, 1), 0) > 0
                                 or nullif(btrim(coalesce(a.answer_text, '')), '') is not null))::int as ans,
             (count(*) filter (where a.is_correct))::int as corr,
             coalesce(sum(coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0) as wnum,
             coalesce(sum(coalesce(dl.weight, 1.0)), 0) as wden
      from public.test_attempt_answers a
      join public.questions q on q.id = a.question_id
      left join public.difficulty_levels dl on dl.id = q.difficulty_id
      where a.attempt_id in (select l.attempt_id from public.student_points_ledger l
                             where not l.pct_valid)
      group by a.attempt_id
    ) agg
   where agg.attempt_id = sl.attempt_id
     and not sl.pct_valid;

  -- Rebuild the ALL-TIME caches from the ledger (idempotent).
  update public.students st
     set pct_num_all      = coalesce(t.num, 0),
         pct_den_all      = coalesce(t.den, 0),
         lb_correct_all   = coalesce(t.corr, 0),
         lb_presented_all = coalesce(t.pres, 0),
         lb_attempts_all  = coalesce(t.att, 0),
         updated_at       = now()
    from (
      select sl.student_profile_id,
             sum(sl.weighted_num)    filter (where sl.pct_valid) as num,
             sum(sl.weighted_den)    filter (where sl.pct_valid) as den,
             sum(sl.correct_count)   filter (where sl.pct_valid) as corr,
             sum(sl.presented_count) filter (where sl.pct_valid) as pres,
             count(*)                filter (where sl.pct_valid) as att
      from public.student_points_ledger sl
      group by sl.student_profile_id
    ) t
   where st.profile_id = t.student_profile_id;

  -- Rebuild the CURRENT-MONTH caches. Only students whose month cache is
  -- already keyed to the current Baku month can have month rows (any
  -- current-month award set the key when it ran).
  update public.students st
     set pct_num_month      = coalesce(t.num, 0),
         pct_den_month      = coalesce(t.den, 0),
         lb_correct_month   = coalesce(t.corr, 0),
         lb_presented_month = coalesce(t.pres, 0),
         lb_attempts_month  = coalesce(t.att, 0),
         updated_at         = now()
    from (
      select sl.student_profile_id,
             sum(sl.weighted_num)    filter (where sl.pct_valid) as num,
             sum(sl.weighted_den)    filter (where sl.pct_valid) as den,
             sum(sl.correct_count)   filter (where sl.pct_valid) as corr,
             sum(sl.presented_count) filter (where sl.pct_valid) as pres,
             count(*)                filter (where sl.pct_valid) as att
      from public.student_points_ledger sl
      where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey
      group by sl.student_profile_id
    ) t
   where st.profile_id = t.student_profile_id
     and st.points_month_key = v_mkey;
end;
$$;

-- -----------------------------------------------------------------------------
-- 15) MIGRATION REPORT (printed by psql; record the numbers in STATUS.md)
-- -----------------------------------------------------------------------------
select 'lb_pct_migration_report' as report,
       (select count(*) from public.student_points_ledger)                          as ledger_rows_inspected,
       (select count(*) from public.student_points_ledger where pct_valid)          as recalculated_ok,
       (select count(*) from public.student_points_ledger where not pct_valid)      as excluded_no_answer_data,
       (select count(*) from public.student_points_ledger where kind = 'daily')     as daily_rows,
       (select count(*) from public.student_points_ledger where kind = 'olympiad')  as olympiad_rows,
       (select count(distinct student_profile_id) from public.student_points_ledger) as students_with_history,
       (select count(*) from public.students where pct_den_all > 0)                 as students_with_pct_cache;

-- =============================================================================
-- End of 2026_07_24_081_percentage_leaderboard.sql
-- =============================================================================
