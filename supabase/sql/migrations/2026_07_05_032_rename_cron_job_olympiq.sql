-- =============================================================================
-- 2026_07_05_032_rename_cron_job_olympiq.sql
-- Round 12 — Prompt 4 (rename): the pg_cron job name carries the brand token, so
-- it is renamed olimpiq_advance_student_grades -> olympiq_advance_student_grades
-- as part of the OlimpIQ -> OlympIQ / olimpiq -> olympiq rename.
--
-- Behavior/schedule are unchanged (Sept 1, 03:00 UTC, yearly, running
-- public.advance_student_grades()). This ONLY renames the job: unschedule BOTH the
-- old and new names first (idempotent, no double-run), then schedule the new name.
--
-- Backport: canonical 016_scheduled_jobs.sql (job name updated there);
--   013 comment reference (#28) updated to the new job name.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- GUARDED: environments without pg_cron skip with a NOTICE (from-zero rebuilds
--   on plain PostgreSQL stay green).
-- =============================================================================

do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if v_has_cron then
    -- Remove the old-named job AND any pre-existing new-named job (idempotent).
    perform cron.unschedule(jobid)
       from cron.job
      where jobname in ('olimpiq_advance_student_grades',
                        'olympiq_advance_student_grades');

    perform cron.schedule(
      'olympiq_advance_student_grades',
      '0 3 1 9 *',                                   -- Sept 1, 03:00 UTC, yearly
      'select public.advance_student_grades();'
    );
    raise notice 'pg_cron job renamed -> olympiq_advance_student_grades (Sept 1, 03:00 UTC yearly).';
  else
    raise notice 'pg_cron absent — nothing to rename (skipped safely).';
  end if;
end
$$;

-- =============================================================================
-- End of 2026_07_05_032_rename_cron_job_olympiq.sql
-- =============================================================================
