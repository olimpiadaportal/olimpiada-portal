-- 103 — Serve the answer-option image to the apps
--
-- Migration 102 gave `answer_option_translations` a `media_asset_id`. Nothing
-- reads it yet: the three RPCs that build a question payload select only the
-- option's text, so an imported option image would exist in the database and be
-- invisible everywhere.
--
-- THREE LIVE BRANCHES, NOT FIVE
-- -----------------------------
-- `get_test_attempt` and `get_test_review` each have a SNAPSHOT branch that
-- reads frozen jsonb from `daily_rounds.content_snapshot` instead of joining
-- the option tables. Those cannot carry an option image and are deliberately
-- left alone: the snapshot's writer was dropped in migration 083, so historical
-- rounds can never be backfilled. They are text-only questions in any case —
-- option media did not exist when they were written.
--
-- ADDITIVE ONLY. Every payload gains one nullable `image` key per option.
-- Mobile calls these RPCs directly with the anon client (there is no BFF for
-- attempts), so already-installed binaries receive the new key immediately —
-- which is safe for an ADDED key and is exactly why nothing here is renamed or
-- removed.
--
-- The image resolves per locale with the same az fallback the option's TEXT
-- uses, so a locale with no image of its own inherits the Azerbaijani one
-- rather than rendering a broken figure.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $patch$
declare
  v_src text;
  v_new text;
  v_fn  text;
  -- The two shapes the option object is built in today. Branch 3 (review) also
  -- emits is_correct, so it needs its own anchor.
  v_old_plain constant text := $a$            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text))$a$;
  v_new_plain constant text := $a$            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image, az fallback.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end)$a$;
  v_old_corr constant text := $b$            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               'is_correct', ao.is_correct)$b$;
  v_new_corr constant text := $b$            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image, az fallback.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end,
                               'is_correct', ao.is_correct)$b$;
  -- The join that resolves the asset. Appended to the existing az-fallback join
  -- so it lands inside the same correlated subquery.
  v_old_join constant text := $c$          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'$c$;
  v_new_join constant text := $c$          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, same locale-then-az resolution
          -- the text above uses.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)$c$;
begin
  foreach v_fn in array array[
    'public.get_practice_attempt(uuid,text)',
    'public.get_test_attempt(uuid,text)',
    'public.get_test_review(uuid,text)'
  ] loop
    -- Resolve loosely: these RPCs have been re-signed over time, so the
    -- identity arguments are looked up rather than assumed.
    if to_regprocedure(v_fn) is null then
      raise exception '103: % not found — re-derive the signature', v_fn;
    end if;

    -- CR first: these bodies came from a CRLF canonical file, so a multi-line
    -- anchor written in an LF migration would never match.
    v_src := replace(pg_get_functiondef(v_fn::regprocedure), chr(13), '');

    if position('Migration 103' in v_src) > 0 then
      raise notice '103: % already serves the option image — skipping', v_fn;
      continue;
    end if;

    v_new := v_src;
    if position(v_old_corr in v_new) > 0 then
      v_new := replace(v_new, v_old_corr, v_new_corr);
    elsif position(v_old_plain in v_new) > 0 then
      v_new := replace(v_new, v_old_plain, v_new_plain);
    else
      raise exception '103: no option-object anchor found in % — the payload '
                      'changed shape; re-derive the patch', v_fn;
    end if;

    if position(v_old_join in v_new) = 0 then
      raise exception '103: the az-fallback join was not found in %', v_fn;
    end if;
    v_new := replace(v_new, v_old_join, v_new_join);

    execute v_new;
    raise notice '103: patched %', v_fn;
  end loop;
end
$patch$;

-- -----------------------------------------------------------------------------
-- Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_fn text;
  v_src text;
begin
  foreach v_fn in array array[
    'public.get_practice_attempt(uuid,text)',
    'public.get_test_attempt(uuid,text)',
    'public.get_test_review(uuid,text)'
  ] loop
    v_src := replace(pg_get_functiondef(v_fn::regprocedure), chr(13), '');
    if position('aom.bucket' in v_src) = 0 then
      raise exception '103: % does not emit the option image', v_fn;
    end if;
    if position('coalesce(aot.media_asset_id, aot_az.media_asset_id)' in v_src) = 0 then
      raise exception '103: % is missing the option-image join', v_fn;
    end if;
    -- The option TEXT must still resolve exactly as before — this migration
    -- adds a key, it does not touch how text is chosen.
    if position('coalesce(aot.text, aot_az.text)' in v_src) = 0 then
      raise exception '103: % lost its option-text fallback', v_fn;
    end if;
  end loop;

  -- The review payload must still expose is_correct, which is what the review
  -- screen colours the options with.
  if position('''is_correct'', ao.is_correct' in
      replace(pg_get_functiondef('public.get_test_review(uuid,text)'::regprocedure), chr(13), '')) = 0 then
    raise exception '103: get_test_review lost is_correct on its options';
  end if;

  raise notice '103 OK — all three live payload branches serve the option image';
end
$verify$;

commit;
