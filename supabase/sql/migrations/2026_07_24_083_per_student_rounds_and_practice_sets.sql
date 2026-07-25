-- =============================================================================
-- 2026_07_24_083_per_student_rounds_and_practice_sets.sql
-- =============================================================================
-- Round 38: "Bugünün/Dünənin Raundları" model change (owner spec).
--
-- RATED daily rounds become PER-STUDENT random sets (owner ruling — supersedes
-- the Round-20 shared-snapshot clause; fair since Round 36 ranks by weighted
-- percentage, not volume):
--   * Starting today's round draws a fresh subtopic-balanced random 25 for THIS
--     student (draw_daily_questions — the Round-37 algorithm, extracted).
--   * The day is consumed ONLY by SUBMIT: a partial unique index allows exactly
--     one GRADED rated daily attempt per (student, subject, Baku date).
--     Leaving mid-round costs nothing; the next start serves a FRESH set.
--   * A LIVE in-progress attempt (deadline still running) RESUMES — a refresh
--     never resets the timer or re-draws (preview/timer exploit guard). Once
--     the 25 minutes lapse, the attempt is dead weight (never graded, never
--     counted) and a fresh attempt+set is allowed.
--   * Grading uses live answer options (same path as topic tests); the Round-21
--     option-id-stability and no-hard-delete guards protect history.
--
-- YESTERDAY'S rounds become LOCKED per-student practice sets:
--   * First open locks daily_practice_sets(student, subject, for_date):
--     own graded set (EXACT question order) -> a peer's graded set (same
--     subject+grade+date, earliest submit — deterministic) -> the legacy shared
--     daily_rounds row (transition window) -> a system-generated draw.
--   * Every retry replays the SAME locked set, untimed, is_rated=false —
--     structurally invisible to points/percentage/streak (award fn skips
--     unrated attempts).
--
-- RETIRED: get_or_create_daily_round, build_round_snapshot (no shared
-- generation), get_my_round_readiness (the "not ready" label is removed by
-- spec; the start action remains the honest gate). The daily_rounds TABLE
-- stays: history, legacy attempt grading, and the transition fallback above.
--
-- Rerun-safe: yes. Backports: 005 (column/index/table), 010 (RLS),
-- 011 (functions), 013 (#61/#67 rewrites).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Attempts: Baku-local round date + submit-only daily consumption
-- -----------------------------------------------------------------------------
alter table public.test_attempts
  add column if not exists round_date date;

comment on column public.test_attempts.round_date is
  'Baku-local date of a daily-round attempt (rated today / practice yesterday). '
  'Set server-side at start; backs the one-SUBMITTED-round-per-day guard.';

-- Backfill legacy daily attempts from their round (rated) or start time so the
-- new guard sees history consistently.
update public.test_attempts ta
   set round_date = dr.round_date
  from public.daily_rounds dr
 where ta.daily_round_id = dr.id and ta.round_date is null;
update public.test_attempts
   set round_date = (started_at at time zone 'Asia/Baku')::date
 where kind = 'daily' and round_date is null;

-- ONE SUBMITTED rated round per student+subject+day (the ONLY consumption).
create unique index if not exists uq_rated_daily_graded_per_day
  on public.test_attempts (student_profile_id, subject_id, round_date)
  where kind = 'daily' and is_rated and status = 'graded';

-- The old any-outcome-consumes guard is retired (abandoned/expired attempts no
-- longer block the day; new rated attempts carry no daily_round_id anyway).
drop index if exists public.uq_rated_attempt_per_round;

-- -----------------------------------------------------------------------------
-- 2) Locked per-student practice sets for yesterday's rounds
-- -----------------------------------------------------------------------------
create table if not exists public.daily_practice_sets (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  subject_id         uuid not null references public.subjects (id) on delete cascade,
  for_date           date not null,
  question_ids       uuid[] not null,
  source             text not null check (source in ('own', 'peer', 'round', 'generated')),
  created_at         timestamptz not null default now(),
  constraint uq_daily_practice_set unique (student_profile_id, subject_id, for_date)
);
comment on table public.daily_practice_sets is
  'Round 38: the LOCKED per-student practice set for one yesterday (subject+date). '
  'Created once on first open (own graded set -> peer set -> legacy round -> '
  'generated) and replayed verbatim on every retry. Written only by '
  'start_daily_round_attempt (SECURITY DEFINER); students read their own rows.';

create index if not exists idx_daily_practice_sets_lookup
  on public.daily_practice_sets (subject_id, for_date);

alter table public.daily_practice_sets enable row level security;
drop policy if exists "daily_practice_sets_select_own" on public.daily_practice_sets;
create policy "daily_practice_sets_select_own" on public.daily_practice_sets
  for select to authenticated
  using (student_profile_id = public.current_profile_id());
-- No insert/update/delete policies: the definer function is the single writer.

-- -----------------------------------------------------------------------------
-- 3) The per-attempt draw (Round-37 balanced algorithm, extracted)
-- -----------------------------------------------------------------------------
-- NOTE: this LANGUAGE SQL body reads questions.olympiad_package_id, a column
-- added by 015 (numeric run order) — skip body validation; the body is planned
-- at call time and 013 #67 covers it.
set check_function_bodies = off;
create or replace function public.draw_daily_questions(
  p_subject_id uuid, p_grade_id uuid, p_count int default 25
)
returns uuid[]
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  -- Cumulative-term pool: published, general bank, term reviewed and <= current,
  -- valid 5-option questions of this subject, for this grade OR shared
  -- (grade_id IS NULL). SUBTOPIC-BALANCED: rank randomly within each subtopic
  -- bucket, take bucket_rank round-robin, random inside a pass.
  select coalesce(array_agg(id), '{}') from (
    select p.id
    from (
      select q.id,
             row_number() over (
               partition by coalesce(q.subtopic_id, q.topic_id, q.id)
               order by random()) as bucket_rank,
             random() as tiebreak
      from public.questions q
      where q.subject_id = p_subject_id
        and (q.grade_id = p_grade_id or q.grade_id is null)
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.term is not null and q.term <= public.current_academic_term()
        and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
        and exists (select 1 from public.answer_options ao
                     where ao.question_id = q.id and ao.is_correct)
    ) p
    order by p.bucket_rank, p.tiebreak
    limit greatest(1, least(coalesce(p_count, 25), 100))
  ) picked;
$$;
comment on function public.draw_daily_questions(uuid, uuid, int) is
  'Subtopic-balanced random draw from the cumulative-term published pool '
  '(Round 38 — per-student rated sets and generated practice fallbacks).';
reset check_function_bodies;
revoke all on function public.draw_daily_questions(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.draw_daily_questions(uuid, uuid, int) to service_role;

-- -----------------------------------------------------------------------------
-- 4) start_daily_round_attempt v2 — per-student sets + locked practice
-- -----------------------------------------------------------------------------
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
  c_duration constant int := 1500;   -- rated rounds: 25 minutes, test-engine parity
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_qids     uuid[];
  v_set      public.daily_practice_sets;
  v_existing record;
  v_attempt  uuid;
  v_deadline timestamptz;
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
    -- The day is consumed ONLY by a SUBMITTED (graded) round.
    if exists (
      select 1 from public.test_attempts
      where student_profile_id = v_student and subject_id = p_subject_id
        and kind = 'daily' and is_rated and status = 'graded'
        and round_date = v_date
    ) then
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- A LIVE attempt (deadline still running) RESUMES — same set, same timer
    -- (a refresh must never re-draw or reset the clock). A lapsed one is
    -- expired here and a FRESH set is drawn below (attempt not consumed).
    select id, deadline_at, duration_seconds, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
        return jsonb_build_object(
          'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
          'deadline_at', v_existing.deadline_at,
          'duration_seconds', v_existing.duration_seconds,
          'count', cardinality(v_existing.question_ids));
      end if;
      update public.test_attempts
         set status = 'expired', updated_at = now() where id = v_existing.id;
    end if;

    -- Fresh per-student subtopic-balanced draw for THIS attempt.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
    v_deadline := now() + make_interval(secs => c_duration);
  else
    -- YESTERDAY: get-or-create the LOCKED practice set for this student.
    select * into v_set from public.daily_practice_sets
     where student_profile_id = v_student and subject_id = p_subject_id
       and for_date = v_date;
    if not found then
      -- 1) The student's own graded set, EXACT order.
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      -- 2) A peer's graded set (same subject + GRADE + date; earliest submit —
      --    deterministic; question ids only, no identity attached).
      if v_qids is null then
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      -- 3) The legacy shared round (transition window after the model change).
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
      -- 4) System-generated batch (spec fallback).
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

    -- Unlimited retries: resume an open practice attempt on this set first.
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
     v_deadline, case when v_rated then c_duration end, v_rated, v_date)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', v_deadline,
    'duration_seconds', case when v_rated then c_duration end,
    'count', cardinality(v_qids));
exception when unique_violation then
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 38: today = RATED per-student subtopic-balanced random 25 (timed 25min; '
  'the day is consumed ONLY by submit — a live attempt resumes, a lapsed one is '
  'replaced by a FRESH set); yesterday = unlimited UNTIMED practice on the '
  'student''s LOCKED set (own graded set -> peer set -> legacy round -> '
  'generated), never rated.';
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Submit: a cross-device double-submit race hits the graded-unique index —
--    surface it as the friendly 'already attempted' signal, not a raw error.
-- -----------------------------------------------------------------------------
-- (submit_test_attempt already returns the stored result idempotently for the
-- SAME attempt; the unique_violation can only come from a SECOND attempt of the
-- same subject+day being graded on another device.)
create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_answers    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_snap     jsonb;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_r        record;
  v_correct  uuid[];
  v_ok       boolean;
  v_score    numeric := 0;
  v_max      int;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  -- Idempotent: an already-graded attempt returns its stored result.
  if v_att.status = 'graded' then
    return public.test_attempt_result(p_attempt_id);
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'submit: attempt is not in progress' using errcode = 'check_violation';
  end if;

  -- Daily-round attempts grade against the round's immutable snapshot
  -- (migration 057): bank edits after generation can never change history.
  -- Round 38: per-student attempts have NO round — they grade from live
  -- options below, like topic tests (option-id stability is DB-guarded).
  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  -- Merge the final client answers only within deadline + 60s grace.
  if p_answers is not null
     and (v_att.deadline_at is null or now() <= v_att.deadline_at + interval '60 seconds') then
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_n := v_n + 1;
      exit when v_n > 100;
      v_qid := nullif(v_item->>'question_id', '')::uuid;
      if v_qid is null or v_qid = any (v_seen) then continue; end if;
      v_seen := v_seen || v_qid;
      select coalesce(array_agg(e::uuid), '{}')
        into v_sel
        from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
      update public.test_attempt_answers
         set selected_option_ids = v_sel, updated_at = now()
       where attempt_id = p_attempt_id and question_id = v_qid;
    end loop;
  end if;

  -- Grade from the STORED rows.
  for v_r in
    select question_id, selected_option_ids
    from public.test_attempt_answers where attempt_id = p_attempt_id
  loop
    if v_snap is not null then
      select coalesce(array_agg((o->>'option_id')::uuid), '{}')
        into v_correct
        from jsonb_array_elements(v_snap) q_el
        cross join lateral jsonb_array_elements(q_el->'options') o
        where (q_el->>'question_id')::uuid = v_r.question_id
          and coalesce((o->>'is_correct')::boolean, false);
    else
      select coalesce(array_agg(ao.id), '{}')
        into v_correct
        from public.answer_options ao
        where ao.question_id = v_r.question_id and ao.is_correct;
    end if;

    v_ok := (array_length(v_correct, 1) is not null)
        and (coalesce(v_r.selected_option_ids, '{}') <@ v_correct)
        and (v_correct <@ coalesce(v_r.selected_option_ids, '{}'))
        and coalesce(array_length(v_r.selected_option_ids, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_r.question_id;
    if v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  begin
    update public.test_attempts
       set status = 'graded', score = v_score, max_score = v_max,
           submitted_at = now(), graded_at = now(), updated_at = now()
     where id = p_attempt_id;
  exception when unique_violation then
    -- Another attempt of the same subject+day was submitted first (second
    -- device). This one can never grade — surface the friendly signal; the
    -- losing attempt stays in_progress and is swept by the expiry cron.
    -- (Any state write here would be undone by this raise — savepoint
    -- semantics — so none is attempted.)
    raise exception 'daily: already attempted today' using errcode = 'unique_violation';
  end;

  return public.test_attempt_result(p_attempt_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Retired functions (the UI labels/panels they fed are gone)
-- -----------------------------------------------------------------------------
drop function if exists public.get_my_round_readiness();
drop function if exists public.get_or_create_daily_round(uuid, uuid, date);
drop function if exists public.build_round_snapshot(uuid[]);

-- =============================================================================
-- End of 2026_07_24_083_per_student_rounds_and_practice_sets.sql
-- =============================================================================
