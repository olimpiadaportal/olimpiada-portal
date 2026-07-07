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


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Points ledger (append-only, UNIQUE(attempt_id)) + streak activity-day ground truth.
-- -----------------------------------------------------------------------------
create table if not exists public.student_points_ledger (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  attempt_id         uuid not null references public.test_attempts (id) on delete cascade,
  subject_id         uuid references public.subjects (id) on delete set null,
  kind               text not null check (kind in ('practice', 'test', 'olympiad', 'daily')),
  points             numeric(10,2) not null default 0,
  breakdown_json     jsonb not null default '{}'::jsonb,   -- {correct, raw, cap_applied}
  created_at         timestamptz not null default now(),
  constraint uq_points_per_attempt unique (attempt_id)
);
comment on table public.student_points_ledger is
  'Append-only leaderboard points ledger. One row per GRADED attempt (UNIQUE attempt_id — scored at most once). Written only by award_attempt_points(); clients have read-own access and no write path.';

create index if not exists idx_points_ledger_student_created
  on public.student_points_ledger (student_profile_id, created_at);
create index if not exists idx_points_ledger_subject_student
  on public.student_points_ledger (subject_id, student_profile_id, created_at);

create table if not exists public.student_activity_days (
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  activity_date      date not null,           -- LOCAL date in the child's streak_tz
  attempts           int not null default 1,
  created_at         timestamptz not null default now(),
  primary key (student_profile_id, activity_date)
);
comment on table public.student_activity_days is
  'Streak ground truth: one row per child per LOCAL active day (graded attempt). Single writer = award_attempt_points().';


-- -----------------------------------------------------------------------------
-- LEADERBOARD SEASONS (backported from migrations/2026_07_07_041)
-- Named competition seasons (admin CRUD via RPCs in 011; RLS in 010).
-- -----------------------------------------------------------------------------
create table if not exists public.leaderboard_seasons (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  closed_at      timestamptz,                 -- null = open; non-null = archived
  standings_json jsonb not null default '[]'::jsonb,  -- frozen top-100 on close
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_season_range check (ends_at > starts_at)
);
comment on table public.leaderboard_seasons is
  'Admin-managed named competition seasons (date ranges). Live standings come from the points ledger; closing freezes top-100 into standings_json. Independent of the monthly/all-time boards.';
create index if not exists idx_leaderboard_seasons_starts on public.leaderboard_seasons (starts_at desc);

-- =============================================================================
-- End of 006_leaderboards_analytics.sql
-- =============================================================================
