-- =============================================================================
-- 2026_07_12_056_daily_rounds_engine.sql
-- Round 20 items 1/2/5/7.7/13.9/15: the RATED DAILY ROUNDS engine + the
-- rated/practice split of the whole attempt model.
--
-- New model (owner rulings, 2026-07-12):
--   * DAILY ROUND = per (subject, grade, Baku-local date): ONE immutable
--     25-question snapshot shared by every student (IDs + order + FULL content
--     incl. all three locales, options w/ correctness, explanations, images —
--     later edits to the question bank never change history). Pool = published
--     general-bank questions of the subject+grade with term <= the current
--     academic term (cumulative: T1→[1], T2→[1,2], …), term IS NOT NULL
--     (unreviewed legacy is excluded), exactly 5 options. < 25 eligible → a
--     clear error identifying subject/grade/terms/missing count (surfaced to
--     admins via daily_round_readiness()).
--   * RATED attempt: one per student per round (partial unique index — API/
--     refresh/multi-tab safe), kind='daily', is_rated=true, TIMED (25 min),
--     feeds points + streak. In_progress resumes; any finished/canceled/
--     expired rated attempt = the day is used.
--   * PREVIOUS-DAY practice: unlimited replays of yesterday's exact snapshot;
--     is_rated=false, UNTIMED, never touches points/streak/boards.
--   * TOPIC TESTS become untimed practice (owner item 2): kind='test',
--     is_rated=false, deadline NULL — no countdown, no points, no streak.
--   * OLYMPIADS: attempts now draw ALL of the package's published questions
--     (owner item 1 — no fixed count; questions_per_attempt is display-legacy);
--     still timed (duration_minutes) and rated (×1.5 multiplier).
--   * award_attempt_points fires ONLY for rated attempts; the old per-subject
--     daily cap is retired (structural anti-grind: one rated round per day).
--   * Olympiad bulk import is CREATION-ONLY (owner item 15): rejected once the
--     package already has questions.
--   * get_test_attempt / get_test_review / submit_test_attempt serve daily-
--     round attempts FROM THE SNAPSHOT (content + grading correctness), and
--     both payloads now carry the question image ({bucket,path}, locale-aware).
--
-- Backports: 005 (daily_rounds + attempt columns), 011 (all functions),
-- 015 (comment), 013 (#61). Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <file>
-- =============================================================================

begin;

-- ---- 1) schema ---------------------------------------------------------------------
create table if not exists public.daily_rounds (
  id                 uuid primary key default gen_random_uuid(),
  round_date         date not null,
  subject_id         uuid not null references public.subjects (id) on delete cascade,
  grade_id           uuid not null references public.grades (id) on delete cascade,
  term_at_generation smallint not null check (term_at_generation between 1 and 4),
  question_ids       uuid[] not null,
  content_snapshot   jsonb not null,
  created_at         timestamptz not null default now(),
  constraint uq_daily_round unique (round_date, subject_id, grade_id)
);

comment on table public.daily_rounds is
  'Immutable daily rated rounds (migration 056): per subject+grade+Baku-local date, '
  'a fixed 25-question set with a FULL content snapshot (all locales, options with '
  'correctness, explanations, image refs). Generated once, shared by all students, '
  'reused verbatim by previous-day practice. Never rewritten.';

alter table public.daily_rounds enable row level security;
-- Students/parents never read rounds directly (the attempt RPCs serve content);
-- admins may inspect.
drop policy if exists daily_rounds_admin_read on public.daily_rounds;
create policy daily_rounds_admin_read on public.daily_rounds
  for select to authenticated using (public.is_admin());
grant select on public.daily_rounds to authenticated;
grant all on public.daily_rounds to service_role;

alter table public.test_attempts
  add column if not exists daily_round_id uuid references public.daily_rounds (id) on delete restrict,
  add column if not exists is_rated boolean not null default false;

comment on column public.test_attempts.is_rated is
  'Rated attempts (daily rounds, olympiads) feed points/streak/boards; practice '
  '(topic tests, previous-day replays) never does (migration 056).';

-- Historical graded attempts already awarded points — mark them rated so the
-- ledger and the flag agree (informational; the ledger is append-only anyway).
update public.test_attempts set is_rated = true
 where status = 'graded' and is_rated = false;

-- ONE rated attempt per student per round — regardless of how it ended.
create unique index if not exists uq_rated_attempt_per_round
  on public.test_attempts (student_profile_id, daily_round_id)
  where is_rated and daily_round_id is not null;

create index if not exists idx_attempts_round on public.test_attempts (daily_round_id);

-- ---- 2) snapshot builder (internal) ---------------------------------------------------
create or replace function public.build_round_snapshot(p_qids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(q_obj order by ord), '[]'::jsonb)
  from (
    select ord, jsonb_build_object(
      'question_id', q.id,
      'type', qtp.code,
      'topic_id', q.topic_id,
      'subtopic_id', q.subtopic_id,
      'term', q.term,
      'translations', (
        select jsonb_object_agg(qt.locale::text, jsonb_build_object(
                 'body', qt.body, 'prompt', qt.prompt,
                 'explanation', qe.explanation_body,
                 'image', case when ma.id is null then null
                               else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end))
        from public.question_translations qt
        left join public.question_explanations qe
          on qe.question_id = qt.question_id and qe.locale = qt.locale
        left join public.media_assets ma on ma.id = qt.media_asset_id
        where qt.question_id = q.id
      ),
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'option_id', ao.id, 'order_index', ao.order_index,
                 'is_correct', ao.is_correct,
                 'text', (select jsonb_object_agg(aot.locale::text, aot.text)
                            from public.answer_option_translations aot
                           where aot.option_id = ao.id))
                 order by ao.order_index), '[]'::jsonb)
        from public.answer_options ao where ao.question_id = q.id
      ))
      as q_obj
    from unnest(p_qids) with ordinality u(qid, ord)
    join public.questions q on q.id = u.qid
    join public.question_types qtp on qtp.id = q.type_id
  ) s;
$$;
revoke all on function public.build_round_snapshot(uuid[]) from public, anon, authenticated;
grant execute on function public.build_round_snapshot(uuid[]) to service_role;

-- ---- 3) round generation (internal; race-safe; term-cumulative pool) -------------------
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
  -- valid 5-option questions of this subject+grade. Random draw = the mixture.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.grade_id = p_grade_id
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

-- Admin readiness: eligible-question counts per subject×grade for the current
-- term (spot the "missing 7 questions" gaps BEFORE students hit them).
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
           where q.subject_id = s.id and q.grade_id = g.id
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

-- ---- 4) start_daily_round_attempt ------------------------------------------------------
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
  c_duration constant int := 1500;   -- rated rounds: 25 minutes, test-engine parity
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_round    public.daily_rounds;
  v_existing record;
  v_attempt  uuid;
  v_deadline timestamptz;
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
    v_round := public.get_or_create_daily_round(p_subject_id, v_grade, v_date);
  else
    -- Previous-day practice replays what WAS generated — never retro-generates.
    select * into v_round from public.daily_rounds
     where round_date = v_date and subject_id = p_subject_id and grade_id = v_grade;
    if not found then
      raise exception 'daily: no round was held yesterday' using errcode = 'no_data_found';
    end if;
  end if;

  -- Resume an open attempt on this round of the same rating class.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and daily_round_id = v_round.id
    and is_rated = v_rated and status = 'in_progress'
  order by started_at desc limit 1;
  if v_existing.id is not null then
    if not v_rated or (v_existing.deadline_at is not null and v_existing.deadline_at > now()) then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', v_rated,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', v_existing.duration_seconds,
        'count', cardinality(v_round.question_ids));
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now() where id = v_existing.id;
  end if;

  -- Rated: the day is consumed by ANY prior rated attempt on this round.
  if v_rated and exists (
    select 1 from public.test_attempts
    where student_profile_id = v_student and daily_round_id = v_round.id and is_rated
  ) then
    raise exception 'daily: already attempted today' using errcode = 'unique_violation';
  end if;

  if v_rated then
    v_deadline := now() + make_interval(secs => c_duration);
  end if;

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status, question_ids,
     deadline_at, duration_seconds, daily_round_id, is_rated)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_round.question_ids,
     v_deadline, case when v_rated then c_duration end, v_round.id, v_rated)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_round.question_ids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', v_deadline,
    'duration_seconds', case when v_rated then c_duration end,
    'count', cardinality(v_round.question_ids));
exception when unique_violation then
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Start/resume a daily-round attempt (migration 056). today = RATED (one per '
  'student per round, timed 25min, feeds points/streak); yesterday = unlimited '
  'UNTIMED practice on the stored snapshot (never rated). Round is generated '
  'lazily once per subject+grade+Baku-date from the cumulative-term pool.';
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

commit;
