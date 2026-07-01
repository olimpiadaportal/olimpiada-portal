-- Migration: 2026_06_28_012_child_subscription_engine.sql
-- Purpose: Stage 11 (Child Subscriptions) — server-side pricing + subscription
--          creation. Price = sum(subject pricing for the interval); sibling
--          discount (2nd 15% / 3rd+ 20%) and trial length are computed HERE, never
--          by the client. quote_* is read-only (for preview); create_* writes the
--          subscription as a 7-day trial and flips the child to access 'trialing'.
--          Real charge/webhook is provider-specific and out of scope until a
--          provider is chosen — the trial grants initial access with no charge.
-- Environment first applied: development/staging
-- Related root SQL file(s): 011 (functions), 013 (validation).
-- Backport status: completed (canonical 011 + 013 #20; from-zero rebuild = 20/20 PASS)
-- Destructive change: no (additive functions)
-- Rollback notes: drop quote_child_subscription(), create_child_subscription().
-- Security: SECURITY DEFINER; service_role EXECUTE only (called from the parent
--           server action's admin client after it authorizes the parent + child).
-- =============================================================================

-- Read-only price quote (base, sibling discount, total, trial length).
create or replace function public.quote_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_base    numeric(12,2);
  v_rank    int;
  v_pct     numeric(5,2);
  v_amt     numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_missing int;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'quote: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every selected subject must have active pricing for the interval.
  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (p_subject_ids) and sp.interval = p_interval and sp.status = 'active';

  -- Sibling rank = (this parent's OTHER children already on a live subscription) + 1.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');

  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;
  v_amt := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN');
end;
$$;

-- Create the subscription as a trial (computes amounts via quote; writes rows).
create or replace function public.create_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_q     jsonb;
  v_sub   uuid;
  v_sid   uuid;
  v_trial int;
begin
  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  v_q := public.quote_child_subscription(p_student_profile_id, p_interval, p_subject_ids);
  v_trial := (v_q->>'trial_days')::int;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'trialing',
     now(), now() + (v_trial || ' days')::interval, now(), now() + (v_trial || ' days')::interval,
     (v_q->>'base')::numeric, (v_q->>'discount_percent')::numeric,
     (v_q->>'discount')::numeric, (v_q->>'total')::numeric, 'AZN', 'none')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  update public.students set access_status = 'trialing' where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object('subscription_id', v_sub, 'status', 'trialing');
end;
$$;

revoke all on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;
revoke all on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;

-- =============================================================================
-- End of 2026_06_28_012_child_subscription_engine.sql
-- =============================================================================
