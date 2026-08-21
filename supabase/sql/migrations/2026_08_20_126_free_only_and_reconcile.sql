-- =============================================================================
-- 2026_08_20_126_free_only_and_reconcile.sql
-- =============================================================================
-- Migration: 2026_08_20_126_free_only_and_reconcile.sql
-- Purpose: Close the three remaining routes to a PAID PLAN WITHOUT A PAYMENT
--          that migration 125 did not reach, and give a lost callback a way
--          home.
--
--          125 inverted ONE path -- the web manage-subjects checkout -- so that
--          a verified payment causes the plan change. It left three doors open,
--          and all three have the same shape: something reaches an APPLY with
--          money owed and no money taken.
--
--          (A) THE PURCHASE-SILENT SURFACE COULD BUY. The mobile BFF routes
--              call create_child_plan / apply_plan_change directly, with no
--              checkout anywhere. A parent bearer token therefore reached a
--              full paid plan for free the moment the payment mode became
--              `real`. It is also a store-policy problem, not only a money one:
--              docs/STORE_PAYMENTS_COMPLIANCE.md section 4 makes the apps
--              purchase-silent BY ARCHITECTURE, and an app-reachable server
--              route that starts a paid plan is the architecture failing
--              quietly. This migration gives that surface its own, narrower
--              entry points -- create_child_plan_if_free /
--              apply_plan_change_if_free -- which do the work and then REFUSE,
--              rolling the whole thing back, if it turns out to have been
--              priced. The verdict is taken from the apply's OWN return value
--              inside the SAME statement, so no re-quote race can slip a priced
--              change past a pre-check that ran a moment earlier.
--
--          (B) A RUNNING TRIAL MADE EVERY ADDITION FREE FOREVER.
--              quote_plan_change prices an addition at ZERO while the plan is
--              trialing and documents it as 'the adds ride the trial like every
--              other subject'. apply_plan_change did not honour that: it
--              anchored every add at now() + its FULL cycle regardless of
--              status. So adding a yearly subject on day one of a seven-day
--              trial bought a YEAR of access for nothing -- repeatable, with no
--              obligation recorded and, since there is no renewal path at all
--              and card-on-file is not approved by the bank yet
--              (AZCDF-100303), nothing that could ever collect it.
--              A trial-time add now ends at the TRIAL END, exactly as
--              create_child_plan already writes the opening basket. One rule,
--              uniform: WHILE TRIALING, EVERY SUBJECT PERIOD ENDS AT THE TRIAL
--              END. The trial stays a bounded free window and can no longer
--              become a free PAID period.
--
--              The same finding's other half: with
--              launch_promo_config.trial_days = 0, create_child_plan still took
--              the `trialing` branch and wrote trial_ends_at = now(), granting
--              a period that had ALREADY ENDED -- while quote_child_plan,
--              reading the same 0, charged the FULL total. A plan is now
--              `trialing` only when it has trial days left to run.
--
--          (D) A LOST CALLBACK HAD NO WAY HOME. A payment authorised at the
--              bank whose BACKREF POST never arrives leaves the family charged
--              with no record, no plan and no alarm. The gateway answers
--              TRTYPE=90 for 24 HOURS, so it is recoverable only inside that
--              window. Two halves are added, and the split is where it is
--              because of a secret, not a preference:
--                * checkout_reconcile_candidates() -- the WORK LIST. Asking the
--                  gateway requires a MAC signed with the merchant private key,
--                  which lives only in the web app's environment and must never
--                  enter the database. So SQL names the orders and the web-app
--                  sweep asks about them; the answer is recorded by exactly the
--                  code path the callback uses.
--                * checkout_redeem_sweep() -- the BACKSTOP that needs no
--                  network at all: sessions already recorded `paid` whose
--                  redemption never ran (the callback recorded the money and
--                  then died). It calls checkout_redeem_plan, so there is ONE
--                  implementation of "money becomes a plan", not two.
--
--          WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It enables no payment
--          flag (production stays `off`), touches neither the entitlement
--          mirror of 124 nor the intent machinery of 125, adds no card or token
--          column, grants no new EXECUTE to anon or authenticated, and gives
--          nothing a direct write path into `entitlements`.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql -- the re-issued
--                    create_child_plan / quote_plan_change / apply_plan_change,
--                    the two *_if_free wrappers and the two reconciliation
--                    functions, each with its revoke/grant pair;
--          * 016_scheduled_jobs.sql -- the olympiq_checkout_redeem_sweep job;
--          * 013_validation_queries.sql -- NEW checks 119 and 120.
-- Backport status: completed
-- Destructive change: no. Three function bodies replaced, four functions added,
--          one cron job added. No table, column, row or grant is dropped.
-- Rollback notes:
--          1. Restore create_child_plan, quote_plan_change and
--             apply_plan_change from git (011).
--          2. drop function public.create_child_plan_if_free(uuid,jsonb),
--                           public.apply_plan_change_if_free(uuid,jsonb,text),
--                           public.checkout_redeem_sweep(int),
--                           public.checkout_reconcile_candidates(int);
--          3. select cron.unschedule('olympiq_checkout_redeem_sweep');
--          Rolling back (2) re-opens finding A: the mobile BFF would have to be
--          reverted in the same step or it will 404 on its own RPC.
--
-- SELF-TRANSACTING. This file wraps itself in begin/commit, matching migrations
-- 120-125. It must NEVER be `\i`'d inside a from-zero rebuild -- that is the
-- CLAUDE.md rule migration 095 exists to enforce. Run bare, against staging
-- first, then production.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. create_child_plan: a zero-day trial is not a trial  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued verbatim from 011 with ONE change: the trialing branch is taken
-- only when the effective trial has at least one day left to run.
-- `create or replace` PRESERVES ACLs, but the revoke/grant pair is re-issued
-- below anyway -- carrying it explicitly is the house rule, not an optimisation.
create or replace function public.create_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    uuid;
  v_q        jsonb;
  v_sub      uuid;
  v_trial    int;
  v_child    text;
  v_auth     uuid;
  v_had_any  boolean;
  -- Migration 126: the trial the CONFIG offers, before the one-per-child rule.
  -- Named rather than inlined so the two questions stay separate: "is a trial
  -- on offer at all?" and "has this child already had theirs?".
  v_offer    int;
  v_status   public.subscription_status;
  v_default  public.plan_interval;
  v_trialend timestamptz;
  v_row      record;
begin
  -- Round 48 kill switch (migration 089): no paid write while the payment mode
  -- is off. Defence in depth -- the web/BFF layer checks too, but this is the
  -- layer that cannot be forgotten.
  perform public.assert_payments_enabled();

  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  -- Serialize all subscription writes of ONE family: prevents the double-submit
  -- duplicate row and the concurrent sibling-rank race (audit C2 + M14).
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'create: child already has a live subscription'
      using errcode = 'unique_violation';
  end if;

  v_q := public.quote_child_plan(p_student_profile_id, p_items);

  -- The DEFAULT cycle for subjects added later = the most common cycle in the
  -- basket; ties resolve year > month > week (the longer commitment is the
  -- safer default to inherit).
  select n.interval into v_default
  from public.plan_items_normalize(p_items) n
  group by n.interval
  order by count(*) desc,
           case n.interval when 'year' then 3 when 'month' then 2 else 1 end desc
  limit 1;

  -- Trial once per child: any prior subscription row (canceled/expired
  -- included) means no new free trial (audit C2).
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);

  -- MIGRATION 126 -- A ZERO-DAY TRIAL IS NOT A TRIAL.
  --
  -- The branch used to be on v_had_any ALONE, so with
  -- launch_promo_config.trial_days = 0 a first-time child took the `trialing`
  -- side with v_trial = 0: trial_ends_at = now(), every subject's
  -- current_period_end = now(), and access_status = 'trialing'. The row
  -- announced a running trial while the period it granted had ALREADY ENDED --
  -- and quote_child_plan, reading the same 0, priced due_now at the FULL total.
  -- So the family was charged for a plan that expired the instant it existed.
  --
  -- The rule is now one sentence: a plan is `trialing` only when it actually
  -- has trial days left to run. Everything else is an ACTIVE plan whose
  -- subjects open real, paid, full-length periods -- which is what the checkout
  -- took the money for.
  v_offer := greatest(coalesce((v_q->>'trial_days')::int, 0), 0);
  if v_had_any or v_offer <= 0 then
    v_trial  := 0;
    v_status := 'active';
  else
    v_trial  := v_offer;
    v_status := 'trialing';
  end if;
  v_trialend := now() + (v_trial || ' days')::interval;

  -- base/discount/total/current_period_end/next_renewal_at are DELIBERATELY not
  -- written here: trg_sync_subscription_period derives all five from the
  -- per-subject rows inserted below.
  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start,
     sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, v_default, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_trialend end,
     now(),
     (v_q->>'discount_percent')::numeric, 'AZN', 'none')
  returning id into v_sub;

  for v_row in
    select n.subject_id, n.interval, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub, v_row.subject_id, v_row.interval, v_row.price_amount, 'AZN',
       now(),
       case when v_status = 'trialing' then v_trialend
            else now() + case v_row.interval
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child
  -- has none, and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students
     set access_status = case when v_status = 'trialing' then 'trialing' else 'active' end::public.child_access_status
   where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', v_status::text, 'trial_days', v_trial,
    'interval', v_default::text,
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.create_child_plan(uuid, jsonb) is
  'Migration 109: starts a child subscription from a PER-SUBJECT basket. Each subject opens its own period (trial end while trialing, else now() + its own cycle); child_subscriptions.interval stores only the DEFAULT cycle for future adds. The amount columns are left to trg_sync_subscription_period. Migration 126: the trialing branch is taken ONLY when the effective trial is at least one day, so trial_days = 0 can no longer create a plan whose period has already ended.';

revoke all on function public.create_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2. quote_plan_change: a trialing add renews at the trial end  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued verbatim from 011 with ONE change: the renewal sentence for an
-- addition made DURING a trial reports the trial end, which is the date
-- apply_plan_change now writes. The preview and the charge stay one computation
-- (audit invariant H7) -- including the dates, not only the amounts.
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

  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

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
  if v_sub.status <> 'trialing' then
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
                 when s.state = 'add' and v_sub.status = 'trialing'
                   then coalesce(v_sub.trial_ends_at, v_sub.current_period_end, now())
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

comment on function public.quote_plan_change(uuid, jsonb) is
  'Migration 109/120/126: diffs a DESIRED full per-subject basket against the live subscription into adds / reinstatements / removes / plan_changes and prices it. due_now = the TRUE adds'' full first cycles at the sibling rate (proration retired); un-cancelling a scheduled removal before its period lapses costs nothing, and a cycle change costs nothing now and applies at that subject''s renewal. Migration 126: while the plan is trialing an add renews at the TRIAL END, matching what apply_plan_change writes.';

revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 3. apply_plan_change: a trial-time add ends with the trial  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued verbatim from 011 with ONE change, in the ADD loop: while the
-- subscription is trialing, a newly added subject's period ends at the TRIAL
-- END rather than opening a full cycle anchored at now(). See the block comment
-- at that line for why this is the whole of finding B.
create or replace function public.apply_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote    jsonb;
  v_sub      public.child_subscriptions%rowtype;
  v_actor    uuid := public.current_profile_id();
  v_pct      numeric(5,2);
  v_before   numeric(12,2);
  v_after    numeric(12,2);
  v_left     int;
  v_prior    jsonb;
  v_adds     int;
  v_restores int;
  v_changes  int;
  v_row      record;
begin
  -- Replay guard: the same batch key returns the original outcome untouched.
  -- A reinstatement participates: it writes a ledger row under the same key, so
  -- a retried batch short-circuits here instead of re-running.
  if p_idempotency_key is not null then
    select jsonb_build_object('idempotent', true, 'applied_at', min(created_at))
      into v_prior
    from public.subscription_changes
    where idempotency_key = p_idempotency_key
      and student_profile_id = p_student_profile_id
    having count(*) > 0;
    if v_prior is not null then return v_prior; end if;
  end if;

  -- ONE source of truth for the numbers (preview == charged, audit H7).
  v_quote := public.quote_plan_change(p_student_profile_id, p_items);

  -- ...and ONE source of truth for WHAT IS AN ADD (migration 120). The quote
  -- priced with this exact classifier, so the preview and the charge cannot
  -- disagree about which subjects are bought and which are merely un-cancelled.
  select (count(*) filter (where s.state = 'add'))::int,
         (count(*) filter (where s.state = 'reinstate'))::int
    into v_adds, v_restores
  from public.plan_change_states((v_quote->>'subscription_id')::uuid, p_items) s;
  v_changes := jsonb_array_length(v_quote->'plan_changes');

  -- Round 48/51 kill switch: while payments are off a parent may still REMOVE
  -- subjects (never trap someone into paying), but may not ADD one — and a
  -- cycle change is a billing change, so it is blocked too.
  -- A REINSTATEMENT is deliberately absent from this condition: it moves no
  -- money and only restores coverage the parent has already paid for, so
  -- blocking it would trap them inside a cancellation they want to undo —
  -- precisely the failure mode the removal carve-out above exists to avoid.
  if v_adds > 0 or v_changes > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub from public.child_subscriptions
  where id = (v_quote->>'subscription_id')::uuid
  for update;

  v_pct    := (v_quote->>'discount_percent')::numeric;
  v_before := (v_quote->>'current_recurring_total')::numeric;
  v_after  := (v_quote->>'new_recurring_total')::numeric;

  -- ---- removals: keep access to THIS SUBJECT'S own period end --------------
  -- 'covered' IS "a live row that the desired basket keeps", so this is the
  -- same count the hand-written subquery produced, read from the one classifier.
  select (count(*) filter (where s.state = 'covered'))::int into v_left
  from public.plan_change_states(v_sub.id, p_items) s;
  if v_left < 1 and v_adds < 1 and v_restores < 1 then
    raise exception 'subject_change: at least one subject must remain'
      using errcode = 'check_violation', hint = 'last_subject';
  end if;

  for v_row in
    select ss.subject_id,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not exists (select 1 from public.plan_items_normalize(p_items) n
                       where n.subject_id = ss.subject_id)
  loop
    update public.subscription_subjects
       set remove_at = v_row.ends_at
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'remove',
       v_row.subject_id, v_row.iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- reinstatements: clear remove_at and NOTHING ELSE --------------------
  -- The un-cancel. interval, price_amount, current_period_start and
  -- current_period_end are untouched, so the prepaid time survives and the
  -- subject renews on the date it always had. Zero is charged.
  --
  -- THIS LOOP MUST RUN BEFORE THE CYCLE-CHANGE LOOP: that loop filters on
  -- remove_at is null, so reinstating afterwards would silently drop a cycle
  -- change requested in the same save. It also runs before the ADD loop, which
  -- re-reads the classifier — a subject reinstated here is 'covered' by then
  -- and can never be processed twice.
  for v_row in
    select s.subject_id,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subscription_subjects ss
      on ss.child_subscription_id = v_sub.id
     and ss.subject_id = s.subject_id
    where s.state = 'reinstate'
  loop
    update public.subscription_subjects
       set remove_at = null
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    -- prorated_amount = 0, always. The ledger is what a payment provider will
    -- reconcile against, and no money moves here.
    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'reinstate',
       v_row.subject_id, v_row.iv, now(), 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- additions: a NEW full cycle anchored at now() -----------------------
  -- TRUE adds only: no row at all, or a row whose coverage already lapsed. The
  -- on-conflict branch below therefore only ever fires for a LAPSED row, where
  -- resetting the period is exactly right — it genuinely is a new subscription.
  for v_row in
    select s.subject_id, s.interval as iv, sp.price_amount
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subjects_pricing sp
      on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
    where s.state = 'add'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub.id, v_row.subject_id, v_row.iv, v_row.price_amount, v_sub.currency,
       now(),
       -- MIGRATION 126 -- A TRIAL-TIME ADD ENDS WITH THE TRIAL.
       --
       -- quote_plan_change prices a trialing add at ZERO and has always said it
       -- 'rides the trial like every other subject'. This line did the
       -- opposite: it opened a FULL cycle anchored at now(), so a yearly
       -- subject added on day one of a seven-day trial was a free year --
       -- repeatable, unrecorded and uncollectable, because nothing in the
       -- platform charges at a trial end or a period end and card-on-file is
       -- not approved by the bank yet (AZCDF-100303). A zero we have no way to
       -- bill later may only buy a period that ENDS, never one that outlives
       -- the window that justified it.
       --
       -- create_child_plan already writes exactly this for the opening basket,
       -- so the rule is now uniform and one sentence long: WHILE TRIALING,
       -- EVERY SUBJECT PERIOD ENDS AT THE TRIAL END.
       --
       -- The coalesce chain FAILS CLOSED. A legacy trialing row carrying no
       -- trial_ends_at and no period lands on now(), i.e. grants nothing --
       -- the safe direction for a period we could not establish.
       case when v_sub.status = 'trialing'
              then coalesce(v_sub.trial_ends_at, v_sub.current_period_end, now())
            else now() + case v_row.iv
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict (child_subscription_id, subject_id) do update
      set remove_at            = null,
          interval             = excluded.interval,
          pending_interval     = null,
          price_amount         = excluded.price_amount,
          current_period_start = excluded.current_period_start,
          current_period_end   = excluded.current_period_end;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'add',
       v_row.subject_id, v_row.iv, now(),
       round(coalesce(v_row.price_amount, 0) * (1 - v_pct / 100.0), 2),
       v_sub.currency, v_before, v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- cycle changes: SCHEDULED only, never a refund, never a charge -------
  -- Reaches a just-reinstated subject too, because the loop above already
  -- cleared its remove_at. That is the whole point of the ordering: a parent
  -- who un-cancels a subject AND moves it to another cycle gets both, and the
  -- cycle still applies at that subject's own renewal rather than immediately.
  for v_row in
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as from_iv,
           coalesce(ss.interval, v_sub.interval) as cur_iv,
           n.interval as to_iv,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at
    from public.subscription_subjects ss
    join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval)
  loop
    -- Choosing the cycle the subject is ALREADY paid on CANCELS a scheduled
    -- change rather than scheduling a no-op, which is the only way back for a
    -- parent who picked the wrong cycle.
    update public.subscription_subjects
       set pending_interval =
             case when v_row.to_iv = v_row.cur_iv then null else v_row.to_iv end
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'plan_change',
       v_row.subject_id, v_row.to_iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- TODO(real-provider): capture (v_quote->>'due_now') through the PSP HERE,
  -- inside this transaction's boundary, then write the resulting payment id
  -- back onto the ledger rows and insert the matching public.payments row.
  -- NEVER accept the amount from a client.

  return v_quote || jsonb_build_object('applied', true, 'charged', false);
end;
$$;

comment on function public.apply_plan_change(uuid, jsonb, text) is
  'Migration 109/120/126: applies a DESIRED full per-subject basket atomically — true adds open their own now()-anchored cycle, a subject whose scheduled removal has not yet lapsed is REINSTATED (remove_at cleared, period and price untouched, nothing charged), removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers and plan_change_states of the add/reinstate/covered split; assert_payments_enabled() gates adds and cycle changes while removals and reinstatements stay legal. Migration 126: while the subscription is trialing an add period ends at the TRIAL END, never a full cycle -- a zero the platform has no way to bill later may only buy a window that closes on its own.';

revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. The purchase-silent surface: apply ONLY what costs nothing (backport -> 011)
-- -----------------------------------------------------------------------------
-- WHY THESE EXIST. The mobile apps are purchase-silent BY ARCHITECTURE
-- (docs/STORE_PAYMENTS_COMPLIANCE.md section 4): purchasing happens on the WEB,
-- in a browser, and the app reflects entitlement. That guarantee was true of
-- everything the app RENDERS and false of what its BFF could CALL -- both
-- routes reached the apply RPCs directly, so a parent bearer token could start
-- a full paid plan with no checkout anywhere the moment the mode became `real`.
--
-- WHY A WRAPPER AND NOT A PRE-CHECK. "Quote, see zero, then apply" cannot be
-- made safe from outside the transaction: prices, the sibling tier and
-- launch_promo_config.trial_days can all move between the two calls, and READ
-- COMMITTED gives each statement its own snapshot. So the verdict is taken from
-- the apply's OWN return value, in the SAME statement, and a refusal RAISES --
-- which rolls back the apply, the ledger rows and the entitlement rows the
-- producer triggers wrote. There is no window in which a priced change exists.
--
-- WHY NOT A BOOLEAN PARAMETER ON THE APPLY ITSELF. Adding one would create a
-- second overload of a function this codebase calls from five places, and the
-- OLD signature would keep existing as a bypass. A separately named function
-- cannot be reached by accident: a route that wants the priced behaviour has to
-- name the priced function, which is a thing a reviewer can see.
--
-- WHAT STAYS LEGAL, and why it must. A removal, a reinstatement (migration
-- 120), a scheduled cycle change, an active giveaway window, an admin
-- free-access interval and a running trial all price at ZERO, and every one of
-- them is a thing a parent must be able to do from the app. Never trap a family
-- inside a plan they are trying to leave because the payment rail is elsewhere.
create or replace function public.create_child_plan_if_free(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_due numeric(12,2);
begin
  v_res := public.create_child_plan(p_student_profile_id, p_items);

  -- NULL IS A REFUSAL, not a zero. An answer with no due_now is an answer we
  -- cannot price, and "we could not tell what this costs" must never resolve to
  -- "so it is probably free".
  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'plan: this change has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.create_child_plan_if_free(uuid, jsonb) is
  'Migration 126: create_child_plan for the PURCHASE-SILENT surface (the mobile BFF). Applies the plan and then rolls the whole statement back with check_violation/payment_required if the plan RPC priced it above zero -- so a bearer token can start a trial or a genuinely free plan and can never reach a paid one. The verdict comes from the apply''s own return value inside the same statement, which is why no re-quote race can defeat it.';

revoke all on function public.create_child_plan_if_free(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan_if_free(uuid, jsonb) to service_role;

create or replace function public.apply_plan_change_if_free(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_due numeric(12,2);
begin
  v_res := public.apply_plan_change(p_student_profile_id, p_items, p_idempotency_key);

  -- A REPLAY IS NOT A PURCHASE. apply_plan_change short-circuits a repeated
  -- idempotency key with {idempotent, applied_at} and applies nothing, so there
  -- is no charge to refuse -- and refusing it would turn a harmless retry into
  -- an error the parent has to interpret.
  if coalesce((v_res->>'idempotent')::boolean, false) then
    return v_res;
  end if;

  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'plan: this change has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.apply_plan_change_if_free(uuid, jsonb, text) is
  'Migration 126: apply_plan_change for the PURCHASE-SILENT surface (the mobile BFF). Removals, reinstatements, scheduled cycle changes and trial-time adds price at zero and pass; anything the quote prices above zero raises check_violation/payment_required, which rolls back the apply, its ledger rows and the entitlement rows the producer triggers wrote. An idempotent replay is returned untouched -- it applied nothing.';

revoke all on function public.apply_plan_change_if_free(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change_if_free(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Reconciliation for a lost callback  (backport -> 011)
-- -----------------------------------------------------------------------------
-- A payment authorised at the bank whose BACKREF POST never reaches us leaves
-- the family CHARGED with no record, no plan and no alarm. The gateway answers
-- a TRTYPE=90 status query for 24 HOURS, so the window in which that is
-- recoverable is exactly one day wide and then closes forever.
--
-- WHY THIS IS TWO FUNCTIONS AND NOT ONE JOB. Asking the gateway requires a MAC
-- signed with the merchant private key. That key lives in the web app's
-- environment and MUST NOT enter the database (CLAUDE.md, secret handling), and
-- this deployment has no pg_net, so a pg_cron job cannot make the call even in
-- principle. The split follows the constraint:
--   * checkout_reconcile_candidates() names the orders worth asking about;
--     the web-app sweep asks, and records the answer through recordOutcome and
--     checkout_redeem_plan -- the SAME code the callback runs, so there is one
--     implementation of "money becomes a plan" rather than a second copy that
--     can drift from it.
--   * checkout_redeem_sweep() is the half that needs no network: sessions the
--     ledger ALREADY says are `paid` whose redemption never ran. It is the
--     pg_cron backstop, and it is what makes the guarantee survive an outage of
--     whatever schedules the web sweep.
create or replace function public.checkout_reconcile_candidates(p_limit int default 50)
returns table (
  provider_order text,
  amount         numeric(12,2),
  currency       text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cs.provider_session_id, cs.amount, cs.currency, cs.created_at
  from public.checkout_sessions cs
  where cs.provider = 'azericard'
    and cs.intent_kind is not null
    and cs.status = 'pending'
    and cs.redeemed_at is null
    and cs.amount is not null
    -- INSIDE THE GATEWAY'S OWN WINDOW. Beyond 24 hours a status query cannot be
    -- answered, so listing the row would only produce a network call that
    -- always fails; 013 check 118 keeps counting it instead.
    and cs.created_at > now() - interval '24 hours'
    -- ...and not so fresh that the parent may still be ON the bank's page. A
    -- sweep that raced a live checkout would query a transaction that has not
    -- happened yet and record a 'pending' answer as though it were news.
    and cs.created_at < now() - interval '5 minutes'
  order by cs.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.checkout_reconcile_candidates(int) is
  'Migration 126: the work list for the lost-callback sweep -- PENDING intents inside the gateway''s 24-hour TRTYPE=90 window and at least five minutes old. Read-only; it decides nothing and grants nothing. The caller asks the gateway (the MAC key is web-app-only and never enters the database) and records the answer through the same path the callback uses.';

revoke all on function public.checkout_reconcile_candidates(int) from public, anon, authenticated;
grant execute on function public.checkout_reconcile_candidates(int) to service_role;

create or replace function public.checkout_redeem_sweep(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_res      jsonb;
  v_seen     int := 0;
  v_applied  int := 0;
  v_review   int := 0;
  v_other    int := 0;
begin
  for v_row in
    select cs.provider_session_id as ord
    from public.checkout_sessions cs
    where cs.provider = 'azericard'
      and cs.intent_kind is not null
      and cs.status = 'paid'
      and cs.redeemed_at is null
      -- Five minutes of grace, because the ordinary case is a callback whose
      -- redeem step is still in flight in another transaction. Sweeping it now
      -- would only contend on the row lock checkout_redeem_plan takes.
      and cs.created_at < now() - interval '5 minutes'
      -- ONLY WHAT SQL CAN FINISH. A plan_start for a child with no 8-digit ID
      -- yet ends with a Supabase Auth admin call that no SQL function can make,
      -- and redeeming it here would leave a paid-for child unable to log in
      -- with nothing saying so. The web-app sweep -- which CAN make that call --
      -- owns those; this job takes the rest, and if the web sweep never runs
      -- 013 check 118 still reports them as money taken and not delivered.
      and (cs.intent_kind = 'plan_change'
           or exists (select 1 from public.students st
                       where st.profile_id = cs.student_profile_id
                         and st.child_unique_id is not null))
    order by cs.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  loop
    v_seen := v_seen + 1;
    -- ONE implementation of "money becomes a plan". Everything that makes it
    -- safe -- the row lock, the status = 'paid' requirement, the re-price
    -- against the amount actually confirmed, redeemed_at written in the same
    -- transaction as the apply -- is inside that function, so this loop cannot
    -- weaken any of it and a concurrent callback cannot double-apply.
    begin
      v_res := public.checkout_redeem_plan(v_row.ord);
    exception when others then
      -- One unhappy session must not abort the sweep for the rest. The handler
      -- SETS A VALUE rather than jumping: leaving a block that has an exception
      -- handler from inside that handler is exactly the sort of control flow
      -- that behaves differently across versions, and this loop holds money.
      v_res := jsonb_build_object('outcome', 'error');
    end;
    if v_res->>'outcome' = 'applied' then
      v_applied := v_applied + 1;
    elsif v_res->>'outcome' = 'needs_review' then
      v_review := v_review + 1;
    else
      v_other := v_other + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'examined', v_seen, 'applied', v_applied,
    'needs_review', v_review, 'other', v_other);
end;
$$;

comment on function public.checkout_redeem_sweep(int) is
  'Migration 126: the no-network half of lost-callback recovery -- redeems checkout sessions the ledger already says are PAID whose redemption never ran, through checkout_redeem_plan (never a second copy of that logic). Idempotent: a decided session answers ''already'' and is counted, not re-applied. Skips a plan_start whose child has no 8-digit ID yet, because finishing one needs a Supabase Auth admin call SQL cannot make.';

revoke all on function public.checkout_redeem_sweep(int) from public, anon, authenticated;
grant execute on function public.checkout_redeem_sweep(int) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Schedule the backstop  (backport -> 016)
-- -----------------------------------------------------------------------------
-- GUARDED exactly like 016: an environment without pg_cron (the local
-- PostgreSQL used for from-zero rebuilds) skips with a NOTICE and the migration
-- still succeeds. Correctness never depends on the job -- it is the floor under
-- the web-app sweep, not the mechanism.
do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_checkout_redeem_sweep';

    perform cron.schedule(
      'olympiq_checkout_redeem_sweep',
      '*/10 * * * *',                                -- every 10 minutes
      'select public.checkout_redeem_sweep(50);'
    );
    raise notice '126: pg_cron job olympiq_checkout_redeem_sweep scheduled (every 10 min).';
  else
    raise notice '126: pg_cron absent — checkout redeem sweep NOT scheduled (skipped safely).';
  end if;
end
$mig$;

-- -----------------------------------------------------------------------------
-- 7. Verify, in-transaction. ABORT rather than half-apply.
-- -----------------------------------------------------------------------------
do $mig$
declare
  n int;
begin
  -- (a) the four new functions exist and none is reachable by a logged-in
  --     browser session. create_child_plan_if_free / apply_plan_change_if_free
  --     are GRANT paths; checkout_redeem_sweep is the grant path wearing a
  --     schedule. An EXECUTE grant to anon or authenticated on any of them is
  --     the whole point of this migration, undone.
  select count(*) into n from (values
    ('public.create_child_plan_if_free(uuid,jsonb)'),
    ('public.apply_plan_change_if_free(uuid,jsonb,text)'),
    ('public.checkout_reconcile_candidates(int)'),
    ('public.checkout_redeem_sweep(int)')
  ) as s(sig)
  where to_regprocedure(s.sig) is null
     or has_function_privilege('anon',          to_regprocedure(s.sig)::oid, 'EXECUTE')
     or has_function_privilege('authenticated', to_regprocedure(s.sig)::oid, 'EXECUTE');
  if n <> 0 then
    raise exception '126: % new function(s) missing or not locked down', n;
  end if;

  -- (b) the trial fix is IN THE BODY, not merely intended. Both halves of
  --     finding B are one line each, and a later `create or replace` from an
  --     older copy of 011 would silently undo them.
  if position('trial_ends_at' in pg_get_functiondef(
       to_regprocedure('public.apply_plan_change(uuid,jsonb,text)'))) = 0 then
    raise exception '126: apply_plan_change does not cap a trial-time add at the trial end';
  end if;
  if position('v_offer <= 0' in pg_get_functiondef(
       to_regprocedure('public.create_child_plan(uuid,jsonb)'))) = 0 then
    raise exception '126: create_child_plan still trials on a zero-day trial';
  end if;

  -- (c) NO EXISTING ROW IS AFFECTED. This migration changes what FUTURE writes
  --     do; if a subject period moved under it, it would be rewriting history.
  select count(*) into n
  from public.child_subscriptions cs
  join public.subscription_subjects ss on ss.child_subscription_id = cs.id
  where cs.status = 'trialing'
    and cs.trial_ends_at is not null
    and ss.remove_at is null
    and ss.current_period_end > cs.trial_ends_at + interval '1 minute';
  if n > 0 then
    -- REPORT, never fail: such rows are the PRE-EXISTING damage this migration
    -- stops from recurring, and refusing to install the fix because the bug
    -- already ran once would be exactly backwards.
    raise notice '126: % subject period(s) already outlive their trial — pre-existing, see 013 check 120', n;
  end if;

  raise notice '126: purchase-silent apply gates + lost-callback reconciliation installed';
end
$mig$;

commit;

-- =============================================================================
-- End of 2026_08_20_126_free_only_and_reconcile.sql
-- =============================================================================
