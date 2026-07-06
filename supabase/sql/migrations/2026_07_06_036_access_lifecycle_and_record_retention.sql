-- =============================================================================
-- Migration 2026_07_06_036 — Audit Batch 2: access lifecycle + record retention
-- Source: docs/CODEBASE_AUDIT_2026_07_05.md (C1 — the launch blocker — plus
-- M13/L13). Companion to migration 035, which already made the attempt RPCs
-- check current_period_end lazily; this adds the state-reconciling job and
-- makes financial records survive account deletion.
--
--   * recompute_child_access(): expires live subscriptions whose period ended
--     and reconciles students.access_status (display cache) both directions.
--     Scheduled hourly via pg_cron (guarded — skips where pg_cron is absent).
--     Correctness does NOT depend on the job: the RPC guards are lazy-dated.
--   * payments.profile_id and olympiad_purchases.{student,owner_parent}
--     FKs move to ON DELETE SET NULL (nullable): deleting an account anonymizes
--     its financial rows instead of cascading them away (or, for the old
--     owner-restrict, blocking the deletion opaquely).
--
-- Backported to canonical 007 / 011 / 015 / 016 / 013.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- C1 — the recompute job (state reconciliation; RPC guards stay authoritative).
-- past_due is included in the expiry sweep: without a payment provider nothing
-- sets it yet, but once Stage 11 lands, a failed-charge subscription past its
-- period must not linger live.
-- -----------------------------------------------------------------------------
create or replace function public.recompute_child_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired    int;
  v_downgraded int;
  v_restored   int;
begin
  -- 1) Expire live subscriptions whose trial/paid period has ended.
  update public.child_subscriptions
     set status = 'expired', updated_at = now()
   where status in ('trialing', 'active', 'past_due')
     and current_period_end is not null
     and current_period_end <= now();
  get diagnostics v_expired = row_count;

  -- 2) Downgrade students whose access flag claims access but who have no live,
  --    date-valid subscription left (canceled keeps access until the already-
  --    paid period ends — same rule as the attempt-RPC guards from 035).
  update public.students s
     set access_status = 'expired'::public.child_access_status
   where s.access_status in ('trialing', 'active')
     and not exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active', 'canceled')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_downgraded = row_count;

  -- 3) Repair the reverse direction: a live dated subscription with a stale
  --    non-access flag (e.g. after a manual DB fix or a missed action update).
  update public.students s
     set access_status = case when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and cs.status = 'trialing'
               and cs.current_period_end > now())
           then 'trialing'::public.child_access_status
           else 'active'::public.child_access_status end
   where s.access_status not in ('trialing', 'active')
     and exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_restored = row_count;

  return jsonb_build_object(
    'subscriptions_expired', v_expired,
    'students_downgraded',   v_downgraded,
    'students_restored',     v_restored);
end;
$$;

comment on function public.recompute_child_access() is
  'Hourly reconciliation (audit C1): expires ended subscriptions and syncs students.access_status. Access CORRECTNESS never depends on this job — the attempt RPCs check current_period_end lazily.';

revoke all on function public.recompute_child_access() from public, anon, authenticated;
grant execute on function public.recompute_child_access() to service_role;

-- Hourly schedule (guarded like 016's grade promotion).
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
      where jobname = 'olympiq_recompute_child_access';

    perform cron.schedule(
      'olympiq_recompute_child_access',
      '17 * * * *',                                  -- hourly at :17 UTC
      'select public.recompute_child_access();'
    );
    raise notice 'pg_cron job olympiq_recompute_child_access scheduled (hourly).';
  else
    raise notice 'pg_cron absent — access recompute NOT scheduled (skipped safely).';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- M13 + L13 — financial records survive account deletion ("never delete
-- purchase records"). Rows are anonymized (FK → NULL), never cascaded away;
-- the old owner-parent RESTRICT (which made parent deletion fail opaquely
-- whenever a purchase existed) is replaced the same way.
-- -----------------------------------------------------------------------------
alter table public.payments alter column profile_id drop not null;
alter table public.payments drop constraint if exists payments_profile_id_fkey;
alter table public.payments
  add constraint payments_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete set null;

alter table public.olympiad_purchases alter column student_profile_id drop not null;
alter table public.olympiad_purchases drop constraint if exists olympiad_purchases_student_profile_id_fkey;
alter table public.olympiad_purchases
  add constraint olympiad_purchases_student_profile_id_fkey
  foreign key (student_profile_id) references public.students (profile_id) on delete set null;

alter table public.olympiad_purchases alter column owner_parent_profile_id drop not null;
alter table public.olympiad_purchases drop constraint if exists olympiad_purchases_owner_parent_profile_id_fkey;
alter table public.olympiad_purchases
  add constraint olympiad_purchases_owner_parent_profile_id_fkey
  foreign key (owner_parent_profile_id) references public.profiles (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Self-verification.
-- -----------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.recompute_child_access()', 'execute') then
    raise exception '036 verify: recompute_child_access is client-executable';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'olympiad_purchases'
      and column_name = 'student_profile_id' and is_nullable = 'NO'
  ) then
    raise exception '036 verify: olympiad_purchases.student_profile_id still NOT NULL';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'payments_profile_id_fkey' and c.confdeltype = 'n'  -- SET NULL
  ) then
    raise exception '036 verify: payments.profile_id FK is not ON DELETE SET NULL';
  end if;
end $$;

commit;
