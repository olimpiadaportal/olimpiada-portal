-- ============================================================================
-- Migration: 2026_07_18_071_child_avatars.sql
-- Purpose: Add-Child avatars (investor round). A parent either uploads a child
-- PHOTO or picks a PRESET ('boy'/'girl'); skipping both keeps the existing
-- initials avatar.
--   * students gains avatar_kind ('preset'|'photo', default 'preset'),
--     avatar_key (preset key; app-side whitelist — NO hard DB whitelist so a
--     future preset needs no migration) and avatar_media_path (storage object
--     path). The DEFAULT state (kind='preset', avatar_key NULL) IS the
--     current initials avatar — every existing row keeps its look with zero
--     backfill.
--   * PRIVATE storage bucket child-avatars (public = false): child photos are
--     served via short-lived SIGNED URLs only, never an enumerable public URL.
--     Path convention: students/<student_profile_id>/<file>.
--   * storage.objects policies (SELECT / INSERT / UPDATE / DELETE, authenticated
--     only — anon has NO path): writes for the student''s CREATOR parent, an
--     ACTIVE linked parent (is_parent_linked_to_student — the exact ownership
--     rule the app''s parent guards use) or an admin; SELECT additionally for
--     the student themself. The student id is parsed from the object name''s
--     path segments inside ONE DEFINER helper (can_access_child_avatar) so the
--     four policies can never drift and the students/links lookups never
--     depend on those tables'' own RLS.
--   * No new RPC: the students.avatar_* row updates go through the existing
--     service-role parent-core server actions (web BFF) after ownership
--     verification; the storage writes run under the parent''s OWN session
--     against these policies.
--
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/002_core_profiles_roles_permissions.sql
--                           supabase/sql/009_storage_buckets_policies.sql
-- Backport status: completed (002 students columns/check, 009 bucket + helper
--                  + policies, 013 new check #72)
-- Destructive change: no
-- Rollback notes: drop the four "child-avatars" policies + function
--                  public.can_access_child_avatar(text,boolean); drop columns
--                  students.avatar_kind/avatar_key/avatar_media_path; leave
--                  the bucket (delete objects via dashboard if truly unwanted).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) students avatar columns. Default (preset + NULL key) = initials avatar.
-- ----------------------------------------------------------------------------
alter table public.students
  add column if not exists avatar_kind       text not null default 'preset',
  add column if not exists avatar_key        text,
  add column if not exists avatar_media_path text;

do $$ begin
  alter table public.students
    add constraint chk_students_avatar_kind
    check (avatar_kind in ('preset', 'photo'));
exception when duplicate_object then null; end $$;

comment on column public.students.avatar_kind is
  'Child avatar mode: preset (avatar_key names a stable preset; NULL key = the default initials avatar) or photo (avatar_media_path points into the PRIVATE child-avatars bucket).';
comment on column public.students.avatar_key is
  'Preset avatar key (e.g. boy, girl). Stable app-side catalog — validated in the parent server actions, intentionally NOT a DB whitelist so future presets need no migration. NULL with kind=preset = initials avatar (the skip default).';
comment on column public.students.avatar_media_path is
  'Storage object path (students/<student_profile_id>/<file>) inside the PRIVATE child-avatars bucket. Served via signed URLs only. NULL unless avatar_kind = photo.';

-- ----------------------------------------------------------------------------
-- 2) PRIVATE bucket. public=false is the point: objects are non-enumerable and
--    every read goes through a signed URL or the owner policies below.
--    2 MB backstop, images only (SVG banned platform-wide; no GIF for avatars).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('child-avatars', 'child-avatars', false, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Privacy backstop: if the bucket pre-exists as public, force it private.
update storage.buckets set public = false where id = 'child-avatars' and public;

-- ----------------------------------------------------------------------------
-- 3) ONE access helper for all four policies. DEFINER: the students /
--    parent_student_links lookups must not depend on those tables' RLS (same
--    reason is_parent_linked_to_student is DEFINER). Path is validated
--    structurally (students/<uuid>/...) before any lookup.
--      write (p_for_write=true) : creator parent | active linked parent | admin
--      read  (p_for_write=false): the same set PLUS the student themself
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
              or (not p_for_write and s.profile_id = public.current_profile_id())
            )
        )
      )
$$;
comment on function public.can_access_child_avatar(text, boolean) is
  'storage.objects gate for the PRIVATE child-avatars bucket (migration 071). '
  'Object path students/<student_profile_id>/<file>. Write: the creator parent, '
  'an ACTIVE linked parent, or an admin. Read: the same set plus the student '
  'themself. anon never has a path (policies are TO authenticated).';
revoke all on function public.can_access_child_avatar(text, boolean) from public, anon;
grant execute on function public.can_access_child_avatar(text, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) The four policies (authenticated only — NO anon access to this bucket).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare
  v_cnt int;
begin
  -- 1) Columns + CHECK (with both allowed values) on students.
  if (select count(*) from information_schema.columns
      where table_schema='public' and table_name='students'
        and column_name in ('avatar_kind','avatar_key','avatar_media_path')) <> 3 then
    raise exception 'students avatar columns missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_students_avatar_kind'
      and conrelid = 'public.students'::regclass
      and pg_get_constraintdef(oid) like '%preset%'
      and pg_get_constraintdef(oid) like '%photo%'
  ) then
    raise exception 'chk_students_avatar_kind missing or wrong';
  end if;

  -- 2) Bucket exists and is PRIVATE.
  if not exists (select 1 from storage.buckets where id = 'child-avatars' and public = false) then
    raise exception 'child-avatars bucket missing or not private';
  end if;

  -- 3) Exactly the four policies, none reachable by anon (TO authenticated
  --    only; no public/anon role on any child-avatars policy).
  select count(*) into v_cnt
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('read child-avatars','insert child-avatars',
                       'update child-avatars','delete child-avatars');
  if v_cnt <> 4 then
    raise exception 'expected 4 child-avatars policies, found %', v_cnt;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like '%child-avatars%'
      and roles::text[] && array['anon','public']
  ) then
    raise exception 'a child-avatars policy is reachable by anon';
  end if;

  -- 4) Helper: DEFINER, out of anon reach, path parsing + ownership markers.
  if to_regprocedure('public.can_access_child_avatar(text,boolean)') is null then
    raise exception 'can_access_child_avatar missing';
  end if;
  if has_function_privilege('anon', 'public.can_access_child_avatar(text,boolean)', 'EXECUTE') then
    raise exception 'anon must not execute can_access_child_avatar';
  end if;
  if not has_function_privilege('authenticated', 'public.can_access_child_avatar(text,boolean)', 'EXECUTE') then
    raise exception 'authenticated execute grant missing on can_access_child_avatar';
  end if;
  if position('split_part' in pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure)) = 0
     or position('created_by_parent_profile_id' in pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure)) = 0
     or position('is_parent_linked_to_student' in pg_get_functiondef('public.can_access_child_avatar(text,boolean)'::regprocedure)) = 0 then
    raise exception 'can_access_child_avatar lacks path/ownership markers';
  end if;

  -- 5) Functional: the default avatar state is the documented skip default.
  if (select column_default from information_schema.columns
      where table_schema='public' and table_name='students'
        and column_name='avatar_kind') not like '%preset%' then
    raise exception 'students.avatar_kind default is not preset';
  end if;

  raise notice 'child avatars self-verify PASS.';
end $$;

commit;
