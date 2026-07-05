-- =============================================================================
-- 005_attempts_daily_tasks_progress.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 005 of 013.
--
-- Responsibility : Learning activity:
--                  test_attempts, test_attempt_answers,
--                  daily_task_packages, daily_task_items,
--                  student_daily_task_progress, progress_snapshots.
-- Run order      : After 004. Before 006 (leaderboard/analytics use this data).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
-- Notes          : Authoritative scoring is server/DB side; clients must never
--                  set score/is_correct directly. RLS in 010 restricts each
--                  student to their own rows and parents to linked students.
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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_attempt_question unique (attempt_id, question_id)
);

-- -----------------------------------------------------------------------------
-- daily_task_packages : scheduled daily practice package.
-- -----------------------------------------------------------------------------
create table if not exists public.daily_task_packages (
  id           uuid primary key default gen_random_uuid(),
  grade_id     uuid references public.grades (id) on delete set null,
  subject_id   uuid references public.subjects (id) on delete set null,
  title        text,
  publish_date date,
  status       public.content_status not null default 'draft',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- daily_task_items : questions inside a daily task package.
-- -----------------------------------------------------------------------------
create table if not exists public.daily_task_items (
  package_id  uuid not null references public.daily_task_packages (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  order_index integer not null default 0,
  points      numeric(6,2) not null default 1.0,
  primary key (package_id, question_id)
);

-- -----------------------------------------------------------------------------
-- student_daily_task_progress : a student's state/result for a package.
-- Unique (student, package) prevents duplicate completion records.
-- -----------------------------------------------------------------------------
create table if not exists public.student_daily_task_progress (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  package_id         uuid not null references public.daily_task_packages (id) on delete cascade,
  status             public.task_progress_status not null default 'not_started',
  score              numeric(8,2),
  max_score          numeric(8,2),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_student_package unique (student_profile_id, package_id)
);

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
