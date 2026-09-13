-- Migration: 2026_09_12_175_sibling_rank_single_source.sql
-- Purpose: Reuse migration 174's sibling rank/percentage helpers at all callers.
-- Environment first applied: staging and production, 2026-09-12.
-- Related root SQL file: 011_indexes_constraints_functions_triggers.sql
-- Backport status: completed. Destructive change: no. No transactions inside.
-- No price rule changes; signatures are unchanged and grants are restated.
create or replace function public.quote_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_rank    int;
  v_pct     numeric(5,2);
  v_missing int;
  v_count   int;
  v_base    numeric(12,2);
  v_disc    numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_items   jsonb;
  v_groups  jsonb;
  v_ivs     int;
  -- Migration 125: the two values that make this quote agree with the charge.
  v_had_any boolean;
  v_due     numeric(12,2);
begin
  select count(*) into v_count from public.plan_items_normalize(p_items);
  if v_count = 0 then raise exception 'quote: no subjects selected'; end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
  -- shape as the single-interval quote so existing mappers keep working.
  select count(*) into v_missing
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = n.subject_id
      and sp.interval = n.interval
      and sp.status = 'active');
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  -- Sibling rank = (this parent's OTHER children already on a live
  -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
  -- percent composes trivially across cycle groups.
  v_rank := public.sibling_rank(v_owner, p_student_profile_id);
  v_pct := public.sibling_discount_percent(v_rank);

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id,
           'interval',   n.interval,
           'price',      sp.price_amount,
           'currency',   'AZN'))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  -- Per-cycle groups, each rounded with EXACTLY today's rule
  -- (discount = round(group_base * pct / 100, 2)).
  with g as (
    select n.interval as iv,
           count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt,
           'base',  g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         coalesce(sum(g.base), 0),
         coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
         count(*)::int
    into v_groups, v_base, v_disc, v_ivs
  from g;

  v_total := v_base - v_disc;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  -- MIGRATION 133 -- THE "LAUNCH PROMOTION" TOGGLE NOW MEANS SOMETHING.
  --
  -- It used to gate exactly one sentence on the public pricing page while the
  -- trial was granted regardless, so switching it OFF stopped ADVERTISING the
  -- promotion and carried on giving it away -- the copy and the behaviour
  -- diverging in the worst of the two directions. There is no other control:
  -- the admin panel has no editor for trial_days, so ending the trial meant raw
  -- SQL against production.
  --
  -- A zero trial is already safe: migration 126's guard routes trial_days = 0
  -- into the ACTIVE/paid branch instead of writing a trial that has already
  -- ended.
  if not coalesce((select enabled from public.feature_flags where key = 'launch_promo'), false) then
    v_trial := 0;
  end if;

  -- MIGRATION 125 -- audit invariant H7 (the preview and the charge are one
  -- computation). The free trial is granted ONCE PER CHILD: create_child_plan
  -- reads exactly this predicate (any prior subscription row, canceled and
  -- expired included) and sets trial_days = 0 / status = 'active' when it is
  -- true. Until now the quote did not look, so a returning child was previewed
  -- a trial they would not get, and a first-time child was previewed a "due
  -- today" of the full total that create_child_plan would not charge. The
  -- preview contradicted the charge in BOTH directions.
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);
  if v_had_any then v_trial := 0; end if;

  -- What the family owes RIGHT NOW. A trialing plan owes nothing until the
  -- trial ends -- create_child_plan runs every subject's first period to the
  -- trial end -- so this is the amount, and the ONLY amount, a checkout may be
  -- opened for.
  v_due := case when v_trial > 0 then 0 else v_total end;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '{}'::jsonb),
    'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
    'due_now', v_due,
    'mixed', coalesce(v_ivs, 0) > 1);
end;
$$;

create or replace function public.add_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_price    numeric(12,2);
  v_end      timestamptz;
begin
  perform public.assert_payments_enabled();
  select id, interval, owner_parent_profile_id, current_period_end
    into v_sub, v_interval, v_owner, v_end
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  select sp.price_amount into v_price
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active';
  if v_price is null then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects
    (child_subscription_id, subject_id, interval, price_amount, currency,
     current_period_start, current_period_end)
  values
    (v_sub, p_subject_id, v_interval, v_price, 'AZN', now(),
     now() + case v_interval
               when 'week'  then interval '7 days'
               when 'month' then interval '1 month'
               else              interval '1 year'
             end)
  on conflict (child_subscription_id, subject_id) do update
    set remove_at = null, price_amount = excluded.price_amount;

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  v_rank := public.sibling_rank(v_owner, p_student_profile_id);
  v_pct := public.sibling_discount_percent(v_rank);

  -- The percent moves first, then one touch of the subject rows re-fires
  -- trg_sync_subscription_period so base/discount/total are re-derived from the
  -- new percent by their single writer.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

create or replace function public.remove_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   uuid;
  v_owner uuid;
  v_rank  int;
  v_pct   numeric(5,2);
  v_count int;
begin
  select id, owner_parent_profile_id into v_sub, v_owner
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

  -- Audit H7: live sibling rank (see add_subscription_subject).
  v_rank := public.sibling_rank(v_owner, p_student_profile_id);
  v_pct := public.sibling_discount_percent(v_rank);

  -- Percent first, then one no-op touch of the subject rows so
  -- trg_sync_subscription_period (their single writer) re-derives the amounts
  -- from the NEW percent — the delete above fired it with the old one.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

create or replace function public.quote_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub        public.child_subscriptions%rowtype;
  v_owner      uuid;
  v_rank       int;
  v_pct        numeric(5,2);
  v_cur_base   numeric(12,2);
  v_next_base  numeric(12,2);
  v_added_base numeric(12,2);
  v_due        numeric(12,2) := 0;
  v_items      jsonb;
  v_groups     jsonb;
  v_renewals   jsonb;
  v_removals   jsonb;
  v_restores   jsonb;
  v_changes    jsonb;
  v_ivs        int;
  v_remaining  int;
  -- Migration 127: a trial is running only while its end is in the FUTURE.
  v_trialing   boolean;
  -- Migration 127: the ADDS, named, so an intent can freeze the CHANGE the
  -- parent authorised instead of a snapshot of the whole plan.
  v_adds       jsonb;
  -- Round 8: how many of the ADDS have no active price. See the guard below.
  v_missing    int;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;
  v_owner := v_sub.owner_parent_profile_id;

  -- ROUND 8 -- AN ADD WITH NO PRICE MUST NOT BE PRICED AT ZERO AND DROPPED.
  --
  -- Every pricing read below is an INNER JOIN on subjects_pricing wrapped in
  -- coalesce(sum(...), 0), so a subject whose pricing row is missing or has
  -- been deactivated does not raise -- it silently vanishes from items, adds,
  -- added_base and due_now. The sibling function quote_child_plan has always
  -- RAISED on exactly this condition, which is why the plan_start branch of
  -- redemption was safe and this one was not.
  --
  -- What that asymmetry cost, in the window between SIGNING an intent and
  -- REDEEMING it: the frozen delta names [add Math, add English] and the
  -- English price is deactivated in between. plan_change_delta re-derives the
  -- SAME delta (it reads coverage and cycles, never pricing), so the delivery
  -- test passes; the re-price comes back at half, which is neither null nor
  -- zero, so no_longer_payable does not fire either; the honour rule then
  -- charges the frozen full price and apply_plan_change delivers one subject.
  -- The family pays for two and receives one, and delivered_items records both.
  --
  -- Scoped to state = 'add' AND NOTHING WIDER. A live subject whose price was
  -- later withdrawn must still be removable, renewable and reinstatable -- a
  -- parent who cannot even CANCEL because we withdrew a price is a worse
  -- failure than the one being fixed. reinstate, cycle and remove never read
  -- subjects_pricing in the quote or in the apply, so they are unaffected.
  select count(*) into v_missing
  from public.plan_change_states(v_sub.id, p_items) s
  where s.state = 'add'
    and not exists (
      select 1 from public.subjects_pricing sp
      where sp.subject_id = s.subject_id
        and sp.interval   = s.interval
        and sp.status     = 'active');
  if v_missing > 0 then
    raise exception 'plan_change: missing pricing for % subject(s)', v_missing
      using errcode = 'check_violation', hint = 'missing_pricing';
  end if;

  -- MIGRATION 127 -- A LAPSED TRIAL IS NOT A TRIAL.
  --
  -- `status = 'trialing'` alone was read as "a trial is running", and the
  -- status is swept by a job rather than by the clock. A subscription whose
  -- trial_ends_at had already passed therefore priced every addition at ZERO
  -- and applied it as trial-time, for as long as the row stayed stale -- a
  -- free paid period bounded by nothing but a cron schedule.
  --
  -- It also closes the second edge in the same line: apply_plan_change caps a
  -- trial-time add at trial_ends_at, and with this predicate that value is
  -- proven non-null and in the future, so an add can no longer be applied
  -- free with an end date that has already gone by (paid nothing, received
  -- nothing). apply_plan_change computes the SAME predicate, which is what
  -- keeps the preview and the charge one computation (audit H7).
  v_trialing := v_sub.status = 'trialing'
                and v_sub.trial_ends_at is not null
                and v_sub.trial_ends_at > now();

  v_rank := public.sibling_rank(v_owner, p_student_profile_id);
  v_pct := public.sibling_discount_percent(v_rank);

  -- CURRENT recurring set = live subjects, each priced on ITS OWN cycle.
  select coalesce(sum(sp.price_amount), 0) into v_cur_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = coalesce(ss.interval, v_sub.interval)
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  -- ADDS = desired subjects that are GENUINELY NEW: no row at all, or a row
  -- whose coverage has already lapsed. Each buys a FULL first cycle (proration
  -- retired -- see the file header). A subject merely SCHEDULED for removal is
  -- NOT an add (migration 120): it is paid for to its period end, so choosing
  -- it again is a REINSTATEMENT and costs nothing.
  select coalesce(sum(sp.price_amount), 0) into v_added_base
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subjects_pricing sp
    on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
  where s.state = 'add';

  -- NEXT recurring set = the desired set, priced on the desired cycles.
  select coalesce(sum(sp.price_amount), 0) into v_next_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id, 'interval', n.interval,
           'price', sp.price_amount, 'currency', v_sub.currency))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  with g as (
    select n.interval as iv, count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt, 'base', g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         count(*)::int
    into v_groups, v_ivs
  from g;

  -- due_now: the TRUE ADDS only, at the sibling rate, rounded per cycle group.
  -- A trial charges nothing (the adds ride the trial like every other subject),
  -- and so does a reinstatement -- there is nothing to buy back.
  --
  -- MIGRATION 126 -- THIS ZERO IS NOW TRUE. It was a claim the apply side did
  -- not honour: apply_plan_change anchored an add at now() + its FULL cycle
  -- whatever the subscription status, so adding a yearly subject on day one of
  -- a seven-day trial bought a year of access for nothing -- repeatably, with
  -- no obligation recorded anywhere and no renewal path that could ever collect
  -- it. The apply now ends a trial-time add at the TRIAL END, which is what
  -- 'rides the trial' has always said. The trial stays a bounded free window;
  -- it can no longer become a free PAID period.
  if not v_trialing then
    with g as (
      select s.interval as iv, coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
      from public.plan_change_states(v_sub.id, p_items) s
      join public.subjects_pricing sp
        on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
      where s.state = 'add'
      group by s.interval)
    select coalesce(sum(g.base - round(g.base * v_pct / 100.0, 2)), 0) into v_due from g;
  end if;

  -- Per-cycle renewal sentences, built from the DESIRED basket. Reading the
  -- STORED rows here is what told a parent who had just moved a subject to
  -- yearly that they would renew at the WEEKLY amount: p_items already carries
  -- the chosen cycle (and, for an untouched subject, its pending_interval), so
  -- the sentence describes the plan the parent is about to have instead of the
  -- one they are leaving.
  -- An already-covered subject renews at ITS OWN period end, a REINSTATED one
  -- at the period end it never lost, and a newly added one opens a full cycle
  -- at now() -- which is exactly what apply_plan_change writes. The branch is
  -- on the STATE, not on a null period_end: a legacy covered row with no period
  -- anywhere must keep reporting no date rather than be given a guessed one.
  with r as (
    select s.interval as iv,
           -- MIGRATION 126: while the plan is TRIALING an add does not open a
           -- full cycle -- it rides the trial and ends with it (see
           -- apply_plan_change). Telling a parent 'renews in a year' about a
           -- subject added on day two of a seven-day trial was the sentence
           -- that made the free-forever add look legitimate.
           min(case
                 when s.state = 'add' and v_trialing
                   then v_sub.trial_ends_at
                 when s.state = 'add'
                   then now() + case s.interval
                                  when 'week'  then interval '7 days'
                                  when 'month' then interval '1 month'
                                  else              interval '1 year'
                                end
                 else s.period_end
               end) as next_at,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subjects_pricing sp
      on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
    group by s.interval)
  select jsonb_agg(jsonb_build_object(
           'interval', r.iv, 'next_at', r.next_at,
           'total', r.base - round(r.base * v_pct / 100.0, 2)))
    into v_renewals from r;

  -- REMOVES = covered but absent from the desired set; each keeps access to ITS
  -- OWN period end (never the subscription's).
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'remove_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_removals
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = ss.subject_id);

  -- REINSTATEMENTS = scheduled for removal, chosen again BEFORE that coverage
  -- lapsed. Nothing is charged, the period is untouched, and the subject simply
  -- renews on its own date as if the removal had never been scheduled. The UI
  -- reads this list so it can stop calling an un-cancel an "addition" and stop
  -- opening a payment sheet for it.
  select jsonb_agg(jsonb_build_object(
           'subject_id', s.subject_id,
           'interval', coalesce(ss.interval, v_sub.interval),
           'renews_at', s.period_end))
    into v_restores
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subscription_subjects ss
    on ss.child_subscription_id = v_sub.id
   and ss.subject_id = s.subject_id
  where s.state = 'reinstate';

  -- PLAN CHANGES = still covered -- live OR being reinstated -- with a different
  -- cycle; scheduled, never charged. Reinstating a subject onto another cycle
  -- is a CYCLE CHANGE like any other: it applies at that subject's own renewal,
  -- never immediately, so the period it is paid on is never overwritten.
  -- The comparison basis is the EFFECTIVE cycle -- pending_interval when one is
  -- already scheduled -- so re-selecting the ORIGINAL cycle is itself a change
  -- (it CANCELS the schedule). Comparing against ss.interval alone locked in a
  -- parent who mis-clicked 'yearly': the diff came back empty, Save stayed
  -- disabled and nothing could unschedule the change.
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'from', coalesce(ss.pending_interval, ss.interval, v_sub.interval),
           'to', s.interval,
           'effective_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_changes
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subscription_subjects ss
    on ss.child_subscription_id = v_sub.id
   and ss.subject_id = s.subject_id
  where s.state in ('covered', 'reinstate')
    and s.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval);

  -- MIGRATION 127 -- WHAT THIS SAVE ACTUALLY BUYS, as its own list.
  -- checkout_intent_open freezes it (plan_change_delta), and redemption
  -- projects it onto CURRENT coverage. Derived from the SAME classifier the
  -- pricing above uses, so the thing that is delivered and the thing that was
  -- priced cannot be two different sets.
  select jsonb_agg(jsonb_build_object(
           'subject_id', s.subject_id, 'interval', s.interval,
           'price', sp.price_amount))
    into v_adds
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subjects_pricing sp
    on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
  where s.state = 'add';

  v_remaining := greatest(0, ceil(
    extract(epoch from (coalesce(v_sub.next_renewal_at, v_sub.current_period_end, now()) - now())) / 86400.0)::int);

  return jsonb_build_object(
    'items',    coalesce(v_items, '[]'::jsonb),
    'groups',   coalesce(v_groups, '{}'::jsonb),
    'renewals', coalesce(v_renewals, '[]'::jsonb),
    'removals_effective', coalesce(v_removals, '[]'::jsonb),
    -- Migration 120: the un-cancels in this basket. Additive on purpose --
    -- already-shipped parsers whitelist the fields they read and ignore it.
    'reinstatements', coalesce(v_restores, '[]'::jsonb),
    'plan_changes', coalesce(v_changes, '[]'::jsonb),
    -- Migration 127, both additive: the TRUE adds this save buys, and the
    -- sibling RANK behind discount_percent -- the parent is shown the saving
    -- and which child earned it, never a silently smaller number.
    'adds', coalesce(v_adds, '[]'::jsonb),
    'rank', v_rank,
    'trialing', v_trialing,
    'mixed', coalesce(v_ivs, 0) > 1,
    -- Legacy contract keys: the web/BFF/mobile parsers still read these.
    'subscription_id',        v_sub.id,
    'status',                 v_sub.status,
    'interval',               v_sub.interval,
    'currency',               v_sub.currency,
    'discount_percent',       v_pct,
    'current_recurring_total', v_cur_base - round(v_cur_base * v_pct / 100.0, 2),
    'new_recurring_total',    v_next_base - round(v_next_base * v_pct / 100.0, 2),
    'due_now',                v_due,
    'prorated',               false,
    'proration_waived',       false,
    'added_base',             v_added_base,
    'remaining_ratio',        1,
    'days_remaining',         v_remaining,
    'period_days',            null,
    -- effective_from = the NEXT CHARGE date, which is what next_renewal_at (the
    -- MIN) genuinely means; the per-subject dates a cycle change takes effect on
    -- are in plan_changes[].effective_at.
    'effective_from',         coalesce(v_sub.next_renewal_at, v_sub.current_period_end),
    -- LEGACY SCALAR, superseded by removals_effective[] above. It used to be the
    -- subscription MIN, so removing a YEARLY subject from a plan that also held
    -- a weekly one told the parent access ended in 7 days while the DB granted a
    -- year. It is now the last of the REMOVED subjects' own dates, so an
    -- already-shipped binary can only ever overstate, never cut access short.
    'removals_effective_at',  coalesce(
      (select max((e.v ->> 'remove_at')::timestamptz)
         from jsonb_array_elements(coalesce(v_removals, '[]'::jsonb)) as e(v)),
      v_sub.next_renewal_at, v_sub.current_period_end));
end;
$$;

-- Every function in this migration is a server-side pricing primitive. CREATE
-- OR REPLACE preserves old ACLs, so close and re-grant each surface explicitly.
revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_child_plan(uuid, jsonb) to service_role;
revoke all on function public.add_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.remove_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

-- DOWN: restore the previous bodies below.
-- create or replace function public.quote_child_plan(
--   p_student_profile_id uuid,
--   p_items              jsonb
-- )
-- returns jsonb
-- language plpgsql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_owner   uuid;
--   v_rank    int;
--   v_pct     numeric(5,2);
--   v_missing int;
--   v_count   int;
--   v_base    numeric(12,2);
--   v_disc    numeric(12,2);
--   v_total   numeric(12,2);
--   v_trial   int;
--   v_items   jsonb;
--   v_groups  jsonb;
--   v_ivs     int;
--   -- Migration 125: the two values that make this quote agree with the charge.
--   v_had_any boolean;
--   v_due     numeric(12,2);
-- begin
--   select count(*) into v_count from public.plan_items_normalize(p_items);
--   if v_count = 0 then raise exception 'quote: no subjects selected'; end if;
-- 
--   select created_by_parent_profile_id into v_owner
--   from public.students where profile_id = p_student_profile_id;
--   if v_owner is null then raise exception 'quote: child has no owning parent'; end if;
-- 
--   -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
--   -- shape as the single-interval quote so existing mappers keep working.
--   select count(*) into v_missing
--   from public.plan_items_normalize(p_items) n
--   where not exists (
--     select 1 from public.subjects_pricing sp
--     where sp.subject_id = n.subject_id
--       and sp.interval = n.interval
--       and sp.status = 'active');
--   if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;
-- 
--   -- Sibling rank = (this parent's OTHER children already on a live
--   -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
--   -- percent composes trivially across cycle groups.
--   select count(distinct cs.student_profile_id) + 1 into v_rank
--   from public.child_subscriptions cs
--   where cs.owner_parent_profile_id = v_owner
--     and cs.student_profile_id <> p_student_profile_id
--     and cs.status in ('trialing', 'active', 'past_due');
--   v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;
-- 
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', n.subject_id,
--            'interval',   n.interval,
--            'price',      sp.price_amount,
--            'currency',   'AZN'))
--     into v_items
--   from public.plan_items_normalize(p_items) n
--   join public.subjects_pricing sp
--     on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';
-- 
--   -- Per-cycle groups, each rounded with EXACTLY today's rule
--   -- (discount = round(group_base * pct / 100, 2)).
--   with g as (
--     select n.interval as iv,
--            count(*)::int as cnt,
--            coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
--     from public.plan_items_normalize(p_items) n
--     join public.subjects_pricing sp
--       on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
--     group by n.interval)
--   select jsonb_object_agg(g.iv, jsonb_build_object(
--            'count', g.cnt,
--            'base',  g.base,
--            'discount', round(g.base * v_pct / 100.0, 2),
--            'total', g.base - round(g.base * v_pct / 100.0, 2))),
--          coalesce(sum(g.base), 0),
--          coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
--          count(*)::int
--     into v_groups, v_base, v_disc, v_ivs
--   from g;
-- 
--   v_total := v_base - v_disc;
-- 
--   select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
--   v_trial := coalesce(v_trial, 7);
-- 
--   -- MIGRATION 133 -- THE "LAUNCH PROMOTION" TOGGLE NOW MEANS SOMETHING.
--   --
--   -- It used to gate exactly one sentence on the public pricing page while the
--   -- trial was granted regardless, so switching it OFF stopped ADVERTISING the
--   -- promotion and carried on giving it away -- the copy and the behaviour
--   -- diverging in the worst of the two directions. There is no other control:
--   -- the admin panel has no editor for trial_days, so ending the trial meant raw
--   -- SQL against production.
--   --
--   -- A zero trial is already safe: migration 126's guard routes trial_days = 0
--   -- into the ACTIVE/paid branch instead of writing a trial that has already
--   -- ended.
--   if not coalesce((select enabled from public.feature_flags where key = 'launch_promo'), false) then
--     v_trial := 0;
--   end if;
-- 
--   -- MIGRATION 125 -- audit invariant H7 (the preview and the charge are one
--   -- computation). The free trial is granted ONCE PER CHILD: create_child_plan
--   -- reads exactly this predicate (any prior subscription row, canceled and
--   -- expired included) and sets trial_days = 0 / status = 'active' when it is
--   -- true. Until now the quote did not look, so a returning child was previewed
--   -- a trial they would not get, and a first-time child was previewed a "due
--   -- today" of the full total that create_child_plan would not charge. The
--   -- preview contradicted the charge in BOTH directions.
--   v_had_any := exists (
--     select 1 from public.child_subscriptions
--     where student_profile_id = p_student_profile_id);
--   if v_had_any then v_trial := 0; end if;
-- 
--   -- What the family owes RIGHT NOW. A trialing plan owes nothing until the
--   -- trial ends -- create_child_plan runs every subject's first period to the
--   -- trial end -- so this is the amount, and the ONLY amount, a checkout may be
--   -- opened for.
--   v_due := case when v_trial > 0 then 0 else v_total end;
-- 
--   return jsonb_build_object(
--     'items', coalesce(v_items, '[]'::jsonb),
--     'groups', coalesce(v_groups, '{}'::jsonb),
--     'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
--     'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
--     'due_now', v_due,
--     'mixed', coalesce(v_ivs, 0) > 1);
-- end;
-- $$;
-- 
-- create or replace function public.add_subscription_subject(
--   p_student_profile_id uuid,
--   p_subject_id         uuid
-- )
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_sub      uuid;
--   v_owner    uuid;
--   v_interval public.plan_interval;
--   v_rank     int;
--   v_pct      numeric(5,2);
--   v_price    numeric(12,2);
--   v_end      timestamptz;
-- begin
--   perform public.assert_payments_enabled();
--   select id, interval, owner_parent_profile_id, current_period_end
--     into v_sub, v_interval, v_owner, v_end
--   from public.child_subscriptions
--   where student_profile_id = p_student_profile_id
--     and status in ('trialing', 'active', 'past_due')
--   order by created_at desc
--   limit 1;
--   if v_sub is null then raise exception 'add_subject: no active subscription'; end if;
-- 
--   select sp.price_amount into v_price
--   from public.subjects_pricing sp
--   where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active';
--   if v_price is null then
--     raise exception 'add_subject: no active pricing for subject %', p_subject_id;
--   end if;
-- 
--   insert into public.subscription_subjects
--     (child_subscription_id, subject_id, interval, price_amount, currency,
--      current_period_start, current_period_end)
--   values
--     (v_sub, p_subject_id, v_interval, v_price, 'AZN', now(),
--      now() + case v_interval
--                when 'week'  then interval '7 days'
--                when 'month' then interval '1 month'
--                else              interval '1 year'
--              end)
--   on conflict (child_subscription_id, subject_id) do update
--     set remove_at = null, price_amount = excluded.price_amount;
-- 
--   -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
--   -- the previewed and the stored totals always match.
--   select count(distinct cs.student_profile_id) + 1 into v_rank
--   from public.child_subscriptions cs
--   where cs.owner_parent_profile_id = v_owner
--     and cs.student_profile_id <> p_student_profile_id
--     and cs.status in ('trialing', 'active', 'past_due');
--   v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;
-- 
--   -- The percent moves first, then one touch of the subject rows re-fires
--   -- trg_sync_subscription_period so base/discount/total are re-derived from the
--   -- new percent by their single writer.
--   update public.child_subscriptions
--      set sibling_discount_percent = v_pct, updated_at = now()
--    where id = v_sub;
--   update public.subscription_subjects
--      set currency = currency
--    where child_subscription_id = v_sub;
-- 
--   return (select jsonb_build_object(
--             'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
--             'discount', cs.discount_amount, 'total', cs.total_amount,
--             'currency', cs.currency, 'subscription_id', cs.id)
--           from public.child_subscriptions cs where cs.id = v_sub);
-- end;
-- $$;
-- 
-- create or replace function public.remove_subscription_subject(
--   p_student_profile_id uuid,
--   p_subject_id         uuid
-- )
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_sub   uuid;
--   v_owner uuid;
--   v_rank  int;
--   v_pct   numeric(5,2);
--   v_count int;
-- begin
--   select id, owner_parent_profile_id into v_sub, v_owner
--   from public.child_subscriptions
--   where student_profile_id = p_student_profile_id
--     and status in ('trialing', 'active', 'past_due')
--   order by created_at desc
--   limit 1;
--   if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;
-- 
--   select count(*) into v_count
--   from public.subscription_subjects where child_subscription_id = v_sub;
--   if v_count <= 1 then
--     raise exception 'remove_subject: at least one subject must remain';
--   end if;
-- 
--   delete from public.subscription_subjects
--   where child_subscription_id = v_sub and subject_id = p_subject_id;
-- 
--   -- Audit H7: live sibling rank (see add_subscription_subject).
--   select count(distinct cs.student_profile_id) + 1 into v_rank
--   from public.child_subscriptions cs
--   where cs.owner_parent_profile_id = v_owner
--     and cs.student_profile_id <> p_student_profile_id
--     and cs.status in ('trialing', 'active', 'past_due');
--   v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;
-- 
--   -- Percent first, then one no-op touch of the subject rows so
--   -- trg_sync_subscription_period (their single writer) re-derives the amounts
--   -- from the NEW percent — the delete above fired it with the old one.
--   update public.child_subscriptions
--      set sibling_discount_percent = v_pct, updated_at = now()
--    where id = v_sub;
--   update public.subscription_subjects
--      set currency = currency
--    where child_subscription_id = v_sub;
-- 
--   return (select jsonb_build_object(
--             'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
--             'discount', cs.discount_amount, 'total', cs.total_amount,
--             'currency', cs.currency, 'subscription_id', cs.id)
--           from public.child_subscriptions cs where cs.id = v_sub);
-- end;
-- $$;
-- 
-- create or replace function public.quote_plan_change(
--   p_student_profile_id uuid,
--   p_items              jsonb
-- )
-- returns jsonb
-- language plpgsql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_sub        public.child_subscriptions%rowtype;
--   v_owner      uuid;
--   v_rank       int;
--   v_pct        numeric(5,2);
--   v_cur_base   numeric(12,2);
--   v_next_base  numeric(12,2);
--   v_added_base numeric(12,2);
--   v_due        numeric(12,2) := 0;
--   v_items      jsonb;
--   v_groups     jsonb;
--   v_renewals   jsonb;
--   v_removals   jsonb;
--   v_restores   jsonb;
--   v_changes    jsonb;
--   v_ivs        int;
--   v_remaining  int;
--   -- Migration 127: a trial is running only while its end is in the FUTURE.
--   v_trialing   boolean;
--   -- Migration 127: the ADDS, named, so an intent can freeze the CHANGE the
--   -- parent authorised instead of a snapshot of the whole plan.
--   v_adds       jsonb;
--   -- Round 8: how many of the ADDS have no active price. See the guard below.
--   v_missing    int;
-- begin
--   select * into v_sub
--   from public.child_subscriptions
--   where student_profile_id = p_student_profile_id
--     and status in ('trialing', 'active', 'past_due')
--   order by created_at desc
--   limit 1;
--   if not found then
--     raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
--   end if;
--   v_owner := v_sub.owner_parent_profile_id;
-- 
--   -- ROUND 8 -- AN ADD WITH NO PRICE MUST NOT BE PRICED AT ZERO AND DROPPED.
--   --
--   -- Every pricing read below is an INNER JOIN on subjects_pricing wrapped in
--   -- coalesce(sum(...), 0), so a subject whose pricing row is missing or has
--   -- been deactivated does not raise -- it silently vanishes from items, adds,
--   -- added_base and due_now. The sibling function quote_child_plan has always
--   -- RAISED on exactly this condition, which is why the plan_start branch of
--   -- redemption was safe and this one was not.
--   --
--   -- What that asymmetry cost, in the window between SIGNING an intent and
--   -- REDEEMING it: the frozen delta names [add Math, add English] and the
--   -- English price is deactivated in between. plan_change_delta re-derives the
--   -- SAME delta (it reads coverage and cycles, never pricing), so the delivery
--   -- test passes; the re-price comes back at half, which is neither null nor
--   -- zero, so no_longer_payable does not fire either; the honour rule then
--   -- charges the frozen full price and apply_plan_change delivers one subject.
--   -- The family pays for two and receives one, and delivered_items records both.
--   --
--   -- Scoped to state = 'add' AND NOTHING WIDER. A live subject whose price was
--   -- later withdrawn must still be removable, renewable and reinstatable -- a
--   -- parent who cannot even CANCEL because we withdrew a price is a worse
--   -- failure than the one being fixed. reinstate, cycle and remove never read
--   -- subjects_pricing in the quote or in the apply, so they are unaffected.
--   select count(*) into v_missing
--   from public.plan_change_states(v_sub.id, p_items) s
--   where s.state = 'add'
--     and not exists (
--       select 1 from public.subjects_pricing sp
--       where sp.subject_id = s.subject_id
--         and sp.interval   = s.interval
--         and sp.status     = 'active');
--   if v_missing > 0 then
--     raise exception 'plan_change: missing pricing for % subject(s)', v_missing
--       using errcode = 'check_violation', hint = 'missing_pricing';
--   end if;
-- 
--   -- MIGRATION 127 -- A LAPSED TRIAL IS NOT A TRIAL.
--   --
--   -- `status = 'trialing'` alone was read as "a trial is running", and the
--   -- status is swept by a job rather than by the clock. A subscription whose
--   -- trial_ends_at had already passed therefore priced every addition at ZERO
--   -- and applied it as trial-time, for as long as the row stayed stale -- a
--   -- free paid period bounded by nothing but a cron schedule.
--   --
--   -- It also closes the second edge in the same line: apply_plan_change caps a
--   -- trial-time add at trial_ends_at, and with this predicate that value is
--   -- proven non-null and in the future, so an add can no longer be applied
--   -- free with an end date that has already gone by (paid nothing, received
--   -- nothing). apply_plan_change computes the SAME predicate, which is what
--   -- keeps the preview and the charge one computation (audit H7).
--   v_trialing := v_sub.status = 'trialing'
--                 and v_sub.trial_ends_at is not null
--                 and v_sub.trial_ends_at > now();
-- 
--   select count(distinct cs.student_profile_id) + 1 into v_rank
--   from public.child_subscriptions cs
--   where cs.owner_parent_profile_id = v_owner
--     and cs.student_profile_id <> p_student_profile_id
--     and cs.status in ('trialing', 'active', 'past_due');
--   v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;
-- 
--   -- CURRENT recurring set = live subjects, each priced on ITS OWN cycle.
--   select coalesce(sum(sp.price_amount), 0) into v_cur_base
--   from public.subscription_subjects ss
--   join public.subjects_pricing sp
--     on sp.subject_id = ss.subject_id
--    and sp.interval = coalesce(ss.interval, v_sub.interval)
--    and sp.status = 'active'
--   where ss.child_subscription_id = v_sub.id
--     and ss.remove_at is null;
-- 
--   -- ADDS = desired subjects that are GENUINELY NEW: no row at all, or a row
--   -- whose coverage has already lapsed. Each buys a FULL first cycle (proration
--   -- retired -- see the file header). A subject merely SCHEDULED for removal is
--   -- NOT an add (migration 120): it is paid for to its period end, so choosing
--   -- it again is a REINSTATEMENT and costs nothing.
--   select coalesce(sum(sp.price_amount), 0) into v_added_base
--   from public.plan_change_states(v_sub.id, p_items) s
--   join public.subjects_pricing sp
--     on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
--   where s.state = 'add';
-- 
--   -- NEXT recurring set = the desired set, priced on the desired cycles.
--   select coalesce(sum(sp.price_amount), 0) into v_next_base
--   from public.plan_items_normalize(p_items) n
--   join public.subjects_pricing sp
--     on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';
-- 
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', n.subject_id, 'interval', n.interval,
--            'price', sp.price_amount, 'currency', v_sub.currency))
--     into v_items
--   from public.plan_items_normalize(p_items) n
--   join public.subjects_pricing sp
--     on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';
-- 
--   with g as (
--     select n.interval as iv, count(*)::int as cnt,
--            coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
--     from public.plan_items_normalize(p_items) n
--     join public.subjects_pricing sp
--       on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
--     group by n.interval)
--   select jsonb_object_agg(g.iv, jsonb_build_object(
--            'count', g.cnt, 'base', g.base,
--            'discount', round(g.base * v_pct / 100.0, 2),
--            'total', g.base - round(g.base * v_pct / 100.0, 2))),
--          count(*)::int
--     into v_groups, v_ivs
--   from g;
-- 
--   -- due_now: the TRUE ADDS only, at the sibling rate, rounded per cycle group.
--   -- A trial charges nothing (the adds ride the trial like every other subject),
--   -- and so does a reinstatement -- there is nothing to buy back.
--   --
--   -- MIGRATION 126 -- THIS ZERO IS NOW TRUE. It was a claim the apply side did
--   -- not honour: apply_plan_change anchored an add at now() + its FULL cycle
--   -- whatever the subscription status, so adding a yearly subject on day one of
--   -- a seven-day trial bought a year of access for nothing -- repeatably, with
--   -- no obligation recorded anywhere and no renewal path that could ever collect
--   -- it. The apply now ends a trial-time add at the TRIAL END, which is what
--   -- 'rides the trial' has always said. The trial stays a bounded free window;
--   -- it can no longer become a free PAID period.
--   if not v_trialing then
--     with g as (
--       select s.interval as iv, coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
--       from public.plan_change_states(v_sub.id, p_items) s
--       join public.subjects_pricing sp
--         on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
--       where s.state = 'add'
--       group by s.interval)
--     select coalesce(sum(g.base - round(g.base * v_pct / 100.0, 2)), 0) into v_due from g;
--   end if;
-- 
--   -- Per-cycle renewal sentences, built from the DESIRED basket. Reading the
--   -- STORED rows here is what told a parent who had just moved a subject to
--   -- yearly that they would renew at the WEEKLY amount: p_items already carries
--   -- the chosen cycle (and, for an untouched subject, its pending_interval), so
--   -- the sentence describes the plan the parent is about to have instead of the
--   -- one they are leaving.
--   -- An already-covered subject renews at ITS OWN period end, a REINSTATED one
--   -- at the period end it never lost, and a newly added one opens a full cycle
--   -- at now() -- which is exactly what apply_plan_change writes. The branch is
--   -- on the STATE, not on a null period_end: a legacy covered row with no period
--   -- anywhere must keep reporting no date rather than be given a guessed one.
--   with r as (
--     select s.interval as iv,
--            -- MIGRATION 126: while the plan is TRIALING an add does not open a
--            -- full cycle -- it rides the trial and ends with it (see
--            -- apply_plan_change). Telling a parent 'renews in a year' about a
--            -- subject added on day two of a seven-day trial was the sentence
--            -- that made the free-forever add look legitimate.
--            min(case
--                  when s.state = 'add' and v_trialing
--                    then v_sub.trial_ends_at
--                  when s.state = 'add'
--                    then now() + case s.interval
--                                   when 'week'  then interval '7 days'
--                                   when 'month' then interval '1 month'
--                                   else              interval '1 year'
--                                 end
--                  else s.period_end
--                end) as next_at,
--            coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
--     from public.plan_change_states(v_sub.id, p_items) s
--     join public.subjects_pricing sp
--       on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
--     group by s.interval)
--   select jsonb_agg(jsonb_build_object(
--            'interval', r.iv, 'next_at', r.next_at,
--            'total', r.base - round(r.base * v_pct / 100.0, 2)))
--     into v_renewals from r;
-- 
--   -- REMOVES = covered but absent from the desired set; each keeps access to ITS
--   -- OWN period end (never the subscription's).
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', ss.subject_id,
--            'remove_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
--     into v_removals
--   from public.subscription_subjects ss
--   where ss.child_subscription_id = v_sub.id
--     and ss.remove_at is null
--     and not exists (
--       select 1 from public.plan_items_normalize(p_items) n
--       where n.subject_id = ss.subject_id);
-- 
--   -- REINSTATEMENTS = scheduled for removal, chosen again BEFORE that coverage
--   -- lapsed. Nothing is charged, the period is untouched, and the subject simply
--   -- renews on its own date as if the removal had never been scheduled. The UI
--   -- reads this list so it can stop calling an un-cancel an "addition" and stop
--   -- opening a payment sheet for it.
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', s.subject_id,
--            'interval', coalesce(ss.interval, v_sub.interval),
--            'renews_at', s.period_end))
--     into v_restores
--   from public.plan_change_states(v_sub.id, p_items) s
--   join public.subscription_subjects ss
--     on ss.child_subscription_id = v_sub.id
--    and ss.subject_id = s.subject_id
--   where s.state = 'reinstate';
-- 
--   -- PLAN CHANGES = still covered -- live OR being reinstated -- with a different
--   -- cycle; scheduled, never charged. Reinstating a subject onto another cycle
--   -- is a CYCLE CHANGE like any other: it applies at that subject's own renewal,
--   -- never immediately, so the period it is paid on is never overwritten.
--   -- The comparison basis is the EFFECTIVE cycle -- pending_interval when one is
--   -- already scheduled -- so re-selecting the ORIGINAL cycle is itself a change
--   -- (it CANCELS the schedule). Comparing against ss.interval alone locked in a
--   -- parent who mis-clicked 'yearly': the diff came back empty, Save stayed
--   -- disabled and nothing could unschedule the change.
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', ss.subject_id,
--            'from', coalesce(ss.pending_interval, ss.interval, v_sub.interval),
--            'to', s.interval,
--            'effective_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
--     into v_changes
--   from public.plan_change_states(v_sub.id, p_items) s
--   join public.subscription_subjects ss
--     on ss.child_subscription_id = v_sub.id
--    and ss.subject_id = s.subject_id
--   where s.state in ('covered', 'reinstate')
--     and s.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval);
-- 
--   -- MIGRATION 127 -- WHAT THIS SAVE ACTUALLY BUYS, as its own list.
--   -- checkout_intent_open freezes it (plan_change_delta), and redemption
--   -- projects it onto CURRENT coverage. Derived from the SAME classifier the
--   -- pricing above uses, so the thing that is delivered and the thing that was
--   -- priced cannot be two different sets.
--   select jsonb_agg(jsonb_build_object(
--            'subject_id', s.subject_id, 'interval', s.interval,
--            'price', sp.price_amount))
--     into v_adds
--   from public.plan_change_states(v_sub.id, p_items) s
--   join public.subjects_pricing sp
--     on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
--   where s.state = 'add';
-- 
--   v_remaining := greatest(0, ceil(
--     extract(epoch from (coalesce(v_sub.next_renewal_at, v_sub.current_period_end, now()) - now())) / 86400.0)::int);
-- 
--   return jsonb_build_object(
--     'items',    coalesce(v_items, '[]'::jsonb),
--     'groups',   coalesce(v_groups, '{}'::jsonb),
--     'renewals', coalesce(v_renewals, '[]'::jsonb),
--     'removals_effective', coalesce(v_removals, '[]'::jsonb),
--     -- Migration 120: the un-cancels in this basket. Additive on purpose --
--     -- already-shipped parsers whitelist the fields they read and ignore it.
--     'reinstatements', coalesce(v_restores, '[]'::jsonb),
--     'plan_changes', coalesce(v_changes, '[]'::jsonb),
--     -- Migration 127, both additive: the TRUE adds this save buys, and the
--     -- sibling RANK behind discount_percent -- the parent is shown the saving
--     -- and which child earned it, never a silently smaller number.
--     'adds', coalesce(v_adds, '[]'::jsonb),
--     'rank', v_rank,
--     'trialing', v_trialing,
--     'mixed', coalesce(v_ivs, 0) > 1,
--     -- Legacy contract keys: the web/BFF/mobile parsers still read these.
--     'subscription_id',        v_sub.id,
--     'status',                 v_sub.status,
--     'interval',               v_sub.interval,
--     'currency',               v_sub.currency,
--     'discount_percent',       v_pct,
--     'current_recurring_total', v_cur_base - round(v_cur_base * v_pct / 100.0, 2),
--     'new_recurring_total',    v_next_base - round(v_next_base * v_pct / 100.0, 2),
--     'due_now',                v_due,
--     'prorated',               false,
--     'proration_waived',       false,
--     'added_base',             v_added_base,
--     'remaining_ratio',        1,
--     'days_remaining',         v_remaining,
--     'period_days',            null,
--     -- effective_from = the NEXT CHARGE date, which is what next_renewal_at (the
--     -- MIN) genuinely means; the per-subject dates a cycle change takes effect on
--     -- are in plan_changes[].effective_at.
--     'effective_from',         coalesce(v_sub.next_renewal_at, v_sub.current_period_end),
--     -- LEGACY SCALAR, superseded by removals_effective[] above. It used to be the
--     -- subscription MIN, so removing a YEARLY subject from a plan that also held
--     -- a weekly one told the parent access ended in 7 days while the DB granted a
--     -- year. It is now the last of the REMOVED subjects' own dates, so an
--     -- already-shipped binary can only ever overstate, never cut access short.
--     'removals_effective_at',  coalesce(
--       (select max((e.v ->> 'remove_at')::timestamptz)
--          from jsonb_array_elements(coalesce(v_removals, '[]'::jsonb)) as e(v)),
--       v_sub.next_renewal_at, v_sub.current_period_end));
-- end;
-- $$;
