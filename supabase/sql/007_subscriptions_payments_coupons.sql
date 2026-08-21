-- =============================================================================
-- 007_subscriptions_payments_coupons.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 007 of 013.
--
-- Responsibility : Subscription & payment SCHEMA (Stripe-first, provider-agnostic):
--                  subscription_plans, subscriptions, payments, payment_events,
--                  coupons, coupon_redemptions.
-- Run order      : After 006. Before 008.
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS). Non-destructive.
--
-- SECURITY NOTES (enforced by RLS in 010 + server logic later):
--   * payment_events is service-role/admin only; it is the webhook idempotency log.
--   * Clients NEVER decide payment success; subscriptions activate only after a
--     verified webhook (handled by Edge Functions in a later stage).
--   * No card data is stored here — only provider references and status.
--   * Optional bank transfer is excluded. SMS is excluded.
--
-- This stage creates only the database schema. Payment app features / webhooks
-- belong to a later stage and are NOT implemented here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subscription_plans : weekly/monthly/yearly plans.
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  price_amount    numeric(12,2) not null,
  currency        text not null default 'AZN',
  interval        public.plan_interval not null,
  stripe_price_id text,                          -- provider reference (server-managed)
  status          public.catalog_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- subscriptions : a subscription owned by a profile (usually parent), optionally
-- scoped to a specific student.
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  owner_profile_id      uuid not null references public.profiles (id) on delete cascade,
  student_profile_id    uuid references public.students (profile_id) on delete set null,
  plan_id               uuid references public.subscription_plans (id) on delete set null,
  status                public.subscription_status not null default 'incomplete',
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  provider              text not null default 'stripe',
  provider_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.subscriptions is
  'Subscription state. Activation/expiration is driven by verified provider webhooks, never by client redirects.';

-- -----------------------------------------------------------------------------
-- payments : payment records. No card/PAN data — provider references only.
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  -- Audit M13 (migration 036): payment records survive account deletion — the
  -- profile FK anonymizes (SET NULL) instead of cascading the row away.
  profile_id      uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider        text not null default 'stripe',
  provider_ref    text,                          -- e.g. payment intent / charge id
  amount          numeric(12,2) not null,
  currency        text not null default 'AZN',
  status          public.payment_status not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_payments_provider_ref unique (provider, provider_ref)
);

-- -----------------------------------------------------------------------------
-- payment_events : raw webhook event log + idempotency key.
-- (provider, event_id) UNIQUE guarantees a webhook is processed at most once.
-- RLS: service-role / admin only.
-- -----------------------------------------------------------------------------
create table if not exists public.payment_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'stripe',
  event_id     text not null,                    -- provider event id (idempotency key)
  payload_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint uq_payment_event unique (provider, event_id)
);

comment on table public.payment_events is
  'Webhook idempotency log. UNIQUE(provider, event_id) prevents duplicate processing on replay/out-of-order delivery.';

-- -----------------------------------------------------------------------------
-- coupons : promo codes.
-- -----------------------------------------------------------------------------
create table if not exists public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  discount_type public.discount_type not null,
  value         numeric(12,2) not null,
  max_redemptions integer,
  valid_from    timestamptz,
  valid_until   timestamptz,
  status        public.catalog_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- coupon_redemptions : coupon usage records.
-- -----------------------------------------------------------------------------
create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  payment_id  uuid references public.payments (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  constraint uq_coupon_profile unique (coupon_id, profile_id)
);

-- =============================================================================
-- CHILD-BASED SUBSCRIPTIONS & SUBJECT PRICING (Stage 7, increment 2)
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
--
-- DEPRECATION: the generic subscription_plans / subscriptions tables above are
-- DEPRECATED in favour of the child-based, subject-priced model below
-- (child_subscriptions). They are intentionally left in place (non-destructive);
-- dropping them later requires explicit approval.
--
-- Provider-agnostic: pricing/plans live in our DB; real provider integration is
-- Stage 11. All pricing/discount/status are server/service-role written (clients
-- never set price/discount/status). RLS is in 010; indexes/triggers in 011;
-- seeds in 012.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subjects_pricing : per-subject price for each billing interval.
-- Placeholder pricing (configurable by admins). Subscription price =
-- selected-subject-count priced from here, minus the automatic sibling discount.
-- -----------------------------------------------------------------------------
create table if not exists public.subjects_pricing (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  interval     public.plan_interval not null,
  price_amount numeric(12,2) not null,
  currency     text not null default 'AZN',
  status       public.catalog_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_subject_interval_price unique (subject_id, interval)
);

-- -----------------------------------------------------------------------------
-- launch_promo_config : singleton (launch promo window + trial length).
-- Sibling discount is NOT here — it is a fixed business rule (2nd 10% / 3rd+ 15%, investor 2026-07-15)
-- computed server-side (no "Discount Settings" module).
-- -----------------------------------------------------------------------------
create table if not exists public.launch_promo_config (
  id                       smallint primary key default 1 check (id = 1),
  launch_promo_starts_at   timestamptz,
  launch_promo_ends_at     timestamptz,
  trial_days               integer not null default 7,
  updated_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- child_subscriptions : per-child subscription (parent-owned/paid).
-- Status, amounts, discount and trial dates are written ONLY by trusted server /
-- service-role code (webhook-verified). Clients can never set these.
-- Defined before the tables/ALTER that reference it.
--
-- Migration 109 REDEFINED four of these columns. Each SUBJECT now owns its own
-- cycle and its own period (see subscription_subjects below), so this row is the
-- container, not the billing anchor:
--   interval           -> the DEFAULT cycle for newly ADDED subjects, and the
--                         fallback for subscription_subjects.interval IS NULL.
--                         It is no longer the renewal anchor.
--   current_period_end -> the MAX of the subjects' period ends: "coverage ends".
--                         MAX, never MIN — a lapsing weekly subject must not
--                         expire a paid yearly one (recompute_child_access, the
--                         cancel path and uq_child_subscriptions_live all read
--                         it as "is there any coverage left").
--   next_renewal_at    -> the MIN: the NEXT charge date.
--   base/discount/total_amount -> the NEXT INVOICE, i.e. only the subjects
--                         renewing at next_renewal_at.
-- All five are written by trg_sync_subscription_period (011) and by nothing
-- else. For a single-cycle plan MAX = MIN and every amount is unchanged.
-- -----------------------------------------------------------------------------
create table if not exists public.child_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  student_profile_id       uuid not null references public.students (profile_id) on delete cascade,
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  interval                 public.plan_interval not null,
  status                   public.subscription_status not null default 'incomplete',
  trial_started_at         timestamptz,
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  next_renewal_at          timestamptz,
  base_amount              numeric(12,2),
  sibling_discount_percent numeric(5,2) not null default 0,
  discount_amount          numeric(12,2),
  total_amount             numeric(12,2),
  currency                 text not null default 'AZN',
  provider                 text not null default 'none',
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- subscription_subjects : which subjects this child subscription covers, and
-- since migration 109 ON WHICH CYCLE and FOR WHICH PERIOD.
--
-- Each subject owns its cycle AND its period: a weekly and a yearly subject on
-- one child cannot share a single current_period_end, so an interval column
-- alone would have been useless. Every new column is NULLABLE and means
-- "inherit the subscription" when NULL — that is what let the whole existing
-- estate (and every writer that predates 109) keep working with a one-time
-- backfill and no rewrite. Readers coalesce, e.g. the attempt engines gate on
-- coalesce(ss.current_period_end, cs.current_period_end).
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_subjects (
  child_subscription_id uuid not null references public.child_subscriptions (id) on delete cascade,
  subject_id            uuid not null references public.subjects (id) on delete cascade,
  added_at              timestamptz not null default now(),
  -- Migration 078: SCHEDULED removal. Access is kept until this timestamp and
  -- the subject is excluded from the NEXT recurring total. NULL = active.
  -- Removals never refund; they simply lower the next renewal. Since 109 this
  -- is always THAT SUBJECT'S own period end, not the subscription's.
  remove_at             timestamptz,
  -- Migration 109 — per-subject billing. NULL interval/period = inherit the
  -- subscription (legacy rows); pending_interval is a cycle change SCHEDULED
  -- for this subject's next renewal (never a refund, never an instant charge);
  -- price_amount is the list price frozen when the cycle opened.
  interval              public.plan_interval,
  pending_interval      public.plan_interval,
  price_amount          numeric(12,2),
  currency              text not null default 'AZN',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  primary key (child_subscription_id, subject_id)
);

-- -----------------------------------------------------------------------------
-- subscription_changes : immutable ledger of mid-cycle plan changes
-- (migration 078). Every add / reinstate / remove / cycle change must stay
-- reconstructible for the next renewal amount and for billing disputes. Written
-- ONLY by apply_plan_change() (migration 118 dropped apply_subject_change, the
-- wrapper that used to be named here). Proration is retired: remaining_ratio is
-- 1 and period_days is null on new rows, and the columns are kept because rows
-- written before that decision must stay readable exactly as they were.
--
-- 'reinstate' (migration 120) = a scheduled removal was cancelled before its
-- period lapsed. It ALWAYS carries prorated_amount = 0: no money moves, the
-- parent simply keeps coverage they had already paid for. A payment provider
-- integration will reconcile against this table, so a reinstatement logged as
-- an 'add' would look like a charge that never happened.
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_changes (
  id                      uuid primary key default gen_random_uuid(),
  child_subscription_id   uuid not null references public.child_subscriptions (id) on delete cascade,
  student_profile_id      uuid not null references public.students (profile_id) on delete cascade,
  owner_parent_profile_id uuid references public.profiles (id) on delete set null,
  -- Migration 120 widened this list with 'reinstate'. The CHECK stays INLINE so
  -- a from-zero build produces the same auto-generated constraint name
  -- (subscription_changes_change_type_check) the migration writes on a live
  -- database; 013 check 107 asserts exactly one such CHECK survives.
  change_type             text not null check (change_type in ('add', 'remove', 'plan_change', 'reinstate')),
  subject_id              uuid not null references public.subjects (id) on delete restrict,
  -- Migration 109: the cycle the row applied to. On an 'add' prorated_amount is
  -- now the FULL first-cycle price — per-subject periods leave no shared period
  -- to prorate into, and the subject receives the full cycle it pays for.
  interval                public.plan_interval,
  effective_at            timestamptz not null,
  prorated_amount         numeric(12,2) not null default 0,
  currency                text not null default 'AZN',
  recurring_before        numeric(12,2),
  recurring_after         numeric(12,2),
  discount_percent        numeric(5,2) not null default 0,
  remaining_ratio         numeric(8,6),
  period_days             numeric(10,4),
  idempotency_key         text,
  -- Real-provider baseline: filled once an actual charge is captured.
  provider                text not null default 'none',
  provider_payment_id     text,
  created_by_profile_id   uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now()
);
create index if not exists idx_sub_changes_sub
  on public.subscription_changes (child_subscription_id, created_at desc);
create index if not exists idx_sub_changes_student
  on public.subscription_changes (student_profile_id, created_at desc);
create unique index if not exists uq_sub_changes_idem
  on public.subscription_changes (child_subscription_id, idempotency_key, subject_id, change_type)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- checkout_sessions : provider-agnostic checkout
-- (subscription | olympiad | protocol_test).
--
-- Migration 123 added 'protocol_test': an acquirer integration test on the
-- bank's sandbox terminal is neither a subscription nor an olympiad, and
-- recording it as one would leave a sale nobody can explain in every future
-- reconciliation report. The CHECK stays INLINE so a from-zero build produces
-- the same auto-generated constraint name (checkout_sessions_kind_check) the
-- migration writes on a live database; 013 check 110 asserts exactly one such
-- CHECK survives.
--
-- provider_session_id carries the PROVIDER'S order id — for AzeriCard/ABB, the
-- merchant ORDER we mint. It is unique per provider (uq_checkout_provider_session
-- in 011); see that index for why uniqueness has to be the database's job.
-- -----------------------------------------------------------------------------
-- THE INTENT (migration 125). Everything from `intent_kind` down exists because
-- the columns above describe an AMOUNT and not a PURCHASE. Without a record of
-- which child and which subjects a payment was for, a verified payment has
-- nothing to act on — which is why the plan used to be applied BEFORE the money
-- was asked for, and why the money was therefore optional. With an intent the
-- order inverts: open a session, redirect, and let the verified callback redeem
-- it exactly once (checkout_redeem_plan, 011).
create table if not exists public.checkout_sessions (
  id                       uuid primary key default gen_random_uuid(),
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind                     text not null check (kind in ('subscription', 'olympiad', 'protocol_test')),
  child_subscription_id    uuid references public.child_subscriptions (id) on delete set null,
  amount                   numeric(12,2),
  currency                 text not null default 'AZN',
  status                   text not null default 'pending',
  provider                 text not null default 'none',
  provider_session_id      text,
  created_at               timestamptz not null default now(),

  -- NULL = a session with no intent: the owner's protocol test, and every row
  -- written before migration 125. Such a row is never redeemable.
  intent_kind              public.checkout_intent_kind,
  -- ON DELETE SET NULL, never CASCADE: deleting a child must not delete the
  -- record of money that was taken. A redemption whose child is gone becomes a
  -- needs_review with the payments row still standing — the only version of
  -- this that can be refunded.
  student_profile_id       uuid references public.students (profile_id) on delete set null,
  -- The FROZEN basket the parent authorised: [{subject_id, interval}], already
  -- through plan_items_normalize. Deliberately jsonb and deliberately WITHOUT a
  -- foreign key: a CASCADE from `subjects` would silently SHRINK a signed
  -- basket and deliver a plan nobody authorised, and a RESTRICT would let a
  -- stale pending checkout block a subject deletion. Redeem re-prices instead,
  -- and fails loudly.
  intent_items             jsonb,
  -- The quote the amount came from, kept as evidence.
  intent_quote             jsonb,
  -- Bounded redeemability. A forgotten pending session must not be redeemable
  -- by a replayed callback weeks later.
  expires_at               timestamptz,
  -- The exactly-once claim. Set by checkout_redeem_plan inside the same
  -- transaction as the apply, for BOTH terminal outcomes.
  redeemed_at              timestamptz,
  redemption_status        public.checkout_redemption_status,
  redemption_note          text,

  -- WHAT THIS CHECK DELIBERATELY OMITS: `student_profile_id is not null`. A
  -- CHECK is re-evaluated on every UPDATE and the FK's ON DELETE SET NULL is an
  -- UPDATE, so requiring it here would make deleting a child fail on any old
  -- checkout row. It is enforced where it is enforceable — at open time by
  -- checkout_intent_open, and again at redeem time, which refuses a session
  -- whose child is gone rather than guessing one.
  constraint ck_checkout_intent_shape check (
    intent_kind is null
    or (    intent_items is not null
        and jsonb_typeof(intent_items) = 'array'
        and jsonb_array_length(intent_items) between 1 and 20
        and expires_at is not null
        and amount is not null
        and amount > 0)),

  -- A redemption is DECIDED or it has not happened. The two columns move
  -- together, and neither can exist without an intent to redeem.
  constraint ck_checkout_redemption check (
        (redeemed_at is null) = (redemption_status is null)
    and (redemption_status is null or intent_kind is not null)
    and (redemption_note is null or length(redemption_note) <= 200))
);

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

-- -----------------------------------------------------------------------------
-- sibling_discounts : audit of the automatic discount applied.
-- -----------------------------------------------------------------------------
create table if not exists public.sibling_discounts (
  id                       uuid primary key default gen_random_uuid(),
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  child_subscription_id    uuid references public.child_subscriptions (id) on delete cascade,
  child_rank               integer not null,           -- 1, 2, 3, ...
  discount_percent         numeric(5,2) not null,       -- 0 / 15 / 20
  applied_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- payments : link to the new child subscription / checkout (additive columns).
-- -----------------------------------------------------------------------------
alter table public.payments
  add column if not exists child_subscription_id uuid references public.child_subscriptions (id) on delete set null,
  add column if not exists checkout_session_id uuid references public.checkout_sessions (id) on delete set null;

-- =============================================================================
-- entitlements : THE ACCESS RECORD (migration 124).
-- docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 — provider-agnostic, and the only
-- thing any gate is allowed to read. An ABB subscription row must NEVER *be*
-- the entitlement: that separation is what makes a forced-IAP scenario roughly
-- a two-week job instead of a rewrite.
--
-- GRAIN: one row per GRANT, keyed (source, external_ref). There is
-- deliberately NO unique index on (student, product) anywhere — on forced-IAP
-- day the same child+subject must be able to hold a LIVE abb_web grant AND a
-- LIVE apple_iap grant at the same time, and any (student, product) uniqueness
-- would make that state unrepresentable. Access is the OR over live rows.
--
-- NO `status` COLUMN. Liveness is COMPUTED:
--     revoked_at is null and starts_at <= now()
--     and (ends_at is null or ends_at > now())
-- This codebase already ran the other experiment: students.access_status is
-- documented inside the gate itself as "a display cache, not authority", and
-- recompute_child_access() exists solely to repair its drift. A stored liveness
-- flag needs a sweeper, and between sweeps it is wrong — drifting toward FREE
-- ACCESS, which is the wrong direction to be wrong in.
--
-- THE MIRROR. A row carrying a producer link (child_subscription_id /
-- olympiad_purchase_id) is MIRRORED from that producer by
-- fn_entitlement_map_subject / fn_entitlement_map_purchase (011). A direct
-- UPDATE on such a row is reverted by the next producer write or by the next
-- entitlements_reconcile(). Revocation of a mirrored grant is expressed on the
-- PRODUCER (olympiad_purchases.status = 'refunded', a subscription status
-- change). Manual/IAP grants carry both links NULL and the mirror never
-- touches them.
-- =============================================================================
create table if not exists public.entitlements (
  id                    uuid primary key default gen_random_uuid(),

  -- WHO. Access is per CHILD. The payer lives in the financial tables.
  student_profile_id    uuid not null references public.students (profile_id) on delete cascade,

  -- WHAT. Exactly one target; ck_entitlement_target enforces it.
  scope                 public.entitlement_scope not null,
  subject_id            uuid references public.subjects (id) on delete cascade,
  -- fk_entitlements_package is added in 015 — olympiad_packages does not exist
  -- yet at this point in the canonical run order.
  package_id            uuid,
  grade_id              uuid references public.grades (id) on delete set null,

  -- WHO GRANTED IT. (source, external_ref) is simultaneously the provider's
  -- idempotency key and the upsert conflict target: 'sub:<cs>:<subject>',
  -- 'oly:<purchase>', Apple's originalTransactionId, Play's purchase token,
  -- 'manual:<uuid>'. It is STABLE across renewals — history lives in
  -- audit_logs, and a stable ref makes reconciliation an exact set comparison
  -- instead of a staleness hunt.
  source                public.entitlement_source not null,
  external_ref          text not null,
  provider_account_ref  text,

  -- WHEN. Lazy. No job decides access.
  starts_at             timestamptz not null default now(),
  ends_at               timestamptz,            -- NULL = lifetime (packages only)
  revoked_at            timestamptz,
  revoked_reason        text,

  -- PROVENANCE. Never read by a gate; this is the mirror scope.
  child_subscription_id uuid references public.child_subscriptions (id) on delete cascade,
  -- fk_entitlements_purchase is added in 015 (olympiad_purchases does not
  -- exist yet either).
  olympiad_purchase_id  uuid,
  granted_by_profile_id uuid references public.profiles (id) on delete set null,
  note                  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint ck_entitlement_target check (
       (scope = 'subject'          and subject_id is not null and package_id is null)
    or (scope = 'olympiad_package' and package_id is not null and subject_id is null)),

  -- A subject grant can NEVER be lifetime. NULL ends_at means forever, and the
  -- live estate contains legacy NULL-period subscription rows that grant
  -- NOTHING today; this makes "backfilled it forward into free-forever maths"
  -- unrepresentable rather than merely unlikely.
  constraint ck_entitlement_bounded check (scope <> 'subject' or ends_at is not null),

  -- CLAUDE.md's LIFETIME rule as a constraint instead of a convention: a
  -- purchased olympiad package never expires, not even for an archived
  -- package. A future school licence wanting one academic year hits this on
  -- purpose — it forces a reviewed migration and an owner decision instead of
  -- a silent semantic change.
  constraint ck_entitlement_lifetime check (scope <> 'olympiad_package' or ends_at is null),

  constraint ck_entitlement_grade   check (scope = 'olympiad_package' or grade_id is null),
  constraint ck_entitlement_window  check (ends_at is null or ends_at > starts_at),
  constraint ck_entitlement_ref     check (length(external_ref) between 1 and 200),
  constraint ck_entitlement_reason  check (revoked_reason is null or
                                           (revoked_at is not null and length(revoked_reason) <= 200))
);

comment on table public.entitlements is
  'THE access record (STORE_PAYMENTS_COMPLIANCE §4.1). One row per GRANT, keyed '
  '(source, external_ref). Access is the OR over LIVE rows: revoked_at IS NULL '
  'AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()). There is '
  'deliberately NO unique index on (student, product) — one child may hold a '
  'live abb_web grant AND a live apple_iap grant for the same subject. '
  'Rows with a producer link (child_subscription_id / olympiad_purchase_id) are '
  'MIRRORED: a direct UPDATE on one is reverted by the next producer write or by '
  'entitlements_reconcile(). Revocation of a mirrored grant is expressed on the '
  'PRODUCER. Manual grants (both links NULL) are never touched by the mirror.';

comment on column public.entitlements.external_ref is
  'The producer''s idempotency key AND the upsert target, namespaced by rail: '
  'sub:<child_subscription>:<subject> | oly:<purchase> | Apple '
  'originalTransactionId | Play purchase token | manual:<uuid>. Stable across '
  'renewals — a renewal moves ends_at, it does not mint a row.';

comment on column public.entitlements.source is
  'The RAIL that produced the grant, never the commercial flavour. A trial is '
  'an abb_web grant with a short period; the giveaway window owns no rows at all.';

-- =============================================================================
-- End of 007_subscriptions_payments_coupons.sql
-- =============================================================================
