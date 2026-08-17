-- =============================================================================
-- 2026_08_17_118_retire_subject_change_proration.sql
-- =============================================================================
-- Migration: 2026_08_17_118_retire_subject_change_proration.sql
-- Purpose: DROP the last two functions that implement the retired billing
--          model: public.quote_subject_change(uuid,uuid[],uuid[]) and
--          public.apply_subject_change(uuid,uuid[],uuid[],text).
--
--          Owner decision (2026-08-17), reversing an earlier one: a subject is
--          billed INDEPENDENTLY, on its OWN cycle, starting the day it is
--          added. No proration, and no single shared renewal date per child.
--
--          Migration 109 already moved the platform onto that model —
--          apply_plan_change writes a per-subject current_period_start/end at
--          now(), and quote_plan_change returns prorated = false,
--          proration_waived = false, remaining_ratio = 1. What survived was the
--          add/remove PAIR: two thin wrappers kept "for already-shipped
--          binaries" that compose a basket in SQL and call the plan pair.
--
--          They are dropped rather than left in place because a wrapper is a
--          ROUTE, and a route that exists gets taken. Any caller that omitted
--          the per-subject cycles reached them, and their in-SQL basket
--          composition is a SECOND implementation of a rule (which cycle does a
--          kept subject keep?) that must match quote_plan_change exactly and
--          silently mis-bills when it drifts. The web app now derives that
--          basket server-side, in ONE place
--          (web-app/src/lib/auth/subscriptionCore.ts -> readLivePlan /
--          derivePlanItems), and always calls quote_plan_change /
--          apply_plan_change. After this migration the retired path is not
--          merely unused, it is unreachable.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql — REMOVE both
--            function bodies and their revoke/grant lines (the neighbouring
--            quote_plan_change / apply_plan_change grants STAY), and reword the
--            assert_payments_enabled() comment, which named apply_subject_change
--            as the guarded add path;
--          * 007_subscriptions_payments_coupons.sql — comment only: the
--            subscription_changes ledger is written by apply_plan_change();
--          * 010_rls_policies.sql — comment only: same, above sub_changes_select;
--          * 013_validation_queries.sql — checks 78, 84, 91 and 95 asserted the
--            wrappers EXIST (78 and 91) or probed their bodies (84, 95); a
--            pg_get_functiondef on a dropped function raises, so those probes are
--            re-pointed at apply_plan_change, and NEW check 105 asserts both
--            wrappers are GONE and that the plan pair is intact and locked down.
-- Backport status: pending
-- Destructive change: YES, but only to CODE. It drops two functions and no
--          table, column, row or policy. Nothing is written by them that is not
--          written by apply_plan_change, which they merely called; the
--          subscription_changes ledger, every subscription_subjects row and
--          every period end are untouched. No data is recoverable-or-not here
--          because none is deleted.
-- Rollback notes: re-create both wrappers from the migration-109 file
--          (2026_08_11_109_per_subject_billing_interval.sql, sections
--          quote_subject_change / apply_subject_change) — they are pure
--          wrappers, so the recreated pair behaves identically to the dropped
--          one. Nothing else has to be undone.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-removed. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild.
--
-- NO CASCADE, deliberately. If some object we do not know about depends on
-- either function, this migration must FAIL LOUDLY inside its transaction
-- rather than quietly drop that dependant too. The repository was grepped
-- first: nothing in supabase/sql, web-app/ or mobile-app/ calls either name
-- outside comments and the 013 checks updated in the same change.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. The two retired wrappers (backport -> remove from 011)
-- -----------------------------------------------------------------------------
-- Signatures are spelled in full: `drop function` without an argument list is
-- ambiguous the moment an overload exists, and being explicit means a signature
-- that has drifted fails to match instead of dropping something adjacent.
drop function if exists public.quote_subject_change(uuid, uuid[], uuid[]);
drop function if exists public.apply_subject_change(uuid, uuid[], uuid[], text);

-- -----------------------------------------------------------------------------
-- B. The kill-switch comment named the dropped function (backport -> 011)
-- -----------------------------------------------------------------------------
-- assert_payments_enabled() is unchanged; only its comment is. It listed
-- "apply_subject_change adds" as the guarded path. apply_plan_change is the
-- real one, and it guards ADDS **and CYCLE CHANGES** while deliberately leaving
-- REMOVALS legal — a parent must always be able to stop paying.
comment on function public.assert_payments_enabled() is
  'Round 48/51: hard server-side payment kill switch. Raises check_violation '
  'with hint payments_disabled while current_payment_mode() = off; called '
  'first inside every paid RPC (create_child_subscription, purchase_olympiad, '
  'add_subscription_subject, apply_plan_change adds and cycle changes).';

-- =============================================================================
-- Verify
-- =============================================================================
do $verify$
declare
  v_def text;
begin
  -- ---- the retired path is GONE -------------------------------------------
  if to_regprocedure('public.quote_subject_change(uuid,uuid[],uuid[])') is not null then
    raise exception '118: quote_subject_change still exists';
  end if;
  if to_regprocedure('public.apply_subject_change(uuid,uuid[],uuid[],text)') is not null then
    raise exception '118: apply_subject_change still exists';
  end if;
  -- Not merely the exact signatures: an OVERLOAD under either name would be the
  -- same reachable route wearing a different argument list.
  if exists (select 1 from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('quote_subject_change', 'apply_subject_change')) then
    raise exception '118: an overload of a retired wrapper survives';
  end if;

  -- ---- and it took nothing else with it ------------------------------------
  -- The plan pair IS the billing surface now; a cascade that removed it would
  -- leave the platform unable to price or apply any change at all.
  if to_regprocedure('public.quote_plan_change(uuid,jsonb)') is null
     or to_regprocedure('public.apply_plan_change(uuid,jsonb,text)') is null
     or to_regprocedure('public.quote_child_plan(uuid,jsonb)') is null
     or to_regprocedure('public.create_child_plan(uuid,jsonb)') is null then
    raise exception '118: a plan RPC is missing';
  end if;
  if to_regprocedure('public.plan_items_normalize(jsonb)') is null then
    raise exception '118: plan_items_normalize is missing';
  end if;
  if to_regclass('public.subscription_changes') is null then
    raise exception '118: the subscription_changes ledger is missing';
  end if;

  -- ---- the surviving pair keeps its posture and its behaviour --------------
  -- 010 grants EXECUTE on new functions to anon+authenticated by default, so
  -- "service_role only" is a property that has to be asserted, not assumed.
  if has_function_privilege('anon', 'public.quote_plan_change(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated',
           'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE') then
    raise exception '118: a plan RPC is reachable from a client role';
  end if;

  v_def := pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure);
  -- The kill switch moved with the wrapper: apply_plan_change is now the ONLY
  -- guarded add path, and it must still let a REMOVAL through while payments
  -- are off.
  if position('v_adds > 0 or v_changes > 0' in v_def) = 0
     or position('assert_payments_enabled' in v_def) = 0 then
    raise exception '118: apply_plan_change no longer guards adds/cycle changes only';
  end if;
  -- Proration is retired at the source: a new subject opens a FULL period at
  -- now(). If this ever stops being true, the copy shown to the parent
  -- ("the cycle starts today, charged in full") becomes a lie.
  if position('now() + case v_row.iv' in v_def) = 0 then
    raise exception '118: apply_plan_change no longer opens a full period at now()';
  end if;

  v_def := pg_get_functiondef('public.quote_plan_change(uuid,jsonb)'::regprocedure);
  if position('''prorated'',               false' in v_def) = 0 then
    raise exception '118: quote_plan_change no longer reports prorated = false';
  end if;

  raise notice '118 OK — quote_subject_change and apply_subject_change dropped '
               '(no cascade, no overload left); quote_plan_change / '
               'apply_plan_change intact, service_role-only, still guarding '
               'adds and cycle changes and still opening a full period at now()';
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_17_118_retire_subject_change_proration.sql
-- =============================================================================
