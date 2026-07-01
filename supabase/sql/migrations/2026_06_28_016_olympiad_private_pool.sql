-- Migration: 2026_06_28_016_olympiad_private_pool.sql
-- Purpose: Batch D — Olympiad packages now own a PRIVATE per-package question pool
--          (NOT shared with the general question bank). A new nullable column
--          public.questions.olympiad_package_id marks a question as PRIVATE to one
--          package. Such questions are EXCLUDED from the general pool everywhere:
--            * admin /questions list  → filter olympiad_package_id IS NULL
--            * start_practice_attempt  → only general (olympiad_package_id IS NULL)
--            * bulk_insert_questions    → always leaves olympiad_package_id NULL
--          The olympiad ATTEMPT engine (start_olympiad_attempt) now draws its 25
--          random questions ONLY from questions WHERE olympiad_package_id = package
--          (replacing the olympiad_package_questions → general-questions linkage;
--          attempts still reference public.questions(id), so test_attempt_answers /
--          get_/grade_practice_attempt are UNCHANGED).
--          New SECURITY DEFINER RPC bulk_insert_olympiad_package_questions() inserts
--          private questions scoped to a package (admin/content.create gated; not anon).
-- Environment first applied: development/staging
-- Related root SQL file(s): 004 (questions column), 011 (functions),
--          015 (private-pool note), 013 (validation #23).
-- Backport status: completed (column → canonical 015; start_practice_attempt +
--          start_olympiad_attempt + bulk_insert_olympiad_package_questions →
--          canonical 011; validation #23 + function list → 013; non-destructive
--          from-zero rebuild = 23/23 PASS)
-- Destructive change: no (additive nullable column + CREATE OR REPLACE functions)
-- Rollback notes: drop bulk_insert_olympiad_package_questions(); re-apply prior
--          start_practice_attempt / start_olympiad_attempt; drop column
--          public.questions.olympiad_package_id (cascades nothing — additive).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) PRIVATE-pool marker on questions.
--    NULL  → general question (visible in admin list + practice random pool).
--    set   → question belongs PRIVATELY to that olympiad package only.
-- ---------------------------------------------------------------------------
alter table public.questions
  add column if not exists olympiad_package_id uuid
    references public.olympiad_packages (id) on delete cascade;

comment on column public.questions.olympiad_package_id is
  'When set, this question is PRIVATE to that olympiad package and is excluded from the general question list and from practice random selection. NULL = general question.';

create index if not exists idx_questions_olympiad_package
  on public.questions (olympiad_package_id);

-- ---------------------------------------------------------------------------
-- 2) start_practice_attempt — EXCLUDE private olympiad questions from the
--    general practice random pool. (Only change: olympiad_package_id IS NULL.)
-- ---------------------------------------------------------------------------
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

  -- Random selection of published, objective, auto-gradable GENERAL questions for
  -- the subject (grade-matched when the child has a grade). Difficulty is NOT
  -- chosen. PRIVATE olympiad-package questions are excluded.
  with picked as (
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

-- ---------------------------------------------------------------------------
-- 3) start_olympiad_attempt — draw 25 random questions ONLY from the package's
--    PRIVATE pool (questions.olympiad_package_id = package), no longer from the
--    olympiad_package_questions → general-questions join. Attempts still
--    reference public.questions(id) so the shared attempt/grading path is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_subject uuid;
  v_n_per   int;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select subject_id, questions_per_attempt into v_subject, v_n_per
  from public.olympiad_packages where id = p_package_id;
  v_n_per := coalesce(v_n_per, 25);

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, v_subject, 'olympiad', 'in_progress')
  returning id into v_attempt;

  -- PRIVATE pool: questions assigned to this package only.
  with picked as (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit greatest(1, v_n_per)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) bulk_insert_olympiad_package_questions — import PRIVATE trilingual
--    questions for one package. Same item format as bulk_insert_questions but
--    every inserted question gets olympiad_package_id = p_package_id (so it stays
--    out of the general pool). Subject/grade default to the package's subject and
--    the item's grade_level; type resolved by name. Admin/content.create gated.
-- ---------------------------------------------------------------------------
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
  if v_profile is null or not (public.is_admin() or public.has_permission('content.create')) then
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
      -- subject: package subject wins; fall back to item meta.subject by name.
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

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

      -- PRIVATE: olympiad_package_id set; published immediately so the attempt
      -- engine (which requires status='published') can draw from the pool.
      -- difficulty removed: difficulty_id left null.
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

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) is
  'Bulk import of PRIVATE trilingual questions for one olympiad package (sets questions.olympiad_package_id, status published). Caller must hold content.create (checked internally). Not anon-executable.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) to authenticated, service_role;

-- =============================================================================
-- End of 2026_06_28_016_olympiad_private_pool.sql
-- =============================================================================
