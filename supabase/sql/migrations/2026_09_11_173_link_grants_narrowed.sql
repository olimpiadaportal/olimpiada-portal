-- Migration: 2026_09_11_173_link_grants_narrowed.sql
-- Purpose: Split the PRIVATE child-avatar storage gate into a link-scoped READ
--          arm and a creator-scoped WRITE arm. An ACTIVE parent_student_links
--          row may still SEE a child's photograph; only the parent who CREATED
--          the account may upload, replace or delete it.
-- Environment first applied: staging and production, 2026-09-12.
-- Related root SQL file(s): 009_storage_buckets_policies.sql
-- Backport status: completed (009 helper body + comment, same round)
-- Destructive change: no -- one function body and four policy definitions. No
--          table is read or written; no storage object is touched.
-- Rollback notes: REVERSIBLE, exact DOWN at the bottom of this file. Read the
--          reasoning first: the widened write arm is the defect, not the fix.
-- =============================================================================
-- 2026_09_11_173 -- A LINK IS NOT OWNERSHIP, AND THIS IS THE HALF THAT LIVES
-- IN THE DATABASE.
--
-- WHY NOW, BEFORE ANY USER-VISIBLE LINKING FEATURE. Co-parent linking is
-- approved: up to four adults per child, each holding a parent_student_links
-- row. Today exactly one adult ever holds such a row -- the creator -- so
-- "created the child" and "has an active link" have returned the same answer
-- for every row that has ever existed, and the difference between them has been
-- invisible while being relied upon as authorization. Minting a SECOND link
-- before narrowing what a link CONFERS would hand the second adult everything
-- the first one has. The narrowing therefore ships first, on its own, where it
-- changes nothing observable: there is no second link yet to be narrowed.
--
-- WHAT THE LINK CONFERS IN THIS FILE. can_access_child_avatar() is the single
-- DEFINER gate behind all four `child-avatars` storage policies (migration
-- 071). Its write branch accepts is_parent_linked_to_student(), so any active
-- link can INSERT, UPDATE and DELETE inside students/<that child>/ in the
-- private bucket. The application deletes the replaced object for real
-- (childAvatarCore.removeObject) -- so a widened write is not a matter of an
-- unwanted picture appearing, it is the other parent's photograph of their
-- child being destroyed, by someone the design names as a possible estranged
-- ex-partner.
--
-- READ IS DELIBERATELY UNCHANGED. A co-parent who cannot see the child's face
-- on their own dashboard has been given a broken product, not a safer one. The
-- read arm keeps the creator, the linked parent, the student themself and
-- admins, exactly as today.
--
-- THE APPLICATION HALF SHIPS IN THE SAME ROUND, and neither half is sufficient
-- alone: web-app/src/lib/auth/childAvatarCore.ts now refuses a non-creator
-- parent before it ever reaches Storage, and childAccountService.ts makes the
-- child PASSWORD RESET creator-only (the same link also exposes
-- students.child_unique_id, so a link that can set the password is a link that
-- can sign in AS the child). The database is the durable enforcement; the app
-- is what produces a translated refusal instead of an opaque RLS failure.
--
-- -----------------------------------------------------------------------------
-- WHY THE BODY IS PATCHED FROM THE LIVE DEFINITION INSTEAD OF RETYPED
-- -----------------------------------------------------------------------------
-- THIS IS THE IMPORTANT PARAGRAPH. The canonical 009 body and the live body may
-- not be the same text. migrations/2026_07_30_096_child_avatar_privacy.sql
-- rewrote this exact function to admit THE STUDENT THEMSELF to the write branch
-- (a child's own avatar moved into this private bucket, and "remove" has to
-- really delete). 096 carries `Backport status: pending` and its artifacts are
-- absent from the canonical files -- no current_profile_is_student() in 002, no
-- media_assets guard in 011, and its intended check 88 slot in 013 is occupied
-- by an unrelated check. So this repository CANNOT tell, from its own contents,
-- whether production carries the 071 body or the 096 body.
--
-- Retyping either one would be a coin flip with a real downside: retyping 071's
-- silently REVERTS 096 and breaks a child's own avatar upload if 096 did apply;
-- retyping 096's silently GRANTS a child write access it may never have been
-- given. Both failures are invisible -- they look like this migration
-- succeeding.
--
-- So the body is not retyped at all. pg_get_functiondef() returns whatever is
-- actually installed, ONE anchored substring is rewritten, and the result is
-- executed. The house already uses this idiom for exactly this hazard
-- (migration 097 patched get_mobile_config the same way -- "retyping 120 lines
-- is how migration 091's payment-mode fix gets silently reverted"). Everything
-- the live body says other than the linked-parent write clause survives
-- verbatim, including SECURITY DEFINER, the search_path pin, and whichever
-- self-branch it has. The anchor is asserted to appear EXACTLY ONCE before
-- anything is rewritten, and the migration RAISES rather than guessing if it
-- does not.
--
-- The 096 divergence itself is NOT closed here -- closing it needs 002 and 011,
-- which this change does not own. It is reported as a tracked gap.
--
-- IDEMPOTENT: a second run finds the narrowed clause already present, says so,
-- and changes nothing.
--
-- NOT SELF-TRANSACTING: no begin/commit/rollback anywhere in this file.
--
-- -----------------------------------------------------------------------------
-- HOW TO APPLY  (staging first; production only after staging passes)
-- -----------------------------------------------------------------------------
--   psql "$OLIMPIADA_STAGING_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/sql/migrations/2026_09_11_173_link_grants_narrowed.sql
--   psql "$OLIMPIADA_PROD_DB_URL"    -v ON_ERROR_STOP=1 \
--        -f supabase/sql/migrations/2026_09_11_173_link_grants_narrowed.sql
--
-- Without -v ON_ERROR_STOP=1 psql exits 0 even when a statement failed, and the
-- success signal here is a NOTICE. Run it with the flag.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. can_access_child_avatar(): the linked-parent clause becomes READ-ONLY.
--
--    BEFORE: or public.is_parent_linked_to_student(s.profile_id)
--    AFTER : or (not p_for_write and public.is_parent_linked_to_student(s.profile_id))
--
--    Every other clause -- is_admin(), the structural path validation, the
--    creator-parent branch, and whatever self-branch the live body carries --
--    is preserved byte-for-byte from the installed definition.
-- -----------------------------------------------------------------------------
do $do$
declare
  v_def      text;
  v_hits     int;
  v_anchor   constant text := 'or public.is_parent_linked_to_student(s.profile_id)';
  v_narrowed constant text := 'or (not p_for_write and public.is_parent_linked_to_student(s.profile_id))';
begin
  if to_regprocedure('public.can_access_child_avatar(text,boolean)') is null then
    raise exception '173: public.can_access_child_avatar(text,boolean) does not exist. '
                    'Run 009_storage_buckets_policies.sql (or migration 071) first.';
  end if;

  v_def := pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure);

  -- Already narrowed (a re-run, or a database built from the backported 009).
  if position(v_narrowed in v_def) > 0 then
    raise notice '173: can_access_child_avatar already grants the link READ only -- no change.';
  else
    -- EXACTLY ONE occurrence, or stop. A body that does not look like the one
    -- this migration reasons about must be read by a human, not guessed at.
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 1 then
      raise exception '173: expected exactly 1 linked-parent write clause in the live '
                      'can_access_child_avatar body, found %. Installed definition follows, '
                      'unchanged: %', v_hits, v_def;
    end if;

    execute replace(v_def, v_anchor, v_narrowed);

    -- Prove it took, by re-reading the database rather than trusting the local
    -- variable the rewrite was built from.
    v_def := pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure);
    if position(v_narrowed in v_def) = 0 or position(v_anchor in v_def) > 0 then
      raise exception '173: the rewrite did not take. Installed definition: %', v_def;
    end if;
    raise notice '173: can_access_child_avatar write arm narrowed to the creating parent.';
  end if;

  -- The creator branch must still be there -- a "narrowing" that removed it
  -- would lock every parent out of their own child's photo.
  if position('s.created_by_parent_profile_id = public.current_profile_id()' in v_def) = 0 then
    raise exception '173: the creator branch is missing from can_access_child_avatar: %', v_def;
  end if;
end
$do$;

comment on function public.can_access_child_avatar(text, boolean) is
  'storage.objects gate for the PRIVATE child-avatars bucket (migration 071; write arm '
  'narrowed to the CREATING parent by migration 173). Object path '
  'students/<student_profile_id>/<file>. WRITE: the parent who created the child, or an '
  'admin -- an ACTIVE linked co-parent may NOT write. READ: that set plus an active '
  'linked parent and the student themself. anon never has a path (policies are TO '
  'authenticated).';

-- Privileges are grantor-scoped, so they are restated rather than assumed.
revoke all on function public.can_access_child_avatar(text, boolean) from public, anon;
grant execute on function public.can_access_child_avatar(text, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Re-create the four child-avatars policies against the helper.
--    Their TEXT is unchanged -- one helper gates all four, which is the whole
--    point of the 071 design. They are restated so this file states the end
--    state in full and a reviewer can see that read passes `false` while every
--    write path passes `true`: that argument is what the split now turns on.
-- -----------------------------------------------------------------------------
drop policy if exists "read child-avatars" on storage.objects;
create policy "read child-avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'child-avatars' and public.can_access_child_avatar(name, false));

drop policy if exists "insert child-avatars" on storage.objects;
create policy "insert child-avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'child-avatars' and public.can_access_child_avatar(name, true));

drop policy if exists "update child-avatars" on storage.objects;
create policy "update child-avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'child-avatars' and public.can_access_child_avatar(name, true))
  with check (bucket_id = 'child-avatars' and public.can_access_child_avatar(name, true));

drop policy if exists "delete child-avatars" on storage.objects;
create policy "delete child-avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'child-avatars' and public.can_access_child_avatar(name, true));

-- -----------------------------------------------------------------------------
-- 3. Final assertions: four policies, none reachable by anon, the helper still
--    executable by authenticated and not by anon. Check 72 of 013 asserts the
--    same three facts -- this migration must not be what breaks it.
-- -----------------------------------------------------------------------------
do $do$
declare
  v_policies int;
  v_anon     int;
begin
  select count(*) into v_policies
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('read child-avatars','insert child-avatars',
                        'update child-avatars','delete child-avatars');
  select count(*) into v_anon
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like '%child-avatars%'
     and roles::text[] && array['anon','public'];

  if v_policies <> 4 then
    raise exception '173: expected 4 child-avatars policies, found %', v_policies;
  end if;
  if v_anon <> 0 then
    raise exception '173: % child-avatars policies are reachable by anon/public', v_anon;
  end if;
  if has_function_privilege('anon','public.can_access_child_avatar(text,boolean)','EXECUTE') then
    raise exception '173: anon can execute can_access_child_avatar';
  end if;
  if not has_function_privilege('authenticated','public.can_access_child_avatar(text,boolean)','EXECUTE') then
    raise exception '173: authenticated cannot execute can_access_child_avatar';
  end if;

  raise notice '173: child-avatars = 4 policies, no anon path, helper grants intact.';
  raise notice '173: TRACKED GAP (not closed here) -- migration 096 is still un-backported, '
               'so 009 does not describe whichever self-branch this database carries.';
end
$do$;

-- =============================================================================
-- DOWN -- restores the 009 helper body EXACTLY as it stands before this
-- migration (the 071 text: creator | linked parent | admin may write, the
-- student may only read). Run it only on a deliberate decision to give linked
-- co-parents write access to a child's photograph again.
--
-- NOTE, and it is the same trap as the UP: if this database carries the 096
-- body (student-self write), the block below REVERTS that too, because it
-- retypes 009 rather than patching what is installed. Before running it, read
-- the installed definition and put the self-branch back by hand if it is there:
--     select pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure);
--
-- create or replace function public.can_access_child_avatar(
--   p_object_name text,
--   p_for_write   boolean
-- )
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
--   select public.is_admin()
--       or (
--         split_part(coalesce(p_object_name, ''), '/', 1) = 'students'
--         and split_part(p_object_name, '/', 3) <> ''         -- a file under the student folder
--         and exists (
--           select 1
--           from public.students s
--           where s.profile_id::text = split_part(p_object_name, '/', 2)
--             and (
--               s.created_by_parent_profile_id = public.current_profile_id()
--               or public.is_parent_linked_to_student(s.profile_id)
--               or (not p_for_write and s.profile_id = public.current_profile_id())
--             )
--         )
--       )
-- $$;
-- comment on function public.can_access_child_avatar(text, boolean) is
--   'storage.objects gate for the PRIVATE child-avatars bucket (migration 071). '
--   'Object path students/<student_profile_id>/<file>. Write: the creator parent, '
--   'an ACTIVE linked parent, or an admin. Read: the same set plus the student '
--   'themself. anon never has a path (policies are TO authenticated).';
-- revoke all on function public.can_access_child_avatar(text, boolean) from public, anon;
-- grant execute on function public.can_access_child_avatar(text, boolean) to authenticated, service_role;
--
-- The four policies need no DOWN: their text is identical before and after.
-- =============================================================================
