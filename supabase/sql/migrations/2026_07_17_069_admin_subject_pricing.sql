-- ============================================================================
-- Migration: 2026_07_17_069_admin_subject_pricing.sql
-- Purpose: subjects_pricing (007; per subject × week|month|year interval,
-- seeded 3/9/90 AZN) had NO admin write path — every write was service-role
-- only, so admins could not reprice a subject at all. Add the Admin-only RPC
-- admin_upsert_subject_price(subject, interval, amount):
--   * in-body guard FIRST: is_admin() (= has_role('administrator') ONLY —
--     content managers never pass; pricing is an Admin-only module);
--   * validation: subject must exist; interval whitelisted to the
--     public.plan_interval values ('week','month','year'); amount finite,
--     > 0, <= 10000, at most 2 decimals (NaN/±Infinity all rejected by the
--     range checks — numeric NaN sorts greater than every number);
--   * currency is NEVER client-set: inserts keep the column default ('AZN'),
--     updates never touch it;
--   * upsert on the uq_subject_interval_price (subject_id, interval) key;
--   * audit row in audit_logs — the exact shape the admin panel's
--     writeAuditLog helper records for other Admin-only mutations
--     (actor/action/target_table/target_id + small metadata_json diff:
--     subject_id, interval, old_amount, new_amount).
-- Grants match admin_send_notification: revoke public/anon; EXECUTE for
-- authenticated (the in-body admin check is the real gate) + service_role.
--
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/011_indexes_constraints_functions_triggers.sql
-- Backport status: completed (011 + new 013 check #70)
-- Destructive change: no
-- Rollback notes: drop function public.admin_upsert_subject_price(uuid, text, numeric);
--                 no data change to roll back (pricing rows keep their values).
-- ============================================================================

begin;

create or replace function public.admin_upsert_subject_price(
  p_subject_id uuid,
  p_interval   text,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_old   numeric(12,2);
  v_new   numeric(12,2);
  v_id    uuid;
  v_cur   text;
begin
  -- Administrator ONLY — guard before reading/using any input. is_admin() is
  -- has_role('administrator'); content managers (or any permission holder)
  -- must NOT pass, so no has_permission() escape hatch here.
  if not public.is_admin() then
    raise exception 'pricing: forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_subject_id is null
     or not exists (select 1 from public.subjects s where s.id = p_subject_id) then
    raise exception 'pricing: unknown subject' using errcode = 'check_violation';
  end if;
  -- Whitelist = the public.plan_interval enum values used by subjects_pricing.
  if p_interval is null or p_interval not in ('week', 'month', 'year') then
    raise exception 'pricing: bad interval' using errcode = 'check_violation';
  end if;
  -- Finite, positive, sane cap, max 2 decimals (numeric NaN/Infinity compare
  -- greater than any number → caught by the > 10000 branch; -Infinity by <= 0).
  if p_amount is null or p_amount <= 0 or p_amount > 10000
     or p_amount <> round(p_amount, 2) then
    raise exception 'pricing: bad amount' using errcode = 'check_violation';
  end if;
  v_new := round(p_amount, 2);

  select sp.price_amount into v_old
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id
    and sp.interval = p_interval::public.plan_interval;

  -- Upsert on the (subject_id, interval) unique key. Currency stays whatever
  -- the row/system uses (default 'AZN' on insert; untouched on update).
  insert into public.subjects_pricing (subject_id, interval, price_amount)
  values (p_subject_id, p_interval::public.plan_interval, v_new)
  on conflict (subject_id, interval)
  do update set price_amount = excluded.price_amount, updated_at = now()
  returning id, currency into v_id, v_cur;

  -- Same audit mechanism the other Admin-only mutations use (audit_logs row,
  -- small metadata diff — never large bodies, never credentials).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.pricing.subject_price_upsert', 'subjects_pricing', v_id,
     jsonb_build_object(
       'subject_id', p_subject_id,
       'interval', p_interval,
       'old_amount', v_old,
       'new_amount', v_new),
     'info', true);

  return jsonb_build_object(
    'id', v_id,
    'subject_id', p_subject_id,
    'interval', p_interval,
    'old_amount', v_old,
    'new_amount', v_new,
    'currency', v_cur);
end;
$$;
comment on function public.admin_upsert_subject_price(uuid, text, numeric) is
  'Admin-only (in-body is_admin guard — content managers never pass) upsert of '
  'one subjects_pricing row (subject × week|month|year). Validates subject/'
  'interval/amount server-side, never touches currency, audits into audit_logs. '
  'Migration 069.';

-- Grants: same pattern as admin_send_notification — the in-body admin check
-- gates authenticated callers; anon/public never execute.
revoke all on function public.admin_upsert_subject_price(uuid, text, numeric) from public, anon;
grant execute on function public.admin_upsert_subject_price(uuid, text, numeric) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  -- 1) Function exists.
  if to_regprocedure('public.admin_upsert_subject_price(uuid,text,numeric)') is null then
    raise exception 'admin_upsert_subject_price missing';
  end if;

  -- 2) anon must have NO execute; authenticated + service_role must have it.
  if has_function_privilege('anon', 'public.admin_upsert_subject_price(uuid,text,numeric)', 'EXECUTE') then
    raise exception 'anon must not execute admin_upsert_subject_price';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_upsert_subject_price(uuid,text,numeric)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_upsert_subject_price(uuid,text,numeric)', 'EXECUTE') then
    raise exception 'authenticated/service_role execute grant missing';
  end if;

  -- 3) Definition contains the guard + audit write.
  v_def := pg_get_functiondef('public.admin_upsert_subject_price(uuid,text,numeric)'::regprocedure);
  if position('is_admin' in v_def) = 0 or position('audit_logs' in v_def) = 0 then
    raise exception 'admin_upsert_subject_price definition lacks guard/audit markers';
  end if;

  -- 4) Functional guard check: with no admin session context (migration runs as
  --    the db owner, current_profile_id() is null) the call must be REJECTED
  --    with insufficient_privilege before touching anything.
  begin
    perform public.admin_upsert_subject_price(gen_random_uuid(), 'week', 1);
    raise exception 'pricing guard failed: non-admin call succeeded';
  exception when insufficient_privilege then
    null; -- expected
  end;

  raise notice 'admin subject pricing self-verify PASS.';
end $$;

commit;
