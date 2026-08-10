-- 104 — Both importers accept an answer-option image
--
-- Migration 102 added the column and 103 serves it to the apps. Neither
-- importer can WRITE it yet: both build `answer_option_translations` rows from
-- `(option_id, locale, text)` only, so an option image in a JSON file would be
-- silently dropped — the exact failure mode this whole feature exists to avoid.
--
-- THE ROW SHAPE
-- -------------
-- An option gains an optional per-locale `image` map, mirroring how its `text`
-- already works:
--
--     { "is_correct": true, "order_index": 0,
--       "text":  { "az": "…", "en": "…" },
--       "image": { "az": "<media_asset_id>" } }
--
-- The value is a media_assets UUID, not base64 — the admin panel uploads and
-- verifies the bytes first (lib/admin/import-media.ts) and rewrites the file
-- before it reaches these functions, so no payload ever passes through Postgres.
--
-- WHY THE INSERT CONDITION HAS TO CHANGE, NOT JUST THE COLUMN LIST
-- ----------------------------------------------------------------
-- Both importers currently SKIP a locale whose text is empty. With image-only
-- options that skip is wrong: the row would never be written, the option would
-- have no translation at all, and the payload RPCs would serve `text: null` and
-- no image. The condition becomes "text OR image", matching the CHECK
-- constraint migration 102 put on the table.
--
-- Empty text is stored as '' rather than NULL because the column is NOT NULL —
-- the constraint, not the nullability, carries the real rule.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $patch$
declare
  v_src text;
  v_new text;
  v_fn  text;
  v_old constant text := $a$          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;$a$;
  v_new_block constant text := $b$          -- Migration 104: write the row when the locale has TEXT **or** an IMAGE.
          -- The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            -- The uuid must name a real question-media asset; the admin panel
            -- verified the bytes before writing the row, and this is the DB's
            -- own guard against a hand-made reference.
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
          end if;$b$;
begin
  foreach v_fn in array array[
    'public.bulk_insert_questions(jsonb,text)',
    'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception '104: % not found', v_fn;
    end if;
    -- CR first — both bodies came from a CRLF canonical file.
    v_src := replace(pg_get_functiondef(v_fn::regprocedure), chr(13), '');

    if position('Migration 104' in v_src) > 0 then
      raise notice '104: % already accepts option images — skipping', v_fn;
      continue;
    end if;
    if position(v_old in v_src) = 0 then
      raise exception '104: option-translation anchor not found in % — the '
                      'function changed shape; re-derive the patch', v_fn;
    end if;

    v_new := replace(v_src, v_old, v_new_block);
    execute v_new;
    raise notice '104: patched %', v_fn;
  end loop;
end
$patch$;

-- ACLs are preserved by create-or-replace; restated so the migration is
-- self-contained. These two differ ON PURPOSE and validation checks 23 and 44
-- assert the difference: the olympiad importer is admin-only, the general one
-- also serves content.create holders.
revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_fn text;
  v_src text;
begin
  foreach v_fn in array array[
    'public.bulk_insert_questions(jsonb,text)',
    'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'
  ] loop
    v_src := replace(pg_get_functiondef(v_fn::regprocedure), chr(13), '');
    if position('answer_option_translations (option_id, locale, text, media_asset_id)' in v_src) = 0 then
      raise exception '104: % does not write the option image', v_fn;
    end if;
    -- Everything earlier migrations rely on must still be intact.
    if position('assert_question_type_rules' in v_src) = 0 then
      raise exception '104: % lost assert_question_type_rules (check 49)', v_fn;
    end if;
  end loop;

  -- Migration-specific markers that later re-runs depend on.
  v_src := replace(pg_get_functiondef(
    'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure), chr(13), '');
  if position('Migration 100' in v_src) = 0 or position('Migration 101' in v_src) = 0 then
    raise exception '104: the migration 100/101 markers were lost — re-running them would raise';
  end if;
  if position('olympiad_type_id into v_oly' in v_src) = 0 then
    raise exception '104: the package-derived olympiad type was lost';
  end if;

  if to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb)') is not null then
    raise exception '104: a second 2-arg overload exists (check 79)';
  end if;

  raise notice '104 OK — both importers write per-locale option images';
end
$verify$;

commit;
