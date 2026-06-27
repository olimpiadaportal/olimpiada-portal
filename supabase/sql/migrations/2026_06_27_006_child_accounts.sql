-- Migration: 2026_06_27_006_child_accounts.sql
-- Purpose: Business-model foundation (Stage 7, increment 1) — parent-created child
--          accounts: 8-digit unique ID registry + generator, child credential mapping,
--          child profile fields, predefined wallpapers catalog + per-child selection,
--          wallpaper storage bucket, RLS, seeds.
-- Environment first applied: development/staging
-- Related root SQL file(s): 002 (students/child_unique_ids/child_credentials),
--          003 (wallpapers/child_wallpaper_selections), 009 (wallpaper bucket),
--          010 (RLS), 011 (generator + indexes), 012 (seed wallpapers).
-- Backport status: pending (will backport at Stage 7 close)
-- Destructive change: no (additive columns/tables/policies)
-- Rollback notes: drop the new tables/columns/function/policies; non-destructive to existing data.
-- =============================================================================

-- ---- Child access status enum ----------------------------------------------
do $$ begin
  create type public.child_access_status as enum
    ('inactive', 'trialing', 'active', 'locked', 'expired');
exception when duplicate_object then null; end $$;

-- ---- students: child profile fields (parent-created) ------------------------
alter table public.students
  add column if not exists created_by_parent_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists child_unique_id text unique,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists city text,
  add column if not exists school_name text,
  add column if not exists class_grade text,
  add column if not exists access_status public.child_access_status not null default 'inactive';

create index if not exists idx_students_created_by_parent on public.students (created_by_parent_profile_id);

-- ---- child_unique_ids: server-side allocation registry (collision-safe) ------
create table if not exists public.child_unique_ids (
  child_unique_id    text primary key,
  student_profile_id uuid not null unique references public.students (profile_id) on delete cascade,
  allocated_at       timestamptz not null default now()
);

-- ---- child_credentials: maps child auth (8-digit ID + parent password) -------
-- The child is a real Supabase Auth user (synthetic c<8digits>@children.invalid
-- email); the parent sets the password. Passwords live only in Supabase Auth.
create table if not exists public.child_credentials (
  student_profile_id            uuid primary key references public.students (profile_id) on delete cascade,
  child_unique_id               text not null unique,
  auth_user_id                  uuid not null unique references auth.users (id) on delete cascade,
  password_set_by_parent_profile_id uuid references public.profiles (id) on delete set null,
  password_set_at               timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- ---- wallpapers: predefined catalog (no arbitrary colors) -------------------
create table if not exists public.wallpapers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  kind           text not null default 'solid_color' check (kind in ('image', 'solid_color')),
  value          text,            -- hex color for solid_color
  media_asset_id uuid references public.media_assets (id) on delete set null, -- for image kind
  status         public.catalog_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---- child_wallpaper_selections: per-child dashboard wallpaper ---------------
create table if not exists public.child_wallpaper_selections (
  student_profile_id uuid primary key references public.students (profile_id) on delete cascade,
  wallpaper_id       uuid not null references public.wallpapers (id) on delete cascade,
  selected_at        timestamptz not null default now()
);

-- ---- 8-digit ID generator (random, collision-safe, server-side) -------------
create or replace function public.allocate_child_unique_id(p_student_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  tries int := 0;
begin
  loop
    tries := tries + 1;
    -- 10000000..99999999 (no leading zero), ~90M space.
    v_id := (10000000 + floor(random() * 90000000))::bigint::text;
    begin
      insert into public.child_unique_ids (child_unique_id, student_profile_id)
      values (v_id, p_student_profile_id);
      update public.students set child_unique_id = v_id where profile_id = p_student_profile_id;
      return v_id;
    exception when unique_violation then
      if tries > 50 then
        raise exception 'Could not allocate a unique child ID after 50 attempts';
      end if;
      -- loop and retry
    end;
  end loop;
end;
$$;

-- ---- updated_at triggers for the new tables --------------------------------
drop trigger if exists trg_set_updated_at on public.child_credentials;
create trigger trg_set_updated_at before update on public.child_credentials
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.wallpapers;
create trigger trg_set_updated_at before update on public.wallpapers
  for each row execute function public.set_updated_at();

-- ---- Baseline privileges for the new tables (RLS still gates rows) -----------
grant select on public.child_unique_ids, public.child_credentials, public.wallpapers, public.child_wallpaper_selections
  to anon, authenticated, service_role;
grant insert, update, delete on public.child_unique_ids, public.child_credentials, public.wallpapers, public.child_wallpaper_selections
  to authenticated;
grant all on public.child_unique_ids, public.child_credentials, public.wallpapers, public.child_wallpaper_selections
  to service_role;

-- ---- RLS --------------------------------------------------------------------
alter table public.child_unique_ids enable row level security;
alter table public.child_credentials enable row level security;
alter table public.wallpapers enable row level security;
alter table public.child_wallpaper_selections enable row level security;

-- students: include the CREATING PARENT in read/manage (besides child/admin/active-link).
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or public.has_permission('users.read')
    or public.is_parent_linked_to_student(profile_id)
    or created_by_parent_profile_id = public.current_profile_id()
  );
drop policy if exists "students_write" on public.students;
create policy "students_write" on public.students for all to authenticated
  using (
    profile_id = public.current_profile_id()
    or created_by_parent_profile_id = public.current_profile_id()
    or public.is_admin()
  )
  with check (
    profile_id = public.current_profile_id()
    or created_by_parent_profile_id = public.current_profile_id()
    or public.is_admin()
  );

-- child_unique_ids / child_credentials: admin read only; writes via the
-- SECURITY DEFINER function / service role (which bypass RLS). No write policy.
drop policy if exists "child_unique_ids_admin" on public.child_unique_ids;
create policy "child_unique_ids_admin" on public.child_unique_ids for select to authenticated
  using (public.is_admin());
drop policy if exists "child_credentials_admin" on public.child_credentials;
create policy "child_credentials_admin" on public.child_credentials for select to authenticated
  using (public.is_admin());

-- wallpapers: active catalog readable by authenticated; admin write.
drop policy if exists "wallpapers_select" on public.wallpapers;
create policy "wallpapers_select" on public.wallpapers for select to authenticated
  using (status = 'active' or public.is_admin());
drop policy if exists "wallpapers_write" on public.wallpapers;
create policy "wallpapers_write" on public.wallpapers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- child_wallpaper_selections: child manages own; parent/admin read.
drop policy if exists "cws_select" on public.child_wallpaper_selections;
create policy "cws_select" on public.child_wallpaper_selections for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
  );
drop policy if exists "cws_write" on public.child_wallpaper_selections;
create policy "cws_write" on public.child_wallpaper_selections for all to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin())
  with check (student_profile_id = public.current_profile_id() or public.is_admin());

-- ---- Storage bucket: wallpaper-assets (public read; admin write) -------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallpaper-assets', 'wallpaper-assets', true, 3145728,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "public read wallpaper-assets" on storage.objects;
create policy "public read wallpaper-assets" on storage.objects for select
  using (bucket_id = 'wallpaper-assets');
drop policy if exists "admin manage wallpaper-assets" on storage.objects;
create policy "admin manage wallpaper-assets" on storage.objects for all to authenticated
  using (bucket_id = 'wallpaper-assets' and public.is_admin())
  with check (bucket_id = 'wallpaper-assets' and public.is_admin());

-- ---- Seed: predefined solid-color wallpapers --------------------------------
-- Image wallpapers are added by an admin later via the wallpaper-assets bucket.
insert into public.wallpapers (code, name, kind, value, status) values
  ('solid_sky',      'Sky',      'solid_color', '#dbeafe', 'active'),
  ('solid_mint',     'Mint',     'solid_color', '#dcfce7', 'active'),
  ('solid_lavender', 'Lavender', 'solid_color', '#ede9fe', 'active'),
  ('solid_peach',    'Peach',    'solid_color', '#ffedd5', 'active'),
  ('solid_rose',     'Rose',     'solid_color', '#ffe4e6', 'active'),
  ('solid_slate',    'Slate',    'solid_color', '#e2e8f0', 'active')
on conflict (code) do nothing;
