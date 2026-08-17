-- =============================================================================
-- 2026_08_17_119_trilingual_explanations.sql
-- =============================================================================
-- Migration: 2026_08_17_119_trilingual_explanations.sql
-- Purpose: Make the question EXPLANATION genuinely trilingual end to end.
--
--          NO SCHEMA CHANGE IS REQUIRED and none is made. public.question_
--          explanations has carried `locale public.content_locale not null`
--          plus `constraint uq_explanation_locale unique (question_id, locale)`
--          since 004, and its RLS policies (qexpl_select / qexpl_write, 010)
--          key off the QUESTION only -- they are entirely locale-agnostic. The
--          table has always been able to hold three explanations per question.
--          The gap was in the WRITE path and in the DISCLOSURE, and that is all
--          this migration touches.
--
--          1) BOTH bulk importers silently DROPPED a translated explanation.
--             In bulk_insert_questions and bulk_insert_olympiad_package_
--             questions the question_explanations insert was NESTED INSIDE the
--             `... and coalesce(translations->loc->>'body','') <> ''` guard, so
--             a row supplying {"en": {"explanation": "..."}} with no en BODY
--             lost that explanation with no row and no error -- not even an
--             entry in the per-item errors array. Nothing justifies the
--             coupling: there is no FK from question_explanations to
--             question_translations, and get_test_review joins the two
--             independently, so an explanation-only locale is fully servable.
--             The guard now wraps the TRANSLATION row only.
--
--             BACKWARD COMPATIBILITY IS TOTAL, and it is the reason the fix is
--             a hoist rather than a reshape. The payload contract is unchanged:
--             the explanation has lived at translations.<locale>.explanation
--             since migration 009 and still does. A legacy file carrying only
--             translations.az.{body,explanation} lands exactly one az
--             translation row and one az explanation row, exactly as before, so
--             every existing template and all 2897 live az rows are untouched.
--             The change is strictly ADDITIVE: payloads that used to lose data
--             now keep it.
--
--          2) get_test_review served the fallback INVISIBLY. It has always
--             resolved reader-locale-then-az -- correctly, in both branches --
--             but handed back one `explanation` string with no hint of which
--             locale produced it, so an English reader could not tell a real
--             translation from Azerbaijani text. Both branches now also emit
--             `explanation_locale` and `explanation_is_fallback`.
--
--             THESE KEYS ARE PURELY ADDITIVE AND THE SHIPPED MOBILE BINARY IS
--             SAFE. Neither client validates the payload -- both cast it after
--             checking only that `questions` is an array -- so unknown keys are
--             ignored. `explanation` keeps its exact type (a nullable string);
--             it is NOT reshaped into an object, because expo-updates cannot
--             reach a build whose runtimeVersion differs from the app version
--             and a shape change would strand installed apps. The server key is
--             snake_case and cannot collide with the clients' own camelCase
--             `explanationIsFallback`, which mobile's types.ts documents as
--             "never sent by the server".
--
--             Today both apps derive the flag themselves with a SECOND query
--             against question_explanations. The server value is strictly more
--             correct than that probe in two places, so they can drop it when
--             convenient: it is SECURITY DEFINER, so it sees an ARCHIVED
--             question's rows that qexpl_select hides from a student (the
--             client helpers deliberately stay silent there rather than
--             mislabel); and for a LEGACY daily round it reads the FROZEN
--             content_snapshot, which the clients can only approximate by
--             probing the live table. Those frozen snapshots are immutable by
--             design and can never be backfilled, so labelling them honestly is
--             the only available fix.
--
--          3) A length CEILING on explanation_body (defence in depth, NOT the
--             product cap). See the constraint's own note below.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql -- ALREADY
--            BACKPORTED: all three function bodies below were extracted from it
--            verbatim, so the two files cannot drift; the item-shape header
--            comment above bulk_insert_questions was updated too;
--          * 004_content_questions_tests.sql -- the ck_qexpl_body_len ceiling
--            (the table itself is unchanged);
--          * 013_validation_queries.sql -- new check 106.
-- Rollback: restore the three function bodies from git history and
--           `alter table public.question_explanations
--              drop constraint if exists ck_qexpl_body_len;`.
--           No data migration to undo -- nothing is rewritten or deleted.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) bulk_insert_questions -- explanation insert hoisted out of the body guard.
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
        if v_loc in ('az','en','ru') then
          -- Migration 119: the BODY guard wraps the TRANSLATION row only. It
          -- used to wrap the explanation insert too, so a locale supplying an
          -- explanation but no body had that explanation silently dropped --
          -- no row, no error, nothing in the per-item errors array.
          -- question_explanations has NO FK to question_translations and
          -- get_test_review joins the two independently, so an
          -- explanation-only locale is perfectly servable: that reader gets
          -- their own explanation next to the az body.
          -- BACKWARD COMPATIBLE: a legacy payload carrying only
          -- translations.az.{body,explanation} still lands exactly one az
          -- translation row and one az explanation row, unchanged.
          if coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
            insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                    nullif(v_item->'translations'->v_loc->>'prompt',''),
                    case when v_loc = v_pl then v_media end);
          end if;
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
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
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

-- Grants re-issued VERBATIM from 011. create-or-replace PRESERVES the existing
-- ACL, so a dropped revoke/grant is INVISIBLE on a live database and only
-- detonates on a from-zero bootstrap -- where anon would silently inherit
-- EXECUTE on a bulk import function.
revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) bulk_insert_olympiad_package_questions -- same hoist. create-or-replace on
--    the CURRENT (uuid, jsonb, uuid) signature: a migration must never drop a
--    live function, and the 2-arg overload 011 drops has not existed since 034.
-- -----------------------------------------------------------------------------
create or replace function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb,
  p_grade_id   uuid default null
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
  v_pool_grade uuid;
  -- Migration 101: optional pre-uploaded question image (the same field the
  -- general importer accepts). Assigned unconditionally per item below — it is
  -- loop-persistent, so leaving it unset would carry the previous question's
  -- image onto the next one.
  v_media uuid;
  -- Migration 108: content keys of THIS grade's existing pool, snapshotted once.
  v_dup_keys text[] := '{}';
  v_key      text;
begin
  -- Audit H2 (migration 035): olympiad pools are an Admin-only module (content
  -- managers must never manage Olympiad Preparation) — no permission fallback.
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

  -- Round 34: the import targets ONE grade pool. Explicit p_grade_id (the new
  -- per-grade admin flow) or the package's legacy single grade (old callers).
  v_pool_grade := coalesce(p_grade_id,
    (select grade_id from public.olympiad_packages where id = p_package_id));
  if v_pool_grade is null then
    raise exception 'bulk_insert_olympiad_package_questions: no target grade'
      using errcode = 'check_violation', hint = 'pool_grade_missing';
  end if;
  if exists (select 1 from public.olympiad_package_grades g
              where g.olympiad_package_id = p_package_id)
     and not exists (select 1 from public.olympiad_package_grades g
                      where g.olympiad_package_id = p_package_id
                        and g.grade_id = v_pool_grade) then
    raise exception 'bulk_insert_olympiad_package_questions: grade is not a package target'
      using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
  end if;

  -- Migration 108: APPEND, duplicate-guarded (replaces the creation-only raise).
  -- ONE snapshot of the existing pool's content keys, taken before the loop, so
  -- a 500-row import costs O(pool + rows) instead of re-querying per row. The
  -- snapshot is never extended during the loop — a row is only ever compared
  -- against what was already in the pool when the call started.
  -- ARCHIVED questions are included on purpose: the row still exists, and
  -- restoring it is the right admin action for a question that is already there.
  select coalesce(array_agg(k), '{}') into v_dup_keys
  from (
    select md5(
             public.norm_import_text(qt.body) || chr(31) ||
             public.norm_import_text(qt.media_asset_id::text) || chr(31) ||
             coalesce((
               select string_agg(
                        public.norm_import_text(aot.text) || chr(29) ||
                        public.norm_import_text(aot.media_asset_id::text),
                        chr(30) order by ao.order_index)
               from public.answer_options ao
               left join public.answer_option_translations aot
                 on aot.option_id = ao.id and aot.locale = q2.primary_locale
               where ao.question_id = q2.id), '')
           ) as k
    from public.questions q2
    join public.question_translations qt
      on qt.question_id = q2.id and qt.locale = q2.primary_locale
    where q2.olympiad_package_id = p_package_id
      and q2.grade_id = v_pool_grade
  ) s;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      -- Round 34: the TARGET GRADE is authoritative for every row — a stray
      -- meta.grade_level in the file can never leak a question into another
      -- grade's pool.
      v_grade := v_pool_grade;

      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- Migration 100: the PACKAGE owns the olympiad type. `meta.olympiad_type`
      -- in an uploaded row is ignored — the admin already chose the type in the
      -- package form, and asking every question to repeat it only created a way
      -- to disagree with it (a typo produced NULL silently, since the old
      -- lookup-by-name had no not-found branch). Subject and grade were already
      -- injected the same way; this closes the last redundant field.
      select p.olympiad_type_id into v_oly
        from public.olympiad_packages p
       where p.id = p_package_id;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- Module scope (migration 050): olympiad uploads live in 'olympiad' scope —
      -- a topic name matching an exam topic yields a SEPARATE olympiad-scoped row,
      -- so nothing ever surfaces inside the Exams module.
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

      -- ---- optional pre-uploaded question image (migration 101) ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- Migration 108: the incoming row's content key, built exactly like the
      -- stored one above. The option ORDER must mirror the insert's
      -- coalesce(order_index, v_order) with v_order starting at 0 — ordinality
      -- is 1-based, hence ord - 1 — or the two keys diverge and nothing ever
      -- matches.
      select md5(
               public.norm_import_text(v_item->'translations'->v_pl->>'body') || chr(31) ||
               public.norm_import_text(v_media::text) || chr(31) ||
               coalesce((
                 select string_agg(
                          public.norm_import_text(o->'text'->>v_pl) || chr(29) ||
                          public.norm_import_text(o->'image'->>v_pl),
                          chr(30) order by coalesce((o->>'order_index')::int, (ord - 1)::int))
                 from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
                        with ordinality as t(o, ord)), '')
             ) into v_key;
      if v_key = any(v_dup_keys) then
        raise exception 'duplicate question already in this grade pool';
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
        if v_loc in ('az','en','ru') then
          -- Migration 119: the BODY guard wraps the TRANSLATION row only. It
          -- used to wrap the explanation insert too, so a locale supplying an
          -- explanation but no body had that explanation silently dropped --
          -- no row, no error, nothing in the per-item errors array.
          -- question_explanations has NO FK to question_translations and
          -- get_test_review joins the two independently, so an
          -- explanation-only locale is perfectly servable: that reader gets
          -- their own explanation next to the az body.
          -- BACKWARD COMPATIBLE: a legacy payload carrying only
          -- translations.az.{body,explanation} still lands exactly one az
          -- translation row and one az explanation row, unchanged.
          if coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
            insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                    nullif(v_item->'translations'->v_loc->>'prompt',''),
                    case when v_loc = v_pl then v_media end);
          end if;
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
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
          end if;
        end loop;
      end loop;

      -- v_key is deliberately NOT pushed back into v_dup_keys: the comparison
      -- is against the PRE-EXISTING pool only. Two identical rows inside one
      -- file both import, exactly as they did before 108 — creation and
      -- add-grade are all-or-nothing, so failing the second one would undo a
      -- package creation that used to succeed.
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) get_test_review -- disclose WHICH locale produced the explanation.
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
               'explanation', coalesce(e.loc_ex, e.az_ex),
               -- Migration 119: WHICH locale produced the string above, and
               -- whether it is the az fallback rather than the reader's
               -- language. Additive keys: the shipped mobile binary ignores
               -- unknown keys (it casts the payload, it does not validate it)
               -- and keeps deriving the flag itself, so this cannot break it.
               -- In THIS branch the server is strictly more correct than the
               -- clients: they probe the LIVE question_explanations table,
               -- which is only a proxy for a FROZEN content_snapshot.
               'explanation_locale',
                 case when e.loc_ex is not null then v_loc
                      when e.az_ex  is not null then 'az' end,
               'explanation_is_fallback',
                 (v_loc <> 'az' and e.loc_ex is null and e.az_ex is not null),
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
      -- Migration 119: resolve each candidate ONCE. btrim/nullif treat a
      -- blank explanation as absent so the served text and the disclosed
      -- locale can never disagree (no write path produces a blank row).
      cross join lateral (
        select nullif(btrim(s.q_el->'translations'->v_loc->>'explanation'), '') as loc_ex,
               nullif(btrim(s.q_el->'translations'->'az'->>'explanation'), '')  as az_ex
      ) e
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
        'explanation', coalesce(e.loc_ex, e.az_ex),
        -- Migration 119: see the snapshot branch. SECURITY DEFINER means this
        -- flag is authoritative where the client probe cannot be: qexpl_select
        -- hides an ARCHIVED question's explanations from a student, so the
        -- clients deliberately stay silent there rather than mislabel.
        'explanation_locale',
          case when e.loc_ex is not null then v_loc
               when e.az_ex  is not null then 'az' end,
        'explanation_is_fallback',
          (v_loc <> 'az' and e.loc_ex is null and e.az_ex is not null),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end,
                               'is_correct', ao.is_correct)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
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
    cross join lateral (
      select nullif(btrim(qe.explanation_body), '')    as loc_ex,
             nullif(btrim(qe_az.explanation_body), '') as az_ex
    ) e
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

revoke all on function public.get_test_review(uuid, text) from public, anon;
grant execute on function public.get_test_review(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Length ceiling on explanation_body (defence in depth).
--
-- This is an ABUSE CEILING, not the product cap. The apps cap an explanation at
-- BULK_BODY_MAX (8000) before it ever reaches the database; this backstop only
-- bounds what a caller could store by going around them. Until now NOTHING
-- bounded it: the server validator length-checked the PRIMARY locale's
-- explanation only, so an en/ru explanation was never measured on either side,
-- and the column has no constraint. Publishing templates that teach per-locale
-- explanations increases the volume flowing down exactly that path, so the
-- ceiling lands in the same change.
--
-- Deliberately NOT VALID: it is enforced on every INSERT and UPDATE from here
-- on, but skips the validation scan of the 2897 existing rows. Their lengths
-- cannot be verified from here (this migration is written without database
-- access), and a ceiling that could abort the migration -- or block an
-- unrelated edit to a legacy row -- would be worse than the gap it closes. The
-- verify block below REPORTS any row already over the ceiling instead.
-- -----------------------------------------------------------------------------
alter table public.question_explanations
  drop constraint if exists ck_qexpl_body_len;
alter table public.question_explanations
  add constraint ck_qexpl_body_len
  check (length(explanation_body) <= 20000) not valid;

comment on constraint ck_qexpl_body_len on public.question_explanations is
  'Migration 119 abuse ceiling (20000). The product cap is BULK_BODY_MAX (8000), '
  'enforced in the apps; this only bounds a caller that bypasses them. NOT VALID '
  'on purpose: enforced going forward, legacy rows never scanned.';

-- -----------------------------------------------------------------------------
-- VERIFY -- raises, so a half-applied migration cannot be mistaken for success.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_def text;
  v_n   int;
  v_over bigint;
begin
  -- ---- both bulk importers must no longer couple explanation to body -------
  foreach v_def in array array[
    'public.bulk_insert_questions(jsonb,text)',
    'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'
  ]
  loop
    if to_regprocedure(v_def) is null then
      raise exception '119: % is missing', v_def;
    end if;
    if has_function_privilege('anon', v_def, 'EXECUTE') then
      raise exception '119: anon must never execute %', v_def;
    end if;
    if not has_function_privilege('authenticated', v_def, 'EXECUTE')
       or not has_function_privilege('service_role', v_def, 'EXECUTE') then
      raise exception '119: % lost a required grant', v_def;
    end if;

    declare v_body text := pg_get_functiondef(v_def::regprocedure);
    begin
      -- the OLD coupled guard must be gone ...
      if position($p$'az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body'$p$
                  in v_body) > 0 then
        raise exception '119: % still nests the explanation inside the body guard', v_def;
      end if;
      -- ... and the explanation insert must still be there, exactly once.
      v_n := (length(v_body) - length(replace(v_body, 'insert into public.question_explanations', '')))
             / length('insert into public.question_explanations');
      if v_n <> 1 then
        raise exception '119: % has % explanation inserts, expected 1', v_def, v_n;
      end if;
      -- backward compatibility: the payload contract is unchanged.
      if position($p$->'translations'->v_loc->>'explanation'$p$ in v_body) = 0 then
        raise exception '119: % no longer reads translations-><locale>->explanation', v_def;
      end if;
    end;
  end loop;

  -- ---- get_test_review must disclose the fallback in BOTH branches ---------
  if to_regprocedure('public.get_test_review(uuid,text)') is null then
    raise exception '119: get_test_review is missing';
  end if;
  if has_function_privilege('anon', 'public.get_test_review(uuid,text)', 'EXECUTE') then
    raise exception '119: anon must never execute get_test_review';
  end if;
  if not has_function_privilege('authenticated', 'public.get_test_review(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_test_review(uuid,text)', 'EXECUTE') then
    raise exception '119: get_test_review lost a required grant';
  end if;

  v_def := pg_get_functiondef('public.get_test_review(uuid,text)'::regprocedure);
  -- TWO branches: the live tables and the frozen daily-round snapshot. One hit
  -- means only half the readers learn they are looking at a fallback.
  v_n := (length(v_def) - length(replace(v_def, 'explanation_is_fallback', '')))
         / length('explanation_is_fallback');
  if v_n <> 2 then
    raise exception '119: get_test_review discloses the fallback in % branch(es), expected 2', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'explanation_locale', '')))
         / length('explanation_locale');
  if v_n <> 2 then
    raise exception '119: get_test_review reports explanation_locale in % branch(es), expected 2', v_n;
  end if;
  -- The az fallback itself must survive: reader-locale-then-az, never
  -- locale-only (which would blank the explanation for en/ru readers).
  if position('e.loc_ex, e.az_ex' in v_def) = 0 then
    raise exception '119: get_test_review no longer falls back to az';
  end if;
  -- The shipped binary parses `explanation` as a STRING. Reshaping it would
  -- strand every installed app (expo-updates cannot cross a runtimeVersion).
  if position($p$'explanation', coalesce(e.loc_ex, e.az_ex)$p$ in v_def) = 0 then
    raise exception '119: get_test_review changed the `explanation` value shape';
  end if;

  -- ---- the ceiling --------------------------------------------------------
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.question_explanations'::regclass
                    and conname = 'ck_qexpl_body_len') then
    raise exception '119: ck_qexpl_body_len was not created';
  end if;

  -- REPORT-ONLY: NOT VALID means these rows are legal and stay readable. A
  -- non-zero count is a heads-up, never a failure.
  select count(*) into v_over
  from public.question_explanations where length(explanation_body) > 20000;
  if v_over > 0 then
    raise notice '119: % pre-existing explanation row(s) exceed the 20000 ceiling '
                 '(left untouched by design -- NOT VALID)', v_over;
  end if;

  raise notice '119 OK -- both bulk importers store per-locale explanations '
               'independently of the body (legacy az-only payloads unchanged); '
               'get_test_review discloses explanation_locale + '
               'explanation_is_fallback in BOTH branches with the az fallback '
               'and the string shape intact; anon still cannot execute any of '
               'the three; ck_qexpl_body_len armed.';
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_17_119_trilingual_explanations.sql
-- =============================================================================
