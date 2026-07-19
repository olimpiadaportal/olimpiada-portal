-- =============================================================================
-- 009_storage_buckets_policies.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 009 of 013.
--
-- Responsibility : Supabase Storage buckets and storage.objects RLS policies.
-- Run order      : After 008 (uses helper functions from 002; pairs with
--                  media_assets metadata in 008). Before 010.
-- Safe to rerun  : Caution. Bucket inserts use ON CONFLICT DO NOTHING. Policies
--                  use DROP POLICY IF EXISTS + CREATE POLICY (idempotent
--                  redefinition of named policies — documented, non-data-destructive).
--
-- RULES:
--   * No binary files in PostgreSQL — buckets hold the files; media_assets (008)
--     holds the metadata/paths.
--   * No public writes. Public READ is allowed only for approved public buckets.
--   * Private buckets (admin-imports, reports) require signed URLs / ownership.
--   * Images should be resized/compressed and audio size-limited by the app on
--     upload; bucket limits below are a backstop.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Buckets
--   question-media     : optimized question images + small audio (public read)
--   explanation-media  : optimized explanation images/audio (public read)
--   profile-avatars    : optional resized avatars (public read, owner write)
--   admin-imports      : temporary content import files (private)
--   reports            : generated CSV/PDF exports (private, signed URLs)
-- file_size_limit is in bytes. allowed_mime_types is a backstop only.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-media',    'question-media',    true,  5242880,
     array['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/mp4','audio/ogg']),
  ('explanation-media', 'explanation-media', true,  5242880,
     array['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/mp4','audio/ogg']),
  ('profile-avatars',   'profile-avatars',   true,  2097152,
     array['image/png','image/jpeg','image/webp']),
  ('admin-imports',     'admin-imports',     false, 10485760,
     array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/json']),
  ('reports',           'reports',           false, 10485760,
     array['text/csv','application/pdf'])
on conflict (id) do nothing;

-- wallpaper-assets : predefined child-dashboard wallpaper images (public read,
-- admin write). Solid-color wallpapers need no file; image wallpapers live here.
-- DEPRECATED (Round 11): wallpapers retired at the app level; bucket kept
-- non-destructively (existing objects untouched).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallpaper-assets', 'wallpaper-assets', true, 3145728,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- sticker-assets : Character Sticker theme images (Round 11, migration 026).
-- Public read, admin write. PNG/WebP ONLY — stickers must support transparency
-- (no JPEG/GIF; SVG is banned platform-wide as a stored-XSS vector).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sticker-assets', 'sticker-assets', true, 2097152,
        array['image/png','image/webp'])
on conflict (id) do nothing;

-- child-avatars : parent-uploaded child photos (migration 071). PRIVATE
-- (public = false): objects are non-enumerable and every read goes through a
-- signed URL or the ownership policies below. Path convention:
-- students/<student_profile_id>/<file>. 2 MB backstop, images only (SVG banned
-- platform-wide; no GIF for avatars).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('child-avatars', 'child-avatars', false, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Privacy backstop: if the bucket pre-exists as public, force it private.
update storage.buckets set public = false where id = 'child-avatars' and public;

-- -----------------------------------------------------------------------------
-- !!! VALIDATION WARNING — TEST THIS FILE ON SUPABASE DEV/STAGING FIRST !!!
-- `storage.objects` is owned by `supabase_storage_admin`, not `postgres`. On some
-- Supabase projects the SQL editor role cannot DROP/CREATE policies on it and the
-- policy statements below will fail with: "must be owner of relation objects".
--
-- FALLBACK (do not over-engineer): if that happens, create the equivalent
-- policies through the Supabase Storage dashboard UI, and keep THIS FILE as the
-- source-of-truth documentation of the intended storage policies. The bucket
-- INSERT above is unaffected and works regardless.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Helper note: storage.objects has columns (bucket_id text, name text,
-- owner uuid, ...). owner maps to auth.uid(). We use our 002 helpers for admin /
-- content-manager checks.
-- -----------------------------------------------------------------------------

-- ===== Public-read buckets: anyone may READ; only privileged roles may WRITE ===

-- question-media + explanation-media: public read
drop policy if exists "public read question/explanation media" on storage.objects;
create policy "public read question/explanation media"
  on storage.objects for select
  using (bucket_id in ('question-media', 'explanation-media'));

-- question-media + explanation-media: write/update/delete = admin or content manager
drop policy if exists "manage question/explanation media" on storage.objects;
create policy "manage question/explanation media"
  on storage.objects for all
  to authenticated
  using (
    bucket_id in ('question-media', 'explanation-media')
    and (public.is_admin() or public.has_permission('content.create') or public.has_permission('content.edit_own'))
  )
  with check (
    bucket_id in ('question-media', 'explanation-media')
    and (public.is_admin() or public.has_permission('content.create') or public.has_permission('content.edit_own'))
  );

-- ===== profile-avatars: public read; owner (or admin) manages own avatar =====
drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

drop policy if exists "owner manage own avatar" on storage.objects;
create policy "owner manage own avatar"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (owner = auth.uid() or public.is_admin())
  )
  with check (
    bucket_id = 'profile-avatars'
    and (owner = auth.uid() or public.is_admin())
  );

-- ===== wallpaper-assets: public read; admin manages the catalog images ========
drop policy if exists "public read wallpaper-assets" on storage.objects;
create policy "public read wallpaper-assets"
  on storage.objects for select
  using (bucket_id = 'wallpaper-assets');

drop policy if exists "admin manage wallpaper-assets" on storage.objects;
create policy "admin manage wallpaper-assets"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'wallpaper-assets' and public.is_admin())
  with check (bucket_id = 'wallpaper-assets' and public.is_admin());

-- ===== sticker-assets: public read; admin manages the theme images ===========
drop policy if exists "public read sticker-assets" on storage.objects;
create policy "public read sticker-assets"
  on storage.objects for select
  using (bucket_id = 'sticker-assets');

drop policy if exists "admin manage sticker-assets" on storage.objects;
create policy "admin manage sticker-assets"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'sticker-assets' and public.is_admin())
  with check (bucket_id = 'sticker-assets' and public.is_admin());

-- ===== child-avatars: PRIVATE — family-only access, no anon path =============
-- Backported from migrations/2026_07_18_071_child_avatars.sql. ONE DEFINER
-- helper gates all four policies (the students/parent_student_links lookups
-- must not depend on those tables' RLS — same reason is_parent_linked_to_student
-- is DEFINER). Path is validated structurally (students/<uuid>/<file>) before
-- any lookup.
--   write (p_for_write=true) : creator parent | active linked parent | admin
--   read  (p_for_write=false): the same set PLUS the student themself
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

-- ===== Private buckets: admin-imports, reports — no public access ============
-- admin-imports: admins (and content importers) only.
drop policy if exists "admin manage imports" on storage.objects;
create policy "admin manage imports"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'admin-imports'
    and (public.is_admin() or public.has_permission('content.create'))
  )
  with check (
    bucket_id = 'admin-imports'
    and (public.is_admin() or public.has_permission('content.create'))
  );

-- reports: admins read/manage; owners may read their own generated report.
drop policy if exists "read reports" on storage.objects;
create policy "read reports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and (public.is_admin() or owner = auth.uid())
  );

drop policy if exists "admin manage reports" on storage.objects;
create policy "admin manage reports"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'reports'
    and public.is_admin()
  )
  with check (
    bucket_id = 'reports'
    and public.is_admin()
  );

-- =============================================================================
-- End of 009_storage_buckets_policies.sql
-- =============================================================================
