-- =============================================================================
-- 016_scheduled_jobs.sql
-- =============================================================================
-- OlympIQ (OlympIQ) — canonical module file 016 (scheduled jobs).
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
      where jobname = 'olympiq_advance_student_grades';

    perform cron.schedule(
      'olympiq_advance_student_grades',
      '0 3 1 9 *',                                   -- Sept 1, 03:00 UTC, yearly
      'select public.advance_student_grades();'
    );
    raise notice 'pg_cron job olympiq_advance_student_grades scheduled (Sept 1, 03:00 UTC yearly).';

    -- Audit C1 (migration 036): hourly access-lifecycle reconciliation —
    -- expires ended subscriptions + syncs students.access_status. The attempt
    -- RPCs check dates lazily, so correctness never depends on this job.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_recompute_child_access';

    perform cron.schedule(
      'olympiq_recompute_child_access',
      '17 * * * *',                                  -- hourly at :17 UTC
      'select public.recompute_child_access();'
    );
    raise notice 'pg_cron job olympiq_recompute_child_access scheduled (hourly).';

    -- Test engine (migration 037): expire timed tests past deadline (+5 min
    -- grace) and abandon >24h-stale practice/olympiad attempts. Lazy deadline
    -- checks in the RPCs keep correctness even without this job.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_expire_stale_attempts';

    perform cron.schedule(
      'olympiq_expire_stale_attempts',
      '*/15 * * * *',                                -- every 15 minutes
      'select public.expire_stale_test_attempts();'
    );
    raise notice 'pg_cron job olympiq_expire_stale_attempts scheduled (every 15 min).';

    -- Leaderboard (migration 039): daily runner that acts only on the 1st
    -- (Asia/Baku) — archives the closed month FROM THE LEDGER into
    -- leaderboard_snapshots and zeroes stale points_month caches.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_leaderboard_rollover';

    perform cron.schedule(
      'olympiq_leaderboard_rollover',
      '25 20 * * *',                                 -- 00:25 Asia/Baku, daily
      'select public.leaderboard_rollover_if_month_start();'
    );
    raise notice 'pg_cron job olympiq_leaderboard_rollover scheduled (daily; acts on the 1st, Baku).';

    -- Notifications (migration 042): dispatch due scheduled broadcasts every 5
    -- minutes, and prune old/read notifications nightly (retention settings).
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_dispatch_scheduled_notifications';
    perform cron.schedule('olympiq_dispatch_scheduled_notifications', '*/5 * * * *',
                          'select public.dispatch_scheduled_notifications();');
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_prune_notifications';
    perform cron.schedule('olympiq_prune_notifications', '40 20 * * *',   -- 00:40 Asia/Baku
                          'select public.prune_notifications();');
    raise notice 'pg_cron jobs olympiq_dispatch_scheduled_notifications + olympiq_prune_notifications scheduled.';
  else
    raise notice 'pg_cron absent — grade promotion / access recompute / attempt expiry / leaderboard rollover / notifications NOT scheduled (skipped safely).';
  end if;
end
$$;

-- =============================================================================
-- End of 016_scheduled_jobs.sql
-- =============================================================================
