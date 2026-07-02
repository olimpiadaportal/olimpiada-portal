-- =============================================================================
-- 016_scheduled_jobs.sql
-- =============================================================================
-- Olimpiada Portal (OlimpIQ) — canonical module file 016 (scheduled jobs).
--
-- Responsibility : pg_cron schedules for recurring maintenance jobs. Currently:
--                  yearly grade promotion (public.advance_student_grades(),
--                  defined in canonical 011) — September 1st, 03:00 UTC.
-- Run order      : After 001-015 (needs advance_student_grades). 013 validation
--                  reports the job conditionally (SKIP where pg_cron is absent).
-- Safe to rerun  : Yes (unschedules the job by name before re-scheduling).
--
-- GUARDED: environments without pg_cron (e.g. the local PostgreSQL used for
-- from-zero rebuilds) skip scheduling with a NOTICE and this file still
-- succeeds. On Supabase enable the extension first if needed:
-- Dashboard → Database → Extensions → pg_cron, then re-run this file.
-- =============================================================================

do $$
declare
  v_has_cron boolean;
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension not available here (%).', sqlerrm;
  end;

  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if v_has_cron then
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
-- End of 016_scheduled_jobs.sql
-- =============================================================================
