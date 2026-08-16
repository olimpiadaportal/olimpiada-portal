-- 113 — Drop the typed confirmation code from OLYMPIAD PACKAGE deletion only
--
-- OWNER DECISION (2026-08-15). Transcribing a package slug before every delete
-- was too much friction for an action performed deliberately from a dialog that
-- already lists exactly what will be destroyed.
--
-- WHAT THIS GIVES UP, STATED PLAINLY
-- ----------------------------------
-- The function is granted to `authenticated`, so it is a PostgREST endpoint an
-- admin session can POST directly. The token was the part of the confirmation
-- that survived outside the browser; the dialog never was. After this, deleting
-- an UNBLOCKED package is one request.
--
-- WHAT STILL PROTECTS THE DATA — none of it is touched here:
--   * olympiad_package_deletion_blocks still refuses a package carrying
--     purchases, attempts or any other blocking reference. That is the guard
--     that keeps a paid lifetime entitlement safe, and it is untouched;
--   * trg_olympiad_package_delete_guard still fires on the table, so the
--     generic delete path cannot bypass it either;
--   * a pool holding answered questions still forces an ARCHIVE, never a
--     delete;
--   * the mutation is still audited.
-- The loss is a layer against ACCIDENTAL or SCRIPTED deletion of a package
-- nothing else objects to — not a layer protecting purchased content.
--
-- SCOPE IS DELIBERATELY NARROW. The token stays on every sibling:
--   admin_delete_subject, admin_purge_subject_questions,
--   admin_delete_olympiad_grade_pool, admin_delete_olympiad_questions.
-- Only the package delete loses it, because only it was asked for. The verify
-- block below FAILS if any sibling lost its token, so a future widening of this
-- change cannot pass silently.
--
-- WHY ANCHORED SURGERY AND NOT A REWRITE
-- --------------------------------------
-- The live body also reclaims the package's cover_media_id (an ON DELETE SET
-- NULL column nothing else ever reclaims) and clears olympiad_question_rotations
-- on the archive branch. A hand-written replacement dropped both on the first
-- attempt and would have leaked the cover asset on every delete. So the new
-- function is derived FROM the shipped body with exactly two edits — the
-- signature and the token check — and everything else survives byte-for-byte.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $patch$
declare
  v_src text;
  v_new text;
  -- The token check, verbatim from the shipped body.
  v_check constant text := $a$
  -- The realistic failure is two packages open in two tabs. Typing the code
  -- makes an id mix-up impossible to commit even if the dialog is restyled.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_package: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;
$a$;
  v_sig constant text :=
    'FUNCTION public.admin_delete_olympiad_package(p_package_id uuid, p_expected_code text)';
  v_sig_new constant text :=
    'FUNCTION public.admin_delete_olympiad_package(p_package_id uuid)';
begin
  if to_regprocedure('public.admin_delete_olympiad_package(uuid,text)') is null then
    if to_regprocedure('public.admin_delete_olympiad_package(uuid)') is not null then
      raise notice '113: package delete is already token-free — skipping';
      return;
    end if;
    raise exception '113: admin_delete_olympiad_package(uuid,text) not found';
  end if;

  -- CR stripped first: a function created from a CRLF source comes back CRLF,
  -- and an LF anchor could never match it.
  v_src := replace(
    pg_get_functiondef('public.admin_delete_olympiad_package(uuid,text)'::regprocedure),
    chr(13), '');

  if position(v_check in v_src) = 0 then
    raise exception '113: the token-check anchor was not found — the function '
                    'changed shape; re-derive the patch';
  end if;
  if position(v_sig in v_src) = 0 then
    raise exception '113: the signature anchor was not found';
  end if;

  -- Two edits, nothing else.
  v_new := replace(v_src, v_check, '');
  v_new := replace(v_new, v_sig, v_sig_new);

  -- CREATE OR REPLACE cannot change a signature, so the tokened arity is
  -- dropped rather than left beside the new one. An overload pair is exactly
  -- how a "removed" requirement comes back.
  execute v_new;
  drop function if exists public.admin_delete_olympiad_package(uuid, text);
  raise notice '113: rebuilt admin_delete_olympiad_package without the token';
end
$patch$;

comment on function public.admin_delete_olympiad_package(uuid) is
  'Migration 113 (owner decision): deletes one olympiad package WITHOUT a typed '
  'confirmation code — the dialog is the only confirmation. Every data guard is '
  'unchanged: olympiad_package_deletion_blocks still refuses a package with '
  'purchases or attempts, answered questions still force an ARCHIVE, disposal '
  'is still delegated to purge_question_set, and the cover asset is still '
  'reclaimed. The token remains on admin_delete_subject, '
  'admin_purge_subject_questions, admin_delete_olympiad_grade_pool and '
  'admin_delete_olympiad_questions.';

revoke all on function public.admin_delete_olympiad_package(uuid) from public, anon;
grant execute on function public.admin_delete_olympiad_package(uuid) to authenticated, service_role;

do $verify$
declare
  v_body text;
begin
  if to_regprocedure('public.admin_delete_olympiad_package(uuid)') is null then
    raise exception '113: the token-free arity does not exist';
  end if;
  -- The tokened arity must be GONE, or PostgREST keeps both and the requirement
  -- survives on one of them.
  if to_regprocedure('public.admin_delete_olympiad_package(uuid,text)') is not null then
    raise exception '113: the two-argument arity still exists';
  end if;

  v_body := replace(
    pg_get_functiondef('public.admin_delete_olympiad_package(uuid)'::regprocedure), chr(13), '');

  if position('confirmation_mismatch' in v_body) > 0 then
    raise exception '113: the token check is still in the body';
  end if;
  -- Everything the surgery had to preserve.
  if position('olympiad_package_deletion_blocks' in v_body) = 0 then
    raise exception '113: the deletion-blocks guard was lost';
  end if;
  if position('purge_question_set' in v_body) = 0 then
    raise exception '113: disposal is no longer delegated to purge_question_set';
  end if;
  if position('cover_media_id' in v_body) = 0 then
    raise exception '113: cover-media reclamation was lost';
  end if;
  if position('olympiad_question_rotations' in v_body) = 0 then
    raise exception '113: the rotation cleanup was lost';
  end if;
  if position('is_admin()' in v_body) = 0 then
    raise exception '113: the admin check was lost';
  end if;
  if has_function_privilege('anon', 'public.admin_delete_olympiad_package(uuid)', 'EXECUTE') then
    raise exception '113: anon can execute the package delete';
  end if;

  -- Narrow scope: every OTHER destructive RPC keeps its token.
  if to_regprocedure('public.admin_delete_subject(uuid,text)') is null
     or to_regprocedure('public.admin_purge_subject_questions(uuid,text)') is null
     or to_regprocedure('public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)') is null
     or to_regprocedure('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)') is null then
    raise exception '113: a sibling lost its confirmation token — scope was too wide';
  end if;

  raise notice '113 OK — package delete is token-free; guards, media reclamation and sibling tokens intact';
end
$verify$;

commit;
