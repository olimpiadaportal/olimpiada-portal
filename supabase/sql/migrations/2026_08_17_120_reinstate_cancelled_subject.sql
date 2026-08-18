-- =============================================================================
-- 2026_08_17_120_reinstate_cancelled_subject.sql
-- =============================================================================
-- Migration: 2026_08_17_120_reinstate_cancelled_subject.sql
-- Purpose: CANCELLING A SCHEDULED SUBJECT REMOVAL MUST NOT BE BILLED AS A NEW
--          ADD. Today it is, twice over, and both halves are wrong.
--
--          What happens now. A parent removes a subject: apply_plan_change sets
--          subscription_subjects.remove_at to THAT subject's own period end and
--          the subject keeps access until then with no refund. That is correct
--          and this migration does not touch it.
--
--          If the parent then CHANGES THEIR MIND before that date, both plan
--          RPCs treat the subject as absent, because every "is this covered?"
--          predicate in them is the same hand-copied
--
--              not exists (select 1 from public.subscription_subjects ss
--                          where ss.child_subscription_id = <sub>
--                            and ss.subject_id = n.subject_id
--                            and ss.remove_at is null)
--
--          That predicate answers "is this subject on the GO-FORWARD plan?" and
--          was then used to answer a DIFFERENT question, "must this subject be
--          BOUGHT?". A row scheduled for removal fails it while still being
--          PAID FOR to its period end, so:
--
--            1. quote_plan_change's due_now CTE charges a FULL new period
--               today, on top of coverage the parent has already paid for --
--               which directly contradicts the product rule that a removal
--               keeps access to period end with no refund. They pay twice for
--               overlapping coverage.
--            2. apply_plan_change's add loop upserts with
--                 on conflict ... do update set remove_at = null,
--                   interval = excluded.interval, pending_interval = null,
--                   price_amount = excluded.price_amount,
--                   current_period_start = excluded.current_period_start,
--                   current_period_end = excluded.current_period_end
--               so the remaining prepaid time is DESTROYED (the period is reset
--               to now()) and the cycle is silently overwritten by whatever the
--               payload carried. Its own comment already said "Un-schedule a
--               pending removal instead of duplicating the row" -- the INTENT
--               was reinstatement; the implementation was a fresh add.
--
--          What this migration implements is the ordinary industry-standard
--          un-cancel. Stripe models it as cancel_at_period_end = false: clearing
--          the flag charges NOTHING and changes neither the period nor the
--          renewal date. Chargebee ("remove scheduled cancellation"), Recurly
--          ("reactivate") and Paddle behave the same. A new charge only happens
--          once the paid period has actually LAPSED, at which point it genuinely
--          IS a new subscription.
--
--          Exactly three states per (subscription, subject):
--            COVERED       -- a row with remove_at is null. Unchanged: not an
--                             add, not charged.
--            REINSTATEMENT -- a row with remove_at not null whose coverage has
--                             NOT lapsed:
--                             coalesce(ss.current_period_end,
--                                      cs.current_period_end) > now().
--                             Clear remove_at and NOTHING ELSE -- same interval,
--                             same price_amount, same current_period_start /
--                             current_period_end. Charge ZERO. Not an add.
--            TRUE ADD      -- no row at all, OR a row whose coverage HAS lapsed.
--                             Unchanged from today: a full period anchored at
--                             now(), charged in full.
--
--          The classifier is ONE function, public.plan_change_states(uuid,
--          jsonb), read by BOTH RPCs. It is one function on purpose: the two
--          copies of that predicate are precisely what drifted, and
--          "preview == charged" is an audited invariant of this codebase
--          (audit H7). A second implementation of a billing rule mis-bills
--          silently the day it diverges.
--
--          ORDER IS LOAD-BEARING inside apply_plan_change. The cycle-change
--          branch filters on ss.remove_at is null, so the reinstatement loop
--          runs BEFORE it -- otherwise a reinstatement that also moves the
--          subject to another cycle would silently drop the cycle change. A
--          reinstatement on a DIFFERENT cycle is a CYCLE CHANGE, not an instant
--          switch: it routes through the existing pending_interval path and
--          takes effect at that subject's own renewal, exactly like any other
--          cycle change. interval is never overwritten immediately.
--
--          THE LEDGER TELLS THE TRUTH. subscription_changes.change_type gains
--          'reinstate' (the CHECK constraint is swapped -- it is a text column
--          with an IN list, so there is no enum surgery), and every
--          reinstatement writes a row with prorated_amount = 0. A payment
--          provider integration is the next piece of work and will read this
--          table; a reinstatement logged as an 'add' would reconcile as a
--          charge that never happened.
--
--          KILL SWITCH, DELIBERATELY. assert_payments_enabled() still gates
--          ADDS and CYCLE CHANGES (v_adds > 0 or v_changes > 0) and still lets
--          REMOVALS through. A REINSTATEMENT is NOT gated, on purpose: it moves
--          no money and only restores something the parent has already paid
--          for. Blocking it would trap a parent inside a cancellation they want
--          to undo while payments happen to be off -- which is the exact
--          failure mode the switch's removal carve-out exists to avoid. (The
--          web/BFF layer keeps its own stricter payment-mode product gate; this
--          migration does not change it.)
--
--          IDEMPOTENCY. apply_plan_change short-circuits on a prior
--          idempotency_key. A reinstatement writes its ledger row with the same
--          key, so a retried batch returns the original outcome instead of
--          re-running, and the partial unique index
--          uq_sub_changes_idem (child_subscription_id, idempotency_key,
--          subject_id, change_type) plus `on conflict do nothing` stops a
--          duplicate row inside one batch. change_type is part of that key, so
--          a reinstatement and a cycle change for the SAME subject in the SAME
--          batch both land, which is what a reinstate-onto-another-cycle is.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 007_subscriptions_payments_coupons.sql -- the change_type CHECK
--            gains 'reinstate' (inline, so a from-zero build produces the same
--            constraint name this migration writes);
--          * 011_indexes_constraints_functions_triggers.sql -- the new
--            plan_change_states() classifier plus its comment and grants, and
--            the rewritten quote_plan_change / apply_plan_change bodies;
--          * 013_validation_queries.sql -- NEW check 107 asserts the constraint
--            accepts 'reinstate', that the classifier exists, is service-role
--            only and still carries the not-lapsed predicate, that BOTH RPCs
--            read it, that the quote still reports prorated = false, and that
--            no reinstatement was ever logged with a non-zero amount.
-- Backport status: pending
-- Destructive change: NO. No table, column, row or policy is dropped. The
--          change_type CHECK is swapped for a STRICTLY WIDER one (the old value
--          list is a subset), so every existing row revalidates unchanged. Both
--          RPCs are replaced with `create or replace`, which preserves ACLs --
--          the grants are nevertheless restated below, because a lost revoke on
--          a live database is invisible until a from-zero bootstrap detonates.
-- Rollback notes: restore quote_plan_change / apply_plan_change from migration
--          109 (2026_08_11_109_per_subject_billing_interval.sql), drop
--          public.plan_change_states(uuid, jsonb), and narrow the CHECK back to
--          ('add','remove','plan_change') -- which requires deleting or
--          re-typing any 'reinstate' ledger rows written in the meantime, so
--          read them first.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves neither RPC half-swapped. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. The ledger vocabulary (backport -> 007)
-- -----------------------------------------------------------------------------
-- change_type is `text` with an inline CHECK, so widening it is a constraint
-- swap. The constraint is found by DEFINITION rather than by name: 007 declares
-- it inline (PostgreSQL names it subscription_changes_change_type_check), but
-- assuming that name would silently no-op on a database where it was ever
-- re-created by hand, leaving the narrow list in place and making every
-- reinstatement fail at INSERT time.
do $constraint$
declare
  v_con record;
begin
  for v_con in
    select conname
    from pg_constraint
    where conrelid = 'public.subscription_changes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%change_type%'
  loop
    execute format('alter table public.subscription_changes drop constraint %I',
                   v_con.conname);
  end loop;
end
$constraint$;

alter table public.subscription_changes
  add constraint subscription_changes_change_type_check
  check (change_type in ('add', 'remove', 'plan_change', 'reinstate'));

-- -----------------------------------------------------------------------------
-- B. The ONE classifier both plan RPCs read (backport -> 011)
-- -----------------------------------------------------------------------------
create or replace function public.plan_change_states(
  p_child_subscription_id uuid,
  p_items                 jsonb
)
returns table (
  subject_id uuid,
  "interval" public.plan_interval,
  state      text,
  period_end timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.subject_id,
         n.interval,
         case
           when ss.subject_id is null then 'add'
           when ss.remove_at is null  then 'covered'
           -- NOT LAPSED = still paid for, so choosing it again is an un-cancel.
           -- NULL on both sides is not a future date and falls through to
           -- 'add', which is right: remove_at was itself set to now() when
           -- neither period end existed, so that coverage is already over.
           when coalesce(ss.current_period_end, cs.current_period_end) > now()
             then 'reinstate'
           else 'add'
         end::text as state,
         -- The coverage a covered/reinstated subject KEEPS. NULL for a true
         -- add: it has no period yet, it opens one at now().
         case
           when ss.subject_id is null then null::timestamptz
           when ss.remove_at is null
             or coalesce(ss.current_period_end, cs.current_period_end) > now()
             then coalesce(ss.current_period_end, cs.current_period_end)
           else null::timestamptz
         end as period_end
  from public.plan_items_normalize(p_items) n
  left join public.child_subscriptions cs
    on cs.id = p_child_subscription_id
  left join public.subscription_subjects ss
    on ss.child_subscription_id = p_child_subscription_id
   and ss.subject_id = n.subject_id
$$;

comment on function public.plan_change_states(uuid, jsonb) is
  'Migration 120: classifies each desired basket entry against the live subscription as covered / reinstate / add, and returns the coverage end it keeps. A row SCHEDULED for removal whose period has not lapsed is a REINSTATEMENT (un-cancel): clear remove_at and nothing else, charge zero. Read by BOTH quote_plan_change and apply_plan_change so the preview and the charge cannot disagree about what is an add.';

-- -----------------------------------------------------------------------------
-- C. The preview (backport -> 011)
-- -----------------------------------------------------------------------------
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
           min(case
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
  'Migration 109/120: diffs a DESIRED full per-subject basket against the live subscription into adds / reinstatements / removes / plan_changes and prices it. due_now = the TRUE adds'' full first cycles at the sibling rate (proration retired); un-cancelling a scheduled removal before its period lapses costs nothing, and a cycle change costs nothing now and applies at that subject''s renewal.';

-- -----------------------------------------------------------------------------
-- D. The apply (backport -> 011)
-- -----------------------------------------------------------------------------
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
       now() + case v_row.iv
                 when 'week'  then interval '7 days'
                 when 'month' then interval '1 month'
                 else              interval '1 year'
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
  'Migration 109/120: applies a DESIRED full per-subject basket atomically — true adds open their own now()-anchored cycle, a subject whose scheduled removal has not yet lapsed is REINSTATED (remove_at cleared, period and price untouched, nothing charged), removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers and plan_change_states of the add/reinstate/covered split; assert_payments_enabled() gates adds and cycle changes while removals and reinstatements stay legal.';

-- -----------------------------------------------------------------------------
-- E. Grants (backport -> 011)
-- -----------------------------------------------------------------------------
-- `create or replace` PRESERVES ACLs, so the two restatements below are
-- belt-and-braces: a revoke lost here is INVISIBLE on the live database and only
-- detonates on a from-zero bootstrap, where 010's blanket grant to
-- anon/authenticated would otherwise stand. The classifier is new and genuinely
-- needs them.
revoke all on function public.plan_change_states(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_change_states(uuid, jsonb) to service_role;

revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- =============================================================================
-- Verify
-- =============================================================================
do $verify$
declare
  v_def text;
  v_con text;
begin
  -- ---- the ledger vocabulary accepts a reinstatement -----------------------
  select pg_get_constraintdef(oid) into v_con
  from pg_constraint
  where conrelid = 'public.subscription_changes'::regclass
    and conname = 'subscription_changes_change_type_check';
  if v_con is null then
    raise exception '120: the change_type CHECK is missing';
  end if;
  if position('reinstate' in v_con) = 0 then
    raise exception '120: the change_type CHECK does not accept reinstate';
  end if;
  -- The old vocabulary must survive too — narrowing it would orphan every
  -- historical row's meaning.
  if position('add' in v_con) = 0
     or position('remove' in v_con) = 0
     or position('plan_change' in v_con) = 0 then
    raise exception '120: the change_type CHECK lost a historical value';
  end if;
  -- Exactly one CHECK on this column: the DO block above drops by definition,
  -- so a leftover narrow duplicate would reject every reinstatement at INSERT.
  if (select count(*) from pg_constraint
       where conrelid = 'public.subscription_changes'::regclass
         and contype = 'c'
         and pg_get_constraintdef(oid) like '%change_type%') <> 1 then
    raise exception '120: more than one change_type CHECK survives';
  end if;

  -- ---- the classifier exists and is locked down ----------------------------
  if to_regprocedure('public.plan_change_states(uuid,jsonb)') is null then
    raise exception '120: plan_change_states is missing';
  end if;
  if has_function_privilege('anon', 'public.plan_change_states(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated',
           'public.plan_change_states(uuid,jsonb)', 'EXECUTE') then
    raise exception '120: plan_change_states is reachable from a client role';
  end if;
  if not has_function_privilege('service_role',
        'public.plan_change_states(uuid,jsonb)', 'EXECUTE') then
    raise exception '120: plan_change_states is not executable by service_role';
  end if;

  -- ---- and it carries the REINSTATEMENT PREDICATE itself -------------------
  v_def := pg_get_functiondef('public.plan_change_states(uuid,jsonb)'::regprocedure);
  if position('coalesce(ss.current_period_end, cs.current_period_end) > now()' in v_def) = 0 then
    raise exception '120: plan_change_states lost the not-lapsed predicate';
  end if;
  if position('''reinstate''' in v_def) = 0
     or position('''covered''' in v_def) = 0 then
    raise exception '120: plan_change_states no longer classifies reinstate/covered';
  end if;

  -- ---- BOTH RPCs still exist, keep their grants, and read that ONE rule ----
  if to_regprocedure('public.quote_plan_change(uuid,jsonb)') is null
     or to_regprocedure('public.apply_plan_change(uuid,jsonb,text)') is null then
    raise exception '120: a plan RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.quote_plan_change(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated',
           'public.quote_plan_change(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
           'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE') then
    raise exception '120: a plan RPC is reachable from a client role';
  end if;
  if not has_function_privilege('service_role', 'public.quote_plan_change(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role',
           'public.apply_plan_change(uuid,jsonb,text)', 'EXECUTE') then
    raise exception '120: a plan RPC lost its service_role grant';
  end if;

  v_def := pg_get_functiondef('public.quote_plan_change(uuid,jsonb)'::regprocedure);
  if position('public.plan_change_states(v_sub.id, p_items)' in v_def) = 0 then
    raise exception '120: quote_plan_change does not read plan_change_states';
  end if;
  -- due_now must be built from the TRUE ADDS only. This is the defect: a
  -- reinstatement priced as an add charges a second full period for coverage
  -- the parent already owns.
  if position('where s.state = ''add''' in v_def) = 0 then
    raise exception '120: quote_plan_change no longer restricts due_now to true adds';
  end if;
  if position('''reinstatements''' in v_def) = 0 then
    raise exception '120: quote_plan_change no longer reports reinstatements';
  end if;
  -- Migration 118's posture is untouched: nothing is split by days.
  if position('''prorated'',               false' in v_def) = 0 then
    raise exception '120: quote_plan_change no longer reports prorated = false';
  end if;

  v_def := pg_get_functiondef('public.apply_plan_change(uuid,jsonb,text)'::regprocedure);
  if position('public.plan_change_states(v_sub.id, p_items)' in v_def) = 0 then
    raise exception '120: apply_plan_change does not read plan_change_states';
  end if;
  if position('where s.state = ''reinstate''' in v_def) = 0
     or position('set remove_at = null' in v_def) = 0
     or position('''reinstate'',' in v_def) = 0 then
    raise exception '120: apply_plan_change has no reinstatement branch';
  end if;
  -- ORDER. The anchors are the STATEMENTS each loop is made of, not the
  -- `where s.state = ...` filters: those also appear in the counts query at the
  -- top of the function, where 'add' legitimately precedes 'reinstate'.
  --   `set remove_at = null`                    -> the reinstatement update
  --   `insert into public.subscription_subjects`-> the add loop
  --   `set pending_interval =`                  -> the cycle-change loop
  -- The reinstatement must precede the cycle-change loop, or a cycle change
  -- requested in the same save is silently dropped (that loop filters on
  -- remove_at is null).
  if position('set remove_at = null' in v_def)
       > position('set pending_interval =' in v_def) then
    raise exception '120: the reinstatement loop runs after the cycle-change loop';
  end if;
  -- ...and before the ADD loop, so a reinstated subject can never also be
  -- processed as a purchase.
  if position('set remove_at = null' in v_def)
       > position('insert into public.subscription_subjects' in v_def) then
    raise exception '120: the reinstatement loop runs after the add loop';
  end if;
  -- Kill-switch posture unchanged: adds and cycle changes gated, removals free,
  -- and now reinstatements free as well (v_restores is deliberately absent).
  if position('if v_adds > 0 or v_changes > 0 then' in v_def) = 0
     or position('assert_payments_enabled' in v_def) = 0 then
    raise exception '120: apply_plan_change no longer guards adds/cycle changes only';
  end if;
  if position('v_restores' in
        substring(v_def from position('if v_adds > 0' in v_def) for 60)) > 0 then
    raise exception '120: a reinstatement is being gated by the payment kill switch';
  end if;
  -- A true add still opens a FULL period at now() (013 check 105 pins this too).
  if position('now() + case v_row.iv' in v_def) = 0 then
    raise exception '120: apply_plan_change no longer opens a full period at now()';
  end if;
  -- The min-one guard must count a reinstatement as a subject that remains,
  -- or a reinstate-only basket raises last_subject and the parent cannot undo.
  if position('if v_left < 1 and v_adds < 1 and v_restores < 1 then' in v_def) = 0 then
    raise exception '120: the min-one guard ignores reinstatements';
  end if;

  -- ---- data: no reinstatement was ever logged as money ---------------------
  if exists (select 1 from public.subscription_changes
              where change_type = 'reinstate' and prorated_amount <> 0) then
    raise exception '120: a reinstate ledger row carries a non-zero amount';
  end if;

  raise notice '120 OK — un-cancelling a scheduled subject removal is a '
               'REINSTATEMENT: one classifier (plan_change_states) read by both '
               'RPCs, zero charged, period and cycle preserved, ledger widened '
               'with reinstate, kill switch still gating adds and cycle changes';
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_17_120_reinstate_cancelled_subject.sql
-- =============================================================================
