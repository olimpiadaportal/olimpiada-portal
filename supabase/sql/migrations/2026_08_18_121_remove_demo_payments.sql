-- =============================================================================
-- 2026_08_18_121_remove_demo_payments.sql
-- =============================================================================
-- Migration: 2026_08_18_121_remove_demo_payments.sql
-- Purpose: DELETE the demo payment mode from the platform (owner decision,
--          2026-08-18). Since Round 11 there were FOUR modes resolved from three
--          mutually-exclusive feature flags: real (`payments`), demo
--          (`demo_payments`), giveaway (`giveaway_period`) and off. The demo
--          mode was the temporary "cosmetic card form, nothing is charged" flow
--          that stood in for a payment provider. It is now removed everywhere —
--          database, web app, admin panel and mobile app — leaving
--          real | giveaway | off.
--
--          `off` STAYS. It is not a payment mode: it is the kill switch AND the
--          fail-closed fallback every resolver returns on an infra failure, so
--          the UI and assert_payments_enabled() always agree. Removing it would
--          show a paid UI on a hiccup while the database refused every write.
--
--          This migration does NOT enable giveaway_period. Enabling it stamps
--          `giveaway.started_at` (the trigger below) and starts the free-window
--          clock, which is the owner's launch decision to make from the admin
--          panel. Production therefore lands in mode `off` after this runs —
--          that is intended, not a regression: `payments` is false today
--          because the platform was in demo mode.
--          `giveaway.duration_days` is deliberately NOT touched (business
--          setting, owner-configurable in /settings).
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql —
--                fn_payment_mode_exclusivity() + trg_payment_mode_exclusivity,
--                current_payment_mode(), get_mobile_config(), and the comment
--                blocks that describe a trio of payment modes;
--          * 012_seed_initial_data.sql — the ('demo_payments', false) seed row
--                must never be created by a from-zero build again;
--          * 013_validation_queries.sql — check 33 now asserts the PAIR, and
--                new check 108 asserts the demo mode is gone and stays gone.
-- Backport status: pending
-- Destructive change: yes, deliberately and narrowly — it deletes ONE
--          feature_flags row (`demo_payments`, a boolean switch that is
--          `true` on production today). No user data, no subscription, no
--          purchase and no money row is touched. Subscriptions created while
--          demo mode was on keep every column they have; they were never
--          charged by a provider in any mode, and `provider = 'none'` already
--          says so.
-- Rollback notes: this is a deliberate feature deletion, not a change that is
--          expected to be reverted. Restoring the old behaviour means (1)
--          restoring 011's trio version of fn_payment_mode_exclusivity() and
--          its WHEN clause, (2) restoring the v_demo branches in
--          current_payment_mode() and get_mobile_config(), (3) re-inserting
--          ('demo_payments', false) — which the guard below REJECTS until step
--          1 is undone — and (4) restoring the app code from git. There is no
--          one-statement rollback, on purpose.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-applied. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild — the rebuild runs the
-- canonical 0NN files only, and is staging-only regardless.
--
-- WHY THE GUARD RAISES INSTEAD OF IGNORING A RE-INSERT:
-- a `demo_payments` row that comes back silently is the worst outcome. Every
-- resolver (current_payment_mode, get_mobile_config, web paymentMode.ts) would
-- ignore it, so the admin panel would show a switch that changes nothing while
-- the exclusivity rule no longer covers it — a flag claiming the platform is in
-- demo mode while it is really charging. Failing loudly at the INSERT is the
-- only state that cannot be misread.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The flag row itself. DELETE (not `enabled = false`): the whole feature is
--    gone, and a disabled row would keep rendering as a payment mode the admin
--    can choose in /settings.
-- -----------------------------------------------------------------------------
delete from public.feature_flags where key = 'demo_payments';

-- -----------------------------------------------------------------------------
-- 2. Exclusivity over the PAIR, plus the re-insert guard.
--
--    The mutual-exclusion half is unchanged in spirit: enabling one of
--    (payments, giveaway_period) disables the other, and enabling
--    giveaway_period (re)stamps giveaway.started_at so the countdown restarts.
--    SECURITY DEFINER so the cross-row/cross-table writes succeed for any
--    authorized caller (admin session under RLS, or service role). The inner
--    UPDATE sets enabled = false, which does not re-satisfy the trigger's WHEN
--    clause — no recursion. An idempotent re-save of an already-enabled flag is
--    ignored (no giveaway clock restart).
-- -----------------------------------------------------------------------------
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Migration 121: the demo payment mode was DELETED. Nothing resolves it any
  -- more, so a row carrying this key must never exist again — fail loudly
  -- rather than let a dead switch reappear in the admin panel.
  if new.key = 'demo_payments' then
    raise exception 'payment mode: demo_payments was removed (migration 121)'
      using errcode = 'check_violation', hint = 'demo_payments_removed';
  end if;

  if tg_op = 'UPDATE' and old.enabled = true then
    return new;
  end if;

  update public.feature_flags
     set enabled = false, updated_at = now()
   where key in ('payments', 'giveaway_period')
     and key <> new.key
     and enabled;

  if new.key = 'giveaway_period' then
    update public.system_settings
       set value_json = to_jsonb(now()), updated_at = now()
     where key = 'giveaway.started_at';
  end if;

  return new;
end;
$$;

comment on function public.fn_payment_mode_exclusivity() is
  'Migration 121: DB-layer guarantee that payments / giveaway_period are never '
  'enabled together; stamps giveaway.started_at when the giveaway flips on; '
  'REJECTS any demo_payments row (that payment mode was deleted).';

-- The WHEN clause carries the guard for `demo_payments` WITHOUT the
-- `new.enabled = true` condition on purpose: an insert of a DISABLED demo row
-- must be rejected too, or the dead switch simply reappears in /settings.
drop trigger if exists trg_payment_mode_exclusivity on public.feature_flags;
create trigger trg_payment_mode_exclusivity
  after insert or update of enabled on public.feature_flags
  for each row
  when (new.key = 'demo_payments'
        or (new.enabled = true and new.key in ('payments', 'giveaway_period')))
  execute function public.fn_payment_mode_exclusivity();

-- -----------------------------------------------------------------------------
-- 3. The two SQL resolvers, patched from their OWN live definitions.
--
--    Per the house rule in README_DATABASE_VERSIONING_WORKFLOW.md: both of these
--    functions have been rewritten by earlier migrations (089/091 for
--    current_payment_mode; 045/070/072/075/097/116 for get_mobile_config), and
--    retyping them from a canonical file is how an unrelated earlier fix gets
--    silently reverted. Every demo mention lives on its OWN line in both bodies
--    (the declaration, the flag read, and the `when v_demo then 'demo'` branch),
--    so removing whole lines that mention `v_demo` is exact, and the flag list
--    is narrowed by one literal replacement. The result is then ASSERTED to
--    resolve no demo mode at all before it is executed.
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_fn  text;
  v_src text;
  v_new text;
begin
  foreach v_fn in array array['public.current_payment_mode()', 'public.get_mobile_config()']
  loop
    v_src := pg_get_functiondef(v_fn::regprocedure);

    if position('v_demo' in v_src) = 0 then
      raise notice '121: % already resolves no demo mode — skipping', v_fn;
      continue;
    end if;

    v_new := v_src;
    -- The flag fetch list. Both spacing styles exist across the two functions.
    v_new := replace(v_new,
      $q$'payments', 'demo_payments', 'giveaway_period'$q$,
      $q$'payments', 'giveaway_period'$q$);
    v_new := replace(v_new,
      $q$'payments','demo_payments','giveaway_period'$q$,
      $q$'payments','giveaway_period'$q$);
    -- Every line that mentions v_demo: its declaration, its assignment and the
    -- `when v_demo then 'demo'` arm of the mode CASE. Done by SPLITTING on the
    -- newline rather than with a regex: a bracket expression like [\r\n] is one
    -- backslash-interpretation away from meaning the character SET {\, r, n},
    -- which would silently eat code instead of whole lines. Re-joining on
    -- chr(10) keeps any CR that the stored body carries at each line end.
    --   `v_demo` followed by an identifier character is a DIFFERENT variable
    --   (`v_demote` exists elsewhere in this schema) — the boundary matters.
    select string_agg(l.line, chr(10) order by l.ord)
      into v_new
      from unnest(string_to_array(v_new, chr(10))) with ordinality as l(line, ord)
     where l.line !~ 'v_demo([^A-Za-z0-9_]|$)';

    if v_new ~ 'v_demo([^A-Za-z0-9_]|$)' or position('demo_payments' in v_new) > 0 then
      raise exception '121: % still resolves demo after the patch — the function '
                      'changed shape; re-derive the patch instead of forcing it', v_fn;
    end if;

    execute v_new;
  end loop;
end
$patch$;

-- create or replace preserves the ACL, but restating the grants keeps this
-- migration correct even if a function is ever recreated from scratch first.
revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

comment on function public.current_payment_mode() is
  'Migration 121: resolves payments/giveaway_period into off|real|giveaway with '
  'EXACTLY get_mobile_config''s parsing rules — a 013 check asserts the two can '
  'never drift. Missing flag rows mean OFF (fail closed); a malformed giveaway '
  'window means "no window", never an exception out of a money gate. The demo '
  'mode was deleted on 2026-08-18.';

-- -----------------------------------------------------------------------------
-- 4. Assertions. A migration that silently did nothing is worse than one that
--    failed, because the app keeps reading the old shape and nobody looks here.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_excl  text;
  v_cpm   text;
  v_cfg   text;
  v_mode  text;
  v_n     int;
begin
  if exists (select 1 from public.feature_flags where key = 'demo_payments') then
    raise exception '121: the demo_payments flag row still exists';
  end if;

  v_excl := pg_get_functiondef('public.fn_payment_mode_exclusivity()'::regprocedure);
  if position($q$key in ('payments', 'giveaway_period')$q$ in v_excl) = 0 then
    raise exception '121: the exclusivity function does not cover the payments/giveaway pair';
  end if;
  if position($q$'payments', 'demo_payments'$q$ in v_excl) > 0 then
    raise exception '121: the exclusivity function still treats demo_payments as a mode';
  end if;
  if position('demo_payments_removed' in v_excl) = 0 then
    raise exception '121: the exclusivity function no longer rejects a demo_payments row';
  end if;

  v_cpm := pg_get_functiondef('public.current_payment_mode()'::regprocedure);
  v_cfg := pg_get_functiondef('public.get_mobile_config()'::regprocedure);
  if v_cpm ~ 'v_demo([^A-Za-z0-9_]|$)' or position('demo_payments' in v_cpm) > 0 then
    raise exception '121: current_payment_mode() still resolves a demo mode';
  end if;
  if v_cfg ~ 'v_demo([^A-Za-z0-9_]|$)' or position('demo_payments' in v_cfg) > 0 then
    raise exception '121: get_mobile_config() still resolves a demo mode';
  end if;

  -- The two resolvers must still agree (013 check 86) and must return one of
  -- the three surviving modes.
  v_mode := public.current_payment_mode();
  if v_mode not in ('real', 'giveaway', 'off') then
    raise exception '121: current_payment_mode() returned %', v_mode;
  end if;
  if v_mode is distinct from (public.get_mobile_config()->'payment'->>'mode') then
    raise exception '121: the two resolvers disagree (% vs %)',
      v_mode, (public.get_mobile_config()->'payment'->>'mode');
  end if;

  -- Pair exclusivity still holds on the live rows.
  select count(*) into v_n from public.feature_flags
   where key in ('payments', 'giveaway_period');
  if v_n <> 2 then
    raise exception '121: expected both payment-mode flags, found %', v_n;
  end if;
  select count(*) into v_n from public.feature_flags
   where key in ('payments', 'giveaway_period') and enabled;
  if v_n > 1 then
    raise exception '121: both payment-mode flags are enabled at once';
  end if;

  -- The guard actually fires. The inner block is its own subtransaction, so the
  -- rejected INSERT rolls back without touching this migration. The
  -- "was ACCEPTED" raise uses the DEFAULT errcode (P0001) so the handler below
  -- — which catches check_violation only — can never swallow it.
  begin
    insert into public.feature_flags (key, enabled) values ('demo_payments', false);
    raise exception '121: a demo_payments row was ACCEPTED — the guard is not armed';
  exception
    when check_violation then
      null; -- expected: the trigger rejected it
  end;
  if exists (select 1 from public.feature_flags where key = 'demo_payments') then
    raise exception '121: the rejected demo_payments row survived';
  end if;

  raise notice '121 OK — demo payment mode deleted; modes are real|giveaway|off; '
               'resolvers agree on %, re-insert guard armed', v_mode;
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_18_121_remove_demo_payments.sql
-- =============================================================================
