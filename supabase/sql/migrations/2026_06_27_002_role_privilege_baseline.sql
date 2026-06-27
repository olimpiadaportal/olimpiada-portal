-- Migration: 2026_06_27_002_role_privilege_baseline.sql
-- Purpose: Grant baseline table/sequence/function privileges to anon/authenticated/
--   service_role so Row Level Security actually governs access. The canonical schema
--   must NOT depend on Supabase's implicit default privileges, which are absent when
--   rebuilding from zero (verified: authenticated had no SELECT on public tables, so
--   every RLS-protected query failed with "permission denied"). RLS still gates rows;
--   these grants only let the gate be reached.
-- Environment first applied: development/staging
-- Related root SQL file(s): supabase/sql/010_rls_policies.sql
-- Backport status: completed (added to canonical 010 after the ENABLE RLS block)
-- Destructive change: no (grants only; RLS unchanged; the REVOKEs only re-assert the
--   existing authoritative-column hardening).
-- Rollback notes: revoke the granted privileges from anon/authenticated; RLS stays on.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Read for anon/authenticated/service_role; RLS policies gate which rows are visible.
grant select on all tables in schema public to anon, authenticated, service_role;
-- Write for authenticated (RLS + column grants gate it); full for service_role.
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
-- (Functions in public are already executable by PUBLIC; an explicit grant here only
--  emits harmless WARNINGs for extension internals, so it is intentionally omitted.
--  Future functions are covered by the ALTER DEFAULT PRIVILEGES below.)

-- Keep future objects consistent (mirrors Supabase default privileges).
alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Re-assert authoritative-column hardening (the broad GRANT above re-added table-level
-- INSERT/UPDATE on these tables; strip it and keep only learner-safe columns).
revoke insert, update on public.test_attempts from anon, authenticated;
grant  insert (test_id, student_profile_id) on public.test_attempts to authenticated;
revoke insert, update on public.test_attempt_answers from anon, authenticated;
grant  insert (attempt_id, question_id, selected_option_ids, answer_text, time_spent_ms)
  on public.test_attempt_answers to authenticated;
grant  update (selected_option_ids, answer_text, time_spent_ms)
  on public.test_attempt_answers to authenticated;
revoke insert, update on public.student_daily_task_progress from anon, authenticated;
grant  insert (student_profile_id, package_id) on public.student_daily_task_progress to authenticated;
