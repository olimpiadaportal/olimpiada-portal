-- =============================================================================
-- 2026_08_26_143 - AN OPEN TOPIC TEST BELONGS TO ONE SUBJECT.
--
-- `start_topic_test_attempt` resumed an in-progress practice test by looking it
-- up on the STUDENT alone:
--
--     where student_profile_id = v_student and kind = 'test'
--       and status = 'in_progress'
--
-- so a child with an unfinished Maths test who pressed "start" on English was
-- handed the MATHS attempt back -- different subject, different questions --
-- reported as `resumed: true`. The child sees a test they did not ask for and
-- has no way to reach the one they wanted except by finishing or abandoning the
-- other one, which nothing on screen tells them.
--
-- `uq_test_attempts_open_test` carried the same omission (it is unique on
-- `student_profile_id` alone, predicated on kind='test' and in_progress), so the
-- database could not have caught the mismatch either -- it was in fact ENFORCING
-- the wrong rule: one open practice test per CHILD, across all subjects.
--
-- WHY THIS SURFACES NOW. It has always been wrong, but a child usually works in
-- one subject at a time. The 1-day Free Trial (migrations 139-142) hands a child
-- TWO subjects and invites unlimited practice in both for 24 hours, so the first
-- family to use the feature as designed would hit it immediately.
--
-- THE RULE AFTER THIS MIGRATION: one open practice test per child PER SUBJECT.
-- Not "one per child". Topic tests are UNRATED practice that touches no score,
-- no percentage, no streak and no board, so several open at once costs nothing;
-- the cap existed to stop a child accumulating abandoned rows, and per-subject
-- still does that. The 24-hour expiry sweep is unchanged.
--
-- SAFE ON EXISTING DATA. The old index was STRICTER, so no child can currently
-- hold two open tests in different subjects -- widening the key cannot collide.
--
-- Self-transacting. Backported into canonical 011 (which is where this index is
-- declared -- 005 defines the table, not its indexes).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 - the index enforces the rule the function means.
-- -----------------------------------------------------------------------------
drop index if exists public.uq_test_attempts_open_test;
create unique index if not exists uq_test_attempts_open_test
  on public.test_attempts (student_profile_id, subject_id)
  where kind = 'test' and status = 'in_progress';

-- -----------------------------------------------------------------------------
-- 2 - the resume looks for THIS subject's attempt.
-- -----------------------------------------------------------------------------
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

  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'start_test: no active access' using errcode = 'check_violation';
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
  -- MIGRATION 143: ... FOR THIS SUBJECT.
  --
  -- This query used to filter on the student alone, so a child with an open
  -- Maths test who pressed "start" on English was handed the MATHS attempt back
  -- -- different questions, different subject, reported as `resumed: true`. The
  -- caller had asked for one subject and silently received another.
  --
  -- The index below carried the same omission, so the database could not have
  -- caught it either.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and subject_id = p_subject_id
    and kind = 'test' and status = 'in_progress'
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
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated,
     is_free_trial)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false,
     -- MIGRATION 140: provenance only. Ratedness is already a literal false
     -- above and stays that way; this records WHY the attempt happened so the
     -- analytics filter can exclude trial play without excluding the practice
     -- of every paying family.
     public.subject_access_is_trial_only(v_student, p_subject_id))
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

-- get_test_attempt: rehydration payload (questions + options WITHOUT is_correct,
-- saved answers + flags, server deadline → remaining seconds). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).

revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'uq_test_attempts_open_test';
  if v_def is null then
    raise exception '143: uq_test_attempts_open_test is missing';
  end if;
  if position('subject_id' in v_def) = 0 then
    raise exception '143: the open-test index is still student-only: %', v_def;
  end if;
  if position('in_progress' in v_def) = 0 then
    raise exception '143: the open-test index lost its status predicate';
  end if;

  v_def := pg_get_functiondef('public.start_topic_test_attempt(uuid, uuid[], uuid[])'::regprocedure);
  if position('subject_id = p_subject_id' in v_def) = 0 then
    raise exception '143: the resume query still ignores the subject';
  end if;

  -- The DAILY round is a different rule and must not have been touched.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_rated_daily_live_per_day'
      and indexdef like '%is_rated%'
  ) then
    raise exception '143: the rated daily index was disturbed';
  end if;

  raise notice '143: an open practice test is now per child PER SUBJECT';
end $$;

commit;
