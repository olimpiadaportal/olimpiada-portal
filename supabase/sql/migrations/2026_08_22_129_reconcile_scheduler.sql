-- =============================================================================
-- 2026_08_22_129 — THE PAYMENT SAFETY NETS ACTUALLY RUN.
--
-- Round 8 found that NOTHING drives /api/payments/azericard/reconcile in
-- production, so two of the three reconciliation passes never ran at all:
--
--   pass 1 — a payment authorised at the bank whose BACKREF POST never arrives.
--            The family is charged, nothing is delivered, and no alarm fires
--            until somebody runs 013 by hand.
--   pass 3 — reversal detection. The money goes back and the access stays live,
--            forever. Migration 128 made this pass correct; it still never ran.
--
-- Why it was not running: web-app/vercel.json was DELETED on 2026-07-19 because
-- Vercel Hobby caps crons at once-daily and a */5 entry failed every deployment
-- (frozen production at a 16 Jul build for two days). pg_cron could not stand in
-- because pg_net was not installed, so the database had no way to make an HTTP
-- call. `olympiq_checkout_redeem_sweep` is the SQL-only floor under this and can
-- only redeem sessions the ledger already records as paid — it cannot ask the
-- bank anything.
--
-- THE MERCHANT PRIVATE KEY STILL NEVER ENTERS THE DATABASE. That constraint is
-- what made this look impossible, and it is not violated here: pg_net calls OUR
-- OWN ROUTE, and the route signs the gateway MAC with the key that lives only in
-- the web app's environment. The database carries a bearer token for our own
-- endpoint and nothing else.
--
-- WHERE THE TOKEN LIVES, AND WHY NOT system_settings. Both the token and the URL
-- are Vault secrets. system_settings is editable from the admin panel, and a
-- setting that decides WHERE THE DATABASE POSTS A BEARER TOKEN is an
-- admin-editable exfiltration primitive. Vault has no admin-panel surface. The
-- function additionally refuses any URL that is not https on a hardcoded host —
-- defence in depth, so even a Vault write cannot redirect the token.
--
-- FAIL-CLOSED AND QUIET. A missing secret is a NOTICE and a no-op, never an
-- error: this runs every five minutes forever, and a job that raises on every
-- tick fills the log and trains people to ignore it. Nothing is granted here —
-- the route decides everything, from answers the web app got from the gateway.
--
-- Self-transacting. Backported into canonical 011 (the function) and 016 (the
-- schedule).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- pg_net — the only new capability. Guarded: an environment without it (a local
-- from-zero rebuild) skips scheduling and this file still succeeds.
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice '129: pg_net not available here (%). The reconcile sweep will not be scheduled.', sqlerrm;
  end;
end $$;

-- -----------------------------------------------------------------------------
-- The kick. Reads its two Vault secrets, refuses anything that is not our own
-- https endpoint, and queues ONE POST. Returns the pg_net request id, or NULL
-- when it declined to call.
-- -----------------------------------------------------------------------------
create or replace function public.azericard_reconcile_kick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url   text;
  v_key   text;
  v_host  text;
  v_req   bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'azericard_reconcile_kick: pg_net is not installed; nothing to do.';
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'azericard_reconcile_url' limit 1;
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'azericard_reconcile_key' limit 1;

  -- Fail CLOSED and quietly. Not configured is the ordinary state of a fresh
  -- database, and this fires every five minutes.
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice 'azericard_reconcile_kick: not configured (vault secrets missing); skipping.';
    return null;
  end if;

  -- OUR OWN ENDPOINT ONLY. The token is useless to anyone but us, but a bearer
  -- token posted at an attacker-chosen host is still a credential leak, and a
  -- hardcoded allowlist is the one check a later Vault write cannot talk its way
  -- around. Anything unexpected is refused, not "cleaned up".
  v_host := split_part(split_part(regexp_replace(v_url, '^https://', ''), '/', 1), ':', 1);
  if v_url !~ '^https://' or v_host not in ('olympiq.ai', 'www.olympiq.ai', 'staging.olympiq.ai') then
    raise warning 'azericard_reconcile_kick: refusing to post to an unexpected host (%).', v_host;
    return null;
  end if;

  -- Fire and forget. pg_net queues the request and a background worker sends it;
  -- the ROUTE does the work and records everything it decides. We deliberately
  -- do not read the response: there is nothing here that could act on it, and a
  -- job that waits on a network call blocks a cron worker for its duration.
  -- Failures are visible in net._http_response, which pg_net prunes itself.
  select net.http_post(
           url                 => v_url,
           body                => '{}'::jsonb,
           params              => '{}'::jsonb,
           headers             => jsonb_build_object(
                                    'Content-Type',    'application/json',
                                    'x-reconcile-key', v_key),
           timeout_milliseconds => 55000
         ) into v_req;
  return v_req;
end;
$$;

-- SERVICE-ROLE ONLY, and not even that in practice — cron runs it as the owner.
-- 010 line 88 grants EXECUTE on new functions to anon AND authenticated by
-- default, so all three must be named or this becomes a way for any logged-in
-- parent to make the server hammer the acquirer.
revoke all on function public.azericard_reconcile_kick() from public, anon, authenticated;
grant execute on function public.azericard_reconcile_kick() to service_role;

comment on function public.azericard_reconcile_kick() is
  'Queues one POST to the web app''s AzeriCard reconciliation sweep. Credentials come from Vault; the target host is allowlisted in the body. Returns the pg_net request id, or NULL when not configured.';

-- -----------------------------------------------------------------------------
-- The schedule. Every five minutes: the gateway answers status queries for 24
-- hours, so this has ~288 chances to recover a lost callback or notice a
-- reversal before the only remaining evidence is the settlement report.
-- -----------------------------------------------------------------------------
do $$
declare
  v_has_cron boolean;
  v_has_net  boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net')  into v_has_net;

  if not v_has_cron then
    raise notice '129: pg_cron absent — reconcile sweep not scheduled.';
    return;
  end if;
  if not v_has_net then
    raise notice '129: pg_net absent — reconcile sweep not scheduled (the function is installed and inert).';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_azericard_reconcile';
  perform cron.schedule(
    'olympiq_azericard_reconcile',
    '*/5 * * * *',
    'select public.azericard_reconcile_kick();'
  );
  raise notice '129: pg_cron job olympiq_azericard_reconcile scheduled (*/5).';
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.azericard_reconcile_kick()') is null then
    raise exception '129: azericard_reconcile_kick was not created';
  end if;
  if has_function_privilege('anon', 'public.azericard_reconcile_kick()', 'execute')
     or has_function_privilege('authenticated', 'public.azericard_reconcile_kick()', 'execute') then
    raise exception '129: azericard_reconcile_kick is executable by anon/authenticated';
  end if;
  if position('staging.olympiq.ai' in pg_get_functiondef('public.azericard_reconcile_kick()'::regprocedure)) = 0 then
    raise exception '129: the host allowlist is missing';
  end if;
  raise notice '129: all checks passed';
end $$;

commit;
