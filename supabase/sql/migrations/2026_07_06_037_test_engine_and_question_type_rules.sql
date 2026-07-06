-- =============================================================================
-- Migration 2026_07_06_037 — Test Engine T0 + per-type question structure rules
-- Plan: docs/plans/TEST_ENGINE_PLAN.md (owner decisions 2026-07-06: FIXED 25
-- questions / 25 minutes, TRUE resume, unlimited attempts w/ fresh re-draw,
-- no daily tasks in this stage, option shuffling deferred).
--
-- Part A — question-type structure rules (owner: MCQ-only launch):
--   question_types gains status / options_required / correct_required. The MCQ
--   is the existing `multiple_choice` row — the ONLY type the owner kept on the
--   live DB (the other five seed types were deleted from the taxonomy earlier);
--   it becomes: exactly 5 options, exactly 1 correct, status 'active'. Every
--   other code (present in from-zero seeds) starts 'inactive' = not selectable
--   for NEW questions. assert_question_type_rules() enforces this inside BOTH
--   bulk-import RPCs (the admin form enforces the same rules app-side).
--   Existing published questions keep working (attempt RPCs filter by CODE).
--
-- Part B — timed topic-test engine (kind='test'):
--   test_attempts gains question_ids/deadline_at/duration_seconds/topic_ids/
--   subtopic_ids/canceled_at; answers gain is_marked (flag-for-review).
--   RPCs: start_topic_test_attempt / get_test_attempt / save_test_answers /
--   submit_test_attempt / cancel_test_attempt / get_test_review /
--   expire_stale_test_attempts (+ 15-min pg_cron). Server-authoritative
--   everything: draw, deadline, grading, single-open, expiry. Answer keys are
--   revealed ONLY by get_test_review, which requires status='graded'.
--
-- Backported to canonical 001/003/005/011/012/016/013.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Part A1 — enum + structural columns
-- -----------------------------------------------------------------------------
alter type public.attempt_status add value if not exists 'canceled';
alter type public.attempt_status add value if not exists 'expired';

alter table public.question_types
  add column if not exists status public.catalog_status not null default 'active',
  add column if not exists options_required int,
  add column if not exists correct_required int;

comment on column public.question_types.status is
  'active = selectable for NEW questions in the creation form / bulk import. Existing questions of an inactive type keep working (attempt RPCs filter by code).';
comment on column public.question_types.options_required is
  'Exact number of answer options a NEW question of this type must have (NULL = flexible 2..10). Enforced by assert_question_type_rules + the admin form.';
comment on column public.question_types.correct_required is
  'Exact number of CORRECT options required (NULL = at least 1).';

-- MCQ-only launch (owner, 2026-07-06): multiple_choice IS the MCQ (5 options,
-- exactly 1 correct) and is the only type selectable for new questions. The
-- other codes exist only in from-zero seeds (deleted from the live taxonomy).
update public.question_types set options_required = 5, correct_required = 1 where code = 'multiple_choice';
update public.question_types set options_required = 2, correct_required = 1 where code = 'true_false';
update public.question_types set status = 'inactive' where code <> 'multiple_choice';
update public.question_types set status = 'active'   where code = 'multiple_choice';

-- -----------------------------------------------------------------------------
-- Part A2 — the shared per-type validator (called from both bulk RPCs; the
-- admin single-question form applies the same rules app-side from the columns).
-- -----------------------------------------------------------------------------
create or replace function public.assert_question_type_rules(
  p_type_id uuid,
  p_options jsonb
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_req         int;
  v_correct_req int;
  v_status      public.catalog_status;
  v_name        text;
  v_n           int;
  v_ncorrect    int;
begin
  select options_required, correct_required, status, name
    into v_req, v_correct_req, v_status, v_name
  from public.question_types where id = p_type_id;
  if not found then
    raise exception 'unknown question type';
  end if;
  if v_status <> 'active' then
    raise exception 'question type "%" is not enabled for new questions', v_name;
  end if;

  select count(*),
         count(*) filter (where coalesce((o->>'is_correct')::boolean, false))
    into v_n, v_ncorrect
  from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o;

  if v_req is not null and v_n <> v_req then
    raise exception 'type "%" requires exactly % answer options (got %)', v_name, v_req, v_n;
  end if;
  if v_req is null and (v_n < 2 or v_n > 10) then
    raise exception 'between 2 and 10 answer options required (got %)', v_n;
  end if;
  if v_correct_req is not null and v_ncorrect <> v_correct_req then
    raise exception 'type "%" requires exactly % correct option(s) (got %)', v_name, v_correct_req, v_ncorrect;
  end if;
  if v_correct_req is null and v_ncorrect < 1 then
    raise exception 'at least one correct option is required';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Part A3 — bulk_insert_questions: add the per-type structure assertion
-- (body otherwise identical to canonical 011).
-- -----------------------------------------------------------------------------
create or replace function public.bulk_insert_questions(
  p_questions jsonb,
  p_filename  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
  -- AuthZ (DEFINER bypasses RLS, so we must check the caller's permission here).
  if v_profile is null or not (public.is_admin() or public.has_permission('content.create')) then
    raise exception 'bulk_insert_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_questions: payload must be a JSON array';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      -- ---- resolve taxonomy by code/level (required) ----
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

      -- Per-type structure rules (migration 037): active type + exact option /
      -- correct-option counts (MCQ = 5 options, exactly 1 correct).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- difficulty removed from the platform (difficulty_id left null).

      -- ---- optional taxonomy (resolve-or-create) ----
      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic') limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name)
          values (v_subject, v_grade, v_item->'meta'->>'topic') returning id into v_topic;
        end if;
        if coalesce(v_item->'meta'->>'subtopic','') <> '' then
          select id into v_subtopic from public.subtopics
            where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
          if v_subtopic is null then
            insert into public.subtopics (topic_id, name)
            values (v_topic, v_item->'meta'->>'subtopic') returning id into v_subtopic;
          end if;
        end if;
      end if;

      -- ---- primary locale + required body ----
      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- ---- question row ----
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'draft', v_pl::public.content_locale, v_profile, v_profile)
      returning id into v_qid;

      -- ---- translations (+ optional explanation) for every provided locale ----
      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      -- ---- answer options (+ per-locale option text) ----
      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      -- per-item rollback to savepoint; record and continue.
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  insert into public.question_imports (imported_by, filename, subject_id, total, successful, failed, errors)
  values (v_profile, p_filename,
          (select id from public.subjects where name = (p_questions->0->'meta'->>'subject')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Part A4 — bulk_insert_olympiad_package_questions: same assertion (body is the
-- migration-035 Admin-only version + the assert call).
-- -----------------------------------------------------------------------------
create or replace function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_pkg_subj uuid;
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
  -- Audit H2 (migration 035): olympiad pools are an Admin-only module.
  if v_profile is null or not public.is_admin() then
    raise exception 'bulk_insert_olympiad_package_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_olympiad_package_questions: payload must be a JSON array';
  end if;

  select subject_id into v_pkg_subj from public.olympiad_packages where id = p_package_id;
  if not found then
    raise exception 'bulk_insert_olympiad_package_questions: package not found';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

      -- Per-type structure rules (migration 037).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic') limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name)
          values (v_subject, v_grade, v_item->'meta'->>'topic') returning id into v_topic;
        end if;
        if coalesce(v_item->'meta'->>'subtopic','') <> '' then
          select id into v_subtopic from public.subtopics
            where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
          if v_subtopic is null then
            insert into public.subtopics (topic_id, name)
            values (v_topic, v_item->'meta'->>'subtopic') returning id into v_subtopic;
          end if;
        end if;
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- PRIVATE + published; difficulty removed (difficulty_id null).
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale,
         olympiad_package_id, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'published', v_pl::public.content_locale,
         p_package_id, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Part B1 — attempt-table extensions (additive, non-destructive)
-- -----------------------------------------------------------------------------
alter table public.test_attempts
  add column if not exists question_ids     uuid[] not null default '{}',
  add column if not exists deadline_at      timestamptz,
  add column if not exists duration_seconds int,
  add column if not exists topic_ids        uuid[] not null default '{}',
  add column if not exists subtopic_ids     uuid[] not null default '{}',
  add column if not exists canceled_at      timestamptz;

comment on column public.test_attempts.question_ids is
  'The fixed server-drawn question set (stable across resume; the answer rows are the source of truth for grading).';
comment on column public.test_attempts.deadline_at is
  'Server-authoritative deadline (started_at + duration). Client countdown is UX only; save/submit clamp against this.';

alter table public.test_attempt_answers
  add column if not exists is_marked boolean not null default false;

-- Single open timed test per child (practice/olympiad flows are unaffected).
create unique index if not exists uq_test_attempts_open_test
  on public.test_attempts (student_profile_id)
  where kind = 'test' and status = 'in_progress';

-- Expiry sweep support.
create index if not exists idx_test_attempts_deadline
  on public.test_attempts (deadline_at)
  where status = 'in_progress';

-- -----------------------------------------------------------------------------
-- Part B2 — start_topic_test_attempt: FIXED 25 questions / 25 minutes (owner).
-- Access guard identical to start_practice_attempt (giveaway / free-access /
-- live dated subscription covering the subject). TRUE resume: an in-progress,
-- not-yet-expired test attempt is returned instead of creating a second one.
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
  c_duration constant int := 1500;  -- 25 minutes (60s/question)
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
  v_deadline timestamptz;
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

  -- TRUE resume: one open timed test at a time. Still-running → return it;
  -- past-deadline → expire it and start fresh.
  select id, deadline_at into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at, 'duration_seconds', c_duration);
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now()
     where id = v_existing.id;
  end if;

  -- Server-random draw, published MCQ-family, general pool, grade-matched;
  -- scoped to the selection, falling back to subject-wide when the scope has
  -- no questions (plan §5).
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

  v_deadline := now() + make_interval(secs => c_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, v_deadline, c_duration, v_topics, v_subs)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', c_duration,
    'count', cardinality(v_qids));
end;
$$;

-- -----------------------------------------------------------------------------
-- Part B3 — get_test_attempt: rehydration payload (questions + options WITHOUT
-- is_correct, saved answers + flags, server deadline → remaining seconds).
-- -----------------------------------------------------------------------------
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
  v_result   jsonb;
begin
  select id, student_profile_id, status, kind, subject_id,
         deadline_at, duration_seconds, score, max_score
    into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
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
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Part B4 — save_test_answers: idempotent autosave. Only attempt-member rows
-- are touched; rejected once the server deadline has passed.
-- Item shape: [{question_id, selected_option_ids?: uuid[], is_marked?: bool,
--               time_spent_ms?: int}]
-- -----------------------------------------------------------------------------
create or replace function public.save_test_answers(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_rows     int;
  v_saved    int := 0;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'save: attempt is not in progress' using errcode = 'check_violation';
  end if;
  if v_att.deadline_at is not null and now() > v_att.deadline_at then
    raise exception 'save: deadline passed' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_n := v_n + 1;
    exit when v_n > 100;  -- payload cap
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_marked = coalesce((v_item->>'is_marked')::boolean, is_marked),
           time_spent_ms = least(coalesce(nullif(v_item->>'time_spent_ms','')::bigint, time_spent_ms, 0), 86400000),
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    v_saved := v_saved + v_rows;
  end loop;

  return jsonb_build_object(
    'saved', v_saved,
    'remaining_seconds',
      case when v_att.deadline_at is null then null
           else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Part B5 — submit_test_attempt: merge final answers (60s grace past the
-- deadline; later answers are IGNORED, saved ones still grade), then grade
-- FROM THE STORED ROWS (never from the client array — audit-H5 posture),
-- idempotent for already-graded attempts. Returns score + per-question results
-- + per-topic breakdown.
-- -----------------------------------------------------------------------------
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
  select id, student_profile_id, status, deadline_at, score, max_score into v_att
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
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao
      where ao.question_id = v_r.question_id and ao.is_correct;

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

-- Shared result payload (score + per-question + per-topic breakdown). Internal
-- helper for submit (and re-reads); owner check lives in the callers.
create or replace function public.test_attempt_result(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'attempt_id', ta.id,
    'status', ta.status,
    'score', ta.score,
    'max', ta.max_score,
    'submitted_at', ta.submitted_at,
    'results', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question_id', taa.question_id, 'is_correct', taa.is_correct)), '[]'::jsonb)
      from public.test_attempt_answers taa where taa.attempt_id = ta.id),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', b.tid, 'name', b.tname, 'total', b.total, 'correct', b.correct)), '[]'::jsonb)
      from (
        select q.topic_id as tid, tp.name as tname,
               count(*) as total,
               count(*) filter (where taa.is_correct) as correct
        from public.test_attempt_answers taa
        join public.questions q on q.id = taa.question_id
        left join public.topics tp on tp.id = q.topic_id
        where taa.attempt_id = ta.id
        group by q.topic_id, tp.name
      ) b))
  from public.test_attempts ta
  where ta.id = p_attempt_id;
$$;

-- -----------------------------------------------------------------------------
-- Part B6 — cancel: counts for NOTHING (no score, no points, no streak).
-- -----------------------------------------------------------------------------
create or replace function public.cancel_test_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
begin
  select id, student_profile_id, status into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'cancel: attempt is not in progress' using errcode = 'check_violation';
  end if;

  update public.test_attempts
     set status = 'canceled', canceled_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Part B7 — post-grading review: the ONLY place answer keys are revealed, and
-- only for the owner's GRADED attempt (works for practice attempts too).
-- -----------------------------------------------------------------------------
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
  v_result  jsonb;
begin
  select id, student_profile_id, status, score, max_score into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'graded' then
    raise exception 'review: attempt not graded yet' using errcode = 'check_violation';
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
    left join public.question_explanations qe
      on qe.question_id = taa.question_id and qe.locale = v_loc::public.content_locale
    left join public.question_explanations qe_az
      on qe_az.question_id = taa.question_id and qe_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Part B8 — stale-attempt expiry (cron): timed tests 5 min past deadline →
-- 'expired'; practice/olympiad attempts stuck in_progress >24h → 'abandoned'.
-- -----------------------------------------------------------------------------
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
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind = 'test' and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily') and status = 'in_progress'
     and started_at < now() - interval '24 hours';
  get diagnostics v_other = row_count;

  return jsonb_build_object('tests_expired', v_tests, 'others_abandoned', v_other);
end;
$$;

-- Grants: learner-facing RPCs are authenticated (owner-checked in body);
-- the sweep is service-role/cron only.
revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;
revoke all on function public.get_test_attempt(uuid, text) from public, anon;
grant execute on function public.get_test_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.save_test_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_test_answers(uuid, jsonb) to authenticated, service_role;
revoke all on function public.submit_test_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated, service_role;
revoke all on function public.cancel_test_attempt(uuid) from public, anon;
grant execute on function public.cancel_test_attempt(uuid) to authenticated, service_role;
revoke all on function public.get_test_review(uuid, text) from public, anon;
grant execute on function public.get_test_review(uuid, text) to authenticated, service_role;
revoke all on function public.test_attempt_result(uuid) from public, anon, authenticated;
grant execute on function public.test_attempt_result(uuid) to service_role;
revoke all on function public.expire_stale_test_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_test_attempts() to service_role;
revoke all on function public.assert_question_type_rules(uuid, jsonb) from public, anon;
grant execute on function public.assert_question_type_rules(uuid, jsonb) to authenticated, service_role;

-- Cron: sweep every 15 minutes (guarded; lazy deadline checks keep correctness
-- even where pg_cron is absent).
do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if v_has_cron then
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_expire_stale_attempts';

    perform cron.schedule(
      'olympiq_expire_stale_attempts',
      '*/15 * * * *',
      'select public.expire_stale_test_attempts();'
    );
    raise notice 'pg_cron job olympiq_expire_stale_attempts scheduled (every 15 min).';
  else
    raise notice 'pg_cron absent — stale-attempt expiry NOT scheduled (skipped safely).';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Self-verification.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'test_attempts' and column_name = 'deadline_at'
  ) then
    raise exception '037 verify: test_attempts.deadline_at missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_test_attempts_open_test'
  ) then
    raise exception '037 verify: uq_test_attempts_open_test missing';
  end if;
  if not exists (
    select 1 from public.question_types
    where code = 'multiple_choice' and options_required = 5 and correct_required = 1 and status = 'active'
  ) then
    raise exception '037 verify: multiple_choice MCQ config missing';
  end if;
  if exists (
    select 1 from public.question_types where code <> 'multiple_choice' and status = 'active'
  ) then
    raise exception '037 verify: a non-MCQ question type is still active';
  end if;
  if has_function_privilege('authenticated', 'public.expire_stale_test_attempts()', 'execute') then
    raise exception '037 verify: expiry sweep is client-executable';
  end if;
  if position('assert_question_type_rules' in
       pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) = 0 then
    raise exception '037 verify: bulk_insert_questions missing the type-rule assert';
  end if;
end $$;

commit;
