-- 108 — Let an olympiad grade pool be APPENDED to, not just created once
--
-- WHY
-- ---
-- Since migration 059 the pool importer refused every upload into a (package,
-- grade) that already held questions: "questions can only be bulk uploaded once
-- per grade". That made the package's OWN grade the only grade an admin could
-- never bulk-upload into — a grade is targeted at creation together with its
-- file, so its pool is non-empty from the first second and the creation-only
-- raise fires forever after. Topping up a pool (the Round-51 rotation rewards a
-- bigger one: a student sees no repeat until their cycle over the whole pool is
-- exhausted) meant adding questions one at a time in the pool editor.
--
-- Owner decision 2026-08-11: the pool is APPENDABLE per grade. The creation-only
-- raise is replaced by a per-row DUPLICATE GUARD, because the realistic failure
-- mode of a newly-enabled append is re-uploading the same file — and a
-- duplicated body silently breaks the promise that a student never repeats a
-- question (the rotation dedupes by question id, so two identical bodies can
-- even land in one attempt).
--
-- WHAT A DUPLICATE IS
-- -------------------
-- md5 over: the normalized primary-locale body + the question image id + every
-- option's normalized text and image id, in stored order_index order. Text is
-- normalized by the new public.norm_import_text (trim, collapse whitespace,
-- lowercase) so a re-export with different spacing still matches.
--
-- COMPARED ONLY AGAINST THE PRE-EXISTING POOL. The key array is snapshotted
-- once, before the row loop, and rows inserted BY THIS CALL are never added to
-- it. That is not an optimization — it is the compatibility rule:
--   * during creation and add-grade the pre-existing pool is EMPTY, so every
--     file that imported before 108 still imports byte-for-byte the same way.
--     Those two flows are all-or-nothing (a failed row removes the grade, or
--     rolls the whole new package back), so flagging two identical rows inside
--     one file would DESTROY a package creation that used to succeed;
--   * on append it still blocks re-importing a file that was already imported,
--     which is the failure mode enabling append actually introduces.
--
-- Three more properties are deliberate, not oversights:
--   * Image references are PART of the key, so a question carrying images never
--     matches an existing one — media uuids are minted per upload. That removes
--     every false positive at the honest cost of not deduping picture-only
--     content.
--   * The key is PRIMARY-LOCALE-BOUND on both sides: the stored key reads
--     question_translations at questions.primary_locale, the incoming key reads
--     the item's own primary_locale. Re-uploading the same question with its
--     primary_locale flipped (az -> en) therefore does NOT match and inserts a
--     second row. Accepted rather than fixed: matching across locales would
--     mean building a key per stored locale and comparing sets, which costs the
--     one-array snapshot this guard is cheap because of — and the realistic
--     failure mode (the same file uploaded twice) never flips the locale.
--   * The guard is BEST EFFORT, not a constraint. Two admins appending the same
--     file at the same time both snapshot the pre-state and both insert. No
--     index can express this rule (it spans questions + question_translations +
--     answer_options), and a duplicate is recoverable — an admin archives it.
--
-- The raise happens inside the row loop's `exception when others` handler, so a
-- duplicate is reported as a normal {index, error} entry in the existing
-- {total, successful, failed, errors[]} contract. No new errcode, no signature
-- change (adding a 4th parameter would mint a second overload and break
-- PostgREST resolution + 013 check 79), no new grants.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- 1. Text normalizer shared by both sides of the duplicate key.
--
-- Deliberately NOT `strict`: the coalesce lives INSIDE the body so a NULL folds
-- to ''. The stored side reads answer_option_translations through a LEFT JOIN
-- (the importer writes no row for a locale with neither text nor image) while
-- the incoming side reads a possibly-absent JSON key — both must produce the
-- same '' or every append would report zero duplicates.
-- -----------------------------------------------------------------------------
create or replace function public.norm_import_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'))
$$;

comment on function public.norm_import_text(text) is
  'Migration 108: normalizes text for the olympiad import duplicate key (trim, '
  'collapse whitespace, lowercase; NULL folds to ''''). service-internal — '
  'reached only from bulk_insert_olympiad_package_questions.';

-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoking `public` alone would leave it callable.
revoke all on function public.norm_import_text(text) from public, anon, authenticated;
grant execute on function public.norm_import_text(text) to service_role;

-- -----------------------------------------------------------------------------
-- 2. The importer itself. Same (uuid, jsonb, uuid) signature, same
--    authorization, same per-row error contract; only the creation-only raise
--    becomes an append-safe duplicate guard.
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

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) is
  'Bulk import of PRIVATE trilingual questions into ONE GRADE POOL of an '
  'olympiad package (Round 34). p_grade_id must be a package target grade '
  '(default: the legacy single package grade). APPENDABLE per grade (migration '
  '108, owner 2026-08-11 — supersedes the migration-059 creation-only rule): a '
  'row whose primary-locale body, option texts and image references already '
  'existed in that pool WHEN THE CALL STARTED is reported as a per-row error '
  'and skipped, so re-uploading a file is safe. Rows inserted by the same call '
  'are never compared against each other, so a file with two identical rows '
  'imports exactly as it did before 108. Rows carrying images are never matched '
  '(media uuids are minted per upload), and the key is bound to the primary '
  'locale on both sides — the same question re-uploaded with a different '
  'primary_locale does not match. Best-effort guard, NOT a constraint — two '
  'simultaneous appends can both insert. Administrators only.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Assertions — the new behaviour is in, and nothing load-bearing was lost.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_src text;
begin
  v_src := replace(
    pg_get_functiondef(
      'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure),
    chr(13), '');

  if position('can only be bulk uploaded once' in v_src) > 0 then
    raise exception '108: the creation-only raise is still in the importer';
  end if;
  if position('v_dup_keys' in v_src) = 0 then
    raise exception '108: the duplicate guard is missing';
  end if;
  -- The snapshot must stay a snapshot. Extending it inside the loop would make
  -- two identical rows in ONE file collide, which turns a package creation that
  -- used to succeed into a full rollback.
  if position('v_dup_keys || v_key' in v_src) > 0 then
    raise exception '108: the duplicate guard compares rows within the same file';
  end if;
  if to_regprocedure('public.norm_import_text(text)') is null then
    raise exception '108: norm_import_text was not created';
  end if;
  -- A 4th parameter would mint a second overload: PostgREST could not resolve
  -- the call and 013 check 79 (2-arg overload absent) would break.
  if to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb)') is not null then
    raise exception '108: a second overload of the importer exists';
  end if;

  -- The contracts other code and 013 depend on.
  if position('content.create' in v_src) > 0 then
    raise exception '108: the importer gained a content.create fallback';
  end if;
  if position('assert_question_type_rules' in v_src) = 0
     or position('scope = ''olympiad''' in v_src) = 0
     or position('pool_grade_missing' in v_src) = 0
     or position('pool_grade_not_targeted' in v_src) = 0 then
    raise exception '108: a load-bearing branch of the importer was lost';
  end if;

  -- The normalizer is an internal helper, not an API surface.
  if has_function_privilege('anon', 'public.norm_import_text(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.norm_import_text(text)', 'EXECUTE') then
    raise exception '108: norm_import_text is reachable by anon/authenticated';
  end if;

  raise notice '108 OK — olympiad grade pools are appendable, duplicates guarded';
end
$verify$;

commit;
