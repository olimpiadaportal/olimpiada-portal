-- =============================================================================
-- 2026_07_02_020_pg_cron_grade_promotion.sql
-- =============================================================================
-- Investor Review Round 6: schedule the yearly grade promotion
-- (public.advance_student_grades(), from migration 017 / canonical 011) via
-- pg_cron — every September 1st at 03:00 UTC.
--
-- GUARDED: environments without the pg_cron extension (e.g. the local
-- PostgreSQL 17 used for from-zero rebuilds) skip scheduling with a NOTICE and
-- the migration still succeeds. On Supabase, enable the extension first if
-- needed: Dashboard → Database → Extensions → pg_cron (then re-run this file).
--
-- Backported to canonical: 016_scheduled_jobs.sql (new file).
-- Safe to rerun: yes (unschedules the job by name before re-scheduling).
-- =============================================================================

do $$
declare
  v_has_cron boolean;
begin
  -- Try to enable pg_cron; tolerate environments where it is unavailable.
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension not available here (%).', sqlerrm;
  end;

  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if v_has_cron then
    -- Idempotent: drop any previous job with this name, then (re)schedule.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olimpiq_advance_student_grades';

    perform cron.schedule(
      'olimpiq_advance_student_grades',
      '0 3 1 9 *',                                   -- Sept 1, 03:00 UTC, yearly
      'select public.advance_student_grades();'
    );
    raise notice 'pg_cron job olimpiq_advance_student_grades scheduled (Sept 1, 03:00 UTC yearly).';
  else
    raise notice 'pg_cron absent — grade promotion NOT scheduled (skipped safely).';
  end if;
end
$$;

-- =============================================================================
-- End of 2026_07_02_020_pg_cron_grade_promotion.sql
-- =============================================================================
