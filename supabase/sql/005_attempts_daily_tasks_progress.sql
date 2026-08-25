-- =============================================================================
-- 005_attempts_daily_tasks_progress.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 005 of 013.
--
-- Responsibility : Learning activity:
--                  test_attempts, test_attempt_answers,
--                  daily_rounds, progress_snapshots.
-- Run order      : After 004. Before 006 (leaderboard/analytics use this data).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
-- Notes          : Authoritative scoring is server/DB side; clients must never
--                  set score/is_correct directly. RLS in 010 restricts each
--                  student to their own rows and parents to linked students.
--                  The legacy daily_task_* tables were removed (migration 052);
--                  the daily-rounds engine (migration 056) replaces the concept.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- test_attempts : a student's attempt of a test.
-- -----------------------------------------------------------------------------
create table if not exists public.test_attempts (
  id                 uuid primary key default gen_random_uuid(),
  -- nullable: random practice/daily attempts have no fixed test (Stage 13).
  test_id            uuid references public.tests (id) on delete cascade,
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  subject_id         uuid references public.subjects (id) on delete set null,
  kind               text not null default 'test'
                       check (kind in ('test', 'practice', 'daily', 'olympiad')),
  status             public.attempt_status not null default 'in_progress',
  score              numeric(8,2),                 -- authoritative; set by grading, not client
  max_score          numeric(8,2),
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  graded_at          timestamptz,
  -- Migration 037 (timed topic tests, kind='test'):
  question_ids       uuid[] not null default '{}', -- fixed server-drawn set (stable on resume)
  deadline_at        timestamptz,                  -- server-authoritative deadline
  duration_seconds   int,
  topic_ids          uuid[] not null default '{}', -- selected scope (results breakdown)
  subtopic_ids       uuid[] not null default '{}',
  canceled_at        timestamptz,                  -- explicit cancel (counts nothing)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Idempotent for databases created before migration 037.
alter table public.test_attempts
  add column if not exists question_ids     uuid[] not null default '{}',
  add column if not exists deadline_at      timestamptz,
  add column if not exists duration_seconds int,
  add column if not exists topic_ids        uuid[] not null default '{}',
  add column if not exists subtopic_ids     uuid[] not null default '{}',
  add column if not exists canceled_at      timestamptz;

comment on column public.test_attempts.score is
  'Authoritative score computed server-side. Clients must never write this value directly.';

-- -----------------------------------------------------------------------------
-- test_attempt_answers : per-question answers within an attempt.
-- selected_option_ids stores chosen option ids for objective questions.
-- -----------------------------------------------------------------------------
create table if not exists public.test_attempt_answers (
  id                 uuid primary key default gen_random_uuid(),
  attempt_id         uuid not null references public.test_attempts (id) on delete cascade,
  question_id        uuid not null references public.questions (id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  answer_text        text,
  is_correct         boolean,                      -- set by grading, not client
  points_awarded     numeric(6,2),
  time_spent_ms      integer,
  is_marked          boolean not null default false, -- flag-for-review (migration 037)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_attempt_question unique (attempt_id, question_id)
);
-- Idempotent for databases created before migration 037.
alter table public.test_attempt_answers
  add column if not exists is_marked boolean not null default false;

-- -----------------------------------------------------------------------------
-- daily_rounds : immutable daily rated rounds (migration 056). Per
-- subject+grade+Baku-local date, a fixed 25-question set with a FULL content
-- snapshot (all locales, options with correctness, explanations, image refs).
-- Generated once, shared by all students, reused verbatim by previous-day
-- practice. Never rewritten. Round generation/attempt functions live in 011.
-- -----------------------------------------------------------------------------
create table if not exists public.daily_rounds (
  id                 uuid primary key default gen_random_uuid(),
  round_date         date not null,
  subject_id         uuid not null references public.subjects (id) on delete cascade,
  grade_id           uuid not null references public.grades (id) on delete cascade,
  term_at_generation smallint not null check (term_at_generation between 1 and 4),
  question_ids       uuid[] not null,
  content_snapshot   jsonb not null,
  created_at         timestamptz not null default now(),
  constraint uq_daily_round unique (round_date, subject_id, grade_id)
);

comment on table public.daily_rounds is
  'Immutable daily rated rounds (migration 056): per subject+grade+Baku-local date, '
  'a fixed 25-question set with a FULL content snapshot (all locales, options with '
  'correctness, explanations, image refs). Generated once, shared by all students, '
  'reused verbatim by previous-day practice. LEGACY since Round 38 (migration '
  '083): rated rounds are per-student draws; kept for history and as the '
  'yesterday-practice transition fallback.';

-- test_attempts joins the rated/practice split (migration 056): rated daily-
-- round attempts link their round; is_rated gates points/streak/boards.
alter table public.test_attempts
  add column if not exists daily_round_id uuid references public.daily_rounds (id) on delete restrict,
  add column if not exists is_rated boolean not null default false;

comment on column public.test_attempts.is_rated is
  'Rated attempts (daily rounds, olympiads) feed points/streak/boards; practice '
  '(topic tests, previous-day replays) never does (migration 056).';

-- Round 38 (migration 083): Baku-local round date + submit-only consumption.
-- The day is consumed ONLY by a SUBMITTED (graded) rated round; abandoned or
-- expired attempts never block a fresh start (which draws a fresh per-student
-- set). The old any-outcome uq_rated_attempt_per_round index is retired.
alter table public.test_attempts
  add column if not exists round_date date;
comment on column public.test_attempts.round_date is
  'Baku-local date of a daily-round attempt (rated today / practice yesterday). '
  'Set server-side at start; backs the one-SUBMITTED-round-per-day guard.';
-- Round 43 (migration 087): the daily attempt is consumed AT CREATION — one
-- live/graded rated daily attempt per student+subject+Baku day (expired/
-- abandoned excluded so legacy timer-lapse duplicates never block the index).
create unique index if not exists uq_rated_daily_live_per_day
  on public.test_attempts (student_profile_id, subject_id, round_date)
  where kind = 'daily' and is_rated
    and status in ('in_progress', 'submitted', 'graded');

create index if not exists idx_attempts_round on public.test_attempts (daily_round_id);

-- MIGRATION 140 - Free Trial provenance on an attempt.
alter table public.test_attempts
  add column if not exists is_free_trial boolean not null default false;

comment on column public.test_attempts.is_free_trial is
  'Migration 140: this attempt happened under the Free Trial. PROVENANCE ONLY -- '
  'is_rated remains the single gate that decides whether an attempt scores, and '
  'nothing in the leaderboard, points or streak path reads this column. Two '
  'booleans that both answered "does this count" would disagree eventually. It '
  'exists so analytics can exclude trial play WITHOUT excluding the ordinary '
  'practice of paying families. Not in the 010 column grant, so a child cannot '
  'set it.';


-- -----------------------------------------------------------------------------
-- daily_practice_sets (Round 38, migration 083): the LOCKED per-student
-- practice set for one yesterday (subject+date). Locked once on first open
-- (own graded set -> peer set -> legacy round -> generated); replayed
-- verbatim on every retry. RLS in 010 (read-own; definer-only writes).
-- -----------------------------------------------------------------------------
create table if not exists public.daily_practice_sets (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  subject_id         uuid not null references public.subjects (id) on delete cascade,
  for_date           date not null,
  question_ids       uuid[] not null,
  source             text not null check (source in ('own', 'peer', 'round', 'generated')),
  created_at         timestamptz not null default now(),
  constraint uq_daily_practice_set unique (student_profile_id, subject_id, for_date)
);
comment on table public.daily_practice_sets is
  'Round 38: the LOCKED per-student practice set for one yesterday (subject+date). '
  'Created once on first open (own graded set -> peer set -> legacy round -> '
  'generated) and replayed verbatim on every retry. Written only by '
  'start_daily_round_attempt (SECURITY DEFINER); students read their own rows.';

create index if not exists idx_daily_practice_sets_lookup
  on public.daily_practice_sets (subject_id, for_date);

-- -----------------------------------------------------------------------------
-- progress_snapshots : pre-aggregated progress metrics to avoid expensive
-- live aggregate queries on every dashboard load.
-- -----------------------------------------------------------------------------
create table if not exists public.progress_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  period             text not null,                -- e.g. '2026-W26', '2026-06', 'all_time'
  subject_id         uuid references public.subjects (id) on delete set null,
  topic_id           uuid references public.topics (id) on delete set null,
  metrics_json       jsonb not null default '{}'::jsonb,
  generated_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_progress_snapshot unique (student_profile_id, period, subject_id, topic_id)
);

-- =============================================================================
-- End of 005_attempts_daily_tasks_progress.sql
-- =============================================================================
