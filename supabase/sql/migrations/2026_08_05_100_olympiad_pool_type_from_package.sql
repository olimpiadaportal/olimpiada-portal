-- 100 — The olympiad PACKAGE is the source of truth for the olympiad type
--
-- WHAT WAS REDUNDANT
-- ------------------
-- `bulk_insert_olympiad_package_questions` already injects the two things the
-- admin picks in the package form:
--
--     subject  <- olympiad_packages.subject_id
--     grade    <- p_grade_id (the per-grade upload slot)
--
-- but it read the olympiad TYPE from each uploaded row's `meta.olympiad_type`,
-- matching it by NAME against `olympiad_types`. So the one value the admin had
-- already chosen in the form had to be repeated, spelled correctly, in every
-- question of every file — and a typo silently produced NULL rather than an
-- error, because the lookup has no not-found branch.
--
-- The package has carried `olympiad_type_id` all along. It is now used.
--
-- CONSEQUENCE FOR UPLOADS
-- -----------------------
-- `meta.olympiad_type` becomes INERT for package pools. Existing files that
-- still carry it keep importing unchanged — the field is simply ignored, which
-- is the right compatibility posture for a value that is now authoritative
-- elsewhere. The JSON format shown in the admin panel drops it.
--
-- Only the olympiad-pool importer changes. `bulk_insert_questions` (the general
-- question bank) still honours `meta.olympiad_type`, because there is no
-- package there to inherit from.
--
-- Patched from the function's OWN live definition with one anchored replace,
-- per the house rule: this function has been edited by several migrations and
-- retyping ~150 lines from a canonical file is how an unrelated fix gets
-- silently reverted.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $patch$
declare
  v_src text;
  v_new text;
  -- The exact three lines that read the type out of the row.
  v_old constant text := $a$      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;$a$;
  -- Resolved once per call would be nicer, but keeping the assignment in the
  -- same place as the code it replaces keeps this patch to a single anchor and
  -- the cost is one indexed primary-key lookup per row.
  v_rep constant text := $b$      -- Migration 100: the PACKAGE owns the olympiad type. `meta.olympiad_type`
      -- in an uploaded row is ignored — the admin already chose the type in the
      -- package form, and asking every question to repeat it only created a way
      -- to disagree with it.
      select p.olympiad_type_id into v_oly
        from public.olympiad_packages p
       where p.id = p_package_id;$b$;
begin
  -- STRIP CR FIRST. This function was originally created from a CRLF file, so
  -- its stored body carries \r\n line endings and pg_get_functiondef returns
  -- them verbatim (252 CRs at the time of writing). A multi-line anchor written
  -- in an LF file can then never match, and the abort below would fire on a
  -- function that is in fact untouched. Normalizing also RE-CREATES the function
  -- with clean LF endings, so the next patch need not think about this at all.
  v_src := replace(
    pg_get_functiondef(
      'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure),
    chr(13), '');

  if position('Migration 100' in v_src) > 0 then
    raise notice '100: bulk_insert_olympiad_package_questions already patched — skipping';
    return;
  end if;

  if position(v_old in v_src) = 0 then
    raise exception '100: anchor not found in bulk_insert_olympiad_package_questions — '
                    'the function changed shape; re-derive the patch instead of forcing it';
  end if;

  v_new := replace(v_src, v_old, v_rep);
  execute v_new;
end
$patch$;

-- create or replace preserves the ACL; restated so the migration is
-- self-contained if the function is ever recreated from scratch first.
--
-- `authenticated` KEEPS execute on purpose. This is SECURITY DEFINER with an
-- internal is_admin() check (audit H2) and the admin panel calls it as the
-- signed-in administrator, not through the service role — revoking it here
-- would break olympiad package creation outright. Only anon is shut out.
-- Validation check 23 asserts exactly this pair.
revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_src text;
begin
  v_src := pg_get_functiondef(
    'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)'::regprocedure);

  if position('olympiad_type_id into v_oly' in v_src) = 0 then
    raise exception '100: the package-derived type assignment is missing';
  end if;
  if position($x$where name = (v_item->'meta'->>'olympiad_type')$x$ in v_src) > 0 then
    raise exception '100: the row-derived type lookup is still present';
  end if;

  -- The general importer must be UNTOUCHED: it has no package to inherit from,
  -- so meta.olympiad_type is still the only source there.
  if position($x$where name = (v_item->'meta'->>'olympiad_type')$x$ in
              pg_get_functiondef('public.bulk_insert_questions(jsonb,text)'::regprocedure)) = 0 then
    raise exception '100: bulk_insert_questions lost its meta.olympiad_type lookup';
  end if;

  if has_function_privilege('anon',
       'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') then
    raise exception '100: olympiad bulk import must not be anon-executable';
  end if;
  -- The other half of the pair. The admin panel invokes this as the signed-in
  -- administrator (internal is_admin() gate), so losing this grant would break
  -- package creation silently at the next upload rather than here.
  if not has_function_privilege('authenticated',
       'public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)', 'EXECUTE') then
    raise exception '100: authenticated must retain EXECUTE (admin panel caller)';
  end if;

  raise notice '100 OK — olympiad pool type now comes from the package; general import unchanged';
end
$verify$;

commit;
