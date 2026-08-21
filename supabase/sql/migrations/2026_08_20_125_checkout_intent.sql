-- =============================================================================
-- 2026_08_20_125_checkout_intent.sql
-- =============================================================================
-- Migration: 2026_08_20_125_checkout_intent.sql
-- Purpose: Make the PAYMENT cause the GRANT.
--
--          THE DEFECT THIS FIXES. The parent checkout applied the plan change
--          FIRST and asked for money AFTERWARDS. `apply_plan_change` /
--          `create_child_plan` wrote `subscription_subjects.current_period_end
--          = now() + cycle` unconditionally, migration 124's mirror turned that
--          into a LIVE entitlement immediately, and the charge was opened after
--          the fact by a helper that "can only return null -- it never fails
--          the change". Nothing expires an unpaid subscription. So a parent
--          could add a 90 AZN yearly subject, confirm, close the tab before
--          paying, and the child had a live year of access with no `payments`
--          row anywhere -- repeatable after every lapse.
--
--          WHY IT COULD NOT SIMPLY BE REORDERED. `checkout_sessions` carried
--          id, owner, kind, child_subscription_id, amount, currency, status,
--          provider, provider_session_id, created_at -- and NO record of WHAT
--          was bought and for WHOM. A verified payment had nothing to act on.
--          This migration gives the session an INTENT, so the callback can.
--
--          THE NEW ORDER OF OPERATIONS:
--            1. the parent picks subjects/cycles     -> QUOTE only, no mutation
--            2. checkout_intent_open()               -> a pending session
--                                                       carrying the child, the
--                                                       basket and the RPC's
--                                                       OWN priced amount
--            3. full-page redirect to the hosted page (unchanged)
--            4. signed callback -> TRTYPE=90 status query -> recordOutcome
--            5. checkout_redeem_plan()               -> RE-PRICE, then apply
--
--          Abandonment is now harmless BY CONSTRUCTION: step 5 never runs, and
--          step 2 granted nothing.
--
--          INTENT COLUMNS, NOT A CHILD TABLE. The basket needs to express a
--          LIST -- (subject, cycle) pairs -- so `checkout_session_items` was the
--          obvious shape. It is the wrong one here, for four reasons.
--            * ATOMICITY. The intent and the price it was quoted at must be one
--              indivisible fact. On one row they cannot disagree; across a
--              parent row and N child rows there is a state where a session
--              exists with half a basket, and that state is signable.
--            * THE PAYLOAD IS ALREADY A CONTRACT. `plan_items_normalize(jsonb)`
--              is this codebase's ONE gate for a plan basket (array shape, <=20
--              cap, UUID-shaped ids, the plan_interval whitelist, de-dup). A
--              jsonb column feeds the stored intent straight back into it, so
--              redeem re-uses that gate instead of inventing a second one that
--              could drift from it.
--            * IMMUTABILITY IS THE POINT. What the parent authorised is frozen
--              evidence. Freezing a column set is one BEFORE UPDATE trigger;
--              freezing a child collection additionally needs INSERT and DELETE
--              guards on the child table, i.e. three chances to get it wrong.
--            * A FOREIGN KEY WOULD REWRITE THE INTENT. `items.subject_id
--              references subjects` must be CASCADE or RESTRICT. CASCADE
--              silently SHRINKS a signed basket when a subject is deleted -- the
--              redemption would then deliver a plan nobody authorised. RESTRICT
--              makes a stale pending checkout block a subject deletion. With
--              jsonb the basket cannot change underneath the payer: redeem
--              re-prices, finds the subject unpriced, and lands in needs_review
--              LOUDLY instead of delivering something else quietly.
--          The cost is honest: no FK integrity on subject ids inside the blob,
--          and no per-item SQL reporting. Both are answered by the re-price --
--          the only moment those ids are believed is the moment they are
--          re-validated by the same RPC that priced them.
--
--          RE-PRICE AT REDEEM, EXACT EQUALITY OR A HUMAN. Prices, the sibling
--          discount tier and the subject catalog can all move between intent
--          and payment. So redeem re-runs the SAME quote RPC over the SAME
--          frozen basket and compares to the amount the gateway actually
--          confirmed. Anything other than exact equality is recorded as
--          `needs_review` and left alone. Deliberately NOT "grant anyway if the
--          new price is lower" and NOT "grant the part that still prices": each
--          way of differing (a price change, a withdrawn subject, a sibling
--          plan started in another tab) has a different correct resolution, and
--          only a person can pick it. We must never keep money without
--          delivering, nor deliver without recording why -- so both halves are
--          written down and neither is guessed.
--
--          EXACTLY ONCE. `checkout_redeem_plan` takes a row lock on the
--          session, refuses when `redeemed_at is not null`, and sets
--          `redeemed_at` in the SAME transaction as the apply. A gateway retry,
--          a double callback and a page refresh therefore see a decided row.
--          Underneath it, the two existing idempotency layers still hold:
--          `payments` UNIQUE(provider, provider_ref), `payment_events`
--          UNIQUE(provider, event_id), and `apply_plan_change`'s replay guard
--          -- which is keyed here on the ORDER (`checkout:<order>`), a value
--          stable across every retry, rather than on the 5-minute time bucket
--          the interactive path uses.
--
--          `needs_review` IS TERMINAL ON PURPOSE. It sets `redeemed_at` too, so
--          a replayed callback does not keep re-attempting an apply that has
--          already been judged unsafe. Clearing it is a human action (013 check
--          118 is the alarm that says one is waiting).
--
--          WHY quote_child_plan CHANGES. Audit invariant H7 says the preview
--          and the charge are ONE computation. It was not true on the
--          start-a-plan screen: `quote_child_plan` returned the config's
--          `trial_days` and the plan `total`, while `create_child_plan` granted
--          ONE free trial per child (any prior subscription row => no second
--          trial) and therefore charged 0 or the total depending on a fact the
--          quote never looked at. The preview contradicted the charge in BOTH
--          directions. The quote now applies that same rule and emits `due_now`
--          beside it, so the number on the screen, the number stored on the
--          intent and the number the gateway is asked for are one value.
--          `create_child_plan` needs no edit: it already returns `v_q || ...`
--          and computes the trial with the identical predicate.
--
--          WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It does not enable any
--          payment flag (production stays `off`), does not touch the entitlement
--          mirror of migration 124 (the producers are still the only writers,
--          and redeem reaches them through create_child_plan /
--          apply_plan_change like every other caller), does not add a card or
--          token column, and does not give the callback a direct write path
--          into `entitlements`.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql -- checkout_intent_kind,
--                    checkout_redemption_status;
--          * 007_subscriptions_payments_coupons.sql -- the eight
--                    checkout_sessions columns and the two named CHECKs;
--          * 011_indexes_constraints_functions_triggers.sql -- the three partial
--                    indexes, fn_checkout_intent_immutable + its trigger, the
--                    re-issued quote_child_plan, and the four checkout intent
--                    functions with their revoke/grant lines;
--          * 013_validation_queries.sql -- NEW checks 117 and 118, and an
--                    amendment to check 114 (which measured the EXISTENCE of a
--                    legitimate non-producer grant as drift).
-- Backport status: completed
-- Destructive change: no. Additive columns, additive functions, one function
--          body replaced (quote_child_plan) and one new trigger. No row is
--          deleted or rewritten. Rollback is `create or replace` from git plus
--          dropping the trigger; the columns are inert once nothing reads them.
-- Rollback notes:
--          1. Restore quote_child_plan from git (011).
--          2. drop trigger trg_checkout_intent_immutable on public.checkout_sessions;
--             drop function public.checkout_redeem_plan(text),
--                           public.checkout_intent_price(text),
--                           public.checkout_intent_open(uuid,public.checkout_intent_kind,jsonb,text,int),
--                           public.checkout_flag_redemption(text,text);
--          3. LEAVE THE COLUMNS. They are inert, and dropping them discards the
--             evidence of what a paid session was for.
--
-- SELF-TRANSACTING. This file wraps itself in begin/commit, matching migrations
-- 120-124. It must NEVER be `\i`'d inside a from-zero rebuild -- that is the
-- CLAUDE.md rule migration 095 exists to enforce. Run bare, against staging
-- first, then production.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Enums  (backport -> 001)
-- -----------------------------------------------------------------------------
-- CHECKOUT INTENT vocabulary (migration 125).
--
-- `checkout_intent_kind` says which RPC a verified payment redeems into, and it
-- is recorded at intent time rather than inferred at redeem time on purpose: a
-- parent who authorised "start a plan with these three subjects" must never have
-- that quietly become "change the existing plan" because a subscription appeared
-- in between. When reality no longer matches the recorded kind, that is a
-- needs_review, not a different delivery.
--
-- `checkout_redemption_status` has NO 'pending' value. Absence of a status IS
-- pending; both values below are terminal and are written together with
-- `redeemed_at`, which is what makes "exactly once" a single NULL test.
do $mig$ begin
  create type public.checkout_intent_kind as enum ('plan_start', 'plan_change');
exception when duplicate_object then null; end $mig$;

do $mig$ begin
  create type public.checkout_redemption_status as enum ('applied', 'needs_review');
exception when duplicate_object then null; end $mig$;

-- -----------------------------------------------------------------------------
-- 2. The intent, on checkout_sessions  (backport -> 007)
-- -----------------------------------------------------------------------------
alter table public.checkout_sessions
  add column if not exists intent_kind        public.checkout_intent_kind,
  -- ON DELETE SET NULL, never CASCADE: deleting a child must not delete the
  -- record of money that was taken. A redemption whose student is gone is a
  -- needs_review with the payment row still standing, which is the only version
  -- of this that can be refunded.
  add column if not exists student_profile_id uuid
    references public.students (profile_id) on delete set null,
  add column if not exists intent_items       jsonb,
  add column if not exists intent_quote       jsonb,
  add column if not exists expires_at         timestamptz,
  add column if not exists redeemed_at        timestamptz,
  add column if not exists redemption_status  public.checkout_redemption_status,
  add column if not exists redemption_note    text;

comment on column public.checkout_sessions.intent_kind is
  'Migration 125. NULL = a session with no intent (the owner''s protocol test, '
  'and every row written before this migration). Non-NULL = a verified payment '
  'for this order MAY be redeemed into a plan, exactly once.';
comment on column public.checkout_sessions.intent_items is
  'The FROZEN basket the parent authorised: [{subject_id, interval}], already '
  'through plan_items_normalize. Re-priced at redeem time by the same RPC that '
  'priced it here; never edited, and deliberately carrying no foreign key, so a '
  'deleted subject cannot silently shrink what was bought.';
comment on column public.checkout_sessions.intent_quote is
  'The quote the amount came from, kept as evidence. The charge is '
  'checkout_sessions.amount; this is what it was computed from.';
comment on column public.checkout_sessions.redemption_note is
  'Why a redemption needs a human: expired | student_gone | plan_already_live | '
  'subscription_changed | price_changed | reprice_failed:<sqlstate> | '
  'apply_failed:<sqlstate> | child_login_email_failed. The last one sits on an '
  'APPLIED row -- the plan was delivered and only the child login needs '
  'repairing -- so a note is what marks "a human is needed", not the status.';

-- WHAT THIS CHECK DELIBERATELY OMITS. `student_profile_id is not null` is NOT
-- one of the conjuncts, even though an intent is meaningless without a child.
-- A CHECK is re-evaluated on every UPDATE, and the FK's ON DELETE SET NULL is an
-- UPDATE -- so requiring it here would make deleting a child fail on any old
-- checkout row. It is therefore enforced where it is enforceable: at open time,
-- by checkout_intent_open, and again at redeem time, which refuses a session
-- whose child is gone rather than guessing one.
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
        and amount > 0));

-- A redemption is DECIDED or it has not happened. The two columns move
-- together, and neither can exist without an intent to redeem.
alter table public.checkout_sessions
  drop constraint if exists ck_checkout_redemption;
alter table public.checkout_sessions
  add constraint ck_checkout_redemption check (
        (redeemed_at is null) = (redemption_status is null)
    and (redemption_status is null or intent_kind is not null)
    and (redemption_note is null or length(redemption_note) <= 200));

-- -----------------------------------------------------------------------------
-- 3. Indexes  (backport -> 011)
-- -----------------------------------------------------------------------------
-- All three are PARTIAL and all three exist to answer an operational question
-- fast on a table that is otherwise written once per purchase.
create index if not exists idx_checkout_intent_student
  on public.checkout_sessions (student_profile_id, created_at desc)
  where intent_kind is not null;

-- "Money taken, nothing delivered" -- 013 check 118 reads exactly this.
create index if not exists idx_checkout_paid_unredeemed
  on public.checkout_sessions (created_at desc)
  where status = 'paid' and intent_kind is not null and redeemed_at is null;

-- "A human owes this family an answer."
create index if not exists idx_checkout_needs_review
  on public.checkout_sessions (created_at desc)
  where redemption_status = 'needs_review';

-- -----------------------------------------------------------------------------
-- 4. The intent is frozen once it exists  (backport -> 011)
-- -----------------------------------------------------------------------------
-- WHAT THE PARENT AUTHORISED IS EVIDENCE. Everything that decides what is
-- delivered, and for how much, is immutable from the moment the session is
-- opened: an UPDATE that moved the basket or the amount would let a signed
-- payment deliver something else, and the signature would still verify.
--
-- TWO DELIBERATE HOLES, both one-way:
--   * student_profile_id may go to NULL, because the FK's ON DELETE SET NULL is
--     an UPDATE and blocking it would make deleting a child impossible. It can
--     never be re-pointed at another child.
--   * redemption_status may move OFF 'needs_review', because that is exactly
--     what an operator resolving one does. It can never move off 'applied', and
--     redeemed_at can never be cleared -- so a delivered plan cannot be made to
--     look undelivered.
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
  'Migration 125. Freezes the signed intent (child, basket, amount, currency, '
  'order, expiry, owner) and forbids un-deciding a redemption. Two one-way '
  'exceptions: the FK cascade may NULL student_profile_id, and an operator may '
  'move a needs_review to applied.';

drop trigger if exists trg_checkout_intent_immutable on public.checkout_sessions;
create trigger trg_checkout_intent_immutable
  before update on public.checkout_sessions
  for each row execute function public.fn_checkout_intent_immutable();

-- -----------------------------------------------------------------------------
-- 5. quote_child_plan: the preview IS the charge  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Re-issued verbatim from 011 with ONE addition: the trial rule
-- create_child_plan actually applies, and the `due_now` that follows from it.
-- `create or replace` PRESERVES ACLs, but the revoke/grant pair is re-issued
-- below anyway -- carrying it explicitly is the house rule, not an optimisation.
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
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

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

comment on function public.quote_child_plan(uuid, jsonb) is
  'Migration 109: read-only price quote for a PER-SUBJECT basket [{subject_id, interval}]. Prices are re-read from subjects_pricing; the sibling discount (2nd 10% / 3rd+ 15%) is applied per cycle group with today''s rounding rule, so a uniform basket returns exactly the number quote_child_subscription always returned. Migration 125: also applies create_child_plan''s one-trial-per-child rule and returns due_now -- the preview and the charge are one computation (audit H7).';

revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_child_plan(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Opening an intent  (backport -> 011)
-- -----------------------------------------------------------------------------
-- THE ONLY WAY A PAYABLE SESSION COMES INTO EXISTENCE. It quotes and inserts in
-- ONE transaction, so the stored amount is provably the RPC's own number and
-- there is no parameter through which a caller could name a price. The ORDER is
-- minted by the caller (a CSPRNG loop that retries on the unique index of
-- migration 123) and passed in; a collision surfaces here as SQLSTATE 23505 and
-- the caller mints again.
--
-- It takes the SAME family advisory lock create_child_plan takes, so an intent
-- cannot be opened against a plan another tab is creating at that instant.
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

  if p_kind = 'plan_start' then
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
  else
    -- Raises no_data_found when there is no live subscription to change.
    v_q   := public.quote_plan_change(p_student_profile_id, p_items);
    v_due := (v_q->>'due_now')::numeric;
    v_sub := (v_q->>'subscription_id')::uuid;
  end if;

  -- A checkout for nothing must not exist. A free change (a removal, a
  -- reinstatement, a scheduled cycle move, a plan that rides a trial) is applied
  -- directly by its own action; routing it through a payment would invent a
  -- charge, and a zero-amount signed request is not a thing the gateway accepts.
  if v_due is null or v_due <= 0 then
    raise exception 'checkout: nothing is due for this change'
      using errcode = 'check_violation', hint = 'nothing_due';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id, 'interval', n.interval)), '[]'::jsonb)
    into v_norm
  from public.plan_items_normalize(p_items) n;

  insert into public.checkout_sessions
    (owner_parent_profile_id, kind, child_subscription_id, amount, currency,
     status, provider, provider_session_id,
     intent_kind, student_profile_id, intent_items, intent_quote, expires_at)
  values
    (v_owner, 'subscription', v_sub, v_due, coalesce(v_q->>'currency', 'AZN'),
     'pending', 'azericard', p_order,
     p_kind, p_student_profile_id, v_norm, v_q, v_exp)
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
  'Migration 125: opens a PENDING checkout carrying the intent (child, frozen basket) and the quote RPC''s OWN due_now. Mutates nothing else -- the plan is applied only by checkout_redeem_plan after a verified payment. Raises check_violation/nothing_due for a free change and unique_violation/already_subscribed for a plan_start on a child who already has one.';

revoke all on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  from public, anon, authenticated;
grant execute on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  to service_role;

-- -----------------------------------------------------------------------------
-- 7. Re-pricing an intent, read-only  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Used at SIGNING time, before the parent is sent to the bank, so a stale
-- pending session is never signed for a number that no longer stands. It is the
-- same computation redeem runs; running it here only means the mismatch is
-- caught before money moves instead of after.
create or replace function public.checkout_intent_price(p_order text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_s   public.checkout_sessions%rowtype;
  v_q   jsonb;
  v_due numeric(12,2);
  v_sub uuid;
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
    if v_s.intent_kind = 'plan_start' then
      if exists (
        select 1 from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
      ) then
        return jsonb_build_object('ok', false, 'reason', 'plan_already_live');
      end if;
      v_q := public.quote_child_plan(v_s.student_profile_id, v_s.intent_items);
    else
      v_q   := public.quote_plan_change(v_s.student_profile_id, v_s.intent_items);
      v_sub := (v_q->>'subscription_id')::uuid;
      if v_s.child_subscription_id is distinct from v_sub then
        return jsonb_build_object('ok', false, 'reason', 'subscription_changed');
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
  'Migration 125: read-only re-quote of a stored intent, for the moment before the redirect is signed. Returns {ok,reason,amount,quoted}; mutates nothing.';

revoke all on function public.checkout_intent_price(text) from public, anon, authenticated;
grant execute on function public.checkout_intent_price(text) to service_role;

-- -----------------------------------------------------------------------------
-- 8. Redeeming a PAID intent -- the step that grants  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Called from the AzeriCard callback AFTER the signature verified, the TRTYPE=90
-- status query agreed, the transaction identity matched, and the outcome was
-- recorded as approved (which is what sets checkout_sessions.status = 'paid').
-- It refuses to do anything for a session that is not 'paid', so it cannot be
-- turned into a grant path by calling it early.
--
-- EXACTLY ONCE: the row is locked FOR UPDATE and `redeemed_at` is the claim.
-- Both terminal outcomes set it, so a gateway retry, a double callback or a
-- refresh finds a decided row and returns what was decided.
--
-- NOTHING HERE WRITES `entitlements`. It calls create_child_plan /
-- apply_plan_change like every other caller and lets migration 124's producer
-- triggers mirror the result. A rail that wrote access directly would be the
-- first drift, with no invoice and no ledger row to reconcile against.
create or replace function public.checkout_redeem_plan(p_order text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s       public.checkout_sessions%rowtype;
  v_q       jsonb;
  v_due     numeric(12,2);
  v_res     jsonb := '{}'::jsonb;
  v_note    text;
  v_live    uuid;
  v_sub     uuid;
  v_outcome text;
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
      if v_s.intent_kind = 'plan_start' then
        select id into v_live from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
        order by created_at desc
        limit 1;
        if v_live is not null then
          v_note := 'plan_already_live';
        else
          v_q   := public.quote_child_plan(v_s.student_profile_id, v_s.intent_items);
          v_due := (v_q->>'due_now')::numeric;
        end if;
      else
        v_q   := public.quote_plan_change(v_s.student_profile_id, v_s.intent_items);
        v_due := (v_q->>'due_now')::numeric;
        v_sub := (v_q->>'subscription_id')::uuid;
        if v_s.child_subscription_id is distinct from v_sub then
          v_note := 'subscription_changed';
        end if;
      end if;
    exception when others then
      -- A subject withdrawn from the catalog, pricing deactivated, the
      -- subscription cancelled in another tab: all land here.
      v_note := 'reprice_failed:' || sqlstate;
    end;
  end if;

  -- EXACT EQUALITY OR A HUMAN. See the header: every way of differing has a
  -- different correct resolution, and delivering a DIFFERENT plan than the one
  -- that was paid for is the failure this whole migration exists to prevent.
  if v_note is null and v_due is distinct from v_s.amount then
    v_note := 'price_changed';
  end if;

  if v_note is null then
    begin
      if v_s.intent_kind = 'plan_start' then
        v_res := public.create_child_plan(v_s.student_profile_id, v_s.intent_items);
        v_sub := (v_res->>'subscription_id')::uuid;
      else
        -- Keyed on the ORDER, not on the interactive path's 5-minute bucket: an
        -- order is stable across every retry this callback can receive.
        v_res := public.apply_plan_change(
                   v_s.student_profile_id, v_s.intent_items, 'checkout:' || p_order);
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
  -- none is ever added.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'redeem:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'outcome', v_outcome,
            'note', v_note,
            'amount_paid', v_s.amount,
            'amount_repriced', v_due,
            'subscription_id', v_sub),
          now())
  on conflict do nothing;

  return jsonb_build_object(
    'outcome',            v_outcome,
    'note',               v_note,
    'student_profile_id', v_s.student_profile_id,
    'subscription_id',    v_sub,
    -- create_child_plan allocates the deferred 8-digit login ID; the caller has
    -- to finish that by setting the synthetic auth email, which is an Auth-admin
    -- call no SQL function can make.
    'new_child_unique_id', v_res->>'new_child_unique_id',
    'auth_user_id',        v_res->>'auth_user_id');
end;
$$;

comment on function public.checkout_redeem_plan(text) is
  'Migration 125: the ONLY path from a verified AzeriCard payment to an applied plan. Requires checkout_sessions.status = ''paid'', locks the row, re-prices the frozen intent and demands exact equality with the amount paid; anything else is recorded as needs_review with a reason. Sets redeemed_at exactly once, so retries and double callbacks are no-ops. Writes no entitlement row -- it calls create_child_plan / apply_plan_change and lets migration 124''s producer triggers mirror them.';

revoke all on function public.checkout_redeem_plan(text) from public, anon, authenticated;
grant execute on function public.checkout_redeem_plan(text) to service_role;

-- -----------------------------------------------------------------------------
-- 9. Flagging a redemption that needs a human  (backport -> 011)
-- -----------------------------------------------------------------------------
-- The one follow-up SQL cannot perform is the Supabase Auth admin call that
-- turns a freshly allocated 8-digit id into a login. When that fails the plan IS
-- applied and paid for, and the child still cannot sign in. That is a human's
-- problem, not a silent one -- so the caller writes the reason here.
--
-- IT WRITES THE NOTE AND NOTHING ELSE. Flipping the status to 'needs_review'
-- would be the obvious move and would be a lie: the plan WAS delivered, and
-- 'needs_review' is this schema's word for "we are holding money we have not
-- delivered on". Two different problems that need two different answers must not
-- share one word. 013 check 118 therefore treats a decided redemption carrying a
-- note as needing a human REGARDLESS of which status it holds, and the ledger
-- (payment_events 'redeem:<order>') keeps the fact that it applied.
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
  return coalesce(v_ok, false);
end;
$$;

comment on function public.checkout_flag_redemption(text, text) is
  'Migration 125: record why a DECIDED redemption still needs a human -- for the follow-up steps SQL cannot perform (the Auth-admin call that activates a child login). Writes redemption_note only: the status keeps saying what happened to the money, and 013 check 118 surfaces any decided redemption carrying a note.';

revoke all on function public.checkout_flag_redemption(text, text) from public, anon, authenticated;
grant execute on function public.checkout_flag_redemption(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 10. Verify, in-transaction. ABORT rather than half-apply.
-- -----------------------------------------------------------------------------
do $mig$
declare
  n        int;
  v_parent uuid;
  v_child  uuid;
  v_id     uuid;
  v_raised boolean := false;
begin
  -- (a) every intent column landed
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'checkout_sessions'
    and column_name in ('intent_kind', 'student_profile_id', 'intent_items',
                        'intent_quote', 'expires_at', 'redeemed_at',
                        'redemption_status', 'redemption_note');
  if n <> 8 then
    raise exception '125: expected 8 intent columns on checkout_sessions, found %', n;
  end if;

  -- (b) both CHECKs are present
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.checkout_sessions'::regclass
    and conname in ('ck_checkout_intent_shape', 'ck_checkout_redemption');
  if n <> 2 then
    raise exception '125: expected both intent CHECKs, found %', n;
  end if;

  -- (c) the freeze trigger is ARMED (not merely defined)
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.checkout_sessions'::regclass
      and tgname = 'trg_checkout_intent_immutable'
      and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception '125: trg_checkout_intent_immutable is not armed';
  end if;

  -- (d) the four functions exist and none of them is reachable by a logged-in
  --     browser session. A grant path that anon or authenticated can call is
  --     the whole defect back again, wearing a different hat.
  select count(*) into n from (values
    ('public.checkout_intent_open(uuid,public.checkout_intent_kind,jsonb,text,int)'),
    ('public.checkout_intent_price(text)'),
    ('public.checkout_redeem_plan(text)'),
    ('public.checkout_flag_redemption(text,text)')
  ) as s(sig)
  where to_regprocedure(s.sig) is null
     or has_function_privilege('anon',          to_regprocedure(s.sig)::oid, 'EXECUTE')
     or has_function_privilege('authenticated', to_regprocedure(s.sig)::oid, 'EXECUTE');
  if n <> 0 then
    raise exception '125: % checkout intent function(s) missing or not locked down', n;
  end if;

  -- (e) the quote now carries due_now, and it obeys the one-trial-per-child rule
  if position('due_now' in pg_get_functiondef(
       to_regprocedure('public.quote_child_plan(uuid,jsonb)'))) = 0 then
    raise exception '125: quote_child_plan does not return due_now';
  end if;
  if position('v_had_any' in pg_get_functiondef(
       to_regprocedure('public.quote_child_plan(uuid,jsonb)'))) = 0 then
    raise exception '125: quote_child_plan does not apply the one-trial rule';
  end if;

  -- (f) NO EXISTING ROW IS AFFECTED. Every session written before this migration
  --     has no intent, is never redeemable, and is untouched by the freeze
  --     trigger. If that were false the migration would be rewriting history.
  select count(*) into n from public.checkout_sessions where intent_kind is not null;
  if n <> 0 then
    raise exception '125: pre-existing rows acquired an intent (%), which is impossible', n;
  end if;

  -- (g) the freeze actually REFUSES. Proven on a throwaway row, because "the
  --     trigger exists" and "the trigger refuses" are different claims and only
  --     the second one is the guarantee. The probe row is deleted either way.
  select cs.owner_parent_profile_id, cs.student_profile_id
    into v_parent, v_child
  from public.child_subscriptions cs
  limit 1;
  if v_parent is not null then
    insert into public.checkout_sessions
      (owner_parent_profile_id, kind, amount, currency, status, provider,
       provider_session_id, intent_kind, student_profile_id, intent_items,
       expires_at)
    values
      (v_parent, 'subscription', 1, 'AZN', 'pending', 'azericard',
       '19700101000000', 'plan_start', v_child, '[{"probe": true}]'::jsonb,
       now() + interval '1 hour')
    returning id into v_id;
    begin
      update public.checkout_sessions set amount = 2 where id = v_id;
    exception when check_violation then
      v_raised := true;
    end;
    delete from public.checkout_sessions where id = v_id;
    if not v_raised then
      raise exception '125: the intent freeze did not refuse a price change';
    end if;
  else
    raise notice '125: no subscription row to build a freeze probe from — freeze proven by 013 check 117 instead';
  end if;

  raise notice '125: checkout intent installed; % pre-existing session(s) left untouched',
    (select count(*) from public.checkout_sessions);
end
$mig$;

commit;

-- =============================================================================
-- End of 2026_08_20_125_checkout_intent.sql
-- =============================================================================
