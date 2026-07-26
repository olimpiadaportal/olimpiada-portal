-- =============================================================================
-- 2026_07_26_089_payments_kill_switch_db_guard.sql
-- =============================================================================
-- Round 48 (owner): the "payments off" kill switch must be enforced SERVER-SIDE
-- so it cannot be bypassed "any way".
--
-- WHAT ALREADY HELD, and why this is defence-in-depth rather than a fix for a
-- live hole: the paid mutation RPCs (create_child_subscription,
-- purchase_olympiad, apply_subject_change, add/remove_subscription_subject) are
-- ALREADY revoked from anon and authenticated -- verified: EXECUTE = false for
-- both roles on every one of them. A browser or a phone therefore cannot call
-- them directly through PostgREST; every call arrives through a web-app server
-- action that runs requireParent() and then checks getPaymentModeInfo().
--
-- WHAT WAS MISSING: that mode check lived ONLY in TypeScript. The database
-- itself would happily create a paid subscription while payments were off, so
-- the guarantee rested on every current AND FUTURE server action / BFF route
-- remembering to call getPaymentModeInfo() first. One forgotten check in a new
-- mobile BFF endpoint would silently re-open commerce during a period when the
-- product is advertised as free. This migration moves the guarantee into the
-- layer that cannot be forgotten.
--
-- MODE SEMANTICS (identical to get_mobile_config, single source of truth):
--   giveaway_period active -> 'giveaway'   (free window; paid writes blocked)
--   demo_payments          -> 'demo'       (no real money; flows allowed)
--   payments               -> 'real'       (live commerce)
--   none of the above      -> 'off'        (KILL SWITCH: no paid writes at all)
--
-- WHAT IS BLOCKED when mode = 'off': creating a subscription, purchasing an
-- olympiad package, and any subject change that ADDS a subject (i.e. that would
-- cost money).
-- WHAT IS DELIBERATELY NOT BLOCKED:
--   * removing a subject / downgrading -- a parent must always be able to stop
--     paying for something, and blocking it would trap them;
--   * admin_grant_child_access -- comping access is precisely how an admin
--     gives free access while payments are off;
--   * quotes/previews -- read-only price maths, no money moves;
--   * everything a child does -- children never purchase in any mode.
--
-- Rerun-safe: yes (CREATE OR REPLACE + idempotent guard insertion).
-- Backports: 011 (helper + guarded functions), 013 (check #84).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The single source of truth for the payment mode, callable from SQL.
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because feature_flags and system_settings are admin-RLS
-- locked; this exposes ONLY the derived mode string, never the flag rows.
create or replace function public.current_payment_mode()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags      jsonb;
  v_real       boolean := false;
  v_demo       boolean := false;
  v_gvw        boolean := false;
  v_gvw_start  timestamptz;
  v_gvw_days   int := 30;
  v_setting    jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments', 'demo_payments', 'giveaway_period');

  v_real := coalesce((v_flags ->> 'payments')::boolean, false);
  v_demo := coalesce((v_flags ->> 'demo_payments')::boolean, false);
  v_gvw  := coalesce((v_flags ->> 'giveaway_period')::boolean, false);

  -- A giveaway only counts while its window is still open (same maths as
  -- get_mobile_config: started_at + duration_days).
  if v_gvw then
    select value_json into v_setting from public.system_settings
     where key = 'giveaway.duration_days';
    if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
      v_gvw_days := greatest(1, (v_setting)::text::int);
    end if;
    select value_json into v_setting from public.system_settings
     where key = 'giveaway.started_at';
    if v_setting is not null and jsonb_typeof(v_setting) = 'string' then
      v_gvw_start := (v_setting ->> 0)::timestamptz;
    end if;
    v_gvw := v_gvw_start is not null
             and now() < v_gvw_start + make_interval(days => v_gvw_days);
  end if;

  return case
    when v_gvw  then 'giveaway'
    when v_demo then 'demo'
    when v_real then 'real'
    else 'off'
  end;
end;
$$;

comment on function public.current_payment_mode() is
  'Derived payment mode (real|demo|giveaway|off) from the mutually-exclusive '
  'feature flags, with the giveaway window applied. Same semantics as '
  'get_mobile_config().payment.mode. Exposes only the mode string.';

revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. The kill-switch assertion used by every paid mutation.
-- -----------------------------------------------------------------------------
create or replace function public.assert_payments_enabled()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_payment_mode() = 'off' then
    -- check_violation: the web/BFF error mappers already translate this class
    -- to a friendly trilingual notice and never leak the raw text.
    raise exception 'payments: disabled' using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_payments_enabled() is
  'Raises check_violation "payments: disabled" when the payment mode is off. '
  'Called at the TOP of every paid mutation so the kill switch cannot be '
  'bypassed by a server action or BFF route that forgets to check.';

revoke all on function public.assert_payments_enabled() from public, anon, authenticated;
grant execute on function public.assert_payments_enabled() to service_role;

-- -----------------------------------------------------------------------------
-- 3. Wire the assertion into the paid mutations.
-- -----------------------------------------------------------------------------
-- Each function body is patched IN PLACE by re-creating it from its own live
-- definition with a single guard line inserted after the opening `begin`. This
-- avoids retyping several hundred lines of pricing/sibling-discount logic and
-- the reconstruction regressions that would come with it.
do $patch$
declare
  v_target text;
  v_def    text;
  v_guard  constant text :=
    E'begin\n  -- Round 48 kill switch: no paid write while the payment mode is off.\n  perform public.assert_payments_enabled();\n';
begin
  foreach v_target in array array[
    'create_child_subscription(uuid,plan_interval,uuid[])',
    'purchase_olympiad(uuid,uuid)',
    'add_subscription_subject(uuid,uuid)'
  ]
  loop
    if to_regprocedure('public.' || v_target) is null then
      raise notice 'skip % (not present)', v_target;
      continue;
    end if;

    v_def := pg_get_functiondef(('public.' || v_target)::regprocedure);

    if position('assert_payments_enabled' in v_def) > 0 then
      raise notice 'already guarded: %', v_target;
      continue;
    end if;

    -- Replace only the FIRST `begin` that opens the function body.
    v_def := regexp_replace(v_def, E'\\nbegin\\n', E'\n' || v_guard, 'n');

    if position('assert_payments_enabled' in v_def) = 0 then
      raise exception 'could not insert guard into % (unexpected body shape)', v_target;
    end if;

    execute v_def;
    raise notice 'guarded: %', v_target;
  end loop;
end
$patch$;

-- apply_subject_change is guarded CONDITIONALLY: a pure removal must stay
-- possible while payments are off (a parent must always be able to stop paying),
-- so only an ADD is blocked. Patch it separately with a predicate guard.
do $patch2$
declare
  v_def   text;
  v_guard constant text :=
    E'begin\n  -- Round 48 kill switch: while payments are off a parent may still\n'
    '  -- REMOVE subjects (never trap someone into paying), but may not ADD one.\n'
    '  if coalesce(array_length(p_add, 1), 0) > 0 then\n'
    '    perform public.assert_payments_enabled();\n'
    '  end if;\n';
begin
  if to_regprocedure('public.apply_subject_change(uuid,uuid[],uuid[],text)') is null then
    raise notice 'apply_subject_change not present -- skipped';
    return;
  end if;
  v_def := pg_get_functiondef('public.apply_subject_change(uuid,uuid[],uuid[],text)'::regprocedure);
  if position('assert_payments_enabled' in v_def) > 0 then
    raise notice 'apply_subject_change already guarded';
    return;
  end if;
  v_def := regexp_replace(v_def, E'\\nbegin\\n', E'\n' || v_guard, 'n');
  if position('assert_payments_enabled' in v_def) = 0 then
    raise exception 'could not insert guard into apply_subject_change';
  end if;
  execute v_def;
  raise notice 'guarded: apply_subject_change (adds only)';
end
$patch2$;

-- =============================================================================
-- End of 2026_07_26_089_payments_kill_switch_db_guard.sql
-- =============================================================================
