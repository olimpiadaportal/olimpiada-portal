-- =============================================================================
-- 2026_07_16_066_sibling_discount_10_15.sql
-- Round 23 follow-up (owner ruling 2026-07-16: the INVESTOR-approved numbers
-- win): the automatic sibling discount changes from 2nd 15% / 3rd+ 20% to
-- **2nd child 10% / 3rd+ child 15%**. The rule stays FIXED (no admin module);
-- only the percent formula changes, in the three functions that compute it:
-- quote_child_subscription (display quote), add_subscription_subject and
-- remove_subscription_subject (both reprice on subject changes). The formula
-- inside create_child_subscription flows through the same quote path.
-- Definitions below were generated from the live dev DB (pg_get_functiondef)
-- with ONLY the percent line + rule comments changed, so nothing else drifts.
-- Historical rows in sibling_discounts keep the percent they were charged.
-- Backport: 011 (same three formula lines + comments), 007/CLAUDE docs.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION public.quote_child_subscription(p_student_profile_id uuid, p_interval plan_interval, p_subject_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;
  v_amt := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN');
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_subscription_subject(p_student_profile_id uuid, p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  if not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active'
  ) then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects (child_subscription_id, subject_id)
  values (v_sub, p_subject_id) on conflict do nothing;

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_subscription_subject(p_student_profile_id uuid, p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_count    int;
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;

  select count(*) into v_count
  from public.subscription_subjects where child_subscription_id = v_sub;
  if v_count <= 1 then
    raise exception 'remove_subject: at least one subject must remain';
  end if;

  delete from public.subscription_subjects
  where child_subscription_id = v_sub and subject_id = p_subject_id;

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$function$;

-- ---- self-verify -------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.quote_child_subscription(uuid,public.plan_interval,uuid[])',
    'public.add_subscription_subject(uuid,uuid)',
    'public.remove_subscription_subject(uuid,uuid)'
  ] loop
    if position('when v_rank = 2 then 10 else 15' in pg_get_functiondef(f::regprocedure)) = 0 then
      raise exception 'sibling discount 10/15 formula missing in %', f;
    end if;
    if position('then 15 else 20' in pg_get_functiondef(f::regprocedure)) > 0 then
      raise exception 'old 15/20 formula still present in %', f;
    end if;
  end loop;
  raise notice 'sibling discount 10/15 self-verify PASS';
end $$;

commit;
