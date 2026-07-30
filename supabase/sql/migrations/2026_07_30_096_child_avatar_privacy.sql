-- =============================================================================
-- 2026_07_30_096_child_avatar_privacy.sql
-- =============================================================================
-- Migration: 2026_07_30_096_child_avatar_privacy.sql
-- Purpose: Close the child-avatar privacy defect. A signed-in CHILD uploading
--          their OWN avatar wrote to the PUBLIC 'profile-avatars' bucket with
--          media_assets.visibility='public', and "remove avatar" was UNLINK
--          ONLY — so a photograph of a MINOR was world-readable at a stable
--          URL and could never be withdrawn. A PARENT uploading a photo FOR
--          the same child already writes to the PRIVATE 'child-avatars' bucket
--          (migration 071) and a removal there really deletes the object. This
--          migration makes the DATABASE enforce that the child's own upload
--          takes exactly the same private path, forbids the old one, and
--          erases what has already leaked.
--
--          Four changes:
--            1. public.current_profile_is_student() — DEFINER helper.
--            2. can_access_child_avatar(): the WRITE branch now also matches
--               the student THEMSELF (today it is read-only for the student),
--               so a child can INSERT/UPDATE/DELETE inside their own
--               students/<own profile id>/ folder in the private bucket.
--            3. storage.objects: a STUDENT may no longer INSERT or UPDATE in
--               the public 'profile-avatars' bucket at all.
--            4. public.media_assets: BEFORE INSERT/UPDATE guard rejecting a
--               bucket='profile-avatars' row owned by a student profile.
--          Plus REMEDIATION of the objects/rows that are already exposed.
--
-- Environment first applied: development  (AUTHORED ONLY — NOT YET APPLIED)
-- Related root SQL file(s):
--          supabase/sql/002_core_profiles_roles_permissions.sql
--                 -> new helper public.current_profile_is_student()
--                    (MUST live in 002, not 011: it is called from a STORAGE
--                    policy in 009 and 009 runs before 011 — same reason
--                    is_parent_linked_to_student is defined in 002.)
--          supabase/sql/009_storage_buckets_policies.sql
--                 -> replace the can_access_child_avatar body + comment
--                    (currently 009:168-200) and the 'profile-avatars' write
--                    policy block (currently 009:115-132).
--          supabase/sql/011_indexes_constraints_functions_triggers.sql
--                 -> media_assets_child_avatar_guard() + its trigger, next to
--                    the other *_guard triggers. (008 keeps the media_assets
--                    TABLE definition unchanged — no schema change here.)
--          supabase/sql/013_validation_queries.sql
--                 -> new check 88 (exact SQL at the bottom of this file; the
--                    last existing check is 87).
-- Backport status: pending
-- Destructive change: YES — a narrowly scoped, owner-approved DELETE of the
--          already-exposed CHILD avatar objects/rows (see section 5). Parent-
--          owned objects are deliberately NOT touched. NB: section 5b briefly
--          sets `storage.allow_delete_query` so the delete gets past Supabase's
--          own storage.protect_objects_delete guard — an explicit, SET LOCAL,
--          one-statement opt-in that the reviewer should see and approve.
-- Rollback notes:
--          Structure is rollback-able: restore the previous
--          can_access_child_avatar body from 009 (the `not p_for_write` self
--          clause), drop public.current_profile_is_student(), drop
--          trg_media_assets_child_avatar_guard +
--          public.media_assets_child_avatar_guard(), and recreate the single
--          "owner manage own avatar" policy from 009:121-132 in place of the
--          three policies created here.
--          The DATA half is NOT rollback-able: the deleted storage.objects
--          rows and media_assets rows are gone. That is the intent — an
--          exposed photograph of a minor must stop being reachable. A child
--          who had a self-uploaded avatar falls back to the initials bubble
--          (never a broken image) and can re-upload once the app change ships;
--          the new upload is private and genuinely removable.
--
-- -----------------------------------------------------------------------------
-- HOW TO APPLY (main session — review first, this file is AUTHORED, NOT APPLIED)
-- -----------------------------------------------------------------------------
--   psql "$OLIMPIADA_DEV_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/sql/migrations/2026_07_30_096_child_avatar_privacy.sql
--
-- Without -v ON_ERROR_STOP=1 psql exits 0 even when the script errored midway
-- and the trailing `commit;` silently reports ROLLBACK. This migration's
-- success signal is a NOTICE, so run it with the flag.
--
-- DEV/STAGING ONLY until the owner approves production.
--
-- -----------------------------------------------------------------------------
-- DESIGN DECISION 1 — why the child's avatar moves BUCKET instead of getting a
-- new read policy on 'profile-avatars'
-- -----------------------------------------------------------------------------
-- 'profile-avatars' is `public = true`. A public bucket is served through
-- /storage/v1/object/public/<bucket>/<path>, which does NOT consult
-- storage.objects RLS at all. So NO select policy written against that bucket
-- can make a child's object private while the bucket stays public — a policy
-- fix there would be security theatre.
--
-- The two real options were:
--   (a) flip 'profile-avatars' to public = false and serve everyone by signed
--       URL, or
--   (b) move the child's self-upload onto the PRIVATE 'child-avatars' bucket
--       that migration 071 already built for the parent-uploaded child photo.
--
-- (a) is rejected: it changes PARENT behaviour (every parent avatar render site
-- builds a public URL — web (parent)/layout.tsx and (parent)/profile/page.tsx,
-- mobile useOwnProfile) and an adult publishing their own picture is a
-- different risk class. The task scope, and the owner's decision, is the CHILD
-- path.
--
-- (b) is chosen. 'child-avatars' is already private, already gated by ONE
-- DEFINER helper that encodes the exact family-membership rule
-- (creator parent | ACTIVE linked parent | admin | the student themself),
-- already read through short-lived signed URLs by every existing render site,
-- and already deletes its objects on replace/remove. The child's photo and the
-- parent-uploaded photo become ONE model with ONE column
-- (students.avatar_media_path) instead of two that can drift apart again —
-- which is how this defect happened in the first place. As a free side effect
-- it also fixes entitlement: a linked parent can finally see a photo their own
-- child uploaded, which is currently impossible.
--
-- The ONLY DB change (b) needs is section 2: the helper's write branch is
-- read-only for the student today, so without it the child's upload would be
-- denied by RLS and the whole fix would fail silently at upload time.
--
-- -----------------------------------------------------------------------------
-- DESIGN DECISION 2 — the child may now DELETE inside their own folder
-- -----------------------------------------------------------------------------
-- Widening the write branch means a child can also delete/replace a photo their
-- PARENT uploaded for them. That is deliberate and it is the safer direction:
-- the subject of the photograph is the child, "remove my picture" must actually
-- remove it, and the parent can always re-set it. The child still cannot touch
-- any other student's folder — the helper matches
-- s.profile_id = current_profile_id() against the path's own student segment.
--
-- -----------------------------------------------------------------------------
-- DESIGN DECISION 3 — the parent's own avatar is UNCHANGED
-- -----------------------------------------------------------------------------
-- 'profile-avatars' stays public = true; "public read avatars" is untouched;
-- a parent can still insert/update/delete their own object and still gets a
-- public URL. Section 3 only removes STUDENTS from the write set, and section 5
-- deletes only CHILD-owned objects. The 4 parent-owned objects on dev survive.
-- Two parent-path improvements are RECOMMENDED but deliberately NOT applied
-- here — see "FOLLOW-UPS" at the bottom.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0) Pre-state, for the reviewer's transcript.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa_total int;
  v_pa_child int;
  v_ma_child int;
begin
  select count(*) into v_pa_total
    from storage.objects where bucket_id = 'profile-avatars';

  select count(*) into v_pa_child
    from storage.objects o
   where o.bucket_id = 'profile-avatars'
     and (
       exists (select 1 from auth.users u
                where u.id = o.owner and lower(u.email) like '%@children.invalid')
       or exists (select 1 from public.profiles p
                    join public.students s on s.profile_id = p.id
                   where p.auth_user_id = o.owner)
     );

  select count(*) into v_ma_child
    from public.media_assets m
   where m.bucket = 'profile-avatars'
     and exists (select 1 from public.students s where s.profile_id = m.owner_profile_id);

  raise notice '096 pre-state: profile-avatars objects=%, of which child-owned=%; child-owned media_assets rows=%',
    v_pa_total, v_pa_child, v_ma_child;
end $$;

-- ----------------------------------------------------------------------------
-- 1) current_profile_is_student() — "is the caller a child account?"
--    DEFINER: the students lookup must not depend on students' own RLS (same
--    reason is_parent_linked_to_student is DEFINER). anon has no path to it.
--    Backport target: 002 (NOT 011) — a STORAGE policy in 009 calls it, and 009
--    runs before 011, so a from-zero rebuild needs it defined by 002.
-- ----------------------------------------------------------------------------
create or replace function public.current_profile_is_student()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.students s
    where s.profile_id = public.current_profile_id()
  )
$$;

comment on function public.current_profile_is_student() is
  'True when the calling auth user''s profile is a CHILD account (has a students row). '
  'Used by the profile-avatars storage policies (migration 096) to keep child photos out '
  'of the PUBLIC avatar bucket: a child''s own avatar belongs in the PRIVATE child-avatars '
  'bucket, exactly like a parent-uploaded child photo.';

revoke all on function public.current_profile_is_student() from public, anon;
grant execute on function public.current_profile_is_student() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) can_access_child_avatar(): admit the student to the WRITE branch.
--    BEFORE: (not p_for_write and s.profile_id = current_profile_id())  -- read only
--    AFTER : s.profile_id = current_profile_id()                        -- read + write
--    Everything else is byte-identical to 009/071: same signature, same
--    SECURITY DEFINER + search_path, same structural path validation, same
--    creator-parent / active-linked-parent / admin set, same grants. The four
--    "child-avatars" policies call this helper, so they need no edit — that is
--    the whole point of the 071 one-helper design.
-- ----------------------------------------------------------------------------
create or replace function public.can_access_child_avatar(
  p_object_name text,
  p_for_write   boolean
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or (
        split_part(coalesce(p_object_name, ''), '/', 1) = 'students'
        and split_part(p_object_name, '/', 3) <> ''         -- a file under the student folder
        and exists (
          select 1
          from public.students s
          where s.profile_id::text = split_part(p_object_name, '/', 2)
            and (
              s.created_by_parent_profile_id = public.current_profile_id()
              or public.is_parent_linked_to_student(s.profile_id)
              -- Migration 096: the student themself, for READ **and WRITE**.
              -- A child's own avatar now lives in this private bucket, so the
              -- child must be able to upload, replace and DELETE it inside
              -- their own folder (and only their own — the comparison is
              -- against the student id parsed out of the object path).
              or s.profile_id = public.current_profile_id()
            )
        )
      )
$$;

comment on function public.can_access_child_avatar(text, boolean) is
  'storage.objects gate for the PRIVATE child-avatars bucket (migration 071; write branch '
  'widened in 096). Object path students/<student_profile_id>/<file>. Read AND write: the '
  'creator parent, an ACTIVE linked parent, an admin, or THE STUDENT THEMSELF (a child''s '
  'own avatar lives here too since 096, and "remove" must really delete). anon never has a '
  'path (the policies are TO authenticated).';

revoke all on function public.can_access_child_avatar(text, boolean) from public, anon;
grant execute on function public.can_access_child_avatar(text, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) storage.objects / 'profile-avatars': a STUDENT may not write here.
--    Replaces the single FOR ALL policy "owner manage own avatar" (009:121-132)
--    with three narrower ones. Rationale for the split:
--      * INSERT / UPDATE  -> student excluded. This is the durable enforcement:
--        even if the old app code were restored, a child upload now FAILS at
--        the database instead of silently publishing a minor's photograph.
--      * DELETE           -> student NOT excluded, on purpose. Deletion is the
--        privacy-positive direction; a leftover legacy object must stay
--        cleanable by its owner.
--      * SELECT is already covered by "public read avatars", which is left
--        exactly as it is (parent behaviour unchanged).
--    Admins keep full management (is_admin() short-circuits the student test).
--    service_role bypasses RLS entirely and is unaffected — the media_assets
--    guard in section 4 is what covers that path.
-- ----------------------------------------------------------------------------
drop policy if exists "owner manage own avatar" on storage.objects;

drop policy if exists "owner insert own avatar" on storage.objects;
create policy "owner insert own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (owner = auth.uid() and not public.current_profile_is_student())
    )
  );

drop policy if exists "owner update own avatar" on storage.objects;
create policy "owner update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (owner = auth.uid() and not public.current_profile_is_student())
    )
  )
  with check (
    bucket_id = 'profile-avatars'
    and (
      public.is_admin()
      or (owner = auth.uid() and not public.current_profile_is_student())
    )
  );

-- Deletion stays open to the object's owner (including a student cleaning up a
-- legacy object) and to admins.
drop policy if exists "owner delete own avatar" on storage.objects;
create policy "owner delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (owner = auth.uid() or public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- 4) media_assets guard: no child-owned row may claim the PUBLIC avatar bucket.
--    A TRIGGER, not a policy, deliberately: triggers also apply to the
--    service_role / BFF path, which RLS does not. This is the half that keeps
--    the metadata (and therefore the anon-enumerable bucket+path pair exposed
--    by the media_select_anon policy in 010) from ever being recreated.
-- ----------------------------------------------------------------------------
create or replace function public.media_assets_child_avatar_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.bucket = 'profile-avatars'
     and new.owner_profile_id is not null
     and exists (select 1 from public.students s where s.profile_id = new.owner_profile_id)
  then
    raise exception
      'media_assets: a child avatar may not live in the public profile-avatars bucket; use the private child-avatars bucket (students.avatar_media_path)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.media_assets_child_avatar_guard() is
  'Child-safety guard (migration 096): rejects any media_assets row that puts a STUDENT-owned '
  'file in the PUBLIC profile-avatars bucket. A child''s avatar belongs in the PRIVATE '
  'child-avatars bucket, pointed at by students.avatar_media_path. Enforced as a trigger so '
  'it also binds the service-role/BFF path, which RLS does not.';

drop trigger if exists trg_media_assets_child_avatar_guard on public.media_assets;
create trigger trg_media_assets_child_avatar_guard
  before insert or update of bucket, owner_profile_id on public.media_assets
  for each row execute function public.media_assets_child_avatar_guard();

-- ----------------------------------------------------------------------------
-- 5) REMEDIATION of what is ALREADY exposed.
--
--    Decision: REVOKE, do not migrate. Justification:
--      * SQL has no primitive that copies Storage BYTES between buckets, so
--        "copy the object into child-avatars and repoint the row" is simply not
--        achievable from a migration file. It would need an out-of-band script
--        holding the service key.
--      * On dev the metadata side is EMPTY (media_assets = 0 rows, profiles = 0,
--        students = 0 after the rebuild) while storage.objects still holds 5
--        real JPEGs in profile-avatars — 1 owned by an @children.invalid auth
--        user. A media_assets-driven migration would remediate literally
--        NOTHING. The exposure lives in storage.objects.
--      * An exposed photograph of a minor should stop being reachable NOW, not
--        on a best-effort copy schedule. Re-uploading one avatar is a trivial
--        cost; leaving it public is not.
--
--    WHAT HAPPENS TO A CHILD WHO HAD ONE: the photo disappears from the child
--    header, the child profile page and every parent screen, and they fall back
--    to the initials bubble — never a broken image, because every resolver
--    degrades to null. They can re-upload once, into the private bucket, and
--    that one is genuinely removable. On dev that is exactly ONE child.
--
--    Scope line: CHILD-owned only. The 4 parent-owned objects are untouched.
--    Three independent ownership signals are OR'd so a row missing one still
--    gets caught:
--      (A) owner -> auth.users.email like '%@children.invalid'  (the canonical
--          synthetic child login email; the operative test on a rebuilt DB)
--      (B) owner -> profiles.auth_user_id -> students            (belt & braces)
--      (C) the path's first segment is the auth user id (the app writes
--          `${authUserId}/<ts>.<ext>`), resolved through (A)/(B) — catches rows
--          whose owner column was lost.
-- ----------------------------------------------------------------------------

-- 5a) Show the reviewer exactly what is about to go, BEFORE it goes.
--     (ON COMMIT DROP scopes the temp table to this transaction; the explicit
--     drop keeps the file re-runnable inside a single session/transaction too.)
drop table if exists tmp_096_child_avatar_objects;
create temporary table tmp_096_child_avatar_objects on commit drop as
select o.id, o.name, o.owner, o.created_at
from storage.objects o
where o.bucket_id = 'profile-avatars'
  and (
    -- (A) + (B): via the owner column
    exists (
      select 1 from auth.users u
       where u.id = o.owner and lower(u.email) like '%@children.invalid'
    )
    or exists (
      select 1 from public.profiles p
        join public.students s on s.profile_id = p.id
       where p.auth_user_id = o.owner
    )
    -- (C): via the first path segment, when it is a well-formed uuid
    or (
      split_part(o.name, '/', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (
        exists (
          select 1 from auth.users u
           where u.id = split_part(o.name, '/', 1)::uuid
             and lower(u.email) like '%@children.invalid'
        )
        or exists (
          select 1 from public.profiles p
            join public.students s on s.profile_id = p.id
           where p.auth_user_id = split_part(o.name, '/', 1)::uuid
        )
      )
    )
  );

select 'TO BE REMOVED (child-owned, public bucket)' as remediation,
       name as object_name, created_at
from tmp_096_child_avatar_objects
order by created_at;

-- 5b) Unlink, then delete the metadata rows, then delete the storage rows.
--     (profiles.avatar_media_id is ON DELETE SET NULL — the explicit update is
--     belt and braces and makes the intent readable.)
update public.profiles p
   set avatar_media_id = null,
       updated_at      = now()
 where p.avatar_media_id in (
   select m.id
     from public.media_assets m
    where m.bucket = 'profile-avatars'
      and exists (select 1 from public.students s where s.profile_id = m.owner_profile_id)
 );

delete from public.media_assets m
 where m.bucket = 'profile-avatars'
   and exists (select 1 from public.students s where s.profile_id = m.owner_profile_id);

-- Also drop metadata rows that point at an object we are deleting, whatever
-- their recorded owner (a stale/mis-owned row would otherwise keep publishing a
-- dead path).
delete from public.media_assets m
 where m.bucket = 'profile-avatars'
   and m.path in (select name from tmp_096_child_avatar_objects);

-- Supabase installs a STATEMENT-level BEFORE DELETE trigger on storage.objects
-- (storage.protect_objects_delete -> storage.protect_delete) that rejects every
-- direct SQL delete unless the session opts in via this custom GUC. It exists to
-- stop accidental orphaning; here the orphaning is understood and accepted (see
-- FOLLOW-UPS 1). Scoped with SET LOCAL and switched straight back off, so the
-- opt-in covers exactly this one statement.
set local storage.allow_delete_query = 'true';

delete from storage.objects o
 using tmp_096_child_avatar_objects t
 where o.id = t.id;

set local storage.allow_delete_query = 'false';

-- 5c) Report: what went, what survived, and what could not be classified.
do $$
declare
  r          record;
  v_removed  int;
  v_left     int;
  v_unknown  int;
begin
  select count(*) into v_removed from tmp_096_child_avatar_objects;
  for r in select name from tmp_096_child_avatar_objects order by name loop
    raise notice '096 removed child avatar object: profile-avatars/%', r.name;
  end loop;

  select count(*) into v_left from storage.objects where bucket_id = 'profile-avatars';

  select count(*) into v_unknown
    from storage.objects o
   where o.bucket_id = 'profile-avatars'
     and o.owner is null
     and split_part(o.name, '/', 1) !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  raise notice '096 remediation: % child object(s) removed, % object(s) remain in profile-avatars (parent/adult-owned, intentionally kept).',
    v_removed, v_left;
  if v_unknown > 0 then
    raise warning '096: % object(s) in profile-avatars have NO owner and no uuid path prefix — they could not be classified. Review them manually in the Storage dashboard.',
      v_unknown;
  end if;
  if v_removed > 0 then
    raise warning '096: the public URL stops resolving immediately (the Storage API resolves every object through the row just deleted), but the underlying BLOB is now orphaned in the object store. Delete the listed path(s) through the Storage API / Supabase dashboard as well to reclaim the bytes.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Self-verify. Any raise fails the migration inside this transaction.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cnt int;
  v_def text;
begin
  -- 6.1 New helper: exists, DEFINER, out of anon reach.
  if to_regprocedure('public.current_profile_is_student()') is null then
    raise exception '096: current_profile_is_student missing';
  end if;
  if not (select p.prosecdef from pg_proc p
           where p.oid = 'public.current_profile_is_student()'::regprocedure) then
    raise exception '096: current_profile_is_student must be SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', 'public.current_profile_is_student()', 'EXECUTE') then
    raise exception '096: anon must not execute current_profile_is_student';
  end if;
  if not has_function_privilege('authenticated', 'public.current_profile_is_student()', 'EXECUTE') then
    raise exception '096: authenticated execute grant missing on current_profile_is_student';
  end if;

  -- 6.2 child-avatars gate: the student self clause is now unconditional
  --     (no `not p_for_write` qualifier), and the parent/admin set survived.
  v_def := pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure);
  if position('not p_for_write' in v_def) > 0 then
    raise exception '096: can_access_child_avatar still gates the student self clause on read only';
  end if;
  if position('s.profile_id = public.current_profile_id()' in v_def) = 0
     or position('created_by_parent_profile_id' in v_def) = 0
     or position('is_parent_linked_to_student' in v_def) = 0
     or position('split_part' in v_def) = 0 then
    raise exception '096: can_access_child_avatar lost a path/ownership marker';
  end if;
  if has_function_privilege('anon', 'public.can_access_child_avatar(text,boolean)', 'EXECUTE') then
    raise exception '096: anon must not execute can_access_child_avatar';
  end if;

  -- 6.3 child-avatars bucket still PRIVATE with its four policies, no anon role.
  if not exists (select 1 from storage.buckets where id = 'child-avatars' and public = false) then
    raise exception '096: child-avatars bucket missing or not private';
  end if;
  select count(*) into v_cnt from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('read child-avatars','insert child-avatars',
                        'update child-avatars','delete child-avatars');
  if v_cnt <> 4 then
    raise exception '096: expected 4 child-avatars policies, found %', v_cnt;
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like '%child-avatars%'
       and roles::text[] && array['anon','public']
  ) then
    raise exception '096: a child-avatars policy is reachable by anon';
  end if;

  -- 6.4 profile-avatars: the old FOR ALL policy is gone; the write policies
  --     exclude students; public read is untouched (parent behaviour intact).
  if exists (select 1 from pg_policies
              where schemaname='storage' and tablename='objects'
                and policyname = 'owner manage own avatar') then
    raise exception '096: legacy "owner manage own avatar" policy still present';
  end if;
  select count(*) into v_cnt from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('owner insert own avatar','owner update own avatar','owner delete own avatar');
  if v_cnt <> 3 then
    raise exception '096: expected 3 profile-avatars write policies, found %', v_cnt;
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname in ('owner insert own avatar','owner update own avatar')
       and coalesce(qual,'') || coalesce(with_check,'') not like '%current_profile_is_student%'
  ) then
    raise exception '096: a profile-avatars write policy does not exclude students';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname = 'public read avatars'
  ) then
    raise exception '096: "public read avatars" was dropped — parent avatars would break';
  end if;

  -- 6.5 media_assets guard installed.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.media_assets'::regclass
       and tgname = 'trg_media_assets_child_avatar_guard'
       and not tgisinternal
  ) then
    raise exception '096: trg_media_assets_child_avatar_guard missing';
  end if;

  -- 6.6 Remediation actually landed: nothing child-shaped left in the public
  --     bucket, on either the metadata or the object side.
  if exists (
    select 1 from public.media_assets m
     where m.bucket = 'profile-avatars'
       and exists (select 1 from public.students s where s.profile_id = m.owner_profile_id)
  ) then
    raise exception '096: a child-owned media_assets row survived in profile-avatars';
  end if;
  if exists (
    select 1 from storage.objects o
     where o.bucket_id = 'profile-avatars'
       and (
         exists (select 1 from auth.users u
                  where u.id = o.owner and lower(u.email) like '%@children.invalid')
         or exists (select 1 from public.profiles p
                      join public.students s on s.profile_id = p.id
                     where p.auth_user_id = o.owner)
       )
  ) then
    raise exception '096: a child-owned object survived in profile-avatars';
  end if;

  raise notice '096 child avatar privacy self-verify PASS.';
end $$;

-- ----------------------------------------------------------------------------
-- 7) Resulting policy surface, for the reviewer's transcript.
-- ----------------------------------------------------------------------------
select policyname, cmd, roles::text as roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname ilike '%avatar%')
order by policyname;

commit;

-- =============================================================================
-- BACKPORT (main session, after this migration is applied and accepted)
-- =============================================================================
--  * 002_core_profiles_roles_permissions.sql — add public.current_profile_is_student()
--    next to is_parent_linked_to_student (MUST be 002: 009's storage policy calls it).
--  * 009_storage_buckets_policies.sql — replace the can_access_child_avatar body +
--    comment (009:168-200) with section 2 above, and replace the
--    "owner manage own avatar" block (009:121-132) with the three policies from
--    section 3. Leave the bucket inserts and "public read avatars" as they are.
--  * 011_indexes_constraints_functions_triggers.sql — add
--    media_assets_child_avatar_guard() + trg_media_assets_child_avatar_guard
--    alongside the other *_guard triggers.
--  * 008_notifications_support_audit.sql — NO change (media_assets table shape
--    is untouched).
--  * 013_validation_queries.sql — append check 88 (last existing check is 87):
--
-- -- 88) Round 53 (migration 096): a CHILD's own avatar is PRIVATE. The child
-- --     may write inside their own child-avatars folder, the public avatar
-- --     bucket refuses student writes, the media_assets guard is installed, and
-- --     no child-owned object/row survives in profile-avatars.
-- select '88_child_avatar_private' as check_name,
--        case when position('not p_for_write' in
--                  pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure)) = 0
--              and to_regprocedure('public.current_profile_is_student()') is not null
--              and not has_function_privilege('anon', 'public.current_profile_is_student()', 'EXECUTE')
--              and exists (select 1 from storage.buckets where id = 'child-avatars' and public = false)
--              and (select count(*) from pg_policies
--                    where schemaname='storage' and tablename='objects'
--                      and policyname in ('owner insert own avatar','owner update own avatar')
--                      and coalesce(qual,'') || coalesce(with_check,'') like '%current_profile_is_student%') = 2
--              and exists (select 1 from pg_trigger
--                           where tgrelid = 'public.media_assets'::regclass
--                             and tgname = 'trg_media_assets_child_avatar_guard'
--                             and not tgisinternal)
--              and not exists (select 1 from public.media_assets m
--                               where m.bucket = 'profile-avatars'
--                                 and exists (select 1 from public.students s
--                                              where s.profile_id = m.owner_profile_id))
--              and not exists (select 1 from storage.objects o
--                               where o.bucket_id = 'profile-avatars'
--                                 and exists (select 1 from auth.users u
--                                              where u.id = o.owner
--                                                and lower(u.email) like '%@children.invalid'))
--             then 'PASS' else 'FAIL' end as status;
--
-- =============================================================================
-- FOLLOW-UPS THIS MIGRATION DELIBERATELY DOES **NOT** DO
-- =============================================================================
-- 1) BYTE-LEVEL DELETE. Supabase itself discourages SQL deletes from
--    storage.objects (the statement trigger storage.protect_objects_delete)
--    precisely because they orphan the blob. Section 5b opts in deliberately:
--    the PRIVACY leak closes the moment the row goes — the Storage API resolves
--    every object, public bucket included, through that row, so the URL starts
--    404ing immediately and nothing serves the photograph any more. What is left
--    behind is a billable, URL-unreachable blob: a HYGIENE problem, not a
--    child-safety one, and not a reason to leave a minor's photo public for
--    another day. Finish the job by deleting the paths printed in section 5a/5c
--    through the Storage API or the Supabase dashboard. SQL cannot free the
--    bytes on its own.
--
-- 2) ANON ENUMERATION OF AVATAR METADATA (parent path — owner decision).
--    010:770 `media_select_anon` grants anon `visibility = 'public'` across ALL
--    buckets, so an anonymous caller can LIST bucket+path for every public
--    avatar and rebuild the URLs. After this migration no CHILD row can exist
--    there, so the child-safety half is closed — but the parent half is not,
--    and it is what makes the privacy policy's "nobody who doesn't know the
--    link can find it" wording inaccurate. Narrowing it does NOT change any
--    parent RENDER path (the parent's own avatar is read by the parent's own
--    authenticated session through `media_select`, and no public page reads
--    profile-avatars), so it is safe — but it is a parent-path change and the
--    task scoped this migration to the child path. Ready to run when approved:
--
--      drop policy if exists "media_select_anon" on public.media_assets;
--      create policy "media_select_anon" on public.media_assets for select to anon
--        using (visibility = 'public' and bucket <> 'profile-avatars');
--
-- 3) PARENT AVATAR REMOVAL IS STILL UNLINK-ONLY
--    (web-app/src/lib/auth/avatarCore.ts removeAvatarCore). An adult's own
--    picture stays in the public bucket forever after they "remove" it. That is
--    a data-retention correctness bug, not a child-safety one — it deserves its
--    own decision, and it is an APP change, not a SQL one.
--
-- 4) FLIPPING 'profile-avatars' TO private = the largest-blast-radius option
--    (every parent render site would need signed URLs, web + mobile). Only if
--    the owner asks for it.
--
-- =============================================================================
-- APP CHANGES THIS MIGRATION ASSUMES (they must ship together)
-- =============================================================================
-- The DB now PERMITS the private child path and FORBIDS the public one. Until
-- the app is updated, a child's avatar upload will FAIL (correctly, and loudly)
-- instead of leaking. The app side must:
--   * rewrite setChildOwnAvatar / removeChildOwnAvatar
--     (web-app/src/lib/auth/childProfileActions.ts) onto the private
--     'child-avatars' bucket at students/<child profile id>/<uuid>.<ext>,
--     writing students.{avatar_kind='photo', avatar_key=null,
--     avatar_media_path} and reusing childAvatarCore.removeObject() so removal
--     really deletes, best-effort, never failing the user action;
--   * branch web-app/src/app/api/mobile/v1/profile/avatar/route.ts on
--     user.role === 'student' and stop returning getPublicUrl() to the device;
--   * drop the legacy getPublicUrl fallbacks in web-app/src/app/child/layout.tsx
--     and web-app/src/app/child/profile/page.tsx, and stop producing avatarUrl
--     for students in mobile-app/src/features/profile/studentProfile.ts;
--   * reject GIF on this path — the private bucket allows png/jpeg/webp only.
-- No change is needed at any parent render site, at any preset/emoji avatar, or
-- at any leaderboard surface (the anonymised public top-10 joins no avatar).
-- =============================================================================
