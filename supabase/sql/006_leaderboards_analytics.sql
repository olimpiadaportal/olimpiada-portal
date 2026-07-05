-- =============================================================================
-- 006_leaderboards_analytics.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 006 of 013.
--
-- Responsibility : Leaderboard + analytics readiness:
--                  leaderboard_periods, leaderboard_entries, leaderboard_snapshots,
--                  achievements, student_achievements, question_analytics.
-- Run order      : After 005. Before 007.
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
-- Notes          : Leaderboard is PostgreSQL-first and recalculated from source
--                  data; snapshots store rendered versions for cheap reads.
--                  Redis (if ever added) is cache-only and never source of truth.
--                  Full leaderboard scope uniqueness (NULL-safe) is enforced by a
--                  unique index in 011.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- leaderboard_periods : weekly/monthly/yearly ranking windows.
-- -----------------------------------------------------------------------------
create table if not exists public.leaderboard_periods (
  id          uuid primary key default gen_random_uuid(),
  period_type public.leaderboard_period_type not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_leaderboard_period unique (period_type, starts_at, ends_at),
  constraint chk_leaderboard_period_range check (ends_at > starts_at)
);

-- -----------------------------------------------------------------------------
-- leaderboard_entries : per-student rank rows within a period and scope.
-- scope_id is NULL for the 'global' scope; NULL-safe uniqueness is in 011.
-- -----------------------------------------------------------------------------
create table if not exists public.leaderboard_entries (
  id                 uuid primary key default gen_random_uuid(),
  period_id          uuid not null references public.leaderboard_periods (id) on delete cascade,
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  scope_type         public.leaderboard_scope_type not null default 'global',
  scope_id           uuid,                         -- grade/subject/school/district id, or NULL for global
  points             numeric(12,2) not null default 0,
  rank               integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.leaderboard_entries is
  'Computed from PostgreSQL source data. Public display should avoid full student names (use pseudonyms).';

-- -----------------------------------------------------------------------------
-- leaderboard_snapshots : stored rendered leaderboard versions for fast reads.
-- -----------------------------------------------------------------------------
create table if not exists public.leaderboard_snapshots (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references public.leaderboard_periods (id) on delete cascade,
  scope_type   public.leaderboard_scope_type not null default 'global',
  scope_id     uuid,
  generated_at timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb,
  entries_json jsonb not null default '[]'::jsonb, -- rendered top-N rows (metadata only, no binaries)
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- achievements : badge / certificate catalog (readiness).
-- -----------------------------------------------------------------------------
create table if not exists public.achievements (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  criteria_json jsonb not null default '{}'::jsonb,
  status       public.catalog_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- student_achievements : achievements earned by a student.
-- -----------------------------------------------------------------------------
create table if not exists public.student_achievements (
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  achievement_id     uuid not null references public.achievements (id) on delete cascade,
  earned_at          timestamptz not null default now(),
  primary key (student_profile_id, achievement_id)
);

-- -----------------------------------------------------------------------------
-- question_analytics : aggregated per-question difficulty/error metrics
-- (e.g. high-error questions). Summary table, not live aggregation.
-- -----------------------------------------------------------------------------
create table if not exists public.question_analytics (
  question_id    uuid primary key references public.questions (id) on delete cascade,
  attempts_count integer not null default 0,
  correct_count  integer not null default 0,
  error_rate     numeric(5,4),                    -- 0..1
  avg_time_ms    integer,
  recalculated_at timestamptz,
  updated_at     timestamptz not null default now()
);

-- =============================================================================
-- End of 006_leaderboards_analytics.sql
-- =============================================================================
