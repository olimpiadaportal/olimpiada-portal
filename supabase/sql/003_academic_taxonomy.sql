-- =============================================================================
-- 003_academic_taxonomy.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 003 of 013.
--
-- Responsibility : Academic taxonomy & future school/partner readiness:
--                  districts, schools, grades, subjects, topics, subtopics.
-- Run order      : After 002. Before 004 (content references taxonomy).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
-- Notes          : schools/districts are future-ready references (no partner
--                  dashboard is implemented now). students.* FKs to these tables
--                  are added in 011.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- districts : the admin-managed CITY entity (schools link to a city via
-- schools.district_id). Despite the legacy name, this is the City catalog — we do
-- NOT keep a separate `cities` table (that would duplicate schools.district_id).
-- `name` holds the AZ proper noun; city seeds live in 012. (Localized city names
-- could be added later as a districts_translations table.)
-- -----------------------------------------------------------------------------
create table if not exists public.districts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  country_code text not null default 'AZ',
  status       public.catalog_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_districts_country_name unique (country_code, name)
);

-- -----------------------------------------------------------------------------
-- schools : a school MUST belong to a city (districts). district_id is MANDATORY.
-- Admins create schools later; sample schools (under Bakı) are seeded in 012.
-- -----------------------------------------------------------------------------
create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  district_id uuid not null references public.districts (id) on delete restrict,
  status      public.catalog_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- grades : grade levels 1..11.
-- -----------------------------------------------------------------------------
create table if not exists public.grades (
  id         uuid primary key default gen_random_uuid(),
  level      smallint not null unique check (level between 1 and 11),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- subjects : subject catalog.
-- -----------------------------------------------------------------------------
create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  status     public.catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- topics : subject/grade topics.
-- -----------------------------------------------------------------------------
create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  grade_id    uuid references public.grades (id) on delete set null,
  name        text not null,
  order_index integer not null default 0,
  status      public.catalog_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- subtopics : nested detail under a topic.
-- -----------------------------------------------------------------------------
create table if not exists public.subtopics (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics (id) on delete cascade,
  name        text not null,
  order_index integer not null default 0,
  status      public.catalog_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- wallpapers : predefined child-dashboard wallpaper catalog (no arbitrary colors).
-- 'solid_color' uses a hex value; 'image' uses a media_asset (wallpaper-assets
-- bucket). media_asset_id references media_assets (008); its FK is deferred to 011
-- to preserve numeric run order.
-- -----------------------------------------------------------------------------
create table if not exists public.wallpapers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  kind           text not null default 'solid_color' check (kind in ('image', 'solid_color')),
  value          text,            -- hex color for solid_color
  media_asset_id uuid,            -- FK -> media_assets(id) added in 011 (image kind)
  status         public.catalog_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- child_wallpaper_selections : the child's chosen dashboard wallpaper (1 per child).
-- -----------------------------------------------------------------------------
create table if not exists public.child_wallpaper_selections (
  student_profile_id uuid primary key references public.students (profile_id) on delete cascade,
  wallpaper_id       uuid not null references public.wallpapers (id) on delete cascade,
  selected_at        timestamptz not null default now()
);

-- Round 11 (migration 026): wallpapers are RETIRED at the app level — replaced
-- by the Character Sticker themes below. Tables kept non-destructively (DEPRECATED).
comment on table public.wallpapers is
  'DEPRECATED (Round 11): replaced by sticker_themes/sticker_images. App code removed; table kept non-destructively pending explicit owner approval to drop.';
comment on table public.child_wallpaper_selections is
  'DEPRECATED (Round 11): replaced by child_sticker_selections. Kept non-destructively pending explicit owner approval to drop.';

-- -----------------------------------------------------------------------------
-- Character Sticker themes (Round 11, migration 026): admin-managed theme
-- catalog + per-theme sticker images (metadata only; files live in the
-- sticker-assets bucket) + the child's selection. A theme may be ENABLED only
-- with >= 6 images and an enabled theme may not drop below 6 (guard triggers in
-- 011; threshold raised 5→6 in migration 028). Children may only select ENABLED
-- themes (RLS in 010).
-- -----------------------------------------------------------------------------
create table if not exists public.sticker_themes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,               -- character/theme display name (proper noun, not localized)
  is_enabled boolean not null default false,
  created_by uuid,                        -- FK -> profiles(id) added in 011 (keeps this file profile-independent)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_sticker_themes_name
  on public.sticker_themes (lower(name));

comment on table public.sticker_themes is
  'Child "Character Sticker" themes (admin-managed). A theme may be enabled only with >= 6 sticker images (DB-enforced).';

create table if not exists public.sticker_images (
  id             uuid primary key default gen_random_uuid(),
  theme_id       uuid not null references public.sticker_themes (id) on delete cascade,
  media_asset_id uuid not null,           -- FK -> media_assets(id) added in 011 (008 runs later)
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

-- =============================================================================
-- End of 003_academic_taxonomy.sql
-- =============================================================================
