-- =============================================================================
-- 2026_08_21_127_paid_olympiad_and_frozen_price.sql
-- =============================================================================
-- Migration: 2026_08_21_127_paid_olympiad_and_frozen_price.sql
-- Purpose: Close the last route to access without money, honour the price we
--          quoted, and make the two states a family can be hurt by -- money
--          taken and nothing delivered, money returned and access kept --
--          impossible to hold in silence.
--
--          SEVEN FINDINGS, ONE CHANGE. They are one change because they are one
--          sentence: THE PAYMENT CAUSES THE GRANT, THE GRANT IS WHAT WAS
--          AUTHORISED, AND NEITHER SIDE MOVES WITHOUT THE OTHER.
--
--   (1) THE OLYMPIAD PURCHASE WAS FREE. web-app/src/lib/auth/olympiadCore.ts
--       carried processOlympiadPayment, a documented MOCK that returned
--       { ok: true } unconditionally and had never been wired to anything.
--       purchase_olympiad then wrote an ACTIVE purchase, migration 124 mirrored
--       it into a LIFETIME entitlement, and no payments row existed anywhere.
--       Migration 126 closed the MOBILE half by refusing a priced package on the
--       purchase-silent surface; the WEB half stayed open and is the single
--       remaining reason the payment mode cannot be switched to real.
--
--       It is fixed the way 125 fixed the subscription: QUOTE -> INTENT ->
--       REDIRECT -> VERIFIED PAYMENT -> GRANT, through the SAME machinery.
--       checkout_intent_kind gains 'olympiad', checkout_redeem_plan gains a
--       branch, and there is still exactly ONE function in this database that
--       turns money into access. A second redemption path would be a second
--       copy of a billing rule, and a second copy mis-bills silently on the day
--       it drifts.
--
--       THE LIFETIME RULE IS UNTOUCHED. ck_entitlement_lifetime still forbids an
--       end date on a package grant, fn_entitlement_map_purchase still writes
--       ends_at = NULL, and can_view_olympiad_package still never reads the
--       package's own catalog status -- an ARCHIVED package a family bought
--       stays visible to them forever (CLAUDE.md non-negotiable).
--
--   (2) THE FROZEN PRICE IS THE PRICE (owner decision, 2026-08-21). Paying for
--       child A moves child B's sibling tier, which invalidated B's
--       already-signed intent: B's money was taken and the redemption landed in
--       needs_review over a few AZN. The owner's decision is that the price we
--       quoted is the price the parent pays. So redemption no longer demands
--       exact equality.
--
--       WHERE THE LINE IS DRAWN, and why it is drawn there:
--         * BEFORE the money moves, we still re-price and REFUSE
--           (checkout_intent_price, unchanged). A parent about to pay should see
--           today's number, and refusing costs them nothing.
--         * AFTER the money moves, a differing amount is HONOURED, recorded in
--           the ledger as honoured_frozen_price, and delivered. The exposure is
--           the window between SIGNING and REDEEMING -- minutes -- because the
--           sign-time re-price already refused anything staler.
--         * A basket that no longer prices AT ALL still goes to a human: a
--           withdrawn subject, a deactivated pricing row, a package taken off
--           sale, a child whose grade moved, a subscription that vanished. Those
--           are not price differences; they are DIFFERENT DELIVERIES, and
--           delivering something other than what was authorised is the failure
--           this whole family of migrations exists to prevent.
--         * A re-price that comes back at ZERO also goes to a human
--           (no_longer_payable). It means the thing the parent paid for has
--           become free -- a trial that opened, a subject already reinstated --
--           and keeping money for something we would now give away is the other
--           way to be dishonest.
--
--   (3) THE WEB FREE BRANCH USED THE UNGUARDED RPC. subscribeChild and
--       updateSubscriptionSubjectsAction quoted, saw due_now = 0, and then
--       called apply_plan_change / create_child_plan -- the exact quote-then-
--       apply race migration 126 declared indefensible from an app server,
--       because prices, the sibling tier and launch_promo_config.trial_days can
--       all move between the two calls under READ COMMITTED. The _if_free
--       wrappers already existed. The web now uses them too, and after this
--       migration NO application code path names a priced apply RPC at all: the
--       priced functions are reachable only from inside checkout_redeem_plan,
--       i.e. only behind a verified payment. purchase_olympiad_if_free is added
--       so the olympiad path has the same shape.
--
--   (4) TWO TRIAL EDGES.
--         (a) quote_plan_change and apply_plan_change read status = 'trialing'
--             as "a trial is running". A subscription whose trial_ends_at has
--             PASSED but whose status has not yet been swept therefore priced
--             every addition at zero and applied it as trial-time -- free, for
--             as long as the row stayed stale.
--         (b) a trial-time addition is capped at trial_ends_at with no check
--             that it is still in the future, so an add could be applied free
--             with an ALREADY-EXPIRED end (granting nothing, and charging
--             nothing for it -- the parent pays zero and receives zero).
--       Both are one predicate: A TRIAL IS RUNNING ONLY WHILE trial_ends_at IS
--       IN THE FUTURE. Quote and apply share it, so H7 still holds, and a
--       lapsed trial now prices an add as the full paid cycle it is.
--
--   (5) A STALE FROZEN BASKET COULD UN-CANCEL A SUBJECT. The intent froze the
--       FULL DESIRED BASKET. Resume it after the parent has cancelled a subject
--       and plan_change_states classifies that subject as a REINSTATEMENT: the
--       payment for something else silently withdrew a cancellation. The mirror
--       image was true too -- a subject the parent added in another tab after
--       the intent was absent from the frozen basket and would have been
--       SCHEDULED FOR REMOVAL by it.
--
--       THE RULE: A PAYMENT AUTHORISES A CHANGE, NOT A WORLD. An absolute
--       basket is a claim about the whole plan at a past moment, and applying it
--       later necessarily overwrites everything that happened since. So a
--       plan_change intent now freezes the DELTA the parent authorised --
--       add / reinstate / cycle / remove, per subject -- and redemption
--       PROJECTS that delta onto CURRENT coverage (plan_delta_project). A change
--       composes with whatever else happened; a snapshot cannot.
--
--       intent_items is KEPT and still frozen: it is the evidence of what the
--       parent was looking at. intent_delta is what is applied. Choosing between
--       them at redeem time is the difference between "deliver the plan they had
--       in mind" and "deliver the change they paid for", and only the second one
--       is safe to do later.
--
--       ONE RESIDUAL, STATED: a frozen remove still acts on a subject the parent
--       re-acquired in between. Re-acquiring costs money and therefore needs its
--       own checkout inside the same minutes-wide window, and a removal is
--       SCHEDULED for that subject's own period end and is undone for free by a
--       reinstatement -- so this is bounded and recoverable, which the un-cancel
--       it replaces was not.
--
--   (6) needs_review REACHED NOBODY. 013 check 118 counts them, and 013 is run
--       by a human who already suspects something. A redemption that cannot be
--       delivered is money we are holding, so checkout_alert_admins() now files
--       a PRIORITY 1 notification to every administrator the moment one is
--       recorded -- from redemption, from a flagged follow-up, and from a
--       reversal. Priority 1 is deliberate: create_notification lets a recipient
--       silence in-app notices, and it explicitly refuses to silence priority 1.
--       Silence is the failure mode this finding is about.
--
--   (7) A REVERSAL WAS INVISIBLE. Found during the live bank test on 2026-08-21,
--       reversing RRN 623279219080 (TRTYPE=22). Two undocumented facts, learned
--       from the terminal and not from the spec:
--         * the gateway answers a reversal with the single character 1;
--         * a status query with TRAN_TRTYPE=1 reports the ORIGINAL authorisation
--           as actionCode=0 / Approved FOREVER. The reversal is visible only
--           when querying with TRAN_TRTYPE=22.
--       So our reconciliation would have kept an entitlement live for money that
--       had been returned. The web sweep now also asks about TRTYPE=22, and
--       checkout_revoke_reversed() expresses the revocation ON THE PRODUCER --
--       an olympiad purchase becomes refunded, a subject period is closed at
--       now() -- so migration 124's mirror revokes the entitlement rather than
--       this function reaching into entitlements directly.
--
-- WHAT THE REVIEW OF THIS FILE THEN FOUND, and what it changed. None of it is
--          a new feature; each one is a place where the sentence above was
--          written down as a WEAKER test than the sentence itself.
--
--   (A) THE HONOUR RULE ASKED ABOUT THE AMOUNT. "The frozen price is the price"
--       was implemented as "the amounts differ, therefore the price moved", and
--       that is wrong in BOTH directions. A delivery that SHRANK (a second tab
--       delivered half the basket first) re-prices lower and was charged the
--       larger frozen amount; a delivery that GREW (a free reinstatement whose
--       coverage lapsed is now a paid add) re-prices higher and was handed over
--       at the smaller frozen amount. One fix, not two: redemption re-derives
--       the change from the projection with the SAME function that froze it and
--       requires the two to be IDENTICAL -- same subjects, same nature, same
--       cycle -- and only then honours whatever the price has become. The
--       amount is a consequence of the delivery test, never a substitute for
--       it, and checkout_intent_price asks the same question before signing.
--
--   (B) A REVERSAL REVOKED THE INTENT, NOT THE DELIVERY. checkout_revoke_reversed
--       closed the periods of the FROZEN delta's `add` entries -- the one set
--       that is provably not what happened whenever anything moved. The
--       redemption knows what it applied, so it now WRITES it
--       (checkout_sessions.delivered_items) and the reversal revokes from that.
--       A plan_start reversal also stopped cancelling the whole subscription:
--       the test is "is any coverage still standing", which is one rule for
--       both plan kinds instead of a branch on the intent kind.
--
--   (C) checkout_intent_price COMPARED THE FROZEN GRADE WITH students.grade_id,
--       so every LEGACY GRADE-LESS package (which quotes grade_id = NULL)
--       re-priced as `grade_changed`: no checkout could be resumed, and the
--       duplicate-purchase guard on that path went with it. It now compares
--       against the QUOTE'S grade, exactly as redemption already did.
--
--   (D) THE PROVIDER STAMP RE-FIRED NOTHING. trg_entitlements_from_purchases is
--       column-scoped and `provider` was not on the list, so a paid package
--       stayed filed as a comped `manual` grant and paid revenue was invisible
--       to every report keyed on `source`. The column is on the list now.
--
--   (E) TWO SMALLER ONES, same shape. The olympiad purchase recorded the
--       CURRENT CATALOG price instead of what the parent was charged, so an
--       honoured price left the purchase row and the payments row disagreeing;
--       it now records the amount taken. And a checkout whose child profile was
--       deleted mid-flight skipped redemption entirely and showed the parent a
--       SUCCESS page (the web callback keyed "is this a family checkout" on the
--       column the FK NULLs) -- redemption now runs, answers `student_gone`,
--       and the parent is told the payment is not finished.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It enables no payment flag
--          (production stays off), adds no card or token column, gives nothing a
--          direct write path into entitlements, grants no new EXECUTE to anon or
--          authenticated, and does not edit migrations 124, 125 or 126 -- those
--          are APPLIED to production, and editing an applied file diverges the
--          canonical record from the live database in silence.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql -- checkout_intent_kind gains
--                    'olympiad';
--          * 007_subscriptions_payments_coupons.sql -- checkout_sessions.
--                    intent_delta, checkout_sessions.delivered_items and the
--                    re-issued ck_checkout_intent_shape;
--          * 015_olympiad_preparation.sql -- trg_entitlements_from_purchases
--                    re-created with `provider` on its column list, so the paid
--                    rail is mirrored as abb_web instead of a comped grant;
--          * 011_indexes_constraints_functions_triggers.sql -- the re-issued
--                    fn_checkout_intent_immutable, quote_plan_change,
--                    apply_plan_change, purchase_olympiad, checkout_intent_open,
--                    checkout_intent_price, checkout_redeem_plan,
--                    checkout_flag_redemption, checkout_redeem_sweep, and the
--                    NEW plan_change_delta, plan_delta_project,
--                    quote_olympiad_purchase, purchase_olympiad_if_free,
--                    checkout_alert_admins, checkout_reversal_candidates,
--                    checkout_revoke_reversed, admin_resolve_checkout_review --
--                    each with its revoke/grant pair;
--          * 013_validation_queries.sql -- NEW checks 121, 122 and 123, and an
--                    amendment to check 118: a redemption whose note starts with
--                    `resolved:` is no longer counted as waiting on a human,
--                    because otherwise the alarm has no off switch (there are
--                    only two redemption statuses and neither means "settled by
--                    a person").
-- Backport status: completed
-- Destructive change: no. Two additive columns, one additive enum value, one
--          trigger re-created with a wider column list, nine function bodies
--          replaced and seven added. No row is deleted, no column dropped, no
--          grant withdrawn.
-- Rollback notes:
--          1. Restore fn_checkout_intent_immutable, quote_plan_change,
--             apply_plan_change, purchase_olympiad, checkout_intent_open,
--             checkout_intent_price, checkout_redeem_plan,
--             checkout_flag_redemption and checkout_redeem_sweep from git
--             (011, at migration 126).
--          2. drop function public.admin_resolve_checkout_review(text,text),
--                           public.checkout_revoke_reversed(text,text),
--                           public.checkout_reversal_candidates(int),
--                           public.checkout_alert_admins(text,text),
--                           public.purchase_olympiad_if_free(uuid,uuid),
--                           public.quote_olympiad_purchase(uuid,uuid),
--                           public.plan_delta_project(uuid,jsonb),
--                           public.plan_change_delta(uuid,jsonb);
--          3. Re-create trg_entitlements_from_purchases without `provider` on
--             its column list (015, at migration 124).
--          4. LEAVE the columns and the enum value. Dropping intent_delta
--             discards the evidence of what a paid session authorised,
--             dropping delivered_items discards the record of what each payment
--             delivered -- which is what a later reversal has to revoke from --
--             and an enum value cannot be removed without rewriting the type.
--          Rolling back (2) re-opens finding 1: the web olympiad purchase would
--             have to be reverted in the same step or it will 404 on its own RPC.
--
-- SELF-TRANSACTING. This file wraps itself in begin/commit, matching migrations
-- 120-126. It must NEVER be sourced inside a from-zero rebuild -- that is the
-- CLAUDE.md rule migration 095 exists to enforce. Run bare, against staging
-- first, then production.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. checkout_intent_kind gains 'olympiad'  (backport -> 001)
-- -----------------------------------------------------------------------------
-- READ THIS BEFORE ADDING ANYTHING THAT MENTIONS THE NEW VALUE IN THIS FILE.
-- PostgreSQL allows ALTER TYPE ... ADD VALUE inside a transaction block, but the
-- new value CANNOT BE USED until that transaction commits ("unsafe use of new
-- value of enum type"). A "use" is anything the server EVALUATES here: an index
-- predicate, a CHECK, a DO block, and the body of an SQL-language function
-- (which is parse-analysed at CREATE time -- unlike plpgsql, which is not).
--
-- Everything below therefore mentions 'olympiad' ONLY inside plpgsql bodies,
-- whose expressions are prepared on first execution, after this commit. The
-- verification block at the end reads pg_enum as a CATALOG, never as a value.
alter type public.checkout_intent_kind add value if not exists 'olympiad';

-- -----------------------------------------------------------------------------
-- 2. The authorised CHANGE, frozen beside the basket  (backport -> 007)
-- -----------------------------------------------------------------------------
alter table public.checkout_sessions
  add column if not exists intent_delta jsonb;

comment on column public.checkout_sessions.intent_delta is
  'Migration 127. The CHANGE the parent authorised, per subject: '
  '[{subject_id, op, interval}] with op in add|reinstate|cycle|remove. Frozen '
  'with the rest of the intent and PROJECTED onto current coverage at redeem '
  '(plan_delta_project), so a payment delivers the change that was paid for '
  'instead of restoring a snapshot of the whole plan -- which is how an '
  'abandoned checkout could un-cancel a subject the parent had since cancelled. '
  'NULL for plan_start (there is no coverage to compose with), for an olympiad '
  'intent, and for every plan_change row written before 127 -- a row with no '
  'delta cannot be shown to deliver what it authorised, so redemption refuses '
  'it rather than guessing.';

-- WHAT THE PAYMENT ACTUALLY DELIVERED, written once, at the moment it is
-- delivered. It is a SEPARATE column from intent_delta and must stay one: the
-- two differ whenever the world moved between signing and redeeming, and a
-- reversal that revokes from the INTENT closes the period of a subject a
-- DIFFERENT payment paid for (that was the defect). Read the comment on
-- checkout_revoke_reversed for the whole argument.
alter table public.checkout_sessions
  add column if not exists delivered_items jsonb;

comment on column public.checkout_sessions.delivered_items is
  'Migration 127. What this payment ACTUALLY delivered, recorded by '
  'checkout_redeem_plan in the same statement that stamps redeemed_at: '
  '[{subject_id, op, interval}] for a plan (the change as it was applied), '
  '[{package_id, grade_id}] for an olympiad package. A REVERSAL revokes from '
  'THIS and never from the frozen intent -- revoking from the intent takes '
  'back a subject some other payment paid for. NULL means nothing was '
  'delivered, or the redemption predates this column; either way a reversal '
  'must take nothing back and ask for a human instead.';

comment on column public.checkout_sessions.redemption_note is
  'Why a redemption needs a human: expired | student_gone | plan_already_live | '
  'subscription_changed | grade_changed | delivery_changed | already_owned | '
  'no_longer_payable | reprice_failed:<sqlstate> | apply_failed:<sqlstate> | '
  'child_login_email_failed | reversed:<reason>. The last two sit on an APPLIED '
  'row -- the plan was delivered and only the child login needs repairing, or '
  'the payment was later reversed at the gateway -- so a note is what marks "a '
  'human is needed", not the status. An operator closes one with '
  'admin_resolve_checkout_review, which rewrites it as resolved:<what they '
  'did>. Migration 127 removed price_changed: a moved price is HONOURED at the '
  'amount that was quoted (owner decision), and only a DIFFERENT DELIVERY -- '
  'the re-derived change differing from the frozen delta -- still needs a '
  'person.';

-- Re-issued from 125 with ONE added conjunct: the delta, when present, is a
-- bounded array. Everything else is the constraint 125 installed, verbatim -- a
-- CHECK is re-evaluated on every UPDATE, including the FK's ON DELETE SET NULL,
-- so the deliberate omission of `student_profile_id is not null` documented
-- there still stands and must not be "fixed" here.
alter table public.checkout_sessions
  drop constraint if exists ck_checkout_intent_shape;
alter table public.checkout_sessions
  add constraint ck_checkout_intent_shape check (
    intent_kind is null
    or (    intent_items is not null
        and jsonb_typeof(intent_items) = 'array'
        and jsonb_array_length(intent_items) between 1 and 20
        and expires_at is not null
        and amount is not null
        and amount > 0
        and (intent_delta is null
             or (jsonb_typeof(intent_delta) = 'array'
                 and jsonb_array_length(intent_delta) <= 40))
        and (delivered_items is null
             or (jsonb_typeof(delivered_items) = 'array'
                 and jsonb_array_length(delivered_items) <= 40))));

-- -----------------------------------------------------------------------------
-- 3. The intent freeze covers the delta too  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 125 with intent_delta added to the frozen column list, for
-- exactly the reason the others are on it: this is now the field that decides
-- WHAT IS DELIVERED, so an UPDATE that moved it would let a signed payment
-- deliver something else with the signature still verifying. delivered_items
-- joins it on the other side of the same sentence: once a redemption has said
-- what it delivered, that record is what a reversal revokes from, and it may
-- not move either. The two one-way holes (the FK may NULL
-- student_profile_id; an operator may move a needs_review to applied) are
-- unchanged.
create or replace function public.fn_checkout_intent_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.intent_kind is null then
    return new;                      -- no intent: nothing to protect
  end if;

  if new.intent_kind             is distinct from old.intent_kind
     or new.intent_items         is distinct from old.intent_items
     or new.intent_delta         is distinct from old.intent_delta
     or new.amount               is distinct from old.amount
     or new.currency             is distinct from old.currency
     or new.kind                 is distinct from old.kind
     or new.provider             is distinct from old.provider
     or new.provider_session_id  is distinct from old.provider_session_id
     or new.expires_at           is distinct from old.expires_at
     or new.owner_parent_profile_id is distinct from old.owner_parent_profile_id
     or (new.student_profile_id is distinct from old.student_profile_id
         and new.student_profile_id is not null)
  then
    raise exception 'checkout: the intent and its price are frozen once opened'
      using errcode = 'check_violation', hint = 'checkout_intent_frozen';
  end if;

  if old.redeemed_at is not null
     and (new.redeemed_at is null
          -- delivered_items is written EXACTLY ONCE, by the statement that
          -- stamps redeemed_at. After that it is the record a reversal revokes
          -- from, so an UPDATE that moved it would let a refund take back a
          -- subject some other payment paid for -- the mirror of the defect
          -- the column exists to close.
          or new.delivered_items is distinct from old.delivered_items
          or (old.redemption_status = 'applied'
              and new.redemption_status is distinct from old.redemption_status))
  then
    raise exception 'checkout: a decided redemption cannot be undone'
      using errcode = 'check_violation', hint = 'checkout_redemption_decided';
  end if;

  return new;
end;
$$;

comment on function public.fn_checkout_intent_immutable() is
  'Migration 125/127. Freezes the signed intent (child, basket, DELTA, amount, '
  'currency, order, expiry, owner), forbids un-deciding a redemption, and pins '
  'delivered_items once written -- it is what a reversal takes back, so moving '
  'it would let a refund revoke a subject another payment paid for. Two '
  'one-way exceptions: the FK cascade may NULL student_profile_id, and an '
  'operator may move a needs_review to applied.';

-- A trigger function is never called directly. Line 88 of 010 default-grants
-- EXECUTE to anon AND authenticated, so all three are named here.
-- `create or replace` PRESERVES ACLs, so this is not strictly required on a
-- live database -- carrying it explicitly is the house rule, not an
-- optimisation, and it is what keeps the from-zero rebuild identical.
revoke all on function public.fn_checkout_intent_immutable()
  from public, anon, authenticated;

drop trigger if exists trg_checkout_intent_immutable on public.checkout_sessions;
create trigger trg_checkout_intent_immutable
  before update on public.checkout_sessions
  for each row execute function public.fn_checkout_intent_immutable();

-- -----------------------------------------------------------------------------
-- 4. A payment authorises a CHANGE, not a WORLD  (backport -> 011)
-- -----------------------------------------------------------------------------
-- THE DEFECT THESE TWO FUNCTIONS EXIST FOR. A plan_change intent froze the FULL
-- DESIRED BASKET. That is an absolute claim about the whole plan at one past
-- moment, and applying it later overwrites everything that happened since:
--
--   * the parent cancels a subject after opening the checkout, then pays -- the
--     frozen basket still names that subject, plan_change_states classifies it
--     as a REINSTATEMENT, and the cancellation is silently withdrawn by a
--     payment made for something else;
--   * the mirror image, which is worse and was never reported: a subject the
--     parent acquired AFTER the intent is absent from the frozen basket, so
--     redeeming it would SCHEDULE THAT SUBJECT FOR REMOVAL.
--
-- Neither is fixable by validating the basket at redeem time, because the basket
-- cannot say which of its entries were the point. The fix is to freeze what the
-- parent actually authorised -- the CHANGE -- and compose it with whatever the
-- plan looks like when the money lands. A change composes; a snapshot cannot.
--
-- WHY NOT SIMPLY "APPLY ONLY THE ADDS". Because a single Save can add a subject
-- (priced), un-cancel another (free), move a third to yearly (free) and drop a
-- fourth (free). The parent clicked once. Delivering only the priced part would
-- honour a quarter of what they asked for and leave the rest quietly undone.
--
-- WHY THE OPS ARE THESE FOUR. They are exactly the four things apply_plan_change
-- does, named the same way, so this is a description of that function's own
-- behaviour rather than a second model of a plan that has to be kept in step.
create or replace function public.plan_change_delta(
  p_child_subscription_id uuid,
  p_items                 jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sub as (
    -- ALIASED, not `cs.interval`. The implicit output name would be `interval`,
    -- which the parser also reads as the start of a type in several positions;
    -- plan_items_normalize already had to quote it in a RETURNS TABLE for that
    -- reason. Naming it here costs nothing and removes the question.
    select cs.id, cs.interval as default_iv
    from public.child_subscriptions cs
    where cs.id = p_child_subscription_id
  ), st as (
    select s.subject_id, s.interval, s.state
    from public.plan_change_states(p_child_subscription_id, p_items) s
  ), live as (
    -- Coverage as it stands: a row scheduled for removal is NOT live, which is
    -- what makes an un-cancel a 'reinstate' op below rather than a no-op.
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, (select sub.default_iv from sub)) as eff
    from public.subscription_subjects ss
    where ss.child_subscription_id = p_child_subscription_id
      and ss.remove_at is null
  ), ops as (
    -- What the parent asked to GAIN. 'add' is the priced half; 'reinstate' is
    -- free (migration 120) and carries the DESIRED cycle, so un-cancelling onto
    -- another cycle survives the round trip.
    select st.subject_id, st.interval::text as iv,
           case when st.state = 'add' then 'add' else 'reinstate' end as op
    from st
    where st.state in ('add', 'reinstate')
    union all
    -- A cycle move on a subject that stays. Scheduled, never charged.
    select st.subject_id, st.interval::text, 'cycle'
    from st
    join live on live.subject_id = st.subject_id
    where st.state = 'covered'
      and st.interval::text is distinct from live.eff::text
    union all
    -- What the parent asked to DROP: live now and absent from the desired set.
    select live.subject_id, null::text, 'remove'
    from live
    where not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = live.subject_id)
  )
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'subject_id', ops.subject_id, 'op', ops.op, 'interval', ops.iv)
             order by ops.op, ops.subject_id),
           '[]'::jsonb)
  from ops;
$$;

comment on function public.plan_change_delta(uuid, jsonb) is
  'Migration 127: the CHANGE a desired basket represents against the live subscription, as [{subject_id, op, interval}] with op in add|reinstate|cycle|remove. Derived from plan_change_states, the same classifier quote_plan_change and apply_plan_change read, so the frozen change and the priced change are one thing. Frozen on checkout_sessions.intent_delta and replayed by plan_delta_project.';

revoke all on function public.plan_change_delta(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_change_delta(uuid, jsonb) to service_role;

-- The other half: replay a frozen change against coverage AS IT IS NOW, and
-- hand back the absolute basket quote_plan_change / apply_plan_change take.
--
-- READ THE RULES OFF THE QUERY:
--   * everything LIVE right now stays, at its own effective cycle -- so a
--     subject the parent added after the intent is never removed by it;
--   * a frozen 'cycle' (or a frozen 'add'/'reinstate' for a subject that is
--     already live again) overrides that cycle, because the parent chose it;
--   * a frozen 'remove' drops a subject only if it is still live -- if the
--     parent already removed it themselves there is nothing to do;
--   * a frozen 'add'/'reinstate' for a subject that is NOT live is re-injected,
--     because that is the thing the money bought;
--   * everything NOT mentioned by the delta and not live is simply absent, which
--     is how a cancellation made after the intent survives the redemption.
--
-- THE ONE RESIDUAL, deliberately left: a frozen 'remove' still acts on a subject
-- the parent re-acquired in between. Re-acquiring is priced, so it needs its own
-- checkout inside the same minutes-wide window; and a removal is SCHEDULED for
-- that subject's own period end and is undone for free by a reinstatement. It is
-- bounded and recoverable, which the un-cancel it replaces was not.
create or replace function public.plan_delta_project(
  p_child_subscription_id uuid,
  p_delta                 jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sub as (
    -- See plan_change_delta: aliased so the CTE never exposes a column literally
    -- called `interval`.
    select cs.id, cs.interval as default_iv
    from public.child_subscriptions cs
    where cs.id = p_child_subscription_id
  ), d as materialized (
    -- Shape-validated on the way in. A malformed entry is DROPPED rather than
    -- guessed at: the delta is our own frozen writing, so anything unreadable is
    -- corruption, and acting on corruption is how a payment delivers a plan
    -- nobody chose. The empty result then fails loudly in apply_plan_change
    -- (last_subject) instead of quietly doing something else.
    --
    -- MATERIALIZED, deliberately. The uuid cast sits in the target list and the
    -- shape test sits in the WHERE, and "the WHERE runs first" is a planner
    -- behaviour rather than a promise. Pinning the CTE keeps the filter and the
    -- cast in the order they are written, so a corrupt entry is dropped instead
    -- of raising 22P02 out of a redemption.
    select (e.v ->> 'subject_id')::uuid as subject_id,
           nullif(e.v ->> 'interval', '') as iv,
           e.v ->> 'op' as op
    from jsonb_array_elements(coalesce(p_delta, '[]'::jsonb)) as e(v)
    where jsonb_typeof(e.v) = 'object'
      and coalesce(e.v ->> 'subject_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and coalesce(e.v ->> 'op', '') in ('add', 'reinstate', 'cycle', 'remove')
      and (e.v ->> 'op' = 'remove'
           or coalesce(e.v ->> 'interval', '') in ('week', 'month', 'year'))
  ), live as (
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, (select sub.default_iv from sub))::text as eff
    from public.subscription_subjects ss
    where ss.child_subscription_id = p_child_subscription_id
      and ss.remove_at is null
  ), kept as (
    select live.subject_id,
           coalesce((select d.iv from d
                      where d.subject_id = live.subject_id
                        and d.op in ('cycle', 'add', 'reinstate')
                      limit 1),
                    live.eff) as iv
    from live
    where not exists (
      select 1 from d where d.subject_id = live.subject_id and d.op = 'remove')
  ), regained as (
    select d.subject_id, d.iv
    from d
    where d.op in ('add', 'reinstate')
      and d.iv is not null
      and not exists (select 1 from live where live.subject_id = d.subject_id)
  ), basket as (
    select subject_id, iv from kept
    union all
    select subject_id, iv from regained
  )
  select coalesce(
           jsonb_agg(jsonb_build_object('subject_id', basket.subject_id,
                                        'interval',   basket.iv)),
           '[]'::jsonb)
  from basket;
$$;

comment on function public.plan_delta_project(uuid, jsonb) is
  'Migration 127: replays a frozen plan_change delta against coverage AS IT IS NOW and returns the absolute basket the plan RPCs take. Live subjects are kept (so a subject added after the intent is never removed by it), a frozen remove drops one only while it is still live, and a frozen add/reinstate is re-injected -- so a cancellation the parent made after opening the checkout survives the payment instead of being silently withdrawn by it.';

revoke all on function public.plan_delta_project(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_delta_project(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 5. quote_plan_change: a lapsed trial is not a trial  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 011 (at migration 126) with THREE changes, all documented at
-- the lines themselves: the trial predicate, the named `adds` list an intent
-- freezes, and the sibling `rank` the parent is shown beside the saving.
-- `create or replace` PRESERVES ACLs, but the revoke/grant pair is re-issued
-- below anyway -- carrying it explicitly is the house rule, not an optimisation.
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

comment on function public.quote_plan_change(uuid, jsonb) is
  'Migration 109/120/126/127: diffs a DESIRED full per-subject basket against the live subscription into adds / reinstatements / removes / plan_changes and prices it. due_now = the TRUE adds'' full first cycles at the sibling rate (proration retired); un-cancelling a scheduled removal before its period lapses costs nothing, and a cycle change costs nothing now and applies at that subject''s renewal. Migration 127: a trial counts as running only while trial_ends_at is in the FUTURE (a swept-late status can no longer make every addition free), and the answer additionally carries adds[], rank and trialing -- the first so a checkout can freeze the CHANGE rather than a snapshot, the second so the parent sees which child earned the discount.';

revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 6. apply_plan_change: the same trial predicate  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 011 (at migration 126) with ONE change: the ADD loop's period
-- is decided by v_trialing, the predicate quote_plan_change computes, instead of
-- the raw status. That closes both halves of finding 4 in one line -- a lapsed
-- trial can no longer make an addition free, and a trial-bounded period can no
-- longer be written already-expired.
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
  -- Migration 127: the same predicate quote_plan_change computes.
  v_trialing boolean;
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

  -- MIGRATION 127 -- A LAPSED TRIAL IS NOT A TRIAL. Identical to the
  -- predicate quote_plan_change uses; see the long note there. Computing it
  -- once here also proves trial_ends_at is non-null and in the FUTURE, which
  -- is what lets the ADD loop below use it directly instead of a coalesce
  -- chain that could land on an already-expired date.
  v_trialing := v_sub.status = 'trialing'
                and v_sub.trial_ends_at is not null
                and v_sub.trial_ends_at > now();

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
       -- MIGRATION 127: v_trialing, not the raw status -- and therefore
       -- trial_ends_at directly. The coalesce chain this replaces existed to
       -- fail closed on a legacy trialing row with no dates; the predicate now
       -- excludes exactly those rows, so they take the paid branch and are
       -- priced, which is the honest answer rather than a period of zero
       -- length granted for free.
       case when v_trialing
              then v_sub.trial_ends_at
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
  'Migration 109/120/126/127: applies a DESIRED full per-subject basket atomically — true adds open their own now()-anchored cycle, a subject whose scheduled removal has not yet lapsed is REINSTATED (remove_at cleared, period and price untouched, nothing charged), removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers and plan_change_states of the add/reinstate/covered split; assert_payments_enabled() gates adds and cycle changes while removals and reinstatements stay legal. Migration 127: an add rides the trial only while the trial is genuinely still running (trial_ends_at in the future), so a stale trialing row can neither make an addition free nor open a period that has already ended.';

revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- 7. The olympiad quote -- the preview IS the charge  (backport -> 011)
-- -----------------------------------------------------------------------------
-- WHY THIS EXISTS AT ALL. Until now the olympiad price was read by the WEB APP
-- straight off olympiad_packages and handed to a mock that always approved.
-- There was no single computation that both previewed and charged, so audit
-- invariant H7 simply did not apply to this product.
--
-- It re-states purchase_olympiad's OWN guards, in the same order, read-only:
-- the child has an owning parent, the package exists, it is on sale
-- (olympiad_package_on_sale -- the one canonical predicate), the package's
-- target grades include the child's CURRENT grade, and the child does not
-- already own it. Every refusal carries the hint the web layer already maps, so
-- the intent path answers a parent with the same sentences the direct purchase
-- did.
--
-- IT DOES NOT ASSERT THE PAYMENT MODE. A quote moves no money, and the kill
-- switch belongs on the writes: checkout_intent_open calls
-- assert_payments_enabled() before it opens anything, and purchase_olympiad
-- calls it before it grants anything.
--
-- THE GRADE IS PART OF THE ANSWER, not a detail. purchase_olympiad SNAPSHOTS the
-- child's grade onto the purchase and attempts draw that grade's pool forever,
-- so "which grade" is part of WHAT IS BEING BOUGHT. The intent freezes it and
-- redemption refuses if it has moved -- a promoted child must not silently
-- receive a different pool than the one that was paid for.
create or replace function public.quote_olympiad_purchase(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_child_grade uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_ex_status   text;
begin
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'olympiad quote: child has no owning parent'
      using errcode = 'check_violation', hint = 'bad_student';
  end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then
    raise exception 'olympiad quote: package not found'
      using errcode = 'check_violation', hint = 'package_not_found';
  end if;

  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'olympiad quote: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'olympiad quote: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  select status into v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id
    and olympiad_package_id = p_package_id;
  if v_ex_status = 'active' then
    -- Lifetime access is already held. Opening a checkout for it would take
    -- money for something the family owns, which is the mirror of the defect
    -- this migration closes.
    raise exception 'olympiad quote: package already owned'
      using errcode = 'unique_violation', hint = 'already_owned';
  end if;

  return jsonb_build_object(
    'package_id',         p_package_id,
    'student_profile_id', p_student_profile_id,
    'grade_id',           v_buy_grade,
    'price',              v_price,
    'due_now',            v_price,
    'currency',           coalesce(v_currency, 'AZN'));
end;
$$;

comment on function public.quote_olympiad_purchase(uuid, uuid) is
  'Migration 127: the read-only price of ONE olympiad package for ONE child, and the single computation the intent, the re-price and the charge all read (audit H7). Re-states purchase_olympiad''s guards in the same order and raises the same hints (bad_student / package_not_found / package_not_on_sale / package_not_for_grade / already_owned). Returns the ENTITLED GRADE beside the price, because purchase_olympiad snapshots it and attempts draw that pool forever -- so the grade is part of what is bought, not a detail.';

revoke all on function public.quote_olympiad_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function public.quote_olympiad_purchase(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 8. purchase_olympiad now says what it charged  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 011 with ONE change, in all three exits: the answer carries
-- amount, currency, grade_id, due_now and charged. Nothing about WHO may buy or
-- WHEN changes here.
--
-- due_now IS THE VERDICT THE WRAPPER READS, and it is why the extra keys exist.
-- The three exits are not the same event: a child who ALREADY owns the package
-- causes nothing to happen (due_now 0), while a first purchase and a re-buy
-- after a refund both write an ACTIVE purchase at today's price (due_now =
-- price). Without that distinction purchase_olympiad_if_free would have to guess
-- from `existing`, and would refuse a harmless repeated click.
create or replace function public.purchase_olympiad(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_child_grade uuid;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_existing    uuid;
  v_ex_status   text;
  v_id          uuid;
begin
  -- Round 48 kill switch (migration 089): no paid write while the
  -- payment mode is off. Defence in depth -- the web/BFF layer checks
  -- too, but this is the layer that cannot be forgotten.
  perform public.assert_payments_enabled();
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Sales window (migration 070; supersedes the migration-035 event-date gate,
  -- carried over by 070's one-time sale_ends_at := event_starts_at backfill):
  -- the ONE canonical predicate — olympiad_package_on_sale, defined in 015.
  -- Off-sale = not purchasable, full stop (existing purchasers are unaffected —
  -- this guard only blocks NEW purchases).
  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'purchase: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  -- Round 34: when the package targets grades, the child's CURRENT grade must
  -- be one of them, and the purchase snapshots it (attempts draw THAT pool
  -- forever — yearly promotion never re-points a lifetime entitlement).
  -- Empty target set = legacy grade-less package: buyable by anyone (old rule).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'purchase: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      -- MIGRATION 127: due_now = 0 and charged = false. NOTHING HAPPENED --
      -- the child already owns it, no money is owed and none was taken. The
      -- _if_free wrapper reads exactly this key, so a harmless re-click from
      -- the purchase-silent surface is not mistaken for an attempted purchase.
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active',
                                'existing', true, 'grade_id', v_buy_grade,
                                'amount', v_price, 'currency', v_currency,
                                'due_now', 0::numeric(12,2), 'charged', false);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT
    -- price/date — and now also the CURRENT grade entitlement.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           grade_id = coalesce(v_buy_grade, grade_id),
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    -- A RE-BUY AFTER A REFUND IS A PURCHASE. It records today's price and
    -- today's grade, so due_now is that price and charged is true -- the row
    -- is `existing` only in the sense that it is reused in place.
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active',
                              'existing', true, 'grade_id', v_buy_grade,
                              'amount', v_price, 'currency', v_currency,
                              'due_now', v_price, 'charged', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider, grade_id)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none', v_buy_grade)
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active',
                            'existing', false, 'grade_id', v_buy_grade,
                            'amount', v_price, 'currency', v_currency,
                            'due_now', v_price, 'charged', true);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. '
  'service_role only. Migration 070: only packages passing '
  'olympiad_package_on_sale are purchasable (hint package_not_on_sale). '
  'Round 34: the child''s grade must be a package target grade (hint '
  'package_not_for_grade) and is SNAPSHOTTED on the purchase row. '
  'Migration 127: the answer carries amount / currency / grade_id / due_now / '
  'charged, and since 127 the ONLY caller that may reach it with money owed is '
  'checkout_redeem_plan, behind a verified payment -- every application path '
  'goes through purchase_olympiad_if_free.';

revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 9. The olympiad apply gate  (backport -> 011)
-- -----------------------------------------------------------------------------
-- The third member of the family migration 126 started, and the reason it now
-- has three: after this migration NO application code path names a priced apply
-- RPC. create_child_plan, apply_plan_change and purchase_olympiad are reachable
-- from the app only through their _if_free wrappers; the priced functions are
-- called from exactly one place, inside checkout_redeem_plan, behind a payment
-- the gateway confirmed.
--
-- THAT IS A STRONGER PROPERTY THAN "the mobile app cannot buy". It removes the
-- quote-then-apply race from the WEB as well: prices, the sibling tier and
-- launch_promo_config.trial_days can all move between an app server's quote and
-- its apply, and READ COMMITTED gives each statement its own snapshot. Taking
-- the verdict from the apply's OWN answer, inside the same statement, is the
-- only version of "this was free" that cannot be raced.
--
-- WHAT STAYS LEGAL: a package the owner priced at zero (a free or comped one),
-- and a repeated click on a package the child already owns -- which charges
-- nothing because nothing happens. Both answer due_now = 0 and pass.
create or replace function public.purchase_olympiad_if_free(
  p_student_profile_id uuid,
  p_package_id         uuid
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
  v_res := public.purchase_olympiad(p_student_profile_id, p_package_id);

  -- NULL IS A REFUSAL, not a zero -- the same sentence the two plan wrappers
  -- carry, for the same reason: "we could not tell what this costs" must never
  -- resolve to "so it is probably free".
  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'olympiad: this package has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.purchase_olympiad_if_free(uuid, uuid) is
  'Migration 127: purchase_olympiad for every APPLICATION caller -- the web action and the purchase-silent mobile BFF alike. Grants the package and then rolls the whole statement back with check_violation/payment_required if the RPC''s own answer priced it above zero, so a priced package can only ever be delivered by checkout_redeem_plan behind a verified payment. A zero-priced package and a repeated click on an already-owned one both answer due_now = 0 and pass.';

revoke all on function public.purchase_olympiad_if_free(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad_if_free(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 9b. The rail the grant is filed under  (backport -> 015)
-- -----------------------------------------------------------------------------
-- The purchase half of the entitlement mirror (migration 124/127). Column-scoped
-- so an amount or provider_payment_id correction does not write a redundant
-- entitlement row AND an audit row for a change that means nothing to ACCESS.
--
-- `provider` IS ON THE LIST, AND IT BELONGS THERE (migration 127).
-- fn_entitlement_map_purchase reads that column, and nothing else, to decide
-- whether the grant is filed as `abb_web` or as a comped `manual` one. Without
-- it the stamp checkout_redeem_plan writes after a verified payment changed the
-- row and re-fired nothing: the purchase said AzeriCard, the entitlement still
-- said manual, and every revenue report keyed on `source` was blind to paid
-- money. The alternative -- stamping the provider before the grant -- would mean
-- a new parameter on purchase_olympiad and a new way for a caller to name the
-- rail it was NOT reached on. The column list is the smaller change and the
-- honest one: the mirror should fire when the thing it mirrors moves.
drop trigger if exists trg_entitlements_from_purchases on public.olympiad_purchases;
create trigger trg_entitlements_from_purchases
  after insert or update of status, grade_id, student_profile_id, provider
  on public.olympiad_purchases
  for each row execute function public.tg_entitlements_purchase();

-- -----------------------------------------------------------------------------
-- 10. Somebody is told  (backport -> 011)
-- -----------------------------------------------------------------------------
-- FINDING 6. `needs_review` is this schema's word for "we are holding a
-- family's money and have not delivered on it". Until now it reached exactly one
-- place: 013 check 118, which is a file a human runs when they ALREADY suspect
-- something. A state that only becomes visible to someone who went looking for
-- it is not an alarm.
--
-- PRIORITY 1 IS THE POINT, not a flourish. create_notification honours a
-- recipient's in-app preference and silently returns NULL for anyone who has
-- turned notices off -- EXCEPT at priority 1, which it documents as "critical:
-- payment/security" and always delivers. This is money that was taken and not
-- delivered on; it may not be silenceable.
--
-- IT NEVER RAISES. A notification that fails must not roll back the redemption
-- decision it is reporting: losing the alarm is bad, losing the RECORD of what
-- happened to the money is worse. The whole body sits in an exception block, and
-- the caller ignores the count.
--
-- ONE ROW PER (order, reason) PER ADMIN, via create_notification's idempotency
-- key, so a callback retried five times files one notice rather than five.
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
        'Sifariş ' || p_order || ' — səbəb: ' || coalesce(p_reason, 'naməlum') ||
          '. Valideynin ödənişi bizdədir; nəyin çatdırıldığını yoxlayın.',
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

comment on function public.checkout_alert_admins(text, text) is
  'Migration 127: files a PRIORITY 1 in-app notification to every administrator when a checkout redemption needs a human — money taken and not delivered on, a follow-up that failed after delivery, or a reversal. Priority 1 because create_notification deliberately refuses to let a recipient silence that level. Idempotent per (order, reason, admin); never raises, so a failed notice cannot roll back the decision it reports.';

revoke all on function public.checkout_alert_admins(text, text) from public, anon, authenticated;
grant execute on function public.checkout_alert_admins(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 11. Opening an intent -- now for an olympiad too  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 125 with TWO additions and nothing else:
--   * an 'olympiad' branch, which prices through quote_olympiad_purchase and
--     freezes [{package_id, grade_id}] -- the grade included, because
--     purchase_olympiad snapshots it and attempts draw that pool forever;
--   * intent_delta for a plan_change, so redemption can deliver the CHANGE the
--     parent authorised rather than a snapshot of the whole plan.
--
-- Everything that made this the ONLY way a payable session comes into existence
-- is unchanged: it quotes and inserts in ONE transaction (so the stored amount
-- is provably the RPC's own number and no parameter can carry a price), it takes
-- the family advisory lock, it refuses a free change, and the ORDER is minted by
-- the caller against migration 123's unique index.
create or replace function public.checkout_intent_open(
  p_student_profile_id uuid,
  p_kind               public.checkout_intent_kind,
  p_items              jsonb,
  p_order              text,
  p_ttl_minutes        int default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_q     jsonb;
  v_due   numeric(12,2);
  v_sub   uuid;
  v_id    uuid;
  v_ttl   int;
  v_exp   timestamptz;
  v_norm  jsonb;
  v_delta jsonb;
  v_kind  text;
  v_pkg   uuid;
begin
  -- The kill switch first: an intent is the first step of a paid write, and a
  -- session opened while payments are off is a charge waiting to happen.
  perform public.assert_payments_enabled();

  -- The gateway's own ORDER shape, mirrored from lib/payments/azericard/format
  -- (6..32 digits; we mint 14). Stated as a range rather than the exact minted
  -- length so this refuses garbage without pinning the mint format, which the
  -- protocol layer owns.
  if p_order is null or p_order !~ '^[0-9]{6,32}$' then
    raise exception 'checkout: malformed order'
      using errcode = 'check_violation', hint = 'bad_order';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'checkout: child has no owning parent'
      using errcode = 'check_violation', hint = 'bad_student';
  end if;

  -- Bounded, and bounded on BOTH sides: a five-minute floor keeps a caller from
  -- opening a session that expires before the bank's own page can be filled in,
  -- and a 24-hour ceiling is what stops a forgotten pending session from being
  -- redeemable by a replayed callback weeks later.
  v_ttl := least(greatest(coalesce(p_ttl_minutes, 1440), 5), 1440);
  v_exp := now() + make_interval(mins => v_ttl);

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  v_kind := 'subscription';

  if p_kind = 'olympiad' then
    -- A DIFFERENT PRODUCT, RECORDED AS ONE. checkout_sessions.kind is what a
    -- reconciliation report reads to tell a subscription from a package from the
    -- owner's protocol test, and a report that cannot tell them apart is a
    -- report nobody can act on.
    v_kind := 'olympiad';
    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) <> 1
       or coalesce(p_items -> 0 ->> 'package_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'checkout: malformed olympiad intent'
        using errcode = 'check_violation', hint = 'bad_items';
    end if;
    v_pkg  := (p_items -> 0 ->> 'package_id')::uuid;
    v_q    := public.quote_olympiad_purchase(p_student_profile_id, v_pkg);
    v_due  := (v_q->>'due_now')::numeric;
    v_sub  := null;
    -- The frozen intent is built from the QUOTE, never echoed from the caller:
    -- the grade is ours to decide, and a caller that could name it could buy a
    -- pool the package does not sell to this child.
    v_norm := jsonb_build_array(jsonb_build_object(
                'package_id', v_pkg,
                'grade_id',   v_q -> 'grade_id'));
  elsif p_kind = 'plan_start' then
    if exists (
      select 1 from public.child_subscriptions
      where student_profile_id = p_student_profile_id
        and status in ('trialing', 'active', 'past_due')
    ) then
      raise exception 'checkout: child already has a live subscription'
        using errcode = 'unique_violation', hint = 'already_subscribed';
    end if;
    v_q   := public.quote_child_plan(p_student_profile_id, p_items);
    v_due := (v_q->>'due_now')::numeric;
    v_sub := null;
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', n.subject_id, 'interval', n.interval)), '[]'::jsonb)
      into v_norm
    from public.plan_items_normalize(p_items) n;
  else
    -- Raises no_data_found when there is no live subscription to change.
    v_q    := public.quote_plan_change(p_student_profile_id, p_items);
    v_due  := (v_q->>'due_now')::numeric;
    v_sub  := (v_q->>'subscription_id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', n.subject_id, 'interval', n.interval)), '[]'::jsonb)
      into v_norm
    from public.plan_items_normalize(p_items) n;
    -- MIGRATION 127 -- THE CHANGE, NOT THE WORLD. See plan_change_delta. The
    -- basket above is kept as EVIDENCE of what the parent was looking at; this
    -- is what redemption will actually deliver, projected onto whatever the plan
    -- looks like when the money lands.
    v_delta := public.plan_change_delta(v_sub, p_items);
  end if;

  -- A checkout for nothing must not exist. A free change (a removal, a
  -- reinstatement, a scheduled cycle move, a plan that rides a trial, a
  -- zero-priced package) is applied directly by its own action; routing it
  -- through a payment would invent a charge, and a zero-amount signed request is
  -- not a thing the gateway accepts.
  if v_due is null or v_due <= 0 then
    raise exception 'checkout: nothing is due for this change'
      using errcode = 'check_violation', hint = 'nothing_due';
  end if;

  insert into public.checkout_sessions
    (owner_parent_profile_id, kind, child_subscription_id, amount, currency,
     status, provider, provider_session_id,
     intent_kind, student_profile_id, intent_items, intent_delta, intent_quote,
     expires_at)
  values
    (v_owner, v_kind, v_sub, v_due, coalesce(v_q->>'currency', 'AZN'),
     'pending', 'azericard', p_order,
     p_kind, p_student_profile_id, v_norm, v_delta, v_q, v_exp)
  returning id into v_id;

  return jsonb_build_object(
    'checkout_session_id', v_id,
    'order',      p_order,
    'amount',     v_due,
    'currency',   coalesce(v_q->>'currency', 'AZN'),
    'expires_at', v_exp,
    'quote',      v_q);
end;
$$;

comment on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int) is
  'Migration 125/127: opens a PENDING checkout carrying the intent (child, frozen basket, and for a plan_change the frozen CHANGE) and the quote RPC''s OWN due_now. Mutates nothing else — the plan or package is delivered only by checkout_redeem_plan after a verified payment. Migration 127 adds the ''olympiad'' kind, priced by quote_olympiad_purchase and freezing [{package_id, grade_id}]. Raises check_violation/nothing_due for a free change, unique_violation/already_subscribed for a plan_start on a child who already has one, and unique_violation/already_owned for a package the child already holds.';

revoke all on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  from public, anon, authenticated;
grant execute on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  to service_role;

-- -----------------------------------------------------------------------------
-- 12. Re-pricing an intent, read-only  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Used at SIGNING time, before the parent is sent to the bank.
--
-- THIS SIDE STAYS STRICT, AND THAT IS THE OTHER HALF OF THE OWNER'S DECISION.
-- Redemption now HONOURS a frozen price (finding 2) — but only because this
-- function refused everything staler first. Before the money moves, showing a
-- parent today's number and refusing to sign yesterday's costs them nothing and
-- is simply honest; after the money moves, refusing is us keeping their money.
-- The exposure the honour rule accepts is therefore the window between SIGNING
-- and REDEEMING, which is minutes, not the day the intent may live.
--
-- Migration 127: it re-prices the same thing redemption will deliver — the
-- PROJECTED delta for a plan_change, the package for an olympiad — so the two
-- computations cannot answer differently about the same session.
create or replace function public.checkout_intent_price(p_order text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_s      public.checkout_sessions%rowtype;
  v_q      jsonb;
  v_due    numeric(12,2);
  v_sub    uuid;
  v_basket jsonb;
  v_pkg    uuid;
  v_grade  uuid;
  v_cur    uuid;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order;
  if not found or v_s.intent_kind is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_s.student_profile_id is null then
    return jsonb_build_object('ok', false, 'reason', 'student_gone');
  end if;
  if v_s.expires_at is not null and now() > v_s.expires_at then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  begin
    if v_s.intent_kind = 'olympiad' then
      v_pkg   := nullif(v_s.intent_items -> 0 ->> 'package_id', '')::uuid;
      v_grade := nullif(v_s.intent_items -> 0 ->> 'grade_id', '')::uuid;
      if v_pkg is null then
        return jsonb_build_object('ok', false, 'reason', 'reprice_failed');
      end if;
      v_q := public.quote_olympiad_purchase(v_s.student_profile_id, v_pkg);
      -- AGAINST THE QUOTE'S OWN GRADE, NEVER students.grade_id. A LEGACY
      -- GRADE-LESS package quotes grade_id = NULL -- it sells one pool, not a
      -- grade -- so reading the child's grade column here compared NULL with a
      -- real grade and reported grade_changed for EVERY such purchase: the
      -- parent could never resume a checkout, and the duplicate-purchase guard
      -- (which only fires on the resume path) was defeated with it. Quoting
      -- first makes both sides the same computation, which is also what catches
      -- the mirror case: a package whose target grades moved under a grade-less
      -- intent. checkout_redeem_plan already compares this way.
      v_cur := nullif(v_q ->> 'grade_id', '')::uuid;
      if v_grade is distinct from v_cur then
        -- The child was promoted, or the package's grades moved. Either way the
        -- purchase would snapshot a DIFFERENT pool than the one that was
        -- quoted, and that is a different purchase, not a different price.
        return jsonb_build_object('ok', false, 'reason', 'grade_changed');
      end if;
    elsif v_s.intent_kind = 'plan_start' then
      if exists (
        select 1 from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
      ) then
        return jsonb_build_object('ok', false, 'reason', 'plan_already_live');
      end if;
      v_q := public.quote_child_plan(v_s.student_profile_id, v_s.intent_items);
    else
      select cs.id into v_sub from public.child_subscriptions cs
      where cs.student_profile_id = v_s.student_profile_id
        and cs.status in ('trialing', 'active', 'past_due')
      order by cs.created_at desc
      limit 1;
      if v_sub is null or v_s.child_subscription_id is distinct from v_sub then
        return jsonb_build_object('ok', false, 'reason', 'subscription_changed');
      end if;
      v_basket := case when v_s.intent_delta is null
                       then v_s.intent_items
                       else public.plan_delta_project(v_sub, v_s.intent_delta) end;
      v_q := public.quote_plan_change(v_s.student_profile_id, v_basket);
      -- IS IT STILL THE SAME DELIVERY? Re-derive the change from the projection
      -- and compare it with the one that was frozen. The amount cannot answer
      -- this: a basket that shrank because another tab already delivered half
      -- of it, and one that grew because a lapsed reinstatement turned into a
      -- paid add, are both "a different number" and neither is a price
      -- movement. Asking HERE costs the parent nothing; the alternative is
      -- taking their money and then telling them a human will be in touch.
      -- A pre-127 session carries no delta, cannot answer the question at all,
      -- and is refused for exactly that reason.
      if public.plan_change_delta(v_sub, v_basket) is distinct from v_s.intent_delta then
        return jsonb_build_object('ok', false, 'reason', 'delivery_changed');
      end if;
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'reprice_failed');
  end;

  v_due := (v_q->>'due_now')::numeric;
  if v_due is distinct from v_s.amount then
    return jsonb_build_object('ok', false, 'reason', 'price_changed',
                              'amount', v_s.amount, 'quoted', v_due);
  end if;
  return jsonb_build_object('ok', true, 'amount', v_s.amount, 'quoted', v_due);
end;
$$;

comment on function public.checkout_intent_price(text) is
  'Migration 125/127: read-only re-quote of a stored intent, for the moment before the redirect is signed. Deliberately STRICT — refusing here costs a parent nothing, which is what makes it safe for redemption to honour a frozen price afterwards. Migration 127 re-prices what redemption will actually deliver (the PROJECTED delta, or the package), refuses a delivery that is no longer the one that was authorised (delivery_changed), and compares the frozen grade against the QUOTE''S grade rather than students.grade_id — reading the column there reported grade_changed for every legacy grade-less package. Returns {ok,reason,amount,quoted}; mutates nothing.';

revoke all on function public.checkout_intent_price(text) from public, anon, authenticated;
grant execute on function public.checkout_intent_price(text) to service_role;

-- -----------------------------------------------------------------------------
-- 13. Redeeming a PAID intent -- the step that grants  (backport -> 011)
-- -----------------------------------------------------------------------------
-- STILL THE ONLY PLACE IN THIS DATABASE WHERE MONEY BECOMES ACCESS. Migration
-- 127 gives it a third product, not a second implementation: the olympiad
-- package redeems through the same lock, the same status = 'paid' requirement,
-- the same exactly-once claim and the same needs_review vocabulary. A second
-- redemption path would be a second copy of a billing rule, and a second copy
-- mis-bills silently on the day it drifts.
--
-- THREE CHANGES, and each is a decision rather than a mechanism:
--
--  (a) THE FROZEN PRICE IS HONOURED (finding 2, owner decision 2026-08-21). The
--      old rule was EXACT EQUALITY OR A HUMAN, and it was defensible on its own
--      terms — until the sibling discount made it fire on ordinary behaviour.
--      Paying for child A moves child B's tier, so B's already-signed intent
--      re-priced differently, B's money was taken, and a family waited on a
--      human over a few AZN. The owner's rule is simpler and better: THE PRICE
--      WE QUOTED IS THE PRICE THE PARENT PAYS. A differing re-price is recorded
--      (payment_events carries both numbers and honoured_frozen_price) and
--      delivered.
--
--      WHAT DID NOT MOVE, and why the line is there: a re-price that FAILS is
--      still a human's problem. A withdrawn subject, a deactivated pricing row,
--      a package taken off sale, a child whose grade moved, a subscription that
--      vanished — none of those is a price difference. They are DIFFERENT
--      DELIVERIES, and delivering something other than what was authorised is
--      the failure this whole family of migrations exists to prevent. So is
--      delivering something that is now FREE (no_longer_payable): if the thing
--      the parent paid for has become free, keeping the money is the other way
--      to be dishonest.
--
--      Note the asymmetry with checkout_intent_price, which is deliberate and
--      is what bounds this: BEFORE the money moves we refuse a moved price,
--      because refusing costs the parent nothing. AFTER it moves we honour it,
--      because refusing costs them their money. The window this rule actually
--      covers is signing-to-redeeming — minutes.
--
--      AND IT IS A RULE ABOUT A PRICE, NEVER ABOUT A DELIVERY. Written as "the
--      amounts differ, so the price must have moved" it is wrong in both
--      directions at once, which is what the first version of this function
--      did: a delivery that SHRANK (a sibling tab already delivered half the
--      basket) re-prices lower and gets charged the larger frozen amount, and
--      a delivery that GREW (a free reinstatement whose coverage lapsed is now
--      a paid add) re-prices higher and is handed over at the smaller frozen
--      one. So the question this function asks is the DELIVERY question — the
--      same subjects, each with the same nature and the same cycle — and the
--      amount is honoured as a CONSEQUENCE of that answer. A delivery that is
--      no longer the authorised one is `delivery_changed` and a human's, at
--      whatever price.
--
--  (b) A plan_change DELIVERS THE FROZEN CHANGE, PROJECTED (finding 5). See
--      plan_change_delta / plan_delta_project. A pre-127 row carries no delta,
--      so it cannot show that what would be delivered is what was authorised;
--      it is recorded for a human rather than delivered on a guess.
--
--  (b2) AND WHAT IT DELIVERED IS WRITTEN DOWN (delivered_items). The reversal
--      path used to re-derive the revocation from the FROZEN delta, which is
--      the one thing that is provably not what happened: after an honoured
--      price, or after any of the moves above, the two sets differ, and closing
--      the frozen one's periods takes back a subject a DIFFERENT payment paid
--      for.
--
--  (c) A needs_review NOW REACHES A PERSON (finding 6), through
--      checkout_alert_admins, which cannot raise and therefore cannot roll back
--      the decision it is reporting.
--
-- NOTHING HERE WRITES `entitlements`. It calls create_child_plan /
-- apply_plan_change / purchase_olympiad like every other caller and lets
-- migration 124's producer triggers mirror the result. Those three priced
-- functions are now called from NOWHERE ELSE in the platform — every
-- application path goes through an _if_free wrapper — so "a grant happened"
-- and "a payment happened" are the same event by construction.
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

comment on function public.checkout_redeem_plan(text) is
  'Migration 125/127: the ONLY path from a verified AzeriCard payment to a delivered plan OR olympiad package. Requires checkout_sessions.status = ''paid'', locks the row, and re-prices the frozen intent. The price it was quoted at is HONOURED (owner decision) — but only once the DELIVERY has been shown to be the authorised one: the re-derived change must equal the frozen delta, subject for subject, nature for nature, cycle for cycle, so neither a basket that shrank nor a reinstatement that lapsed into a paid add can ride the honour rule. Anything else — delivery_changed, grade_changed, subscription_changed, plan_already_live, a re-price that FAILS, or one that comes back at zero (no_longer_payable) — is recorded as needs_review with a reason and files a priority-1 admin notification. It writes what it DELIVERED onto delivered_items, which is what a reversal revokes from. Sets redeemed_at exactly once. Writes no entitlement row.';

revoke all on function public.checkout_redeem_plan(text) from public, anon, authenticated;
grant execute on function public.checkout_redeem_plan(text) to service_role;

-- -----------------------------------------------------------------------------
-- 14. Flagging a redemption that needs a human  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 125 with ONE addition: it now RAISES THE ALARM as well as
-- writing the note. Its whole purpose is the follow-up SQL cannot perform — the
-- Supabase Auth admin call that turns a freshly allocated 8-digit id into a
-- login — and when that fails the plan IS applied and paid for while the child
-- still cannot sign in. A note nobody is told about is the same silence finding
-- 6 is about.
--
-- IT STILL WRITES THE NOTE AND NOT THE STATUS. Flipping to 'needs_review' would
-- be a lie: the plan WAS delivered, and 'needs_review' is this schema's word for
-- "we are holding money we have not delivered on". Two different problems that
-- need two different answers must not share one word. 013 check 118 therefore
-- treats a decided redemption carrying a note as needing a human REGARDLESS of
-- status.
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
  v_ok boolean := false;
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
  returning true into v_ok;

  if coalesce(v_ok, false) then
    perform public.checkout_alert_admins(p_order, coalesce(p_note, 'flagged'));
  end if;
  return coalesce(v_ok, false);
end;
$$;

comment on function public.checkout_flag_redemption(text, text) is
  'Migration 125/127: record why a DECIDED redemption still needs a human — for the follow-up steps SQL cannot perform (the Auth-admin call that activates a child login) — and, since 127, notify the administrators. Writes redemption_note only: the status keeps saying what happened to the money, and 013 check 118 surfaces any decided redemption carrying a note.';

revoke all on function public.checkout_flag_redemption(text, text) from public, anon, authenticated;
grant execute on function public.checkout_flag_redemption(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 15. The no-network redeem backstop  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued from 126 with ONE change: an 'olympiad' session is eligible. The
-- exclusion this job carries is not about product, it is about what SQL can
-- FINISH — a plan_start for a child with no 8-digit ID yet ends with a Supabase
-- Auth admin call no SQL function can make. An olympiad redemption has no such
-- tail, so leaving it to the web sweep alone would have meant a package a family
-- paid for waiting on a process that may not be running.
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
      -- ONLY WHAT SQL CAN FINISH. See the header: the web-app sweep -- which CAN
      -- make the Auth-admin call -- owns a plan_start whose child has no login
      -- ID yet; this job takes the rest, and if the web sweep never runs 013
      -- check 118 still reports them as money taken and not delivered.
      and (cs.intent_kind in ('plan_change', 'olympiad')
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
  'Migration 126/127: the no-network half of lost-callback recovery -- redeems checkout sessions the ledger already says are PAID whose redemption never ran, through checkout_redeem_plan (never a second copy of that logic). Idempotent: a decided session answers ''already'' and is counted, not re-applied. Skips only a plan_start whose child has no 8-digit ID yet, because finishing one needs a Supabase Auth admin call SQL cannot make; plan_change and olympiad redemptions have no such tail and are swept here.';

revoke all on function public.checkout_redeem_sweep(int) from public, anon, authenticated;
grant execute on function public.checkout_redeem_sweep(int) to service_role;

-- -----------------------------------------------------------------------------
-- 16. A reversal must not leave access standing  (backport -> 011)
-- -----------------------------------------------------------------------------
-- FINDING 7, learned from the live bank test on 2026-08-21 and not from the
-- spec. We reversed RRN 623279219080 with TRTYPE=22 and it worked. Two things
-- the documentation does not say:
--
--   * the gateway answers a reversal with the single character `1`;
--   * a status query with TRAN_TRTYPE=1 reports the ORIGINAL authorisation as
--     actionCode=0 / Approved FOREVER. The reversal is visible ONLY when
--     querying with TRAN_TRTYPE=22.
--
-- queryTransactionStatus hardcoded TRAN_TRTYPE=1, so reconciliation could never
-- see a reversal: the money went back and the entitlement stayed live. The web
-- sweep now asks the second question too and calls this function with the
-- answer.
--
-- THE REVOCATION IS EXPRESSED ON THE PRODUCER, never on `entitlements`
-- (docs/STORE_PAYMENTS_COMPLIANCE.md §4.1, migration 124). A direct UPDATE on a
-- mirrored entitlement row is reverted by the next producer write or by the next
-- entitlements_reconcile() — it would look like it worked and quietly come back.
-- So:
--   * an olympiad purchase becomes 'refunded', and fn_entitlement_map_purchase
--     mirrors that as a REVOKED grant. Note it is NOT deleted: CLAUDE.md keeps
--     purchase records forever, and can_view_olympiad_package's entitlement
--     branch is revocation-blind on purpose so the family keeps seeing the
--     catalog row for something they once bought.
--   * a subject period is closed at now(), and fn_entitlement_map_subject
--     mirrors ends_at = least(subscription end, subject end). Only the subjects
--     THIS money bought are closed, read from checkout_sessions.delivered_items
--     — what the redemption ACTUALLY applied. Re-deriving them from the frozen
--     intent was wrong the moment anything moved between signing and redeeming:
--     the intent then names a subject a DIFFERENT payment paid for, and closing
--     its period revokes access the family is owed.
--   * the subscription is cancelled only when NOTHING is left covered on it.
--     Cancelling it because the intent happened to be a plan_start killed every
--     subject a later, un-reversed payment had added to it.
--   * a redemption decided before delivered_items existed revokes NOTHING and
--     asks for a person: of the two ways to be wrong, money standing against
--     live access is recoverable and cutting off a paying family is not.
--
-- IT IS NOT A REFUND FLOW. It records that money we were given has been given
-- back, and takes back what that money bought. Deciding to reverse, and doing
-- it, is the operator's action on the gateway.
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
    and cs.created_at > now() - interval '24 hours'
    and cs.created_at < now() - interval '5 minutes'
  order by cs.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.checkout_reversal_candidates(int) is
  'Migration 127: the work list for the reversal sweep — settled checkout payments inside the gateway''s 24-hour status window. Read-only; it decides nothing. The caller asks the gateway with TRAN_TRTYPE=22 (the ONLY query that reveals a reversal — a TRAN_TRTYPE=1 query reports the original authorisation as approved forever) and records the answer through checkout_revoke_reversed. Beyond 24 hours a reversal is invisible to us; that is the acquirer''s window, not a choice.';

revoke all on function public.checkout_reversal_candidates(int) from public, anon, authenticated;
grant execute on function public.checkout_reversal_candidates(int) to service_role;

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
  end if;

  -- 3. The ledger copy, and the alarm.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'reversed:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'reason', p_reason,
            'was_redeemed', v_s.redeemed_at is not null,
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

comment on function public.checkout_revoke_reversed(text, text) is
  'Migration 127: records that a settled checkout payment was REVERSED at the gateway and takes back what it bought. Marks the payment refunded, then expresses the revocation ON THE PRODUCER — an olympiad purchase becomes refunded, and the subjects named by checkout_sessions.delivered_items (what the redemption ACTUALLY applied, never the frozen intent) have their period closed at now() — so migration 124''s mirror revokes the entitlement instead of this function writing access directly. The subscription is cancelled only when no coverage is left on it, so a reversal cannot kill a subject a later payment bought. A redemption decided before delivered_items existed revokes nothing and asks for a person. A payment reversed before it was ever redeemed closes the session so a late callback cannot deliver it. Idempotent on payments.status = ''refunded''; always notifies the administrators.';

revoke all on function public.checkout_revoke_reversed(text, text) from public, anon, authenticated;
grant execute on function public.checkout_revoke_reversed(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 16b. An operator says what they did  (backport -> 011)
-- -----------------------------------------------------------------------------
-- THE ALARM HAD NO OFF SWITCH, and that is a real defect rather than a missing
-- convenience. `checkout_redemption_status` has exactly TWO values, both
-- terminal, and neither of them means "a person has dealt with this". So 013
-- check 118 would have gone permanently red seven days after the first genuine
-- needs_review, and a board that is always red is a board nobody reads.
--
-- MOVING THE STATUS WOULD HAVE BEEN A LIE. 'applied' means the plan was
-- delivered. An operator who REFUNDED the family instead has not applied
-- anything, and overwriting the status would destroy the only record of what
-- happened to the money at redemption time.
--
-- So the resolution is written where a resolution belongs: the NOTE, prefixed
-- `resolved:`. The status keeps saying what happened, the note says a human
-- settled it, and the audit row says HOW. 013 checks 118 and 123 skip a row
-- carrying that prefix and count every other one.
--
-- IT DEMANDS A SENTENCE. A blank resolution is refused, because "somebody
-- clicked the button" is not an answer to "what happened to this family's
-- money".
create or replace function public.admin_resolve_checkout_review(
  p_order      text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_s     public.checkout_sessions%rowtype;
  v_note  text;
begin
  if not public.is_admin() then
    raise exception 'checkout: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_resolution is null or btrim(p_resolution) = '' then
    raise exception 'checkout: say what was done'
      using errcode = 'check_violation', hint = 'resolution_required';
  end if;

  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;
  if not found or v_s.intent_kind is null or v_s.redeemed_at is null then
    raise exception 'checkout: no decided redemption for this order'
      using errcode = 'no_data_found', hint = 'not_found';
  end if;

  -- 180, not 200: `resolved:` costs nine characters and the column is capped at
  -- 200 by ck_checkout_redemption. Truncating the OPERATOR'S sentence rather
  -- than the prefix keeps the prefix — which is what the checks key on — intact.
  v_note := 'resolved:' || left(btrim(p_resolution), 180);

  update public.checkout_sessions
     set redemption_note = v_note
   where id = v_s.id;

  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.checkout.redemption_resolved', 'checkout_sessions', v_s.id,
     jsonb_build_object(
       'order', p_order,
       'intent_kind', v_s.intent_kind,
       'redemption_status', v_s.redemption_status,
       'previous_note', v_s.redemption_note,
       'resolution', left(btrim(p_resolution), 180)),
     'info', true);

  return jsonb_build_object('ok', true, 'note', v_note);
end;
$$;

comment on function public.admin_resolve_checkout_review(text, text) is
  'Migration 127: an administrator records what they DID about a redemption that needed a human — delivered by hand, refunded, contacted the family. Writes redemption_note = ''resolved:<sentence>'' and an audit row, and deliberately leaves redemption_status alone: the status says what happened to the MONEY at redemption time, and overwriting it with ''applied'' would be a lie about a refunded case. 013 checks 118 and 123 skip a row carrying the prefix. Refuses a blank resolution and anyone who is not an administrator.';

revoke all on function public.admin_resolve_checkout_review(text, text) from public, anon;
grant execute on function public.admin_resolve_checkout_review(text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 17. Verify, in-transaction. ABORT rather than half-apply.
-- -----------------------------------------------------------------------------
-- NOTHING HERE MAY EVALUATE THE NEW ENUM VALUE (see section 1). The enum check
-- below reads pg_enum as a CATALOG — enumlabel is a name, not a value of the
-- type — which is why it does not raise "unsafe use of new value".
do $mig$
declare
  n int;
begin
  -- (a) the new enum label landed
  select count(*) into n
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'checkout_intent_kind' and e.enumlabel = 'olympiad';
  if n <> 1 then
    raise exception '127: checkout_intent_kind is missing the olympiad label';
  end if;

  -- (b) the frozen delta column and the re-issued shape CHECK
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checkout_sessions'
      and column_name = 'intent_delta'
  ) then
    raise exception '127: checkout_sessions.intent_delta is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checkout_sessions'
      and column_name = 'delivered_items'
  ) then
    raise exception '127: checkout_sessions.delivered_items is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_sessions'::regclass
      and conname = 'ck_checkout_intent_shape'
  ) then
    raise exception '127: ck_checkout_intent_shape did not come back';
  end if;

  -- (c) the freeze trigger is ARMED and actually covers the delta. "The trigger
  --     exists" and "the trigger protects the field that decides what is
  --     delivered" are different claims.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.checkout_sessions'::regclass
      and tgname = 'trg_checkout_intent_immutable'
      and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception '127: trg_checkout_intent_immutable is not armed';
  end if;
  if position('intent_delta' in pg_get_functiondef(
       to_regprocedure('public.fn_checkout_intent_immutable()'))) = 0 then
    raise exception '127: the intent freeze does not cover intent_delta';
  end if;

  -- (d) every new function exists and NONE of them is reachable by a logged-in
  --     browser session. purchase_olympiad_if_free is a grant path;
  --     checkout_revoke_reversed takes access AWAY, which is just as much a
  --     thing no end user may drive.
  select count(*) into n from (values
    ('public.plan_change_delta(uuid,jsonb)'),
    ('public.plan_delta_project(uuid,jsonb)'),
    ('public.quote_olympiad_purchase(uuid,uuid)'),
    ('public.purchase_olympiad_if_free(uuid,uuid)'),
    ('public.checkout_alert_admins(text,text)'),
    ('public.checkout_reversal_candidates(int)'),
    ('public.checkout_revoke_reversed(text,text)')
  ) as s(sig)
  where to_regprocedure(s.sig) is null
     or has_function_privilege('anon',          to_regprocedure(s.sig)::oid, 'EXECUTE')
     or has_function_privilege('authenticated', to_regprocedure(s.sig)::oid, 'EXECUTE');
  if n <> 0 then
    raise exception '127: % new function(s) missing or not locked down', n;
  end if;

  -- (e) the trial predicate is IN BOTH BODIES. It is one line in each, in
  --     functions this repository re-issues often, and a `create or replace`
  --     from an older copy of 011 would undo either one in silence.
  if position('v_sub.trial_ends_at > now()' in pg_get_functiondef(
       to_regprocedure('public.quote_plan_change(uuid,jsonb)'))) = 0 then
    raise exception '127: quote_plan_change still treats a lapsed trial as running';
  end if;
  if position('v_sub.trial_ends_at > now()' in pg_get_functiondef(
       to_regprocedure('public.apply_plan_change(uuid,jsonb,text)'))) = 0 then
    raise exception '127: apply_plan_change still treats a lapsed trial as running';
  end if;

  -- (f) redemption honours the frozen price and no longer refuses on a moved one
  if position('honoured_frozen_price' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) = 0 then
    raise exception '127: checkout_redeem_plan does not honour the frozen price';
  end if;
  if position('price_changed' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) > 0 then
    raise exception '127: checkout_redeem_plan still sends a moved price to a human';
  end if;
  if position('plan_delta_project' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) = 0 then
    raise exception '127: checkout_redeem_plan does not project the frozen change';
  end if;

  -- (f2) ...AND THE HONOURED PRICE IS GATED ON THE DELIVERY. Without this the
  --      honour rule reads "the amounts differ, so the price moved", which
  --      charges the larger frozen amount for a delivery that shrank and hands
  --      over an enlarged one at the smaller. Both halves are one comparison,
  --      so one probe covers both.
  if position('delivery_changed' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) = 0
     or position('public.plan_change_delta(' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) = 0 then
    raise exception '127: checkout_redeem_plan honours a price without checking the delivery';
  end if;
  if position('delivery_changed' in pg_get_functiondef(
       to_regprocedure('public.checkout_intent_price(text)'))) = 0 then
    raise exception '127: checkout_intent_price signs a delivery it has not checked';
  end if;

  -- (f3) A REVERSAL REVOKES WHAT WAS DELIVERED, NOT WHAT WAS INTENDED. The two
  --      sets are the same only while nothing moved between signing and
  --      redeeming; whenever they differ, the intent names a subject a
  --      DIFFERENT payment paid for.
  if position('delivered_items' in pg_get_functiondef(
       to_regprocedure('public.checkout_redeem_plan(text)'))) = 0 then
    raise exception '127: checkout_redeem_plan does not record what it delivered';
  end if;
  if position('delivered_items' in pg_get_functiondef(
       to_regprocedure('public.checkout_revoke_reversed(text,text)'))) = 0
     or position('intent_delta' in pg_get_functiondef(
       to_regprocedure('public.checkout_revoke_reversed(text,text)'))) > 0 then
    raise exception '127: the reversal still revokes from the frozen intent';
  end if;

  -- (f4) THE PAID RAIL IS FILED AS THE PAID RAIL. fn_entitlement_map_purchase
  --      reads olympiad_purchases.provider and nothing else to choose abb_web
  --      over a comped manual grant, so the provider stamp only means something
  --      if it re-fires the mirror.
  if position(' provider' in coalesce((
       select pg_get_triggerdef(t.oid) from pg_trigger t
        where t.tgrelid = 'public.olympiad_purchases'::regclass
          and t.tgname = 'trg_entitlements_from_purchases'), '')) = 0 then
    raise exception '127: the entitlement mirror ignores the provider stamp';
  end if;

  -- (g) the mock is gone from the DATABASE side of the olympiad purchase: the
  --     priced function is reachable, the free-only wrapper exists, and the
  --     wrapper really does raise AFTER the apply (a pre-check cannot be made
  --     safe from outside the transaction — migration 126's reasoning).
  declare
    v_def text := pg_get_functiondef(to_regprocedure('public.purchase_olympiad_if_free(uuid,uuid)'));
  begin
    if position('public.purchase_olympiad(' in v_def) = 0 then
      raise exception '127: purchase_olympiad_if_free does not call the real purchase';
    end if;
    if position('raise exception' in v_def) = 0
       or position('raise exception' in v_def) < position('public.purchase_olympiad(' in v_def) then
      raise exception '127: purchase_olympiad_if_free refuses before it applies';
    end if;
    if position('hint = ''payment_required''' in v_def) = 0 then
      raise exception '127: purchase_olympiad_if_free does not raise payment_required';
    end if;
  end;

  -- (g2) the alarm has an OFF SWITCH, and it is admin-only. Without one, 013
  --      check 118 goes permanently red seven days after the first genuine
  --      needs_review, and a board that is always red is a board nobody reads.
  if to_regprocedure('public.admin_resolve_checkout_review(text,text)') is null then
    raise exception '127: admin_resolve_checkout_review is missing';
  end if;
  if has_function_privilege('anon',
       to_regprocedure('public.admin_resolve_checkout_review(text,text)')::oid, 'EXECUTE') then
    raise exception '127: admin_resolve_checkout_review is reachable by anon';
  end if;
  if position('is_admin()' in pg_get_functiondef(
       to_regprocedure('public.admin_resolve_checkout_review(text,text)'))) = 0 then
    raise exception '127: admin_resolve_checkout_review does not check the role';
  end if;

  -- (h) WHO IS IN FLIGHT RIGHT NOW. A plan_change intent opened before this
  --     migration carries no delta, so it cannot show that what would be
  --     delivered is what was authorised -- redemption records it for a human
  --     instead of delivering on a guess. That is the safe answer and it is not
  --     a free one, so the count is reported rather than assumed to be zero.
  select count(*) into n from public.checkout_sessions
  where intent_kind is not null and redeemed_at is null
    and status in ('pending', 'paid') and intent_delta is null;
  if n > 0 then
    raise notice '127: % redeemable pre-127 intent(s) will need a human rather than be delivered', n;
  end if;

  raise notice '127: paid olympiad checkout, frozen-price redemption, delta projection, admin alerts and reversal revocation installed';
end
$mig$;

commit;

-- =============================================================================
-- End of 2026_08_21_127_paid_olympiad_and_frozen_price.sql
-- =============================================================================
