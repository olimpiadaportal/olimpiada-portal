-- =============================================================================
-- 2026_07_12_059_bulk_import_v3_question_flow.sql
-- Round 20 items 13/15/7/9 — the question-creation backend pass:
--   * GENERAL bulk import (bulk_insert_questions v3):
--       - meta.type is OPTIONAL → defaults to single_choice (the "Sual növü"
--         field is removed from the admin flow; 5-option rule enforced by the
--         shared assert via question_types.options_required=5).
--       - meta.topic AND meta.subtopic are REQUIRED (owner item 13.2).
--       - meta.term (1..4) is REQUIRED: a NEW topic is created with it; an
--         existing exam topic with NULL term is UPGRADED to it (explicit admin
--         declaration — the cascade fills its subtopics/questions); a mismatch
--         with an already-termed topic is a per-item error.
--       - optional meta.media_asset_id → links the PRIMARY locale's image
--         (pre-uploaded question-media asset; validated).
--   * OLYMPIAD bulk import: CREATION-ONLY (owner item 15) — rejected once the
--     package already has questions; meta.type optional like above.
--   * DB safety net: NEW general-bank questions must carry topic + subtopic
--     (insert trigger; legacy rows untouched; term inherits via 054's guard).
--
-- Backports: 011 (both functions + trigger). Validation: 013 #63.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) safety net: new general-bank questions need full taxonomy --------------------
create or replace function public.question_taxonomy_guard()
returns trigger
language plpgsql
as $$
begin
  if new.olympiad_package_id is null then
    if new.topic_id is null or new.subtopic_id is null then
      raise exception 'question: topic and subtopic are required'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_question_taxonomy_guard on public.questions;
create trigger trg_question_taxonomy_guard
  before insert on public.questions
  for each row execute function public.question_taxonomy_guard();

-- ---- 2) general bulk import v3 ---------------------------------------------------------
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
  v_term     smallint; v_topic_term smallint;
  v_media    uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
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
      -- ---- required base taxonomy ----
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      -- type is optional since Round 20 — the platform is MCQ (single_choice).
      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      -- Per-type structure rules (five options, exactly one correct — 055).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- ---- REQUIRED term (Rüb) ----
      v_term := nullif(v_item->'meta'->>'term','')::smallint;
      if v_term is null or v_term not between 1 and 4 then
        raise exception 'term (1..4) is required';
      end if;

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

      -- ---- REQUIRED topic + subtopic (exam scope) ----
      if coalesce(v_item->'meta'->>'topic','') = '' then
        raise exception 'topic is required';
      end if;
      if coalesce(v_item->'meta'->>'subtopic','') = '' then
        raise exception 'subtopic is required';
      end if;

      select id, term into v_topic, v_topic_term from public.topics
        where subject_id = v_subject and name = (v_item->'meta'->>'topic')
          and scope = 'exam' limit 1;
      if v_topic is null then
        insert into public.topics (subject_id, grade_id, name, scope, term)
        values (v_subject, v_grade, v_item->'meta'->>'topic', 'exam', v_term)
        returning id into v_topic;
      elsif v_topic_term is null then
        -- explicit admin declaration upgrades a legacy (unreviewed) topic; the
        -- 054 cascade rolls the term onto its subtopics/questions.
        update public.topics set term = v_term, updated_at = now() where id = v_topic;
      elsif v_topic_term <> v_term then
        raise exception 'term % conflicts with topic "%" (term %)',
          v_term, v_item->'meta'->>'topic', v_topic_term;
      end if;

      select id into v_subtopic from public.subtopics
        where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
      if v_subtopic is null then
        insert into public.subtopics (topic_id, name, term)
        values (v_topic, v_item->'meta'->>'subtopic', v_term) returning id into v_subtopic;
      end if;

      -- ---- optional pre-uploaded question image ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      -- ---- primary locale + required body ----
      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, term, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'in_review', v_pl::public.content_locale, v_term, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''),
                  case when v_loc = v_pl then v_media end);
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

  insert into public.question_imports (imported_by, filename, subject_id, total, successful, failed, errors)
  values (v_profile, p_filename,
          (select id from public.subjects where name = (p_questions->0->'meta'->>'subject')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_questions(jsonb, text) is
  'Bulk question import v3 (Round 20): topic+subtopic+term REQUIRED, type optional '
  '(defaults single_choice, 5 options), optional pre-uploaded question image; exam-'
  'scoped taxonomy resolve-or-create; per-item fault tolerance. content.create gated.';

revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- ---- 3) olympiad bulk import: creation-only + optional type -----------------------------
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

  -- CREATION-ONLY (owner item 15, migration 059): once a package holds
  -- questions, further bulk imports are rejected — uploads happen only during
  -- the create-package flow (a totally-failed first import may be retried).
  if exists (select 1 from public.questions where olympiad_package_id = p_package_id) then
    raise exception 'olympiad: questions can only be bulk uploaded during package creation'
      using errcode = 'check_violation';
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

      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

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

      -- Olympiad taxonomy stays OPTIONAL and olympiad-scoped (migration 050).
      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic')
            and scope = 'olympiad' limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name, scope)
          values (v_subject, v_grade, v_item->'meta'->>'topic', 'olympiad') returning id into v_topic;
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
  'Bulk import of PRIVATE trilingual questions for one olympiad package — CREATION-'
  'ONLY since migration 059 (rejected once the package has questions). Type optional '
  '(single_choice, 5 options); olympiad-scoped optional taxonomy. Administrators only.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) to authenticated, service_role;

-- ---- self-verify ------------------------------------------------------------------------
do $$
begin
  if position('creation' in pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'creation-only gate missing';
  end if;
  if position('term (1..4) is required' in pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) = 0 then
    raise exception 'bulk term requirement missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_question_taxonomy_guard') then
    raise exception 'taxonomy guard trigger missing';
  end if;
  raise notice 'bulk import v3 self-verify PASS';
end $$;

commit;
