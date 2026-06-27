-- Migration: 2026_06_27_004_question_primary_locale.sql
-- Purpose: Add a primary content language to questions so content can be
--          categorized by language (az/en/ru). The question's body/options/
--          explanation are stored under this locale.
-- Environment first applied: development/staging
-- Related root SQL file(s): supabase/sql/004_content_questions_tests.sql (column),
--                           supabase/sql/011_indexes_constraints_functions_triggers.sql (index)
-- Backport status: completed
-- Destructive change: no (additive column with default)
-- Rollback notes: alter table public.questions drop column if exists primary_locale;
-- =============================================================================

alter table public.questions
  add column if not exists primary_locale public.content_locale not null default 'az';

create index if not exists idx_questions_primary_locale
  on public.questions (primary_locale);
