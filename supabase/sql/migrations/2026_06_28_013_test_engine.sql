-- Migration: 2026_06_28_013_test_engine.sql
-- Purpose: Stage 13 (Test & Daily Task Engine) — server-side RANDOM question
--          selection + attempts + auto-grading. Users never choose difficulty and
--          never see is_correct before grading; scores are computed server-side.
--          test_attempts gains nullable test_id (random practice has no fixed test)
--          + subject_id + kind. Three SECURITY DEFINER RPCs (executable by the
--          authenticated student; each verifies it owns the attempt):
--            start_practice_attempt  → picks N random published objective questions
--            get_practice_attempt    → returns questions + options WITHOUT is_correct
--            grade_practice_attempt  → records answers, auto-grades, sets the score
-- Environment first applied: development/staging
-- Related root SQL file(s): 005 (test_attempts cols), 011 (functions), 013 (validation).
-- Backport status: completed (canonical 005/011 + 013 #21; from-zero rebuild = 21/21 PASS)
-- Destructive change: no (nullable relax + additive columns/functions)
-- Rollback notes: drop the 3 functions; columns are additive.
-- =============================================================================

-- test_attempts: allow random practice (no fixed test) + remember subject/kind.
alter table public.test_attempts alter column test_id drop not null;
alter table public.test_attempts
  add column if not exists subject_id uuid references public.subjects (id) on delete set null,
  add column if not exists kind text not null default 'test'
    check (kind in ('test', 'practice', 'daily', 'olympiad'));
create index if not exists idx_test_attempts_subject on public.test_attempts (subject_id);

-- ---- start_practice_attempt ----
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_access  public.child_access_status;
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select access_status, grade_id into v_access, v_grade
  from public.students where profile_id = v_student;
  if v_access is null then raise exception 'start_practice: not a student'; end if;
  if v_access not in ('trialing', 'active') then
    raise exception 'start_practice: no active access' using errcode = 'check_violation';
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  -- Random selection of published, objective, auto-gradable questions for the
  -- subject (grade-matched when the child has a grade). Difficulty is NOT chosen.
  with picked as (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
    order by random()
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

-- ---- get_practice_attempt (questions + options, NO is_correct) ----
create or replace function public.get_practice_attempt(
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
  v_owner   uuid;
  v_status  public.attempt_status;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_result  jsonb;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;

  select jsonb_build_object('attempt_id', p_attempt_id, 'status', v_status,
                            'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
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

-- ---- grade_practice_attempt (records answers, auto-grades, sets score) ----
create or replace function public.grade_practice_attempt(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_item    jsonb;
  v_qid     uuid;
  v_sel     uuid[];
  v_correct uuid[];
  v_ok      boolean;
  v_score   numeric := 0;
  v_max     int;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;
  if v_status <> 'in_progress' then raise exception 'attempt already submitted'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_qid := (v_item->>'question_id')::uuid;
    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao where ao.question_id = v_qid and ao.is_correct;

    v_ok := (array_length(v_correct, 1) is not null)
        and (v_sel <@ v_correct) and (v_correct <@ v_sel)
        and coalesce(array_length(v_sel, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    if v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('score', v_score, 'max', v_max,
    'results', (select coalesce(jsonb_agg(jsonb_build_object(
                  'question_id', question_id, 'is_correct', is_correct)), '[]'::jsonb)
                from public.test_attempt_answers where attempt_id = p_attempt_id));
end;
$$;

-- EXECUTE: the authenticated student (owner-checked inside); never anon.
revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;
revoke all on function public.get_practice_attempt(uuid, text) from public, anon;
grant execute on function public.get_practice_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.grade_practice_attempt(uuid, jsonb) from public, anon;
grant execute on function public.grade_practice_attempt(uuid, jsonb) to authenticated, service_role;

-- =============================================================================
-- End of 2026_06_28_013_test_engine.sql
-- =============================================================================
