-- =============================================================================
-- 004_content_questions_tests.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 004 of 013.
--
-- Responsibility : Content config catalogs + question bank + tests:
--                  question_types, difficulty_levels, olympiad_types, sources,
--                  questions, question_translations, answer_options,
--                  answer_option_translations, question_explanations,
--                  tests, test_questions.
-- Run order      : After 003. Before 005 (attempts/daily tasks reference these).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
-- Notes          : Multilingual content uses *_translations tables (MVP locale az).
--                  question/explanation media is referenced by media_asset_id
--                  (uuid); its FK to media_assets (008) is added in 011.
--                  Correct-answer hiding before result is enforced by RLS in 010.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- question_types : catalog of question types (e.g. single_choice, multi_choice).
-- -----------------------------------------------------------------------------
create table if not exists public.question_types (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  supports_auto_grading boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- difficulty_levels : difficulty catalog with relative weight.
-- -----------------------------------------------------------------------------
create table if not exists public.difficulty_levels (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  weight     numeric(6,2) not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- olympiad_types : local / international olympiad type catalog.
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_types (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- sources : question source metadata / licensing notes.
-- -----------------------------------------------------------------------------
create table if not exists public.sources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  license_notes text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- questions : core, language-neutral question entity.
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  grade_id       uuid references public.grades (id) on delete set null,
  subject_id     uuid references public.subjects (id) on delete set null,
  topic_id       uuid references public.topics (id) on delete set null,
  subtopic_id    uuid references public.subtopics (id) on delete set null,
  type_id        uuid references public.question_types (id) on delete set null,
  difficulty_id  uuid references public.difficulty_levels (id) on delete set null,
  olympiad_type_id uuid references public.olympiad_types (id) on delete set null,
  source_id      uuid references public.sources (id) on delete set null,
  status         public.content_status not null default 'draft',
  primary_locale public.content_locale not null default 'az',  -- question presentation language
  created_by     uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.questions is
  'Language-neutral question metadata. Localized body lives in question_translations. Only published questions are readable by subscribed students (RLS in 010).';

-- -----------------------------------------------------------------------------
-- question_translations : localized question body/prompt.
-- media_asset_id FK -> media_assets(id) is added in 011.
-- -----------------------------------------------------------------------------
create table if not exists public.question_translations (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references public.questions (id) on delete cascade,
  locale         public.content_locale not null,
  body           text not null,
  prompt         text,
  media_asset_id uuid,                          -- FK added in 011
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint uq_question_locale unique (question_id, locale)
);

-- -----------------------------------------------------------------------------
-- answer_options : objective-question options. Correctness is hidden from
-- students before result via RLS / service responses (never expose is_correct).
-- -----------------------------------------------------------------------------
create table if not exists public.answer_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  is_correct  boolean not null default false,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- answer_option_translations : localized option text.
-- -----------------------------------------------------------------------------
create table if not exists public.answer_option_translations (
  id         uuid primary key default gen_random_uuid(),
  option_id  uuid not null references public.answer_options (id) on delete cascade,
  locale     public.content_locale not null,
  text       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_option_locale unique (option_id, locale)
);

-- -----------------------------------------------------------------------------
-- question_explanations : localized solution/explanation. Visible after
-- attempt/result only (RLS in 010). media_asset_id FK added in 011.
-- -----------------------------------------------------------------------------
create table if not exists public.question_explanations (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions (id) on delete cascade,
  locale           public.content_locale not null,
  explanation_body text not null,
  media_asset_id   uuid,                         -- FK added in 011
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_explanation_locale unique (question_id, locale)
);

-- -----------------------------------------------------------------------------
-- tests : test packages.
-- -----------------------------------------------------------------------------
create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  grade_id         uuid references public.grades (id) on delete set null,
  subject_id       uuid references public.subjects (id) on delete set null,
  olympiad_type_id uuid references public.olympiad_types (id) on delete set null,
  title            text not null,
  description      text,
  status           public.content_status not null default 'draft',
  duration_seconds integer,                       -- null = untimed
  scoring_policy   public.scoring_policy not null default 'per_question',
  created_by       uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_tests_duration_positive
    check (duration_seconds is null or duration_seconds > 0)
);

-- -----------------------------------------------------------------------------
-- test_questions : questions contained in a test package.
-- -----------------------------------------------------------------------------
create table if not exists public.test_questions (
  test_id     uuid not null references public.tests (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  order_index integer not null default 0,
  points      numeric(6,2) not null default 1.0,
  primary key (test_id, question_id)
);

-- -----------------------------------------------------------------------------
-- question_imports : history/audit of bulk imports (one row per bulk call).
-- Backported from migrations/2026_06_28_009_bulk_question_import.sql.
-- Index/grants/RLS/the bulk_insert_questions() function live in 010/011.
-- -----------------------------------------------------------------------------
create table if not exists public.question_imports (
  id          uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles (id) on delete set null,
  filename    text,
  subject_id  uuid references public.subjects (id) on delete set null,
  total       integer not null default 0,
  successful  integer not null default 0,
  failed      integer not null default 0,
  errors      jsonb,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- End of 004_content_questions_tests.sql
-- =============================================================================
