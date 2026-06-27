-- Migration: 2026_06_27_003_content_audit_triggers.sql
-- Purpose: Append-only audit for content actions (create/edit/archive/publish/etc.)
--          on questions, tests and daily task packages, reusing fn_audit_row().
-- Environment first applied: development/staging
-- Related root SQL file(s): supabase/sql/011_indexes_constraints_functions_triggers.sql
-- Backport status: completed (added to canonical 011)
-- Destructive change: no
-- Rollback notes:
--   drop trigger if exists trg_audit_questions on public.questions;
--   drop trigger if exists trg_audit_tests on public.tests;
--   drop trigger if exists trg_audit_daily_task_packages on public.daily_task_packages;
-- =============================================================================

drop trigger if exists trg_audit_questions on public.questions;
create trigger trg_audit_questions
  after insert or update or delete on public.questions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_tests on public.tests;
create trigger trg_audit_tests
  after insert or update or delete on public.tests
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_daily_task_packages on public.daily_task_packages;
create trigger trg_audit_daily_task_packages
  after insert or update or delete on public.daily_task_packages
  for each row execute function public.fn_audit_row();
