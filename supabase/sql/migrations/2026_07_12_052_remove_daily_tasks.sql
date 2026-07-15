-- =============================================================================
-- 2026_07_12_052_remove_daily_tasks.sql
-- Owner request (Round 20 item 17): remove "Daily tasks" from the codebase.
-- The daily_task_packages / daily_task_items tables shipped in 005 but were
-- never used by any app code (PRODUCT_COMPLETION_BACKLOG: zero app code).
-- The NEW daily-rounds engine (migration 057) replaces the concept and reuses
-- the attempt kind 'daily' — the enum value stays.
--
-- Destructive by explicit owner approval; tables are empty/unused.
-- Backports: 005 (drop the two CREATE TABLE blocks), 010 (their policies),
-- 011 (audit trigger), 013 (table lists). Validation: 013 #61 (migration 057).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

do $$
begin
  -- Row-count report + trigger drop only while the tables still exist (keeps
  -- the migration re-runnable after a partial first pass).
  if to_regclass('public.daily_task_packages') is not null then
    raise notice 'daily-task removal: dropping % package row(s).',
      (select count(*) from public.daily_task_packages);
    execute 'drop trigger if exists trg_audit_daily_task_packages on public.daily_task_packages';
  end if;
end $$;

drop table if exists public.daily_task_items cascade;
drop table if exists public.daily_task_packages cascade;
-- The per-student progress tracker of the same dormant feature (005): zero app
-- code references it — removed with its parents.
drop table if exists public.student_daily_task_progress cascade;

-- self-verify
do $$
begin
  if to_regclass('public.daily_task_packages') is not null
     or to_regclass('public.daily_task_items') is not null
     or to_regclass('public.student_daily_task_progress') is not null then
    raise exception 'daily task tables still exist';
  end if;
  raise notice 'daily-task removal self-verify PASS';
end $$;

commit;
