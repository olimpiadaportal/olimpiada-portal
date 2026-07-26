-- =============================================================================
-- 2026_07_26_088_olympiads_practice_only.sql
-- =============================================================================
-- Round 48 (owner decision): PURCHASED OLYMPIADS BECOME PRACTICE-ONLY.
--
-- Product rule, as specified by the owner:
--   * a student may enter and retake a purchased olympiad an UNLIMITED number
--     of times;
--   * every attempt is still stored, graded and reviewable (history/review);
--   * NO attempt awards points;
--   * NO attempt affects percentage, rating or ranking;
--   * NO attempt updates general performance statistics or the streak;
--   * NO attempt consumes the daily per-subject rated-round slot.
-- Olympiad results are therefore ISOLATED from the main scoring and ranking
-- system. Daily rounds remain the ONLY scoring surface.
--
-- Two parts:
--   PART A  forward rule     -- award_attempt_points returns early for olympiads.
--   PART B  one-time cleanup -- the owner chose "freeze history AND recompute"
--           so that students who bought olympiad packages keep NO residual
--           advantage on the all-time board. (Dev holds demo accounts that will
--           be removed before go-live, so a full recompute is safe here; on a
--           live database this step needs a maintenance window and a backup.)
--
-- WHY A RECOMPUTE IS REQUIRED, not merely a DELETE: the leaderboard reads from
-- two different places. The SUBJECT scope of lb_rows aggregates
-- student_points_ledger directly, but every other scope (global / grade / city
-- / district / school) reads the CACHED counters on students -- pct_num_all,
-- pct_den_all, lb_correct_all, lb_presented_all, lb_attempts_all and their
-- _month twins. Deleting ledger rows alone would fix the subject board and
-- silently leave every other board wrong, which is worse than doing nothing.
--
-- Streaks are rebuilt too: award_attempt_points used to write an activity day
-- for an olympiad attempt, so a purchased olympiad could extend a streak. The
-- rebuild derives student_activity_days from NON-olympiad graded attempts only
-- and recomputes current/best streak from that day set, using the same rule as
-- the live function (consecutive local days; a run counts as CURRENT only if it
-- reaches today or yesterday in the student's own timezone).
--
-- Rerun-safe: yes. PART A is CREATE OR REPLACE; PART B is a fixed point -- after
-- the first run no olympiad ledger rows remain and the recompute is idempotent.
-- Backports: 011 (award_attempt_points), 012 (drop the now-dead setting),
--            013 (check #83).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART A -- forward rule: olympiad attempts never score.
-- -----------------------------------------------------------------------------
-- Taken VERBATIM from the live definition with exactly ONE addition (the
-- kind = 'olympiad' early return), so none of the Round-36 percentage-snapshot
-- maths is accidentally reconstructed or lost.

CREATE OR REPLACE FUNCTION public.award_attempt_points(p_attempt_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Migration 057: ONLY rated attempts score. Practice (topic tests,
  -- previous-day replays) never touches points/streak.
  if not coalesce(v_rated, false) then
    return;
  end if;

  -- Round 48 (owner): PURCHASED OLYMPIADS ARE PRACTICE-ONLY. An olympiad
  -- attempt is still stored, graded and reviewable for history, but it awards
  -- NO points, contributes NO percentage/ranking weight, updates NO cached
  -- leaderboard counter, records NO activity day and can never extend a
  -- streak. Returning HERE -- before the ledger insert -- is what guarantees
  -- all of that, because every one of those writes is downstream of it.
  -- Olympiads also never consume the daily rated-round slot: that is keyed on
  -- kind = 'daily', which this path never reaches.
  if v_kind = 'olympiad' then
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
  -- Round 48: the olympiad multiplier is gone. Olympiads return above, so the
  -- kind weight is always 1.0 and the setting it used to read is deleted in
  -- PART B (dead config an admin could otherwise set to no effect).
  v_kw   := 1.0;

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

  -- Percentage snapshot: kind weight in BOTH numerator and denominator so the
  -- ratio can never exceed 1 (spec 17.4). With olympiads gone the weight is a
  -- constant 1.0, but the shape is kept so a future weighted kind slots in.
  v_wnum  := round(v_wnum0 * v_kw, 4);
  v_wden  := round(v_wden0 * v_kw, 4);
  v_valid := v_wden > 0;
  v_snapshot := jsonb_build_object(
    'kind', v_kind,
    'kind_weight', v_kw,
    'points_per_correct', v_per,
    'difficulty_weights',
      coalesce((select jsonb_object_agg(dl.code, dl.weight) from public.difficulty_levels dl),
               '{}'::jsonb));

  -- LEGACY points (unchanged since 057): kept for rewards/reports/history.
  v_awarded := round(v_raw, 2);

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
$function$;

comment on function public.award_attempt_points(uuid) is
  'Round 48: scores a GRADED attempt. Practice attempts (is_rated = false) and '
  'ALL olympiad attempts return early - olympiads are practice-only and touch '
  'no points, percentage, ranking, statistics or streak. Daily rated rounds '
  'are the only scoring surface.';

-- -----------------------------------------------------------------------------
-- PART B -- one-time cleanup so no historical olympiad advantage remains.
-- -----------------------------------------------------------------------------

-- B1. Drop every olympiad row from the points ledger.
delete from public.student_points_ledger where kind = 'olympiad';

-- B2. Rebuild the cached leaderboard counters on students from what is LEFT.
--     Month counters use the CURRENT Baku month key, matching lb_rows, which
--     treats a stale points_month_key as "no month data".
with agg as (
  select sl.student_profile_id                                      as pid,
         coalesce(sum(sl.points), 0)                                as pts_all,
         coalesce(sum(sl.weighted_num), 0)                          as num_all,
         coalesce(sum(sl.weighted_den), 0)                          as den_all,
         coalesce(sum(sl.correct_count), 0)                         as corr_all,
         coalesce(sum(sl.presented_count), 0)                       as pres_all,
         count(*) filter (where sl.pct_valid)                       as att_all,
         coalesce(sum(sl.points) filter (where sl.mk = sl.cur), 0)          as pts_m,
         coalesce(sum(sl.weighted_num) filter (where sl.mk = sl.cur), 0)    as num_m,
         coalesce(sum(sl.weighted_den) filter (where sl.mk = sl.cur), 0)    as den_m,
         coalesce(sum(sl.correct_count) filter (where sl.mk = sl.cur), 0)   as corr_m,
         coalesce(sum(sl.presented_count) filter (where sl.mk = sl.cur), 0) as pres_m,
         count(*) filter (where sl.pct_valid and sl.mk = sl.cur)    as att_m,
         max(sl.created_at)                                         as last_at
  from (
    select l.*,
           to_char(l.created_at at time zone 'Asia/Baku', 'YYYY-MM') as mk,
           to_char(now() at time zone 'Asia/Baku', 'YYYY-MM')        as cur
    from public.student_points_ledger l
  ) sl
  group by sl.student_profile_id
)
update public.students st
   set points_all_time    = coalesce(a.pts_all, 0),
       points_month       = coalesce(a.pts_m, 0),
       pct_num_all        = coalesce(a.num_all, 0),
       pct_den_all        = coalesce(a.den_all, 0),
       pct_num_month      = coalesce(a.num_m, 0),
       pct_den_month      = coalesce(a.den_m, 0),
       lb_correct_all     = coalesce(a.corr_all, 0),
       lb_presented_all   = coalesce(a.pres_all, 0),
       lb_attempts_all    = coalesce(a.att_all, 0),
       lb_correct_month   = coalesce(a.corr_m, 0),
       lb_presented_month = coalesce(a.pres_m, 0),
       lb_attempts_month  = coalesce(a.att_m, 0),
       points_month_key   = to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'),
       last_points_at     = a.last_at,
       updated_at         = now()
  from agg a
 where st.profile_id = a.pid;

--     Students whose ONLY scored attempts were olympiads now have no ledger
--     rows at all and must be zeroed explicitly (UPDATE ... FROM cannot reach
--     them). lb_rows filters on pct_den > 0, so zeroing removes them from the
--     boards, which is the intended outcome.
update public.students st
   set points_all_time = 0, points_month = 0,
       pct_num_all = 0, pct_den_all = 0, pct_num_month = 0, pct_den_month = 0,
       lb_correct_all = 0, lb_presented_all = 0, lb_attempts_all = 0,
       lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
       last_points_at = null,
       updated_at = now()
 where not exists (select 1 from public.student_points_ledger l
                    where l.student_profile_id = st.profile_id)
   and (st.points_all_time <> 0 or st.pct_den_all <> 0 or st.lb_attempts_all <> 0
        or st.pct_den_month <> 0 or st.lb_attempts_month <> 0);

-- B3. Rebuild activity days from NON-olympiad graded attempts, then recompute
--     streaks from that day set. An olympiad attempt could previously create an
--     activity day and extend a streak; after this it never can.
delete from public.student_activity_days;

insert into public.student_activity_days (student_profile_id, activity_date, attempts)
select ta.student_profile_id,
       (coalesce(ta.graded_at, ta.submitted_at, ta.updated_at)
          at time zone coalesce(st.streak_tz, 'Asia/Baku'))::date,
       count(*)
from public.test_attempts ta
join public.students st on st.profile_id = ta.student_profile_id
where ta.status = 'graded'
  and ta.is_rated
  and ta.kind <> 'olympiad'
  and coalesce(ta.graded_at, ta.submitted_at, ta.updated_at) is not null
group by 1, 2
on conflict (student_profile_id, activity_date) do nothing;

--     Consecutive-day runs per student: gaps-and-islands -- inside a run,
--     (date - row_number) is constant.
with runs as (
  select student_profile_id, activity_date,
         activity_date - (row_number() over (partition by student_profile_id
                                             order by activity_date))::int as grp
  from public.student_activity_days
),
streaks as (
  select student_profile_id, grp, count(*) as len, max(activity_date) as ends_on
  from runs group by 1, 2
),
per_student as (
  select s.student_profile_id as pid,
         max(s.len)           as best,
         max(s.ends_on)       as last_day,
         max(s.len) filter (
           where s.ends_on = (select max(x.ends_on) from streaks x
                               where x.student_profile_id = s.student_profile_id)
         )                    as current_run
  from streaks s group by 1
)
update public.students st
   set best_streak      = greatest(coalesce(p.best, 0), 0),
       last_active_date = p.last_day,
       -- A run counts as CURRENT only if it reaches today or yesterday in the
       -- student's own timezone -- identical to the live award rule.
       current_streak   = case
         when p.last_day >= (now() at time zone coalesce(st.streak_tz, 'Asia/Baku'))::date - 1
           then coalesce(p.current_run, 0)
         else 0 end,
       updated_at       = now()
  from per_student p
 where st.profile_id = p.pid;

--     Students left with no qualifying activity at all.
update public.students st
   set current_streak = 0, best_streak = 0, last_active_date = null, updated_at = now()
 where not exists (select 1 from public.student_activity_days d
                    where d.student_profile_id = st.profile_id)
   and (st.current_streak <> 0 or st.best_streak <> 0 or st.last_active_date is not null);

-- B4. The olympiad multiplier is now dead configuration -- an olympiad attempt
--     never reaches the weighting code. Remove it so no admin can set a value
--     that silently does nothing.
delete from public.system_settings where key = 'leaderboard.points.olympiad_multiplier';

-- =============================================================================
-- End of 2026_07_26_088_olympiads_practice_only.sql
-- =============================================================================
