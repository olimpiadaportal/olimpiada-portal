-- 101 — Olympiad pool imports accept a question image
--
-- THE BUG
-- -------
-- `bulk_insert_questions` (general bank) has honoured `meta.media_asset_id`
-- since Round 21: it validates the uuid is a `question-media` asset and writes
-- it onto the PRIMARY locale's translation row.
--
-- `bulk_insert_olympiad_package_questions` never did. Its translations insert
-- names only `(question_id, locale, body, prompt)`, and unknown `meta` keys are
-- silently ignored — so an olympiad pool file carrying an image imports as
-- "successful" with no image and NO ERROR. The admin client has meanwhile
-- advertised the field for two rounds. This closes that gap.
--
-- WHY ANCHORED SURGERY AND NOT A REWRITE
-- --------------------------------------
-- Same reasoning as migration 100, plus one addition that is easy to get wrong:
--
--   * The live body carries CRLF line endings (it was created from a CRLF
--     canonical file), so `pg_get_functiondef` returns \r\n and any multi-line
--     anchor written in an LF file silently fails to match. CR is stripped
--     FIRST; the function is then re-created with clean LF endings.
--   * Restating the body from `011` would create a SECOND overload: several
--     older migrations define a 2-arg `(uuid, jsonb)` version, and validation
--     check 79 asserts that overload no longer exists. PostgREST would also see
--     an ambiguous function.
--   * The replacement text MUST KEEP the literal `Migration 100` comment.
--     Migration 100's own anchor is consumed once it has patched, so it detects
--     "already applied" by that marker. A body without it makes a re-run of 100
--     raise 'anchor not found' instead of skipping.
--
-- The signature stays `(uuid, jsonb, uuid)`. Six validation checks and five
-- statements in migration 100 address this function by that exact regprocedure
-- literal; a 4th parameter would make them ERROR, not FAIL.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $patch$
declare
  v_src text;
  v_new text;

  -- (1) last line of the declare block
  v_dec_old constant text := $a$  v_pool_grade uuid;$a$;
  v_dec_new constant text := $a$  v_pool_grade uuid;
  -- Migration 101: optional pre-uploaded question image, same field the general
  -- importer accepts. Assigned unconditionally per item below — it is
  -- loop-persistent, and leaving it unset would carry the previous question's
  -- image onto the next one.
  v_media uuid;$a$;

  -- (2) resolve + validate, immediately before the primary-locale block. Same
  --     relative position and same check as the general importer.
  v_res_old constant text := $b$      v_pl := coalesce(v_item->>'primary_locale','az');$b$;
  v_res_new constant text := $b$      -- ---- optional pre-uploaded question image (migration 101) ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');$b$;

  -- (3) the translations insert — image on the PRIMARY locale only, exactly as
  --     the general importer does it (en/ru rows keep NULL).
  v_ins_old constant text := $c$          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));$c$;
  v_ins_new constant text := $c$          insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''),
                  case when v_loc = v_pl then v_media end);$c$;
begin
  -- CR first — see the header. Without this every anchor below misses.
  v_src := replace(
    pg_get_functiondef(
      'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure),
    chr(13), '');

  if position('Migration 101' in v_src) > 0 then
    raise notice '101: olympiad importer already accepts media — skipping';
    return;
  end if;

  -- Migration 100 must have run first: this patch preserves its marker, and a
  -- body without it would mean 100 has not been applied to this database.
  if position('Migration 100' in v_src) = 0 then
    raise exception '101: migration 100 has not been applied to this database — run it first';
  end if;

  if position(v_dec_old in v_src) = 0
     or position(v_res_old in v_src) = 0
     or position(v_ins_old in v_src) = 0 then
    raise exception '101: an anchor was not found in '
                    'bulk_insert_olympiad_package_questions — the function changed '
                    'shape; re-derive the patch instead of forcing it';
  end if;

  v_new := replace(v_src, v_dec_old, v_dec_new);
  v_new := replace(v_new, v_res_old, v_res_new);
  v_new := replace(v_new, v_ins_old, v_ins_new);
  execute v_new;
end
$patch$;

-- create or replace preserves the ACL; restated so the migration is
-- self-contained. `authenticated` KEEPS execute: the function is SECURITY
-- DEFINER with an internal is_admin() gate and the admin panel calls it as the
-- signed-in administrator. Validation check 23 asserts exactly this pair.
revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Assertions — everything this migration must ADD, and everything it must not
-- have disturbed on the way.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_src text;
begin
  v_src := replace(
    pg_get_functiondef(
      'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure),
    chr(13), '');

  if position('question_translations (question_id, locale, body, prompt, media_asset_id)' in v_src) = 0 then
    raise exception '101: the translations insert does not carry media_asset_id';
  end if;
  if position('Migration 100' in v_src) = 0 then
    raise exception '101: the Migration 100 marker was lost — re-running 100 would now raise';
  end if;
  if position('olympiad_type_id into v_oly' in v_src) = 0 then
    raise exception '101: migration 100''s package-derived olympiad type was lost';
  end if;
  -- Guarded by validation checks 49 / 59 / 44 respectively.
  if position('assert_question_type_rules' in v_src) = 0 then
    raise exception '101: assert_question_type_rules call was lost';
  end if;
  if position('''olympiad''' in v_src) = 0 then
    raise exception '101: the olympiad module scope was lost';
  end if;
  if position('content.create' in v_src) > 0 then
    raise exception '101: olympiad import must stay admin-only (no content.create)';
  end if;
  -- Check 79: the old 2-arg overload must not come back.
  if to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb)') is not null then
    raise exception '101: a second 2-arg overload exists — PostgREST would be ambiguous';
  end if;
  if has_function_privilege('anon',
       'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') then
    raise exception '101: olympiad bulk import must not be anon-executable';
  end if;
  if not has_function_privilege('authenticated',
       'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') then
    raise exception '101: authenticated must retain EXECUTE (admin panel caller)';
  end if;

  raise notice '101 OK — olympiad pool imports accept a question image; 100 marker intact';
end
$verify$;

commit;
