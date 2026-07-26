-- =============================================================================
-- 2026_07_26_091_payment_mode_parity.sql
-- =============================================================================
-- Round 51 (sync audit F1/F2/F6): ONE payment-mode semantics for every
-- resolver, and every failure path fails CLOSED.
--
-- WHAT WAS WRONG (all three found by the cross-platform audit, same day 089
-- shipped — none had reached production, which does not exist yet):
--   F1  current_payment_mode() (migration 089) treated a MISSING `payments`
--       flag row as false while get_mobile_config() and the web resolver
--       treated it as true. With no row, both apps rendered full commerce
--       while assert_payments_enabled() refused every paid write — buy
--       buttons that always error.
--   F2  The two SQL resolvers also disagreed on the giveaway window:
--       089 defaulted duration_days to 30 (011 requires an explicit > 0), and
--       089's `(v_setting ->> 0)::timestamptz` cast had NO exception guard —
--       the seeded default for giveaway.started_at is '""'::jsonb, so a
--       half-configured giveaway made current_payment_mode() RAISE
--       invalid_datetime_format, which propagated through
--       assert_payments_enabled() and broke every paid RPC with a raw error.
--   F6  assert_payments_enabled() raised with no HINT, so the web/BFF error
--       mappers (which key off hints, never raw text) showed the generic
--       "something went wrong" instead of the friendly payments-off notice.
--
-- THE DECISION (fail closed, everywhere): a missing `payments` flag row now
-- means OFF in ALL resolvers — current_payment_mode(), get_mobile_config()
-- (one-line patch below) and the web's lib/paymentMode.ts (same round). The
-- old missing→true default was pre-Round-11 legacy parity; for a MONEY gate,
-- "we could not read the flag" must never mean "sell things". The launch plan
-- is payments OFF anyway (owner).
--
-- Rerun-safe: yes (CREATE OR REPLACE + an idempotent string patch that no-ops
-- once applied).
-- Destructive change: no.
-- Environment first applied: development
-- Related root SQL file(s):
--   supabase/sql/011_indexes_constraints_functions_triggers.sql
--     (current_payment_mode, assert_payments_enabled, get_mobile_config)
--   supabase/sql/013_validation_queries.sql (new check #86: the two SQL
--     resolvers must agree on the mode)
-- Backport status: pending
-- Rollback notes: restore the 089 bodies of current_payment_mode /
--   assert_payments_enabled and re-add `true` to get_mobile_config's payments
--   coalesce. Nothing structural to undo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) current_payment_mode(): byte-level mirror of get_mobile_config's
--    resolution (guarded parses, explicit-duration requirement), with the
--    fail-closed missing-flag default.
-- -----------------------------------------------------------------------------
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
  v_gvw_flag   boolean := false;
  v_gvw_days   int := 0;
  v_gvw_start  timestamptz;
  v_gvw_active boolean := false;
  v_setting    jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments', 'demo_payments', 'giveaway_period');
  v_flags := coalesce(v_flags, '{}'::jsonb);

  -- Missing row → OFF for every flag (fail closed; F1).
  v_real     := coalesce((v_flags ->> 'payments')::boolean, false);
  v_demo     := coalesce((v_flags ->> 'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags ->> 'giveaway_period')::boolean, false);

  -- Giveaway window — the EXACT parsing rules of get_mobile_config (F2):
  -- duration must be an explicit positive number (no invented 30-day default),
  -- started_at must be a non-empty string that parses, and a bad value NEVER
  -- raises out of a money gate — it just means "no active window".
  select value_json into v_setting from public.system_settings
   where key = 'giveaway.duration_days';
  if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
    v_gvw_days := greatest(0, floor((v_setting)::text::numeric)::int);
  end if;
  select value_json into v_setting from public.system_settings
   where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;
  if v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_active := now() < v_gvw_start + make_interval(days => v_gvw_days);
  end if;

  return case
    when v_gvw_active then 'giveaway'
    when v_demo       then 'demo'
    when v_real       then 'real'
    else 'off'
  end;
end;
$$;

comment on function public.current_payment_mode() is
  'Round 51: resolves payments/demo_payments/giveaway_period into '
  'off|real|demo|giveaway with EXACTLY get_mobile_config''s parsing rules — '
  'a 013 check asserts the two can never drift. Missing flag rows mean OFF '
  '(fail closed); a malformed giveaway window means "no window", never an '
  'exception out of a money gate.';

revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2) assert_payments_enabled(): stable machine hint for the error mappers (F6).
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
    -- hint = the stable key the web/BFF mappers translate to the trilingual
    -- gate.paymentsOff notice (they key off hints, never raw message text).
    raise exception 'payments: disabled'
      using errcode = 'check_violation', hint = 'payments_disabled';
  end if;
end;
$$;

comment on function public.assert_payments_enabled() is
  'Round 48/51: hard server-side payment kill switch. Raises check_violation '
  'with hint payments_disabled while current_payment_mode() = off; called '
  'first inside every paid RPC (create_child_subscription, purchase_olympiad, '
  'add_subscription_subject, apply_subject_change adds).';

revoke all on function public.assert_payments_enabled() from public, anon, authenticated;
grant execute on function public.assert_payments_enabled() to service_role;


-- -----------------------------------------------------------------------------
-- 3) get_mobile_config(): the ONE divergent line — missing `payments` row now
--    resolves false, matching the two gates above. Patched from the live
--    definition (house idiom) so nothing else about the function can regress.
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.get_mobile_config()'::regprocedure);

  if position('coalesce((v_flags->>''payments'')::boolean, false)' in v_def) > 0 then
    -- Already patched (rerun) — nothing to do.
    return;
  end if;
  if position('coalesce((v_flags->>''payments'')::boolean, true)' in v_def) = 0 then
    -- Neither form present: the function drifted from what this patch expects.
    -- Refuse loudly rather than silently leaving the resolvers divergent (the
    -- 013 parity check would also catch it, but this is the better error).
    raise exception 'get_mobile_config(): expected payments-coalesce not found — review before patching';
  end if;

  v_def := replace(
    v_def,
    'coalesce((v_flags->>''payments'')::boolean, true)',
    'coalesce((v_flags->>''payments'')::boolean, false)'
  );

  execute v_def;
end
$patch$;

-- =============================================================================
-- Validation (also lands in 013 as check #86):
--
--   select '86_payment_mode_parity' as check_name,
--          case when public.current_payment_mode()
--                    = (public.get_mobile_config()->'payment'->>'mode')
--                and position('payments_disabled' in
--                      pg_get_functiondef('public.assert_payments_enabled()'::regprocedure)) > 0
--               then 'PASS' else 'FAIL' end as status;
-- =============================================================================
-- End of 2026_07_26_091_payment_mode_parity.sql
-- =============================================================================
