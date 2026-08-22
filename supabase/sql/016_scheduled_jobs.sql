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

    -- Per-subject billing (migration 109): promote each subject's SCHEDULED
    -- cycle change (pending_interval -> interval) once its own paid period
    -- ends. Nothing else in the platform reads pending_interval, so without
    -- this job the column is write-only and a parent's cycle choice is stored
    -- and never applied. Runs 10 minutes before the hourly access recompute so
    -- a promoted row is already correct when that job looks at it.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_apply_due_plan_changes';

    perform cron.schedule(
      'olympiq_apply_due_plan_changes',
      '7 * * * *',                                   -- hourly at :07 UTC
      'select public.apply_due_plan_changes();'
    );
    raise notice 'pg_cron job olympiq_apply_due_plan_changes scheduled (hourly).';

    -- Notification scanners (migration 074): warn parents ~3 days before a child
    -- subscription lapses, and all parents in the final 2 days of a giveaway.
    -- Both idempotent (keyed by period/window end), so a daily run never spams.
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notify_expiring_subscriptions';
    perform cron.schedule('olympiq_notify_expiring_subscriptions', '0 4 * * *',
                          'select public.notify_expiring_subscriptions();');
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notify_giveaway_ending';
    perform cron.schedule('olympiq_notify_giveaway_ending', '30 4 * * *',
                          'select public.notify_giveaway_ending();');
    raise notice 'pg_cron jobs olympiq_notify_expiring_subscriptions + olympiq_notify_giveaway_ending scheduled.';

    -- Entitlements (migration 124): repair the mirror. The three producer
    -- triggers are the single point of silent failure in that design — if one
    -- stops firing, or a period is computed wrongly, access disappears (or
    -- worse, persists) with no error anywhere. This job re-runs the SAME
    -- mapping expression over every producer row and sweeps orphans, so the
    -- worst case is up to an hour of drift instead of an unbounded one.
    -- Runs at :22, five minutes after recompute_child_access at :17, so it
    -- observes a settled state rather than racing it.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_entitlements_reconcile';

    perform cron.schedule(
      'olympiq_entitlements_reconcile',
      '22 * * * *',                                  -- hourly at :22 UTC
      'select public.entitlements_reconcile();'
    );
    raise notice 'pg_cron job olympiq_entitlements_reconcile scheduled (hourly).';

    -- Checkout redemption backstop (migration 126): a payment the ledger
    -- already records as PAID whose redemption never ran -- the callback wrote
    -- the money and then died -- is money taken with nothing delivered. This
    -- re-runs checkout_redeem_plan for those, which is idempotent (a decided
    -- session answers 'already'). It deliberately does NOT ask the gateway:
    -- that needs a MAC signed with the merchant private key, which lives only
    -- in the web app's environment and must never enter the database, so the
    -- TRTYPE=90 half is the web-app sweep's job and this is the floor under it.
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_checkout_redeem_sweep';

    perform cron.schedule(
      'olympiq_checkout_redeem_sweep',
      '*/10 * * * *',                                -- every 10 minutes
      'select public.checkout_redeem_sweep(50);'
    );
    raise notice 'pg_cron job olympiq_checkout_redeem_sweep scheduled (every 10 min).';
  else
    raise notice 'pg_cron absent — grade promotion / access recompute / attempt expiry / leaderboard rollover / plan-change rollover / notifications NOT scheduled (skipped safely).';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- AZERICARD RECONCILIATION SWEEP (migration 129) — every five minutes.
--
-- The two passes that need to ASK THE BANK: recovering a payment whose callback
-- never arrived, and noticing a reversal. Both were unscheduled until 129 —
-- vercel.json was deleted because Hobby caps crons at once-daily, and pg_net was
-- not installed, so nothing drove the route at all.
--
-- Guarded twice: without pg_cron nothing is scheduled, and without pg_net the
-- function exists but declines. It also declines when its Vault secrets are
-- unset, which is the ordinary state of a fresh database — see
-- public.azericard_reconcile_kick() in 011.
-- -----------------------------------------------------------------------------
do $$
declare
  v_has_cron boolean;
  v_has_net  boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net')  into v_has_net;
  if not v_has_cron then
    raise notice '016: pg_cron absent — AzeriCard reconcile sweep not scheduled.';
    return;
  end if;
  if not v_has_net then
    raise notice '016: pg_net absent — AzeriCard reconcile sweep not scheduled.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_azericard_reconcile';
  perform cron.schedule(
    'olympiq_azericard_reconcile',
    '*/5 * * * *',
    'select public.azericard_reconcile_kick();'
  );
  raise notice '016: pg_cron job olympiq_azericard_reconcile scheduled (*/5).';
end $$;

-- -----------------------------------------------------------------------------
-- GIVEAWAY RESTORE (migration 134) — hourly.
--
-- Switching `giveaway_period` on force-disables `payments`, and the window then
-- expires LAZILY: the flag stays on, is_giveaway_active() simply starts
-- returning false, and the resolved mode becomes `off` rather than `real`. At
-- that moment the whole campaign cohort loses access AND nobody can buy their
-- way back. Nothing used to turn payments on again, so the outage lasted until
-- an administrator happened to open Settings — driven by the clock, with no
-- mistake required from anyone.
--
-- The restore is idempotent and refuses to act while a window is still running.
-- -----------------------------------------------------------------------------
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice '016: pg_cron absent — giveaway restore not scheduled.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'olympiq_restore_payments_after_giveaway';
  perform cron.schedule(
    'olympiq_restore_payments_after_giveaway',
    '9 * * * *',
    'select public.restore_payments_after_giveaway();'
  );
  raise notice '016: pg_cron job olympiq_restore_payments_after_giveaway scheduled (hourly at :09).';
end $$;

-- =============================================================================
-- End of 016_scheduled_jobs.sql
-- =============================================================================
