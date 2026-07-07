-- =============================================================================
-- 2026_07_07_040_status_reduction_and_mcq_four_options.sql
-- Owner rulings (2026-07-07):
--   A) Content lifecycle collapses to THREE statuses for BOTH questions and
--      news: 'in_review', 'published', 'rejected'. Creation lands in 'in_review'.
--      The content_status enum keeps its 6 physical values (dropping enum values
--      is unsafe and the type is shared) — the app + RPCs simply stop using
--      draft/approved/archived. Existing rows are remapped:
--        draft    -> in_review
--        approved -> published
--        archived -> rejected
--   B) The MCQ (multiple_choice) now requires EXACTLY 4 answer options (was 5),
--      still exactly 1 correct. options_required is a FIXED business rule now
--      (the admin question-types page no longer edits it).
--
-- Backports: data remap is one-time (migration only). Column defaults -> 004
-- (questions) / 014 (news). bulk_insert_questions status literal -> 011.
-- question_types MCQ options_required -> 012. assert comment -> 011/037 note.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- A) remap existing rows to the 3-status model ---------------------------
update public.questions set status = 'in_review', updated_at = now() where status = 'draft';
update public.questions set status = 'published', updated_at = now() where status = 'approved';
update public.questions set status = 'rejected',  updated_at = now() where status = 'archived';

update public.news set status = 'in_review', updated_at = now() where status = 'draft';
update public.news set status = 'published', updated_at = now() where status = 'approved';
update public.news set status = 'rejected',  updated_at = now() where status = 'archived';

-- New content is created in review (was 'draft').
alter table public.questions alter column status set default 'in_review';
alter table public.news      alter column status set default 'in_review';

-- ---- B) MCQ = exactly 4 options (fixed rule) --------------------------------
update public.question_types
   set options_required = 4, updated_at = now()
 where code = 'multiple_choice';

-- ---- bulk_insert_questions: land imports in 'in_review' (was 'draft') --------
-- Full CREATE OR REPLACE (only the inserted status literal changed vs canonical).
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
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

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

      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'in_review', v_pl::public.content_locale, v_profile, v_profile)
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

  insert into public.question_imports (imported_by, filename, subject_id, total, successful, failed, errors)
  values (v_profile, p_filename,
          (select id from public.subjects where name = (p_questions->0->'meta'->>'subject')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- ---- self-verify ------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.questions where status in ('draft','approved','archived'))
     or exists (select 1 from public.news where status in ('draft','approved','archived')) then
    raise exception 'self-verify: legacy statuses still present after remap';
  end if;
  if (select options_required from public.question_types where code = 'multiple_choice') <> 4 then
    raise exception 'self-verify: MCQ options_required is not 4';
  end if;
  if pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure) not like '%''in_review''%' then
    raise exception 'self-verify: bulk_insert_questions still lands imports in draft';
  end if;
  raise notice 'migration 040 self-verify PASS';
end $$;

commit;
