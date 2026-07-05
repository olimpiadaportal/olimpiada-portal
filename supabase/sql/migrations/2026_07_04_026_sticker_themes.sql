-- =============================================================================
-- 2026_07_04_026_sticker_themes.sql
-- Round 11 item 9 — "Character Stickers" replace the wallpaper/color-palette
-- child customization.
--
-- Product model:
--   * Admin creates a sticker THEME (e.g. "Ben 10") and uploads ≥5 transparent
--     PNG/WebP sticker images for it (Supabase Storage `sticker-assets` bucket;
--     PostgreSQL stores metadata only via media_assets).
--   * A theme can only be ENABLED once it has at least 5 images (DB trigger);
--     deleting an image from an ENABLED theme below 5 is blocked (DB trigger).
--     NOTE (historical): this minimum was RAISED from 5 to 6 in migration
--     2026_07_04_028_sticker_min_six.sql. The "5" below reflects what THIS
--     migration originally applied; the live/canonical guards enforce 6.
--   * A child picks ONE enabled theme in their profile; the selection drives
--     decorative, non-blocking stickers across the child-facing pages.
--   * Children may only select ENABLED themes (RLS WITH CHECK).
--
-- The old wallpapers feature is retired at the APP level (UI + admin module
-- removed). `wallpapers` / `child_wallpaper_selections` stay in the schema as
-- DEPRECATED (non-destructive, same precedent as the old `subscriptions`
-- tables); dropping them needs explicit owner approval.
--
-- Backports: tables → 003; bucket + storage policies → 009; RLS → 010;
-- guard triggers + updated_at → 011; validation check #36 → 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.sticker_themes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,               -- character/theme display name (proper noun, not localized)
  is_enabled boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_sticker_themes_name
  on public.sticker_themes (lower(name));

comment on table public.sticker_themes is
  'Child "Character Sticker" themes (admin-managed). A theme may be enabled only with >= 5 sticker images (DB-enforced).';

create table if not exists public.sticker_images (
  id             uuid primary key default gen_random_uuid(),
  theme_id       uuid not null references public.sticker_themes (id) on delete cascade,
  media_asset_id uuid not null references public.media_assets (id) on delete restrict,
  order_index    int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists ix_sticker_images_theme on public.sticker_images (theme_id, order_index);

comment on table public.sticker_images is
  'Sticker images of a theme — METADATA only (media_assets → sticker-assets bucket). Transparent PNG/WebP enforced at upload (byte-sniffed app-side; bucket mime whitelist).';

create table if not exists public.child_sticker_selections (
  student_profile_id uuid primary key references public.students (profile_id) on delete cascade,
  theme_id           uuid not null references public.sticker_themes (id) on delete cascade,
  selected_at        timestamptz not null default now()
);

comment on table public.child_sticker_selections is
  'The child''s chosen sticker theme (1 per child). RLS: child writes own row and may only pick ENABLED themes.';

-- -----------------------------------------------------------------------------
-- Guard triggers (business invariants live in the DB, not only the admin UI)
-- -----------------------------------------------------------------------------
create or replace function public.fn_sticker_theme_enable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if new.is_enabled and not coalesce(old.is_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = new.id;
    if v_count < 5 then
      raise exception 'sticker theme needs at least 5 images to be enabled (has %)', v_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sticker_theme_enable_guard on public.sticker_themes;
create trigger trg_sticker_theme_enable_guard
  before update of is_enabled on public.sticker_themes
  for each row execute function public.fn_sticker_theme_enable_guard();

create or replace function public.fn_sticker_image_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_enabled boolean; v_count int;
begin
  select is_enabled into v_enabled from public.sticker_themes where id = old.theme_id;
  if coalesce(v_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = old.theme_id;
    if v_count - 1 < 5 then
      raise exception 'an enabled sticker theme must keep at least 5 images — disable the theme first'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_sticker_image_delete_guard on public.sticker_images;
create trigger trg_sticker_image_delete_guard
  before delete on public.sticker_images
  for each row execute function public.fn_sticker_image_delete_guard();

-- updated_at maintenance (shared helper from 011).
drop trigger if exists trg_set_updated_at on public.sticker_themes;
create trigger trg_set_updated_at before update on public.sticker_themes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.sticker_themes enable row level security;
alter table public.sticker_images enable row level security;
alter table public.child_sticker_selections enable row level security;

-- Themes: enabled catalog readable by authenticated (children/parents); admin sees all + writes.
drop policy if exists "sticker_themes_select" on public.sticker_themes;
create policy "sticker_themes_select" on public.sticker_themes for select to authenticated
  using (is_enabled or public.is_admin());
drop policy if exists "sticker_themes_write" on public.sticker_themes;
create policy "sticker_themes_write" on public.sticker_themes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Images: readable when their theme is visible; admin writes.
drop policy if exists "sticker_images_select" on public.sticker_images;
create policy "sticker_images_select" on public.sticker_images for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.sticker_themes t
               where t.id = theme_id and t.is_enabled)
  );
drop policy if exists "sticker_images_write" on public.sticker_images;
create policy "sticker_images_write" on public.sticker_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Selections: child manages own (ENABLED themes only); parent (linked or creator)/admin read.
drop policy if exists "css_select" on public.child_sticker_selections;
create policy "css_select" on public.child_sticker_selections for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
  );
drop policy if exists "css_write" on public.child_sticker_selections;
create policy "css_write" on public.child_sticker_selections for all to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin())
  with check (
    (student_profile_id = public.current_profile_id() or public.is_admin())
    and exists (select 1 from public.sticker_themes t
                where t.id = theme_id and (t.is_enabled or public.is_admin()))
  );

-- -----------------------------------------------------------------------------
-- Storage bucket: sticker-assets (public read; admin write).
-- PNG/WebP ONLY — stickers must support transparency (no JPEG/GIF/SVG; SVG is
-- banned platform-wide as a stored-XSS vector).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sticker-assets', 'sticker-assets', true, 2097152,
        array['image/png','image/webp'])
on conflict (id) do nothing;

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

-- -----------------------------------------------------------------------------
-- Retire the wallpapers feature (non-destructive).
-- -----------------------------------------------------------------------------
comment on table public.wallpapers is
  'DEPRECATED (Round 11): replaced by sticker_themes/sticker_images. App code removed; table kept non-destructively pending explicit owner approval to drop.';
comment on table public.child_wallpaper_selections is
  'DEPRECATED (Round 11): replaced by child_sticker_selections. Kept non-destructively pending explicit owner approval to drop.';

commit;

-- =============================================================================
-- End of 2026_07_04_026_sticker_themes.sql
-- =============================================================================
