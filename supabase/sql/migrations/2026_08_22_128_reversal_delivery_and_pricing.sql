-- =============================================================================
-- 2026_08_22_128 — ROUND 8: the reversal that told nobody, the price that was
--                 not there, and the purchase that notified no one.
--
-- Five defects left open at the end of round 7, plus the notification migration
-- 127 lost when it moved the olympiad purchase onto the checkout rail. They are
-- one sentence: WHAT WE TELL A HUMAN ABOUT A FAMILY'S MONEY MUST BE TRUE.
--
--   1 (HIGH) — a gateway reversal on a checkout that was DECIDED but delivered
--     nothing left the session untouched, so the review queue went on saying
--     "money held, nothing delivered" about money already returned. The obvious
--     operator response to that sentence — grant the access by hand — gives the
--     purchase away for free AFTER the refund. checkout_revoke_reversed had arms
--     for "never redeemed" and "applied" and no `else`.
--
--   2 — the reversal sweep's 24-hour window was anchored on the INTENT's
--     created_at, not the authorisation. An intent lives 24 hours, so a checkout
--     opened at 09:00 and paid at 20:00 went unwatched from 09:00 next morning
--     while the gateway still answered until 20:00.
--
--   3 — quote_plan_change priced an ADD whose subjects_pricing row had been
--     deactivated at ZERO and dropped it, silently, while the delivery test
--     (which never reads pricing) still matched. The family paid the frozen
--     price for two subjects and received one.
--
--   4 — redemption_note is a single last-writer-wins slot holding three
--     orthogonal facts; every writer destroyed the previous one. The slot keeps
--     its meaning ("the current state" — what the queue and 013 read) and the
--     history now goes to payment_events, which is append-only and already the
--     ledger for this rail.
--
--   5 — checkout_alert_admins asserted "the parent's money is with us" in an
--     alarm that a REVERSAL also files, after the money has gone back.
--
--   6 — a paid olympiad purchase notified nobody. Migration 127 routed the paid
--     path through checkout_redeem_plan and around the only notifyOlympiadPurchased
--     call site. The emit moves ONTO THE TABLE, following the precedent migration
--     068 set for attempt_graded, so every producer — free activation, bank
--     callback, redeem sweep, admin grant — notifies exactly once. A one-shot
--     BACKFILL covers the purchases already delivered since 127 went live.
--
-- NOT DONE HERE, deliberately: nothing schedules /api/payments/azericard/reconcile
-- in production. web-app/vercel.json was deleted on 2026-07-19 because Vercel
-- Hobby caps crons at once-daily and a */5 entry failed every deployment, and
-- pg_net is not installed, so pg_cron cannot call it either. Until something
-- drives that route, passes 1 and 3 of the sweep — lost-callback recovery and
-- THE REVERSAL DETECTION THIS MIGRATION IMPROVES — never run at all. That is an
-- infrastructure decision with a secret-storage question attached (the route
-- takes a bearer token), so it is reported to the owner rather than decided in
-- a migration.
--
-- Self-transacting, like 127. Every body below is backported VERBATIM into the
-- canonical file and the pair is pinned by paidOlympiad.test.ts.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 3 — an add with no active price is refused, not silently dropped.
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

revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2 — the reversal window runs from the authorisation.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_reversal_candidates(p_limit int default 50)
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
  join public.payments p
    on p.provider = cs.provider
   and p.provider_ref = cs.provider_session_id
  where cs.provider = 'azericard'
    and cs.intent_kind is not null
    and cs.status = 'paid'
    -- A payment we still believe succeeded. Once checkout_revoke_reversed has
    -- run it is 'refunded' and drops out of this list, which is what keeps the
    -- sweep from asking about the same order forever.
    and p.status = 'succeeded'
    -- INSIDE THE GATEWAY'S OWN WINDOW. Beyond 24 hours a status query cannot be
    -- answered at all, so listing the row would only produce a network call that
    -- always fails. THIS IS A REAL LIMIT AND IT IS WORTH SAYING PLAINLY: a
    -- reversal performed after the window closes is invisible to us, and the
    -- only evidence left is the settlement report. That is the acquirer's
    -- constraint, not a choice made here.
    --
    -- ROUND 8 -- THE CLOCK RUNS FROM THE AUTHORISATION, and neither created_at
    -- is that moment.
    --   cs.created_at is when the INTENT WAS OPENED, and an intent lives for a
    --   full day (INTENT_TTL_MINUTES = 24 * 60). A checkout opened at 09:00,
    --   abandoned and resumed at 20:00 re-signs the SAME order in place, so
    --   this sweep went blind at 09:00 the next morning while the gateway went
    --   on answering until 20:00 -- eleven hours in which a refund was
    --   invisible and the family kept access nobody was paying for.
    --   p.created_at is no better and fails on the same case: the reconcile
    --   sweep asks about a still-pending order five minutes after it opens, an
    --   unpaid order answers without an AMOUNT, that reconciles to 'unknown',
    --   and a payments row is written with status 'pending'. The real
    --   authorisation then takes the UPDATE branch of the upsert, and
    --   created_at stays at 09:05.
    -- p.updated_at is when we recorded the APPROVAL, and nothing moves it
    -- backwards inside this list: the revoke that moves it also sets status =
    -- 'refunded', which the conjunct above has already excluded, and the
    -- redemption's child_subscription_id write only moves it FORWARD. Forward
    -- over-asks, and an out-of-window query is not a money event -- it fails,
    -- classifies as unreadable, changes nothing, and is asked again next pass.
    and p.updated_at > now() - interval '24 hours'
    and p.updated_at < now() - interval '5 minutes'
  order by p.updated_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.checkout_reversal_candidates(int) from public, anon, authenticated;
grant execute on function public.checkout_reversal_candidates(int) to service_role;

-- -----------------------------------------------------------------------------
-- 1 — the decided-but-undelivered arm, and the note history.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_revoke_reversed(
  p_order  text,
  p_reason text default 'gateway_reversal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     public.checkout_sessions%rowtype;
  v_pkg   uuid;
  v_note  text;
  v_n     int := 0;
  v_rows  int := 0;
  v_row   record;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;
  if not found or v_s.intent_kind is null then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  v_note := left('reversed:' || coalesce(p_reason, 'gateway'), 200);

  -- IDEMPOTENT. A sweep that runs twice, or a reversal the operator repeats,
  -- must not revoke twice or file two alarms.
  if exists (
    select 1 from public.payments
    where provider = 'azericard' and provider_ref = p_order and status = 'refunded'
  ) then
    return jsonb_build_object('outcome', 'already', 'note', v_s.redemption_note);
  end if;

  -- 1. The ledger first: the money went back.
  update public.payments
     set status = 'refunded', updated_at = now()
   where provider = 'azericard' and provider_ref = p_order;

  -- 2. Take back what it bought.
  if v_s.redeemed_at is null then
    -- Nothing was ever delivered, and now nothing may be: close the session so a
    -- late callback cannot redeem a payment that has been returned.
    update public.checkout_sessions
       set redeemed_at       = now(),
           redemption_status = 'needs_review',
           redemption_note   = v_note
     where id = v_s.id and redeemed_at is null;
  elsif v_s.redemption_status = 'applied' then
    if v_s.delivered_items is null then
      -- WE DO NOT KNOW WHAT THIS PAYMENT DELIVERED, so we take nothing back.
      -- The only rows in this state are redemptions decided before
      -- delivered_items existed. Guessing from the intent is exactly the defect
      -- this column closes, and of the two ways to be wrong here — leaving
      -- access standing for money that went back, or cutting a paying family
      -- off from something a different payment bought — only the first one is
      -- recoverable by the person this note reaches.
      v_note := left('reversed:unknown_delivery:' || coalesce(p_reason, 'gateway'), 200);
    elsif v_s.intent_kind = 'olympiad' then
      v_pkg := nullif(v_s.delivered_items -> 0 ->> 'package_id', '')::uuid;
      update public.olympiad_purchases
         set status = 'refunded', updated_at = now()
       where student_profile_id = v_s.student_profile_id
         and olympiad_package_id = v_pkg
         and status = 'active';
      get diagnostics v_n = row_count;
    else
      -- ONLY THE SUBJECTS THIS MONEY BOUGHT, read from what the redemption
      -- actually APPLIED and never from the frozen intent. The two are the same
      -- set only when nothing moved between signing and redeeming; whenever
      -- they differ, the intent names a subject some OTHER payment paid for,
      -- and closing its period would be revoking access a family is owed.
      --
      -- `add` alone, in both plan kinds: a reinstatement, a cycle move and a
      -- removal cost nothing, so they are not this payment's to take back, and
      -- a plan_start's delivery is written as adds for exactly this reason.
      for v_row in
        select (e.v ->> 'subject_id')::uuid as sid
        from jsonb_array_elements(v_s.delivered_items) as e(v)
        where jsonb_typeof(e.v) = 'object'
          and e.v ->> 'op' = 'add'
          and coalesce(e.v ->> 'subject_id', '')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      loop
        update public.subscription_subjects
           set current_period_end = now(),
               remove_at = now()
         where child_subscription_id = v_s.child_subscription_id
           and subject_id = v_row.sid
           and (current_period_end is null or current_period_end > now());
        get diagnostics v_rows = row_count;
        v_n := v_n + v_rows;
      end loop;

      -- ...AND THE SUBSCRIPTION ITSELF ONLY WHEN NOTHING IS LEFT OF IT. A
      -- plan_start reversal used to cancel the subscription outright, which
      -- also killed every subject bought on it later by payments nobody
      -- reversed. The honest test is not "which kind of intent was this" but
      -- "is any coverage still standing", and it is the same test for both plan
      -- kinds — one rule instead of two.
      if v_s.child_subscription_id is not null
         and not exists (
           select 1 from public.subscription_subjects ss
            where ss.child_subscription_id = v_s.child_subscription_id
              and (ss.remove_at is null or ss.remove_at > now())
              and (ss.current_period_end is null or ss.current_period_end > now()))
      then
        update public.child_subscriptions
           set status = 'canceled', updated_at = now()
         where id = v_s.child_subscription_id
           and status in ('trialing', 'active', 'past_due');
      end if;
    end if;

    -- The status keeps saying what happened to the money at REDEMPTION time
    -- ('applied' — it was delivered). The NOTE is what says a person is needed
    -- now, which is the same split checkout_flag_redemption uses and the same
    -- one 013 check 118 reads.
    update public.checkout_sessions
       set redemption_note = v_note
     where id = v_s.id;
  else
    -- ROUND 8 -- DECIDED, AND DELIVERED NOTHING. The third reachable state, and
    -- until now the one with no arm at all: redeemed_at is set and the
    -- redemption ended in `needs_review`, so the money was taken and nothing
    -- was ever granted.
    --
    -- REVOKE NOTHING -- there is nothing to revoke, and delivered_items is NULL
    -- for exactly that reason. What was missing is the SENTENCE. With no arm
    -- here the reversal left the session untouched, so the review queue went on
    -- telling an operator "we are holding this family's money and have not
    -- delivered" about money that had already gone home -- and the obvious
    -- response to that sentence is to grant the access by hand, which gives the
    -- purchase away for free after the refund.
    --
    -- The previous note is carried in the tail rather than overwritten: it is
    -- the only record of WHY the redemption could not deliver, and left(...)
    -- truncates the tail, never the `reversed:` prefix the checks match on.
    update public.checkout_sessions
       set redemption_note = left('reversed:' || coalesce(p_reason, 'gateway') ||
                                  '|prev:' || coalesce(v_s.redemption_note, '-'), 200)
     where id = v_s.id;
  end if;

  -- 3. The ledger copy, and the alarm.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'reversed:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'reason', p_reason,
            'was_redeemed', v_s.redeemed_at is not null,
            -- ROUND 8: the note this reversal replaced. redemption_note is one
            -- last-writer-wins slot carrying three orthogonal facts -- why the
            -- redemption could not deliver, what an operator DID, and whether
            -- the money came back -- so every write destroys the previous
            -- answer. payment_events is append-only and is where the history
            -- belongs; the slot keeps meaning "the current state".
            'previous_note', v_s.redemption_note,
            'redemption_status', v_s.redemption_status,
            'producers_revoked', v_n),
          now())
  on conflict do nothing;

  perform public.checkout_alert_admins(p_order, v_note);

  return jsonb_build_object(
    'outcome', 'reversed',
    'note', v_note,
    'producers_revoked', v_n,
    'student_profile_id', v_s.student_profile_id);
end;
$$;

revoke all on function public.checkout_revoke_reversed(text, text) from public, anon, authenticated;
grant execute on function public.checkout_revoke_reversed(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4 — the note that was replaced is kept in the ledger.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_flag_redemption(
  p_order text,
  p_note  text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok   boolean := false;
  v_prev text;
begin
  update public.checkout_sessions
     set redemption_note = left(coalesce(p_note, 'flagged'), 200)
   where provider = 'azericard'
     and provider_session_id = p_order
     and intent_kind is not null
     -- A DECIDED redemption only. There is no follow-up to report on one that
     -- has not happened, and inventing a note for it would put a row in front of
     -- a human that nothing has gone wrong with yet.
     and redeemed_at is not null
  returning true, redemption_note into v_ok, v_prev;

  if coalesce(v_ok, false) then
    -- ROUND 8 -- KEEP THE NOTE THAT WAS REPLACED. redemption_note is a single
    -- slot and every writer overwrites it, so an operator arriving later sees
    -- only the newest condition and no way to learn what the redemption
    -- originally could not deliver. The slot stays the CURRENT state -- that is
    -- what the admin queue and 013 checks 118 and 123 read -- and the history
    -- goes where this rail already keeps history: the append-only ledger.
    --
    -- Best-effort, in its own block: failing to record history must never roll
    -- back the flag it describes, which is the whole point of flagging.
    begin
      insert into public.payment_events (provider, event_id, payload_json, processed_at)
      values ('azericard', 'note:' || p_order || ':' || md5(coalesce(v_prev, '')),
              jsonb_build_object(
                'order', p_order,
                'previous_note', v_prev,
                'new_note', left(coalesce(p_note, 'flagged'), 200)),
              now())
      on conflict do nothing;
    exception when others then
      raise warning 'checkout_flag_redemption: note history not kept for %: %', p_order, sqlerrm;
    end;
    perform public.checkout_alert_admins(p_order, coalesce(p_note, 'flagged'));
  end if;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.checkout_flag_redemption(text, text) from public, anon, authenticated;
grant execute on function public.checkout_flag_redemption(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5 — the alarm no longer asserts where the money is.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_alert_admins(
  p_order  text,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_n     int := 0;
begin
  if p_order is null then return 0; end if;
  begin
    for v_admin in
      select a.profile_id from public.lb_notify_audience('administrators', '{}'::jsonb) a
    loop
      perform public.create_notification(
        v_admin,
        'checkout_needs_review',
        'Ödəniş baxış tələb edir',
        -- ROUND 8: the old sentence asserted "the parent's money is with
        -- us", and this function has three callers, one of which is a
        -- gateway REVERSAL -- filed after the money has gone back. An
        -- alarm that states the wrong fact about the money is worse than
        -- one that states none: it tells the operator to go and deliver.
        'Sifariş ' || p_order || ' — səbəb: ' || coalesce(p_reason, 'naməlum') ||
          '. Ödənişin və çatdırılmanın vəziyyətini yoxlayın.',
        jsonb_build_object('order', p_order, 'reason', p_reason),
        array['in_app'],
        'ckrev:' || p_order || ':' || coalesce(p_reason, 'x'),
        1,
        '/subscriptions/checkouts',
        'billing',
        null);
      v_n := v_n + 1;
    end loop;
  exception when others then
    -- Never let the alarm break the thing it is reporting.
    raise warning 'checkout_alert_admins failed: %', sqlerrm;
  end;
  return v_n;
end;
$$;

revoke all on function public.checkout_alert_admins(text, text) from public, anon, authenticated;
grant execute on function public.checkout_alert_admins(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 6 — A PAID OLYMPIAD PURCHASE NOTIFIES THE FAMILY.
--
-- Before 127 every purchase went through purchaseOlympiadForChildCore, which
-- called notifyOlympiadPurchased. 127 split the surface: due_now > 0 now opens a
-- checkout intent and the grant happens inside checkout_redeem_plan, which never
-- called the emitter. So the ONLY purchases that notified were the free ones,
-- and a family that actually paid heard nothing.
--
-- The emit moves onto the TABLE, exactly as migration 068 did for attempt_graded
-- (see the note in web-app/src/lib/notifications/events.ts). A trigger cannot be
-- routed around by a new producer, and there are already four: free activation,
-- the bank callback, checkout_redeem_sweep, and an admin grant.
--
-- The copy is AZ-ONLY and that is deliberate, not an oversight. profiles.preferred_locale
-- is never written by web-app or mobile-app, and the purchase row has no locale
-- of its own (purchase_olympiad does not populate checkout_session_id), so
-- "localising" here would be a trilingual gesture that ships one language anyway.
-- The text is carried over verbatim from the TypeScript emitter it replaces, so
-- the two can never disagree during the deploy window.
--
-- WHEN references NEW only. `old.status is distinct from new.status` is illegal
-- on a trigger that includes INSERT and would abort this migration; the
-- idempotency key already makes a repeat a no-op, which is why the key exists.
--
-- CONSEQUENCE FOR WHOEVER RESTORES THIS TABLE: a bulk write into
-- olympiad_purchases that touches `status` now emits notifications, and this
-- repository bans both escape hatches (ALTER TABLE ... DISABLE TRIGGER and
-- session_replication_role = replica). Purchases are never bulk-created today.
-- The grade backfills in 015 update grade_id only and do not fire this trigger.
-- -----------------------------------------------------------------------------
create or replace function public.notify_olympiad_purchased_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_title text;
  v_child text;
  v_label text;
  v_base  text;
  v_data  jsonb;
begin
  begin
    select coalesce(nullif(btrim(t.title), ''), '') into v_title
      from public.olympiad_package_translations t
      where t.olympiad_package_id = new.olympiad_package_id and t.locale = 'az'
      limit 1;
    select coalesce(nullif(btrim(s.first_name), ''), '') into v_child
      from public.students s
      where s.profile_id = new.student_profile_id
      limit 1;

    v_label := coalesce(nullif(v_title, ''), 'Olimpiada paketi');
    v_base  := 'oly:' || new.student_profile_id::text || ':' || new.olympiad_package_id::text;
    -- `package_id`, not the column name, so the payload stays byte-compatible
    -- with the retired TypeScript emitter's shape.
    v_data  := jsonb_build_object(
      'student_profile_id', new.student_profile_id,
      'package_id', new.olympiad_package_id,
      'package_title', nullif(v_title, ''),
      'child_name', nullif(v_child, ''));

    -- The child, in the arena voice.
    perform public.create_notification(
      new.student_profile_id, 'olympiad_purchased', 'Yeni olimpiada paketi',
      v_label || ' paketi artıq sənin üçün açıqdır.',
      v_data, array['in_app'], v_base || ':child', 4, '/child/olympiads', 'olympiad', null);

    -- The parent who paid.
    if new.owner_parent_profile_id is not null then
      perform public.create_notification(
        new.owner_parent_profile_id, 'olympiad_purchased', 'Olimpiada paketi alındı',
        case when v_child <> ''
             then v_label || ' paketi ' || v_child || ' üçün aktivdir.'
             else v_label || ' paketi övladınız üçün aktivdir.' end,
        v_data, array['in_app'], v_base || ':parent', 4,
        '/children/' || new.student_profile_id::text || '/olympiads', 'olympiad', null);
    end if;
  exception when others then
    -- `raise warning`, never `null`: a silently broken notifier — a renamed
    -- column, a dropped FK — is invisible forever, which is the same class of
    -- failure this migration exists to close. Warning is equally rollback-safe.
    raise warning 'notify_olympiad_purchased failed for purchase %: %', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- 010 line 88 runs `alter default privileges ... grant execute on functions to
-- anon, authenticated, service_role`, so a NEW function is EXECUTE-able by anon
-- AND authenticated unless all three are named. Revoking from `public, anon`
-- alone has shipped as a hole in this repository before (migration 117).
revoke all on function public.notify_olympiad_purchased_tg() from public, anon, authenticated;

drop trigger if exists trg_notify_olympiad_purchased on public.olympiad_purchases;
create trigger trg_notify_olympiad_purchased
  after insert or update of status on public.olympiad_purchases
  for each row when (new.status = 'active')
  execute function public.notify_olympiad_purchased_tg();

-- -----------------------------------------------------------------------------
-- ONE-SHOT BACKFILL. Migration 127 is already live, so every package the paid
-- rail has delivered since then has no notification row and a trigger only fires
-- on future writes. Without this the change reads "no NEW customer is failed"
-- rather than "the defect is closed".
--
-- Re-runnable: it reuses the same idempotency keys, so create_notification
-- discards anything already sent. Per-row exception handling, because one bad
-- row must not abort a migration that has already re-issued five functions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_row   record;
  v_title text;
  v_child text;
  v_label text;
  v_base  text;
  v_data  jsonb;
  v_n     int := 0;
begin
  for v_row in
    select p.id, p.student_profile_id, p.owner_parent_profile_id,
           p.olympiad_package_id, p.status
    from public.olympiad_purchases p
    where p.status = 'active'
    order by p.created_at
  loop
    begin
      -- BOTH RECIPIENTS, exactly as the trigger writes them. A no-op self-update
      -- would fire the trigger for us but would also write an audit row per
      -- purchase, inventing a change nobody made -- so the two notifications are
      -- emitted here with the identical keys instead, and create_notification
      -- discards whichever of them already exists.
      select coalesce(nullif(btrim(t.title), ''), '') into v_title
        from public.olympiad_package_translations t
        where t.olympiad_package_id = v_row.olympiad_package_id and t.locale = 'az'
        limit 1;
      select coalesce(nullif(btrim(s.first_name), ''), '') into v_child
        from public.students s
        where s.profile_id = v_row.student_profile_id
        limit 1;

      v_label := coalesce(nullif(v_title, ''), 'Olimpiada paketi');
      v_base  := 'oly:' || v_row.student_profile_id::text || ':' || v_row.olympiad_package_id::text;
      v_data  := jsonb_build_object(
        'student_profile_id', v_row.student_profile_id,
        'package_id', v_row.olympiad_package_id,
        'package_title', nullif(v_title, ''),
        'child_name', nullif(v_child, ''));

      perform public.create_notification(
        v_row.student_profile_id, 'olympiad_purchased', 'Yeni olimpiada paketi',
        v_label || ' paketi artıq sənin üçün açıqdır.',
        v_data, array['in_app'], v_base || ':child', 4, '/child/olympiads', 'olympiad', null);

      if v_row.owner_parent_profile_id is not null then
        perform public.create_notification(
          v_row.owner_parent_profile_id, 'olympiad_purchased', 'Olimpiada paketi alındı',
          case when v_child <> ''
               then v_label || ' paketi ' || v_child || ' üçün aktivdir.'
               else v_label || ' paketi övladınız üçün aktivdir.' end,
          v_data, array['in_app'], v_base || ':parent', 4,
          '/children/' || v_row.student_profile_id::text || '/olympiads', 'olympiad', null);
      end if;
      v_n := v_n + 1;
    exception when others then
      raise warning '128 backfill: purchase % not notified: %', v_row.id, sqlerrm;
    end;
  end loop;
  raise notice '128 backfill: % active purchase(s) visited', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION — the migration proves its own claims before it commits.
-- -----------------------------------------------------------------------------
do $$
begin
  if position('missing_pricing' in pg_get_functiondef('public.quote_plan_change(uuid,jsonb)'::regprocedure)) = 0 then
    raise exception '128: quote_plan_change does not assert add pricing availability';
  end if;
  if position('p.updated_at > now()' in pg_get_functiondef('public.checkout_reversal_candidates(int)'::regprocedure)) = 0 then
    raise exception '128: reversal window is not anchored on the authorisation';
  end if;
  if position('|prev:' in pg_get_functiondef('public.checkout_revoke_reversed(text,text)'::regprocedure)) = 0 then
    raise exception '128: checkout_revoke_reversed has no decided-but-undelivered arm';
  end if;
  if position('previous_note' in pg_get_functiondef('public.checkout_flag_redemption(text,text)'::regprocedure)) = 0 then
    raise exception '128: checkout_flag_redemption does not keep the replaced note';
  end if;
  if position('bizdədir' in pg_get_functiondef('public.checkout_alert_admins(text,text)'::regprocedure)) > 0 then
    raise exception '128: the admin alarm still asserts where the money is';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.olympiad_purchases'::regclass
      and tgname = 'trg_notify_olympiad_purchased'
      and not tgisinternal
  ) then
    raise exception '128: the olympiad purchase notification trigger is not attached';
  end if;
  -- The grant hole this repository has shipped once before.
  if has_function_privilege('anon', 'public.notify_olympiad_purchased_tg()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_olympiad_purchased_tg()', 'execute') then
    raise exception '128: notify_olympiad_purchased_tg is executable by anon/authenticated';
  end if;
  raise notice '128: all checks passed';
end $$;

commit;
