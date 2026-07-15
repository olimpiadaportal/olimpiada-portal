-- =============================================================================
-- 2026_07_12_057_engine_function_rewrites.sql
-- Round 20 — the attempt-engine function pass that activates the new model
-- (schema landed in 056):
--   * start_topic_test_attempt → UNTIMED PRACTICE (owner item 2): no deadline,
--     is_rated=false (never points/streak). Old timed in-flight tests still
--     resume/expire correctly.
--   * start_olympiad_attempt → draws ALL of the package's published questions
--     (owner item 1; no questions_per_attempt cap) and marks the attempt rated.
--   * award_attempt_points → fires ONLY for rated attempts (daily + olympiad);
--     the per-subject daily cap is retired (structural anti-grind: one rated
--     round per subject per day). Olympiad multiplier unchanged.
--   * submit_test_attempt → daily-round attempts grade against the round's
--     immutable SNAPSHOT correctness (bank edits after generation can never
--     change history).
--   * get_test_attempt / get_test_review → daily-round attempts render from
--     the snapshot; every payload now carries the question 'image'
--     ({bucket,path}, locale-aware with az fallback).
--   * expire_stale_test_attempts → timed sweep covers rated daily rounds;
--     the 24h abandon sweep covers the now-deadline-less practice tests.
--
-- Backports: 011 (all six). Validation: 013 #61.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) topic tests become untimed practice -------------------------------------------
create or replace function public.start_topic_test_attempt(
  p_subject_id   uuid,
  p_topic_ids    uuid[] default '{}',
  p_subtopic_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;    -- owner decision: fixed
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
begin
  if v_student is null then raise exception 'start_test: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_test: not a student'; end if;

  -- Access: same rule as start_practice_attempt (035 — per-subject, lazy-dated).
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
      raise exception 'start_test: no active access' using errcode = 'check_violation';
    end if;
  end if;

  -- Scope validation: topics must belong to the subject; subtopics to the
  -- chosen topics (and require topics when subtopics are given).
  if cardinality(v_topics) > 50 or cardinality(v_subs) > 100 then
    raise exception 'start_test: scope too large';
  end if;
  if cardinality(v_topics) > 0 and exists (
    select 1 from unnest(v_topics) t(id)
    where not exists (select 1 from public.topics tp where tp.id = t.id and tp.subject_id = p_subject_id)
  ) then
    raise exception 'start_test: topic does not belong to subject';
  end if;
  if cardinality(v_subs) > 0 then
    if cardinality(v_topics) = 0 then
      raise exception 'start_test: subtopics given without topics';
    end if;
    if exists (
      select 1 from unnest(v_subs) s(id)
      where not exists (select 1 from public.subtopics st where st.id = s.id and st.topic_id = any (v_topics))
    ) then
      raise exception 'start_test: subtopic does not belong to the chosen topics';
    end if;
  end if;

  -- Resume: one open practice test at a time. Untimed rows (056+) resume
  -- forever (the 24h cron abandons them); legacy timed rows keep the old
  -- deadline behavior.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is null or v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', v_existing.duration_seconds);
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now()
     where id = v_existing.id;
  end if;

  -- Server-random draw, published MCQ-family, general pool, grade-matched;
  -- scoped to the selection, falling back to subject-wide when the scope has
  -- no questions.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      and (cardinality(v_topics) = 0 or q.topic_id = any (v_topics))
      and (cardinality(v_subs) = 0 or q.subtopic_id = any (v_subs))
    order by random()
    limit c_count
  ) picked;

  if cardinality(v_qids) = 0 and (cardinality(v_topics) > 0 or cardinality(v_subs) > 0) then
    select coalesce(array_agg(id), '{}') into v_qids from (
      select q.id
      from public.questions q
      where q.subject_id = p_subject_id
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.type_id in (
          select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
        )
        and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
        and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      order by random()
      limit c_count
    ) picked;
  end if;

  if cardinality(v_qids) = 0 then
    raise exception 'start_test: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  -- UNTIMED practice (migration 057): no deadline, never rated.
  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', false,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
end;
$$;
comment on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) is
  'Subject PRACTICE test (migration 057): mandatory-scope 25-question draw, UNTIMED '
  '(no deadline) and UNRATED (no points/streak/boards). Rated play = daily rounds.';

-- ---- 2) olympiad attempts draw the WHOLE pool -------------------------------------------
create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_pkg      record;
  v_duration int;
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
  v_deadline timestamptz;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select id, subject_id, coalesce(duration_minutes, 25) as dur_min
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  v_duration := v_pkg.dur_min * 60;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'olympiad' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', coalesce(v_existing.duration_seconds, v_duration));
    end if;
    update public.test_attempts
       set status = (case when v_existing.deadline_at is null
                          then 'abandoned' else 'expired' end)::public.attempt_status,
           updated_at = now()
     where id = v_existing.id;
  end if;

  -- ALL of the package's published questions, random order (owner item 1,
  -- migration 057: a package may hold ANY number of questions — no cap).
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
  ) picked;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, is_rated)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, true)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids));
end;
$$;
comment on function public.start_olympiad_attempt(uuid) is
  'Child starts/resumes a TIMED, RATED olympiad attempt on a PURCHASED package. '
  'Since migration 057 the attempt contains ALL of the package''s published questions '
  '(random order; no fixed count). Deadline from olympiad_packages.duration_minutes.';

-- ---- 3) points/streak fire only for RATED attempts --------------------------------------
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
  v_correct   int := 0;
  v_raw       numeric := 0;
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

  -- Difficulty-weighted raw points over CORRECT stored answers (server truth).
  select count(*), coalesce(sum(v_per * coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_raw
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id and a.is_correct;

  -- The old per-subject daily cap is retired (057): rated play is structurally
  -- limited to one daily round per subject per day (+ purchased olympiads).
  if v_kind = 'olympiad' then
    v_awarded := round(v_raw * v_mult, 2);
  else
    v_awarded := round(v_raw, 2);
  end if;

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', false))
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
  'SINGLE leaderboard writer (rated attempts ONLY since migration 057): ledger row '
  '(once per graded attempt), cached points (lazy month rollover) and streak. Fired '
  'by trg_award_points_on_graded; never callable by clients.';

-- ---- 4) snapshot-aware grading -------------------------------------------------------
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
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

  return public.test_attempt_result(p_attempt_id);
end;
$$;

-- ---- 5) attempt payloads: snapshot branch + question image -------------------------------
create or replace function public.get_test_attempt(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_loc      text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap     jsonb;
  v_result   jsonb;
begin
  select id, student_profile_id, status, kind, subject_id,
         deadline_at, duration_seconds, score, max_score, daily_round_id
    into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    -- Immutable snapshot content (migration 057) + live answer state.
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'status', v_att.status,
             'kind', v_att.kind,
             'subject_id', v_att.subject_id,
             'deadline_at', v_att.deadline_at,
             'duration_seconds', v_att.duration_seconds,
             'remaining_seconds',
               case when v_att.deadline_at is null then null
                    else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
             'score', v_att.score,
             'max_score', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'type', s.q_el->>'type',
               'topic_id', nullif(s.q_el->>'topic_id','')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'is_marked', taa.is_marked,
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'status', v_att.status,
           'kind', v_att.kind,
           'subject_id', v_att.subject_id,
           'deadline_at', v_att.deadline_at,
           'duration_seconds', v_att.duration_seconds,
           'remaining_seconds',
             case when v_att.deadline_at is null then null
                  else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
           'score', v_att.score,
           'max_score', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'topic_id', qq.topic_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'is_marked', taa.is_marked,
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text))
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.questions qq on qq.id = taa.question_id
    left join public.question_types qtp on qtp.id = qq.type_id
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

create or replace function public.get_test_review(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap    jsonb;
  v_result  jsonb;
begin
  select id, student_profile_id, status, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'graded' then
    raise exception 'review: attempt not graded yet' using errcode = 'check_violation';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'score', v_att.score,
             'max', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'is_correct', taa.is_correct,
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'explanation', coalesce(s.q_el->'translations'->v_loc->>'explanation',
                                       s.q_el->'translations'->'az'->>'explanation'),
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'),
                                      'is_correct', coalesce((o->>'is_correct')::boolean, false))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'score', v_att.score,
           'max', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'is_correct', taa.is_correct,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'explanation', coalesce(qe.explanation_body, qe_az.explanation_body),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               'is_correct', ao.is_correct)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    left join public.question_explanations qe
      on qe.question_id = taa.question_id and qe.locale = v_loc::public.content_locale
    left join public.question_explanations qe_az
      on qe_az.question_id = taa.question_id and qe_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- ---- 6) expiry sweep: rated daily rounds are timed; practice tests abandon at 24h ---------
create or replace function public.expire_stale_test_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tests int;
  v_other int;
begin
  -- Timed attempts (tests legacy, olympiads, rated daily rounds): hard-expire
  -- past the deadline (5-min grace).
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind in ('test', 'olympiad', 'daily') and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  -- Deadline-less attempts (practice, untimed topic tests, previous-day
  -- replays, legacy olympiad rows): 24h abandon.
  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily', 'test') and status = 'in_progress'
     and deadline_at is null
     and started_at < now() - interval '24 hours';
  get diagnostics v_other = row_count;

  return jsonb_build_object('tests_expired', v_tests, 'others_abandoned', v_other);
end;
$$;

-- ---- self-verify -------------------------------------------------------------------------
do $$
begin
  if position('is_rated' in pg_get_functiondef('public.award_attempt_points(uuid)'::regprocedure)) = 0 then
    raise exception 'award gate missing';
  end if;
  if position('deadline_at, null' in pg_get_functiondef('public.start_topic_test_attempt(uuid,uuid[],uuid[])'::regprocedure)) = 0
     and position('null, null, v_topics' in pg_get_functiondef('public.start_topic_test_attempt(uuid,uuid[],uuid[])'::regprocedure)) = 0 then
    raise exception 'topic tests still timed';
  end if;
  if position('limit greatest' in pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0 then
    raise exception 'olympiad draw still capped';
  end if;
  if position('daily_round_id' in pg_get_functiondef('public.submit_test_attempt(uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'submit not snapshot-aware';
  end if;
  if position('''image''' in pg_get_functiondef('public.get_test_attempt(uuid,text)'::regprocedure)) = 0 then
    raise exception 'attempt payload missing image';
  end if;
  raise notice 'engine rewrites self-verify PASS';
end $$;

commit;
