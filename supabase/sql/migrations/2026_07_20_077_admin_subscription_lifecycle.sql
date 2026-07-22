-- ============================================================================
-- Migration: 2026_07_20_077_admin_subscription_lifecycle.sql
-- Round 31: the Admin Panel gains a real "Subscriptions" section. Admins need
-- to manage the DEMO/comped subscription ecosystem (no real payment provider
-- exists yet) WITHOUT hand-writing status updates from TypeScript.
--
-- This adds ONE centralized, self-auditing lifecycle RPC so every admin status
-- change goes through validated transitions server-side. The client never sets
-- status/dates/amounts directly — it names an ACTION and the DB decides.
--
--   activate : incomplete|past_due            -> active   (opens a period)
--   cancel   : trialing|active|past_due       -> canceled (keeps access to period end)
--   expire   : trialing|active|past_due|canceled -> expired (revokes access NOW)
--   extend   : trialing|active|past_due|canceled -> (+N days on the period end)
--
-- Anything else raises check_violation with hint 'invalid_transition', so the
-- UI can never drive the record into an inconsistent state. students.access_status
-- is reconciled for the affected child on every action (the hourly
-- recompute_child_access() job remains the global safety net).
--
-- Existing RPCs are reused, NOT duplicated: admin_grant_child_access() still
-- creates comped subscriptions, create_child_subscription() still handles the
-- parent purchase path. No new tables, no schema change, no second subscription
-- system. The Payments module is untouched.
--
-- Backported into canonical 011. 013 check #77.
-- ============================================================================

begin;

create or replace function public.admin_manage_child_subscription(
  p_subscription_id uuid,
  p_action          text,
  p_days            int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_profile_id();
  v_sub      public.child_subscriptions%rowtype;
  v_from     text;
  v_to       text;
  v_end      timestamptz;
  v_student  uuid;
begin
  -- Administrator only (subscription/payment modules are Admin-only; content
  -- managers must never reach this).
  if not public.is_admin() then
    raise exception 'subscription: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('activate', 'cancel', 'expire', 'extend') then
    raise exception 'subscription: bad action' using errcode = 'check_violation',
      hint = 'unknown_action';
  end if;

  select * into v_sub from public.child_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription: not found' using errcode = 'no_data_found';
  end if;
  v_from    := v_sub.status::text;
  v_student := v_sub.student_profile_id;
  v_to      := v_from;
  v_end     := v_sub.current_period_end;

  if p_action = 'activate' then
    if v_from not in ('incomplete', 'past_due') then
      raise exception 'subscription: cannot activate from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'active';
    -- Open a period when there is none / it already lapsed.
    if v_end is null or v_end <= now() then
      v_end := now() + case v_sub.interval
                         when 'week'  then interval '7 days'
                         when 'month' then interval '30 days'
                         else interval '365 days'
                       end;
    end if;
    update public.child_subscriptions
       set status = 'active',
           current_period_start = coalesce(current_period_start, now()),
           current_period_end   = v_end,
           updated_at = now()
     where id = p_subscription_id;

  elsif p_action = 'cancel' then
    if v_from not in ('trialing', 'active', 'past_due') then
      raise exception 'subscription: cannot cancel from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'canceled';
    -- Canceled keeps access until the period end (web parity).
    update public.child_subscriptions
       set status = 'canceled', updated_at = now()
     where id = p_subscription_id;

  elsif p_action = 'expire' then
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot expire from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to  := 'expired';
    v_end := now();
    update public.child_subscriptions
       set status = 'expired', current_period_end = v_end, updated_at = now()
     where id = p_subscription_id;

  else -- extend
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot extend from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    if p_days is null or p_days < 1 or p_days > 730 then
      raise exception 'subscription: days must be 1..730' using errcode = 'check_violation',
        hint = 'bad_days';
    end if;
    -- Extend from NOW when the period already lapsed, else from its end.
    v_end := greatest(coalesce(v_sub.current_period_end, now()), now())
             + make_interval(days => p_days);
    update public.child_subscriptions
       set current_period_end = v_end, updated_at = now()
     where id = p_subscription_id;
  end if;

  -- Reconcile the child's cached access flag for THIS student (same rules as
  -- recompute_child_access(), applied to one row so the UI is instantly right).
  update public.students s
     set access_status = case
           when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and (cs.status in ('trialing','active','past_due')
                    or (cs.status = 'canceled' and cs.current_period_end > now()))
               and (cs.current_period_end is null or cs.current_period_end > now())
           ) then (
             case when exists (
               select 1 from public.child_subscriptions cs
               where cs.student_profile_id = s.profile_id and cs.status = 'trialing'
                 and (cs.current_period_end is null or cs.current_period_end > now())
             ) then 'trialing'::public.child_access_status
             else 'active'::public.child_access_status end)
           else 'expired'::public.child_access_status
         end
   where s.profile_id = v_student;

  -- Self-auditing (same mechanism as admin_upsert_subject_price).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.subscription.' || p_action, 'child_subscriptions', p_subscription_id,
     jsonb_build_object(
       'from_status', v_from,
       'to_status', v_to,
       'days', p_days,
       'period_end', v_end,
       'student_profile_id', v_student),
     (case when p_action in ('expire', 'cancel') then 'warning' else 'info' end)::public.audit_severity,
     true);

  return jsonb_build_object(
    'id', p_subscription_id,
    'from_status', v_from,
    'status', v_to,
    'current_period_end', v_end);
exception
  when unique_violation then
    -- uq_child_subscriptions_live: this child already has another live sub.
    raise exception 'subscription: child already has a live subscription'
      using errcode = 'unique_violation', hint = 'duplicate_live_subscription';
end;
$$;
revoke all on function public.admin_manage_child_subscription(uuid, text, int) from public, anon;
grant execute on function public.admin_manage_child_subscription(uuid, text, int) to authenticated, service_role;

-- ---- self-verify -----------------------------------------------------------
do $$
declare v_def text;
begin
  if to_regprocedure('public.admin_manage_child_subscription(uuid,text,int)') is null then
    raise exception 'admin_manage_child_subscription missing';
  end if;
  if has_function_privilege('anon','public.admin_manage_child_subscription(uuid,text,int)','EXECUTE') then
    raise exception 'anon must not execute the subscription lifecycle RPC';
  end if;
  v_def := pg_get_functiondef('public.admin_manage_child_subscription(uuid,text,int)'::regprocedure);
  if position('is_admin' in v_def) = 0 or position('invalid_transition' in v_def) = 0
     or position('audit_logs' in v_def) = 0 then
    raise exception 'guard / transition validation / audit missing';
  end if;
  raise notice 'admin subscription lifecycle self-verify PASS.';
end $$;

commit;
