-- Migration: 2026_06_28_009_bulk_question_import.sql
-- Purpose: Admin bulk question operations foundation (ported architecture from the
--          owner's UniPrep admin, implemented natively on our normalized trilingual
--          schema). Adds an atomic, per-item fault-tolerant bulk-insert RPC + an
--          import-history table. Lets Administrators / Content Managers import many
--          questions (az/en/ru) in one call instead of one-at-a-time.
-- Environment first applied: development/staging
-- Related root SQL file(s): 004 (question_imports table), 010 (RLS),
--          011 (bulk_insert_questions fn + privileges), 013 (validation).
-- Backport status: completed (canonical 004/010/011/013; from-zero rebuild = 18/18 PASS)
-- Destructive change: no (additive function/table/policies)
-- Rollback notes: drop bulk_insert_questions(); drop question_imports + its policy.
-- Security: SECURITY DEFINER fn checks has_permission('content.create') internally
--           (DEFINER bypasses RLS), derives created_by from current_profile_id()
--           (never trusts caller input), and is NOT executable by anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- question_imports : history/audit of bulk imports (one row per bulk call).
-- -----------------------------------------------------------------------------
create table if not exists public.question_imports (
  id          uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles (id) on delete set null,
  filename    text,
  subject_id  uuid references public.subjects (id) on delete set null,
  total       integer not null default 0,
  successful  integer not null default 0,
  failed      integer not null default 0,
  errors      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_question_imports_imported_by
  on public.question_imports (imported_by, created_at desc);

-- Privileges: importer/admin may READ; writes happen only via the DEFINER fn.
revoke all on public.question_imports from anon, authenticated;
grant select on public.question_imports to authenticated;  -- RLS limits rows
grant all on public.question_imports to service_role;

alter table public.question_imports enable row level security;
drop policy if exists "question_imports_select" on public.question_imports;
create policy "question_imports_select" on public.question_imports for select to authenticated
  using (imported_by = public.current_profile_id() or public.is_admin());

-- -----------------------------------------------------------------------------
-- bulk_insert_questions : atomic, per-item fault-tolerant batch insert across the
-- normalized trilingual question tables. Resolves taxonomy by code/level/name and
-- auto-creates missing topics/subtopics/sources. Each item runs in its own
-- subtransaction (BEGIN..EXCEPTION): a bad item is skipped + reported, good items
-- persist. Returns {total, successful, failed, errors[]}.
--
-- Item shape (JSON):
-- {
--   "primary_locale": "az",
--   "meta": { "subject_code","grade_level","type_code","difficulty_code",
--             "olympiad_type_code"?, "topic"?, "subtopic"?, "source"? },
--   "translations": { "az": {"body","prompt"?,"explanation"?}, "en"?: {...}, "ru"?: {...} },
--   "options": [ { "is_correct": true, "order_index"?: 0, "text": {"az": "...","en"?:"...","ru"?:"..."} } ]
-- }
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
  v_subject  uuid; v_grade uuid; v_type uuid; v_diff uuid; v_oly uuid; v_source uuid;
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
      select id into v_subject from public.subjects where code = (v_item->'meta'->>'subject_code');
      if v_subject is null then raise exception 'unknown subject_code %', coalesce(v_item->'meta'->>'subject_code','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where code = (v_item->'meta'->>'type_code');
      if v_type is null then raise exception 'unknown type_code %', coalesce(v_item->'meta'->>'type_code','(null)'); end if;

      select id into v_diff from public.difficulty_levels where code = (v_item->'meta'->>'difficulty_code');
      if v_diff is null then raise exception 'unknown difficulty_code %', coalesce(v_item->'meta'->>'difficulty_code','(null)'); end if;

      -- ---- optional taxonomy (resolve-or-create) ----
      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type_code','') <> '' then
        select id into v_oly from public.olympiad_types where code = (v_item->'meta'->>'olympiad_type_code');
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
        (v_grade, v_subject, v_topic, v_subtopic, v_type, v_diff,
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
          (select id from public.subjects where code = (p_questions->0->'meta'->>'subject_code')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_questions(jsonb, text) is
  'Atomic per-item bulk question import (az/en/ru). Caller must hold content.create (checked internally). created_by derived from session. Not anon-executable.';

-- EXECUTE: authenticated content authors + service_role; never anon/public.
revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- =============================================================================
-- End of 2026_06_28_009_bulk_question_import.sql
-- =============================================================================
