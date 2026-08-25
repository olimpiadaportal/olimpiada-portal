-- =============================================================================
-- 2026_08_25_137 — A CARD-PAID SUBSCRIPTION WAS FILED AS A COMPED GRANT.
--
-- FOUND IN REAL DATA, not by review. The first genuine end-to-end AzeriCard
-- payment through the parent checkout — order 20260825782482, RRN
-- 623779222092, 9.00 AZN, approval 517950 — redeemed cleanly: the session went
-- `paid` -> `applied` with no review note, the payment went `succeeded`, the
-- subscription went active and the child got their 8-digit id and a month of
-- access. Everything a parent would notice worked.
--
-- And the entitlement it produced said:
--
--     source = 'manual'
--
-- `manual` is the value that means SOMEBODY COMPED THIS. The one thing the
-- entitlements table exists to record — which rail paid — was wrong on the very
-- first real payment.
--
-- TWO GAPS, AND BOTH HAD TO BE CLOSED. Fixing either alone changes nothing.
--
--   1. THE STAMP WAS NEVER WRITTEN. `create_child_plan` sets
--      `child_subscriptions.provider = 'none'` because it genuinely cannot know:
--      it is reached from a comped admin grant, a free plan change and a paid
--      redemption alike. Only `checkout_redeem_plan` knows a card was charged —
--      and it said so only in its OLYMPIAD branch. `fn_entitlement_map_subject`
--      reads exactly that column:
--
--          v_src := case when v_provider = 'azericard' then 'abb_web'
--                       else 'manual' end;
--
--      so the mapper was right all along and was being told the wrong thing.
--
--   2. THE MIRROR WOULD NOT HAVE RE-FIRED. `trg_entitlements_from_child_subs`
--      is column-scoped to (status, current_period_end, current_period_start).
--      `provider` was not on that list, so stamping it would have updated the
--      subscription and left the entitlement exactly as wrong as before.
--
-- This is the SAME defect migration 127 found and fixed for olympiad purchases
-- (its finding M5, which added `provider` to trg_entitlements_from_purchases'
-- column list for precisely this reason). 127 fixed the purchase half; the
-- subscription half was never revisited.
--
-- WHY IT MATTERS BEYOND TIDINESS. `source` is how the platform answers "what did
-- ABB actually settle": every paid subscription filed as `manual` is invisible to
-- a revenue or reconciliation report, and indistinguishable from a giveaway or an
-- admin comp. CLAUDE.md makes the entitlement table provider-agnostic ON PURPOSE
-- so a forced-IAP scenario stays a two-week job; that only holds while the
-- provenance is true.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — the mirror watches `provider`, so a stamp actually re-files the grant.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_entitlements_from_child_subs on public.child_subscriptions;
create trigger trg_entitlements_from_child_subs
  after update of status, current_period_end, current_period_start, provider
  on public.child_subscriptions
  for each row
  when (old.status is distinct from new.status
        or old.current_period_end is distinct from new.current_period_end
        or old.current_period_start is distinct from new.current_period_start
        -- MIGRATION 137: the mirror must move when the thing it mirrors moves.
        or old.provider is distinct from new.provider)
  execute function public.tg_entitlements_subscription();

-- -----------------------------------------------------------------------------
-- 2 — the redemption records which rail paid.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_redeem_plan(p_order text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s        public.checkout_sessions%rowtype;
  v_q        jsonb;
  v_due      numeric(12,2);
  v_res      jsonb := '{}'::jsonb;
  v_note     text;
  v_live     uuid;
  v_sub      uuid;
  v_outcome  text;
  v_basket   jsonb;
  v_pkg      uuid;
  v_grade    uuid;
  v_cur      uuid;
  v_honoured boolean := false;
  -- Migration 127: WHAT THIS PAYMENT WILL DELIVER, computed by the redemption
  -- itself from the world as it is now. It answers the only question that
  -- matters before anything is applied -- is this still the delivery the parent
  -- authorised? -- and is then PERSISTED, because a reversal has to take back
  -- what was DELIVERED and not what was once intended.
  v_delivering jsonb;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;

  if not found then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;
  if v_s.intent_kind is null then
    -- The owner's protocol test, or a pre-125 row. Nothing to deliver, and
    -- inventing an intent for it would be worse than doing nothing.
    return jsonb_build_object('outcome', 'no_intent');
  end if;

  if v_s.redeemed_at is not null then
    return jsonb_build_object(
      'outcome', 'already',
      'redemption_status', v_s.redemption_status,
      'note', v_s.redemption_note,
      'student_profile_id', v_s.student_profile_id);
  end if;

  -- NOT PAID IS NOT A FAILURE. A pending or failed session is simply not
  -- redeemable yet; saying so without touching the row keeps a later genuine
  -- callback able to redeem it.
  if v_s.status <> 'paid' then
    return jsonb_build_object('outcome', 'not_paid', 'status', v_s.status);
  end if;

  if v_s.student_profile_id is null then
    v_note := 'student_gone';
  elsif v_s.expires_at is not null and now() > v_s.expires_at then
    -- Money was taken against an intent whose window closed. Never silently
    -- deliver it (the world has had a day to move) and never silently drop it
    -- (we are holding the family's money): record it and stop.
    v_note := 'expired';
  end if;

  if v_note is null then
    begin
      if v_s.intent_kind = 'olympiad' then
        v_pkg   := nullif(v_s.intent_items -> 0 ->> 'package_id', '')::uuid;
        v_grade := nullif(v_s.intent_items -> 0 ->> 'grade_id', '')::uuid;
        if v_pkg is null then
          v_note := 'reprice_failed:noitem';
        else
          v_q   := public.quote_olympiad_purchase(v_s.student_profile_id, v_pkg);
          v_due := (v_q->>'due_now')::numeric;
          -- WHAT WAS BOUGHT vs WHAT WOULD BE BOUGHT NOW. The entitled grade is
          -- snapshotted onto the purchase and attempts draw that pool forever,
          -- so a promoted child is a DIFFERENT PURCHASE, not a different price,
          -- and is never silently delivered.
          --
          -- Compared against the QUOTE'S OWN ANSWER rather than students.grade_id,
          -- because a LEGACY GRADE-LESS package quotes grade_id = NULL -- it
          -- sells the whole pool, not a grade. Reading the child's grade column
          -- there compared NULL against a real grade, so EVERY such purchase
          -- reported grade_changed and held the family's money for a change that
          -- had not happened. Quoting first makes both sides the same
          -- computation, which also catches the mirror case: a package whose
          -- target grades moved under a grade-less intent.
          v_cur := nullif(v_q ->> 'grade_id', '')::uuid;
          if v_grade is distinct from v_cur then
            v_note := 'grade_changed';
          else
            -- THE DELIVERY, NAMED. For a package it is the package and the
            -- entitled grade and there is nothing else it could be, so the two
            -- lines above ARE this product's delivery test -- the same question
            -- the plan branch below asks with a delta. Recorded so a reversal
            -- takes back THIS purchase rather than re-deriving one.
            v_delivering := jsonb_build_array(jsonb_build_object(
                              'package_id', v_pkg, 'grade_id', v_grade));
          end if;
        end if;
      elsif v_s.intent_kind = 'plan_start' then
        select id into v_live from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
        order by created_at desc
        limit 1;
        if v_live is not null then
          v_note := 'plan_already_live';
        else
          v_basket := v_s.intent_items;
          v_q   := public.quote_child_plan(v_s.student_profile_id, v_basket);
          v_due := (v_q->>'due_now')::numeric;
          -- THE DELIVERY IS THE FROZEN BASKET, and for this kind it cannot be
          -- anything else: there is no coverage to compose with, quote_child_plan
          -- RAISES when any entry has no active price (so the set cannot quietly
          -- shrink), and create_child_plan writes every entry it is given. Named
          -- as adds, because that is what each one is and it is what a reversal
          -- will close.
          select coalesce(jsonb_agg(jsonb_build_object(
                   'subject_id', n.subject_id, 'op', 'add',
                   'interval', n.interval::text) order by n.subject_id), '[]'::jsonb)
            into v_delivering
          from public.plan_items_normalize(v_basket) n;
        end if;
      else
        select cs.id into v_sub from public.child_subscriptions cs
        where cs.student_profile_id = v_s.student_profile_id
          and cs.status in ('trialing', 'active', 'past_due')
        order by cs.created_at desc
        limit 1;
        if v_sub is null or v_s.child_subscription_id is distinct from v_sub then
          v_note := 'subscription_changed';
        else
          -- MIGRATION 127: the CHANGE, projected onto coverage as it is NOW.
          v_basket := case when v_s.intent_delta is null
                           then v_s.intent_items
                           else public.plan_delta_project(v_sub, v_s.intent_delta) end;
          v_q   := public.quote_plan_change(v_s.student_profile_id, v_basket);
          v_due := (v_q->>'due_now')::numeric;

          -- IS THIS STILL THE DELIVERY THE PARENT AUTHORISED?
          --
          -- Re-derive the change from the projection, with the SAME function
          -- that froze it, and require the two to be identical: the same
          -- subjects, each with the same nature (add / reinstate / cycle /
          -- remove) and the same cycle. THE PRICE IS NOT THE TEST. It cannot
          -- be, and the two ways an amount-only test fails are mirror images:
          --
          --   * the delivery SHRANK. Two tabs: A froze [add Math, add English]
          --     at 18.00, B froze [add Math] at 9.00 and was paid first, so
          --     Math is already live. A now re-prices at 9.00 -- and an
          --     amount-only rule reads that as "the price moved, honour the
          --     frozen one" and charges 18.00 for a delivery worth 9.00.
          --   * the delivery GREW. A frozen FREE reinstate whose coverage
          --     lapsed in the meantime is re-classified as a paid add, so the
          --     re-price comes back HIGHER -- and the same amount-only rule
          --     honours the smaller frozen price and hands over a brand-new
          --     full cycle for nothing.
          --
          -- Both are one sentence: the honour rule is about a price MOVING and
          -- never about delivering something else. So the SET is what is
          -- compared, and the amount is a consequence -- honoured while the
          -- delivery is unchanged (the owner's decision), a human's problem
          -- when it is not.
          --
          -- A pre-127 session carries no delta, so it cannot answer this
          -- question at all; answering it on the session's behalf would be
          -- inventing an authorisation. It lands here too.
          v_delivering := public.plan_change_delta(v_sub, v_basket);
          if v_delivering is distinct from v_s.intent_delta then
            v_note := 'delivery_changed';
          end if;
        end if;
      end if;
    exception when others then
      -- A subject withdrawn from the catalog, pricing deactivated, a package
      -- taken off sale, the subscription cancelled in another tab, a package the
      -- child already owns: all land here.
      v_note := 'reprice_failed:' || sqlstate;
    end;
  end if;

  -- THE FROZEN PRICE (finding 2), and it is reached ONLY once the delivery has
  -- been shown to be the one that was authorised -- every branch above sets
  -- v_note otherwise. That ordering IS the rule: the amount is honoured because
  -- the delivery is the same, never instead of asking whether it is.
  --
  -- A zero re-price is still not a cheap delivery: it means the thing that was
  -- paid for has become free, and keeping money for something we would now give
  -- away is the other way to be dishonest.
  if v_note is null then
    if v_due is null or v_due <= 0 then
      v_note := 'no_longer_payable';
    elsif v_due is distinct from v_s.amount then
      v_honoured := true;
    end if;
  end if;

  if v_note is null then
    begin
      if v_s.intent_kind = 'olympiad' then
        v_res := public.purchase_olympiad(v_s.student_profile_id, v_pkg);
        if not coalesce((v_res->>'charged')::boolean, false) then
          -- NOTHING WAS BOUGHT. The only way here is a child who already owned
          -- the package (the quote raises `already_owned`, so this is a race
          -- rather than an ordinary path) -- and we are holding money for it.
          -- Stamping the existing purchase would misattribute somebody else's
          -- payment, so nothing is written and a person is told.
          v_note := 'already_owned';
        else
          -- WHICH RAIL PAID FOR IT, AND WHAT THE PARENT WAS CHARGED.
          --
          -- purchase_olympiad writes provider = 'none' (it has no idea how it
          -- was reached) and fn_entitlement_map_purchase reads exactly that
          -- column to decide whether the grant is abb_web or manual, so leaving
          -- it files every paid package as a COMPED one. It also records the
          -- CURRENT CATALOG price, which is not necessarily what was taken: a
          -- frozen price that was honoured leaves the purchase row and the
          -- payments row disagreeing about the same money, and the purchase row
          -- is the one a family and an accountant read. Both are corrected here
          -- rather than through a new parameter, so purchase_olympiad's
          -- signature -- and every caller of it -- stays as it is.
          --
          -- `provider` is on trg_entitlements_from_purchases' column list
          -- (migration 127), so this statement re-fires the mirror and the grant
          -- is re-filed as abb_web instead of staying a comped one.
          update public.olympiad_purchases
             set provider   = 'azericard',
                 amount     = v_s.amount,
                 currency   = coalesce(v_s.currency, 'AZN'),
                 updated_at = now()
           where id = (v_res->>'purchase_id')::uuid;
        end if;
      elsif v_s.intent_kind = 'plan_start' then
        v_res := public.create_child_plan(v_s.student_profile_id, v_basket);
        v_sub := (v_res->>'subscription_id')::uuid;
      else
        -- Keyed on the ORDER, not on the interactive path's 5-minute bucket: an
        -- order is stable across every retry this callback can receive.
        v_res := public.apply_plan_change(
                   v_s.student_profile_id, v_basket, 'checkout:' || p_order);
      end if;
    exception when others then
      -- assert_payments_enabled() flipped between the charge and the callback,
      -- a last_subject guard, a lost race: money is held, nothing was applied.
      v_note := 'apply_failed:' || sqlstate;
    end;
  end if;

  v_outcome := case when v_note is null then 'applied' else 'needs_review' end;

  update public.checkout_sessions
     set redeemed_at       = now(),
         redemption_status = v_outcome::public.checkout_redemption_status,
         redemption_note   = left(v_note, 200),
         -- WRITTEN EXACTLY ONCE, in the statement that decides the redemption,
         -- and only when something really was delivered. checkout_revoke_reversed
         -- reads THIS and nothing else, so a reversal takes back what this money
         -- bought instead of what the intent once described -- which after an
         -- honoured price, or after the world moved, are two different sets.
         delivered_items   = case when v_outcome = 'applied' then v_delivering end,
         child_subscription_id = coalesce(child_subscription_id, v_sub)
   where id = v_s.id
     and redeemed_at is null;

  if v_outcome = 'applied' and v_sub is not null then
    -- Close the loop the ledger was missing: which subscription this money
    -- bought, and which order paid for these subject changes. Both were
    -- unanswerable before, and a reconciliation report that cannot answer them
    -- is a report nobody can act on.
    update public.payments
       set child_subscription_id = v_sub,
           updated_at = now()
     where provider = 'azericard'
       and provider_ref = p_order
       and child_subscription_id is null;

    update public.subscription_changes
       set provider = 'azericard',
           provider_payment_id = p_order
     where idempotency_key = 'checkout:' || p_order
       and student_profile_id = v_s.student_profile_id;

    -- MIGRATION 137 -- WHICH RAIL PAID FOR THIS SUBSCRIPTION.
    --
    -- create_child_plan writes `provider = 'none'` because it genuinely cannot
    -- know: it is reached from a comped admin grant, a free change and a paid
    -- redemption alike. Only THIS function knows a card was charged, and until
    -- now only the OLYMPIAD branch above said so.
    --
    -- The consequence was measured, not predicted. The first real end-to-end
    -- AzeriCard payment (order 20260825782482, RRN 623779222092, 9.00 AZN) left
    -- the subscription at 'none', so fn_entitlement_map_subject took its
    -- `else` arm and filed the grant as `source = 'manual'` -- the value that
    -- means COMPED. Every card-paid subscription would have been indistinguishable
    -- from a free one, and a settlement or revenue report keyed on `source` would
    -- have shown no ABB income at all.
    --
    -- Exactly the shape migration 127 fixed for purchases (finding M5), on the
    -- half it did not reach.
    update public.child_subscriptions
       set provider   = 'azericard',
           updated_at = now()
     where id = v_sub
       and provider is distinct from 'azericard';
  end if;

  -- The ledger copy. Amounts and enum values only: no card data exists here and
  -- none is ever added. honoured_frozen_price is what makes the owner's decision
  -- auditable rather than invisible — a settlement report can find every charge
  -- that was delivered at a price the catalog had since moved off.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'redeem:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'checkout_kind', v_s.kind,
            'outcome', v_outcome,
            'note', v_note,
            'amount_paid', v_s.amount,
            'amount_repriced', v_due,
            'honoured_frozen_price', v_honoured,
            'subscription_id', v_sub,
            'olympiad_purchase_id', v_res->>'purchase_id'),
          now())
  on conflict do nothing;

  -- FINDING 6: somebody is told. After the row is decided and the ledger is
  -- written, so an alarm that fails cannot cost us the record.
  if v_outcome = 'needs_review' then
    perform public.checkout_alert_admins(p_order, coalesce(v_note, 'unknown'));
  end if;

  return jsonb_build_object(
    'outcome',            v_outcome,
    'note',               v_note,
    'student_profile_id', v_s.student_profile_id,
    'subscription_id',    v_sub,
    'purchase_id',        v_res->>'purchase_id',
    'honoured_frozen_price', v_honoured,
    -- create_child_plan allocates the deferred 8-digit login ID; the caller has
    -- to finish that by setting the synthetic auth email, which is an Auth-admin
    -- call no SQL function can make.
    'new_child_unique_id', v_res->>'new_child_unique_id',
    'auth_user_id',        v_res->>'auth_user_id');
end;
$$;

revoke all on function public.checkout_redeem_plan(text) from public, anon, authenticated;
grant execute on function public.checkout_redeem_plan(text) to service_role;

-- -----------------------------------------------------------------------------
-- 3 — REPAIR WHAT IS ALREADY WRONG.
--
-- Forward-only would leave every subscription paid before today filed as comped,
-- and those are exactly the rows a first settlement report would be checked
-- against. A subscription is re-stamped only when a SUCCEEDED azericard payment
-- points at it — the ledger is the evidence, never a guess — and the trigger
-- above then re-files its entitlements by itself.
-- -----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  update public.child_subscriptions cs
     set provider = 'azericard', updated_at = now()
   where cs.provider is distinct from 'azericard'
     and exists (select 1 from public.payments p
                  where p.child_subscription_id = cs.id
                    and p.provider = 'azericard'
                    and p.status = 'succeeded');
  get diagnostics v_n = row_count;
  raise notice '137: re-stamped % subscription(s) that a card had actually paid for', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare v_bad int;
begin
  if position('137' in pg_get_functiondef('public.checkout_redeem_plan(text)'::regprocedure)) = 0 then
    raise exception '137: checkout_redeem_plan does not stamp the subscription provider';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_entitlements_from_child_subs' and not tgisinternal
      and pg_get_triggerdef(oid) like '%provider%'
  ) then
    raise exception '137: the entitlement mirror still ignores provider changes';
  end if;

  -- Nothing paid by card may still be filed as comped.
  select count(*) into v_bad
  from public.entitlements e
  join public.payments p on p.child_subscription_id = e.child_subscription_id
  where e.source = 'manual'
    and p.provider = 'azericard'
    and p.status = 'succeeded'
    and e.revoked_at is null;
  if v_bad > 0 then
    raise exception '137: % card-paid entitlement(s) are still filed as manual', v_bad;
  end if;

  raise notice '137: paid subscriptions are filed as abb_web, and the backfill is clean';
end $$;

commit;
