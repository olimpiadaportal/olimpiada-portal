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
-- districts : rayon / district reference (future school/partner readiness).
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
-- schools : future-ready school reference.
-- -----------------------------------------------------------------------------
create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  district_id uuid references public.districts (id) on delete set null,
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

-- =============================================================================
-- End of 003_academic_taxonomy.sql
-- =============================================================================
