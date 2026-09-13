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
  -- FK is added in 015 after olympiad_purchases exists; the nullable column is
  -- declared here so canonical 011 can create its support index in run order.
  olympiad_purchase_id uuid,
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
  -- > 0, not >= 0: admin_upsert_subject_price refuses 0, and a free
  -- subject is delivered through the free-access rail rather than by
  -- pricing it at zero. Migration 162.
  price_amount numeric(12,2) not null check (price_amount > 0),
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
  -- DELIBERATELY STILL NOT NULL / ON DELETE CASCADE, unlike checkout_sessions,
  -- sibling_discounts, free_trials and iap_purchase_intents, which migration 174
  -- moved to nullable SET NULL. A subscription is an ACCESS record for a child
  -- who is still here, not a receipt: a NULL owner would be a subscription no
  -- surface could renew, change or cancel. So when the owner leaves a child who
  -- SURVIVES (a co-parent still holds an active link), the row is HANDED OVER --
  -- promote_surviving_co_parent (011) re-points it before the parent row goes --
  -- and when the child does not survive it cascades away with the child anyway.
  -- Do not "harmonise" this with the four history tables; the promotion is the
  -- reason it does not need to be.
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
  -- Migration 174: NULLABLE, ON DELETE SET NULL -- the same rule
  -- student_profile_id below already carries, and for the same reason. Deleting
  -- the PARENT used to CASCADE this row away, so a family that closed their
  -- account took the record of every basket they had ever authorised with them.
  -- Required at CREATION time by the endpoint, which is where it is enforceable.
  owner_parent_profile_id  uuid references public.profiles (id) on delete set null,
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
  -- Migration 127. The CHANGE the parent authorised, per subject:
  -- [{subject_id, op, interval}] with op in add|reinstate|cycle|remove. The
  -- basket above is an ABSOLUTE claim about the whole plan at one past moment,
  -- and applying it later overwrites everything that happened since -- which is
  -- how an abandoned checkout could UN-CANCEL a subject the parent had since
  -- cancelled, and could REMOVE one they had since added. A delta composes with
  -- whatever the plan looks like when the money lands; a snapshot cannot.
  -- NULL for plan_start, for an olympiad intent, and for pre-127 rows.
  intent_delta             jsonb,
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
  -- Migration 127. What this payment ACTUALLY delivered, written once by
  -- checkout_redeem_plan in the same statement that stamps redeemed_at. It is
  -- a SEPARATE column from intent_delta and has to stay one: the two differ
  -- whenever the world moved between signing and redeeming, and a reversal
  -- that revokes from the INTENT closes the period of a subject a DIFFERENT
  -- payment paid for. NULL = nothing was delivered, or the redemption predates
  -- this column; a reversal then takes nothing back and asks for a human.
  delivered_items          jsonb,

  -- MIGRATION 136: the language the parent opened this checkout in, so the
  -- gateway CALLBACK can render its result page in it. That request is a
  -- cross-site POST, so the SameSite `locale` cookie never arrives with it, and
  -- BACKREF carries no `?lang=` any more: AzeriCard matches BACKREF against the
  -- URL registered for the terminal, and directed us to the LANG field for the
  -- language of THEIR hosted page (2026-08-23). NULL on pre-136 rows, which
  -- renders in the default language exactly as they were built.
  --
  -- NOT in the intent-freeze trigger's column list, deliberately: the locale is
  -- a rendering detail, not part of what the parent authorised, and freezing it
  -- would make a language change look like intent tampering.
  locale                   text
    constraint ck_checkout_locale check (locale is null or locale in ('az', 'en', 'ru')),

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
        and amount > 0
        and (intent_delta is null
             or (jsonb_typeof(intent_delta) = 'array'
                 and jsonb_array_length(intent_delta) <= 40))
        and (delivered_items is null
             or (jsonb_typeof(delivered_items) = 'array'
                 and jsonb_array_length(delivered_items) <= 40)))),

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
comment on column public.checkout_sessions.delivered_items is
  'Migration 127. What this payment ACTUALLY delivered, recorded by '
  'checkout_redeem_plan in the same statement that stamps redeemed_at: '
  '[{subject_id, op, interval}] for a plan (the change as it was applied), '
  '[{package_id, grade_id}] for an olympiad package. A REVERSAL revokes from '
  'THIS and never from the frozen intent -- revoking from the intent takes '
  'back a subject some other payment paid for. NULL means nothing was '
  'delivered, or the redemption predates this column; either way a reversal '
  'must take nothing back and ask for a human instead.';
comment on column public.checkout_sessions.intent_quote is
  'The quote the amount came from, kept as evidence. The charge is '
  'checkout_sessions.amount; this is what it was computed from.';
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

-- -----------------------------------------------------------------------------
-- sibling_discounts : audit of the automatic discount applied.
-- -----------------------------------------------------------------------------
create table if not exists public.sibling_discounts (
  id                       uuid primary key default gen_random_uuid(),
  -- Migration 174: NULLABLE, ON DELETE SET NULL -- the audit of a discount that
  -- was actually applied outlives the person it was applied for.
  owner_parent_profile_id  uuid references public.profiles (id) on delete set null,
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


-- ---------------------------------------------------------------------------
-- MIGRATION 140 - the one-time 1-day pre-purchase Free Trial.
-- ---------------------------------------------------------------------------
create table if not exists public.free_trials (
  id                       uuid primary key default gen_random_uuid(),
  student_profile_id       uuid not null references public.students(profile_id) on delete cascade,
  -- Migration 174: NULLABLE, ON DELETE SET NULL. The ledger is per CHILD
  -- (uq_free_trials_student below); this column records WHO activated it and
  -- must not take the ledger row with them when their account closes.
  owner_parent_profile_id  uuid references public.profiles(id) on delete set null,
  subject_ids              uuid[] not null,
  activated_at             timestamptz not null default now(),
  ends_at                  timestamptz not null,
  locale                   text not null default 'az',
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- ONCE PER CHILD, guaranteed by the database rather than by a check the
  -- application might skip. A second activation raises unique_violation, which
  -- activate_free_trial catches and reports as trial_already_used.
  --
  -- HONEST LIMIT, stated rather than implied: deleting and recreating the child
  -- resets this, because every per-child table cascades from the auth user. The
  -- existing paid trial has the same hole. The ceiling here is friction, not
  -- prevention, and a per-PARENT lifetime cap was deliberately NOT added -- it
  -- would punish large families to stop an attack nobody has attempted.
  constraint uq_free_trials_student unique (student_profile_id),
  -- The 2-subject cap, in the one place a hand-crafted request cannot route
  -- around. The RPC checks it too; this is the layer that cannot be bypassed.
  constraint ck_free_trial_subjects check (cardinality(subject_ids) between 1 and 2),
  constraint ck_free_trial_window   check (ends_at > activated_at),
  constraint ck_free_trial_locale   check (locale in ('az', 'en', 'ru'))
);

comment on table public.free_trials is
  'The one-time 1-day pre-purchase Free Trial (migration 140). One row per child, '
  'ever. ends_at is the SINGLE source of truth for the countdown and every '
  'notification rung; expiry is DERIVED from it and never written by a job. The '
  'entitlements rows it grants are the access authority -- subject_ids is this '
  'ledger''s own record of what was chosen.';

create index if not exists idx_free_trials_ends_at
  on public.free_trials (ends_at) where cancelled_at is null;
create index if not exists idx_free_trials_parent
  on public.free_trials (owner_parent_profile_id);


-- -----------------------------------------------------------------------------
-- MONEY CANNOT GO NEGATIVE (migration 2026_08_29_162).
--
-- The two ADMIN-EDITABLE prices carry their constraint inline on the column
-- (subjects_pricing above, olympiad_packages in 015). These are the rest: money
-- and percentage columns written only by RPCs and triggers. They are guarded
-- here for the same reason the editable ones are — an audit found exactly ONE
-- bounding CHECK in the whole schema, while RLS grants any signed-in admin plain
-- table writes, so `PATCH /rest/v1/<table>` with a negative amount succeeded.
-- Application validation is the readable error; the constraint is the boundary.
--
-- A guarded do-block rather than inline column checks, because `create table if
-- not exists` above is a no-op on a database that already has these tables, so
-- an inline check would silently never arrive there.
--
-- The floors differ ON PURPOSE and each is argued in migration 162's header:
-- >= 0 where zero is a real state (a comped grant writes 0), > 0 only where the
-- writing RPC already refuses zero. subscription_changes.prorated_amount is
-- >= 0 only because proration is retired and removals never refund — a future
-- credit feature would need to drop that constraint deliberately.
-- -----------------------------------------------------------------------------
do $$
declare
  v_specs text[][] := array[
    ['payments',              'ck_payments_amount',           'amount >= 0'],
    ['checkout_sessions',     'ck_checkout_amount_positive',  'amount is null or amount > 0'],
    ['child_subscriptions',   'ck_child_subs_amounts',
      'coalesce(base_amount,0) >= 0 and coalesce(discount_amount,0) >= 0 and coalesce(total_amount,0) >= 0'],
    ['child_subscriptions',   'ck_child_subs_sibling_pct',
      'sibling_discount_percent is null or sibling_discount_percent between 0 and 100'],
    ['subscription_subjects', 'ck_sub_subjects_price',        'price_amount is null or price_amount >= 0'],
    ['subscription_changes',  'ck_sub_changes_amounts',
      'coalesce(prorated_amount,0) >= 0 and coalesce(recurring_before,0) >= 0 and coalesce(recurring_after,0) >= 0 and (discount_percent is null or discount_percent between 0 and 100)'],
    ['sibling_discounts',     'ck_sibling_discounts_pct',
      'discount_percent is null or discount_percent between 0 and 100'],
    ['coupons',               'ck_coupons_value',             'value is null or value >= 0'],
    ['subscription_plans',    'ck_subscription_plans_price',  'price_amount is null or price_amount >= 0']
  ];
  v_tbl  text;
  v_name text;
  v_pred text;
  i      int;
begin
  for i in 1 .. array_length(v_specs, 1) loop
    v_tbl  := v_specs[i][1];
    v_name := v_specs[i][2];
    v_pred := v_specs[i][3];
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_tbl
    ) then
      continue;
    end if;
    if exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = v_tbl and c.conname = v_name
    ) then
      continue;
    end if;
    execute format('alter table public.%I add constraint %I check (%s)',
                   v_tbl, v_name, v_pred);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- THE APPLE IN-APP PURCHASE RAIL (migrations 164 and 166).
--
-- Apple rejected the iOS build on 2026-08-31 under Guideline 3.1.1 — the app
-- read content the family bought on the web without offering an in-app
-- purchase, and the Azerbaijan storefront gets no relief (the Epic v. Apple
-- carve-out is US-only, the DMA is EEA-only; docs/STORE_PAYMENTS_COMPLIANCE.md).
-- The owner decided to build IAP.
--
-- THE ACCESS HALF NEEDED NOTHING. entitlements above is already
-- provider-agnostic, public.entitlement_source (001) already carries
-- 'apple_iap', external_ref's own comment already names Apple's
-- originalTransactionId as the key this rail uses, and entitlement_grant()
-- (011) is already the service_role-only writer. What was missing is the three
-- facts Apple cannot tell us:
--     WHAT a store product id sells          -> iap_products
--     WHICH CHILD a transaction was for      -> iap_purchase_intents
--     WHETHER a message was already acted on -> iap_notifications
--
-- The rest of the rail is spread across the run order, where each piece can
-- actually be created: policies + grants in 010, indexes and the two triggers
-- in 011, the INACTIVE iOS product catalogue in 012, and the package FK plus
-- the two olympiad product reservations in 015 (olympiad_packages does not
-- exist yet at this point).
-- ---------------------------------------------------------------------------

-- iap_products : what a store product id actually sells.
--
-- Apple's transaction payload carries a productId and nothing else about our
-- catalogue. This is the lookup that turns it into a target the platform can
-- grant, and it is the ONLY place that mapping is written down.
--
-- NON-RENEWING subscriptions, not auto-renewable: Apple allows ONE active
-- subscription per group per Apple ID and this product is PER CHILD, so a
-- parent with three children needs three concurrent grants. The consequence a
-- reader will otherwise "simplify" away is that Apple's subscription-status
-- endpoints cover AUTO-RENEWABLE products only — there is no status to poll,
-- and OUR server computes ends_at as purchase date + `interval`.
create table if not exists public.iap_products (
  id           uuid primary key default gen_random_uuid(),

  -- THE ANDROID PURCHASE-SILENCE GUARD. See the column comment below before
  -- adding a single 'android' row.
  platform     text not null,

  -- The App Store Connect / Play Console identifier. Permanent and public.
  product_id   text not null,

  -- WHAT IS SOLD — the same vocabulary entitlements uses, so the mapping into
  -- entitlement_grant() is a copy rather than a translation.
  scope        public.entitlement_scope not null,

  -- BOTH TARGET FKs ARE ON DELETE CASCADE, AND THAT DIVERGES FROM entitlements
  -- ON PURPOSE. entitlements is the ACCESS RECORD, where losing a row is
  -- fail-OPEN and RESTRICT is right; iap_products is a CATALOGUE, where losing
  -- a row is fail-CLOSED — the purchase endpoint has nothing to sell and the
  -- app hides the product, which is exactly what a subject with no live iOS
  -- product must do. No grant is harmed: revocation keys on
  -- (source, external_ref) in entitlements and never reads this table.
  -- Anything ever SOLD is unreachable by this cascade anyway —
  -- subject_deletion_blocks() block 10 and olympiad_package_deletion_blocks()
  -- block 4 already refuse a target holding an entitlement.
  subject_id   uuid references public.subjects (id) on delete cascade,

  -- NO INLINE FK, exactly as entitlements.package_id above: olympiad_packages
  -- does not exist yet in the canonical run order. fk_iap_products_package is
  -- added in 015.
  package_id   uuid,

  grade_id     uuid references public.grades (id) on delete set null,

  -- NOT NULL for a subject product, and load-bearing rather than decorative:
  -- non-renewing subscriptions produce no renewal event, so this is the only
  -- place the length of what was bought is recorded.
  interval     public.plan_interval,

  -- FALSE by default. A row is not sellable until somebody has created the
  -- matching product in App Store Connect, had it approved, and deliberately
  -- turned it on: a subject with no LIVE iOS product must be neither
  -- purchasable NOR accessible on iOS.
  active       boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint uq_iap_product unique (platform, product_id),

  constraint ck_iap_product_platform check (platform in ('ios', 'android')),

  -- MIRRORS ck_entitlement_target exactly. A row can never name both a subject
  -- and a package, because the row that did would grant one and charge for the
  -- other.
  constraint ck_iap_product_target check (
       (scope = 'subject'          and subject_id is not null and package_id is null)
    or (scope = 'olympiad_package' and package_id is not null and subject_id is null)),

  -- A subject product is a PERIOD and must say which one; a package product is
  -- LIFETIME (ck_entitlement_lifetime) and must not carry one at all.
  constraint ck_iap_product_interval check (
       (scope = 'subject'          and "interval" is not null)
    or (scope = 'olympiad_package' and "interval" is null)),

  -- Mirrors ck_entitlement_grade.
  constraint ck_iap_product_grade check (scope = 'olympiad_package' or grade_id is null),

  -- The naming convention as a constraint, not as a convention. A store id is
  -- permanent and public; the moment it is wrong it is wrong forever.
  constraint ck_iap_product_id_shape check (
    product_id ~ '^ai\.olympiq\.app\.(sub\.[a-z0-9]+\.(week|month|year)|oly\.[a-z0-9]+)$'),

  -- THE ID AND THE ROW MUST AGREE ABOUT THE PERIOD. Written as three literal
  -- branches rather than `product_id like '%.' || "interval"::text` because an
  -- enum-to-text I/O cast is not dependably immutable and a CHECK is not the
  -- place to find out. A row whose id ends `.month` while it grants a year is a
  -- billing defect, and it is now rejected at INSERT.
  constraint ck_iap_product_id_interval check (
    scope <> 'subject'
    or (   ("interval" = 'week'  and product_id like '%.week')
        or ("interval" = 'month' and product_id like '%.month')
        or ("interval" = 'year'  and product_id like '%.year'))
  )
);

comment on table public.iap_products is
  'Migration 164. Maps a STORE product id (App Store Connect / Play Console) to '
  'something this platform sells, so an Apple transaction — which carries a '
  'productId and nothing else about our catalogue — can be resolved into an '
  'entitlement target. The ONLY place that mapping exists. Carries NO price: '
  'Apple owns the price (per-storefront tiers, changed in App Store Connect), '
  'and a copy here would be a second source of truth that is wrong the first '
  'time a tier moves. iOS is dearer than web by owner decision (it preserves '
  'our net after commission) and the web-only sibling discount is never '
  'reflected here — nor may any surface tell an iOS user the web is cheaper, '
  'which is the anti-steering rule we were rejected under on 2026-08-31.';

comment on column public.iap_products.platform is
  'ios | android. THIS COLUMN IS THE ANDROID PURCHASE-SILENCE GUARD. The Play '
  'build is consumption-only on purpose (docs/STORE_PAYMENTS_COMPLIANCE.md): '
  'with NO google_play rows here the purchase endpoint has literally nothing to '
  'sell on Android, so the silence is structural instead of being a flag '
  'somebody can flip. DO NOT SEED ANDROID ROWS to "prepare" for Play billing, '
  'and do not add them because the check constraint allows the value — the '
  'value exists so that the day Google forces IAP is a data change and not a '
  'schema change. Until an owner decision says otherwise, every row is ios.';

comment on column public.iap_products.product_id is
  'The permanent, public store identifier. ai.olympiq.app.sub.<slug>.<interval> '
  'for a subject, ai.olympiq.app.oly.<slug> for an olympiad package. The slug is '
  'DELIBERATELY NOT subjects.code: the subject coded az_language is named '
  '"Məntiq" (Logic) and a different subject, azerbaycan_dili, is the real '
  'Azerbaijani-language one, so a code-derived id would sell Logic under the '
  'name of a language forever. It is also not olympiad_packages.code, which an '
  'admin can edit. App Store Connect never renames a product id and never lets '
  'one be reused; this row is the mapping, so the id does not need to encode it.';

comment on column public.iap_products.interval is
  'The PERIOD a subject product grants. NOT NULL for scope = subject and NULL '
  'for a package (packages are lifetime). Load-bearing: these are NON-RENEWING '
  'subscriptions, so Apple sends no renewal event and its subscription-status '
  'endpoints do not cover them at all — our server computes ends_at as purchase '
  'date + this interval. There is no status to poll and no grace period to '
  'model; only REFUND/REVOKE arrives, and that revokes.';

comment on column public.iap_products.active is
  'FALSE until the matching store product exists, is approved, and an owner '
  'turns it on. Decision (4), 2026-08-31: a subject with no LIVE iOS product '
  'must be neither purchasable NOR accessible on iOS — offering access to '
  'something the store cannot sell is the Guideline 3.1.3(b) shape that got the '
  'app rejected. Flipping this is the go-live step, and it is audited.';

comment on column public.iap_products.grade_id is
  'NULL in the normal case: the entitled grade is resolved from the CHILD named '
  'in the purchase intent, exactly as olympiad_purchases already records it. A '
  'non-NULL value pins ONE grade to ONE store product, which is how a package '
  'would be sold per grade if that is ever wanted. Package rows only '
  '(ck_iap_product_grade), mirroring ck_entitlement_grade.';


-- iap_purchase_intents : which CHILD a transaction was for.
--
-- One row per tap on Buy, written BEFORE the store sheet opens. Its `id` IS the
-- value passed to StoreKit as appAccountToken (Apple requires a UUID), and
-- Apple echoes it back in the signed transaction.
--
-- THIS IS THE ONLY THING THAT KNOWS WHICH CHILD A PURCHASE WAS FOR. An Apple
-- subscription attaches to an APPLE ID; this platform sells per CHILD, and a
-- parent with three children buys the same product three times from the same
-- Apple ID. Without this row the three transactions are indistinguishable and
-- the money cannot be turned into the right grant.
create table if not exists public.iap_purchase_intents (
  -- THE appAccountToken. Not a surrogate key that happens to be a uuid — the
  -- value leaves this database, travels through StoreKit, and comes back inside
  -- Apple's signed payload. Never recycle one, never expose another family's.
  id                      uuid primary key default gen_random_uuid(),

  -- Migration 174: NULLABLE, ON DELETE SET NULL. This row is the only link from
  -- an Apple transaction id back to a family, and the comment on
  -- student_profile_id below promises a surviving row "still carries the parent,
  -- the product and the transaction id -- which is what support needs to
  -- refund". Under the original CASCADE there was no surviving row: deleting the
  -- parent deleted the evidence the refund would be resolved from.
  owner_parent_profile_id uuid references public.profiles (id) on delete set null,

  -- ON DELETE SET NULL, never CASCADE, and deliberately NOT NULL-CONSTRAINED —
  -- the same reasoning checkout_sessions.student_profile_id carries verbatim:
  -- deleting a child must not delete the record of money that was taken. It is
  -- required at CREATION time by the endpoint, which is where it is
  -- enforceable. A surviving row with a NULL child still carries the parent,
  -- the product and the transaction id — which is what support needs to refund.
  student_profile_id      uuid references public.students (profile_id) on delete set null,

  -- The store product tapped. FK on (platform, product_id) rather than on the
  -- product row's uuid so that an intent naming an ios product while claiming
  -- android is unrepresentable, and so the recorded id is the literal string
  -- Apple will send back.
  platform                text not null,
  product_id              text not null,

  created_at              timestamptz not null default now(),

  -- STALENESS, NOT A GATE. Read this before writing any code against it.
  -- expires_at bounds how long an unconsumed intent is treated as "the pending
  -- tap", so abandoned rows can be pruned and support can triage. It must NEVER
  -- be a reason to refuse a grant for a transaction Apple actually reports:
  -- StoreKit delivers interrupted purchases, Ask-to-Buy approvals and
  -- offline-queued transactions hours or days later, and refusing one would
  -- take the family's money and hand back nothing.
  expires_at              timestamptz not null default (now() + '7 days'::interval),

  -- Set when a transaction has actually been tied to this intent.
  consumed_at             timestamptz,

  -- Apple's originalTransactionId, once known. This becomes
  -- entitlements.external_ref for the grant.
  original_transaction_id text,

  constraint ck_iap_intent_platform check (platform in ('ios', 'android')),

  -- ON DELETE RESTRICT, and the consequence is stated rather than discovered:
  -- because iap_products.subject_id CASCADEs from subjects, an intent pins the
  -- product row, which pins the SUBJECT. Hard-deleting a subject that anyone
  -- ever tapped Buy on will therefore fail. That is the outcome we want — an
  -- abandoned intent is the record of a purchase ATTEMPT, it is money-adjacent,
  -- and cascading it away to make an admin delete succeed destroys evidence.
  constraint fk_iap_intent_product
    foreign key (platform, product_id)
    references public.iap_products (platform, product_id)
    on update cascade on delete restrict,

  constraint ck_iap_intent_window check (expires_at > created_at),
  constraint ck_iap_intent_consumed check (consumed_at is null or consumed_at >= created_at),
  constraint ck_iap_intent_txn check (
    original_transaction_id is null
    or length(original_transaction_id) between 1 and 100),

  -- ONE-DIRECTIONAL ON PURPOSE, and this is where it departs from
  -- ck_checkout_redemption, which couples its two columns exactly. Consumed
  -- implies a transaction id; a transaction id does NOT imply consumed. The
  -- asymmetry exists so the id can be recorded the instant it is known, even if
  -- the grant then fails: originalTransactionId is the only key that can later
  -- revoke or refund this purchase, and losing it is worse than any
  -- inconsistency coupling would have prevented.
  constraint ck_iap_intent_txn_required check (
    consumed_at is null or original_transaction_id is not null)
);

comment on table public.iap_purchase_intents is
  'Migration 164. One row per tap on Buy, written BEFORE the store sheet opens. '
  'Its id IS the appAccountToken handed to StoreKit and echoed back in Apple''s '
  'signed transaction, and it is THE ONLY THING THAT KNOWS WHICH CHILD A '
  'PURCHASE WAS FOR — an Apple subscription attaches to an Apple ID while this '
  'platform sells per child, so a parent buying the same product for three '
  'children produces three otherwise indistinguishable transactions. Written by '
  'service_role only; read by the owning parent and by support.';

comment on column public.iap_purchase_intents.id is
  'THE appAccountToken. Leaves the database, travels through StoreKit, returns '
  'inside Apple''s signed payload. Apple requires a UUID. Never recycled.';

comment on column public.iap_purchase_intents.expires_at is
  'A STALENESS MARKER, NOT AN ACCESS GATE. It bounds how long an unconsumed '
  'intent counts as the pending tap, for pruning and for support triage. A '
  'transaction Apple actually reports MUST still be granted after it passes: '
  'interrupted purchases, Ask-to-Buy approvals and offline-queued transactions '
  'arrive hours or days late, and refusing one takes the money and delivers '
  'nothing. Late arrival raises a flag for a human; it never denies access.';

comment on column public.iap_purchase_intents.student_profile_id is
  'The child this purchase was for. NULLABLE only because the FK is ON DELETE '
  'SET NULL — deleting a child must not delete the record of money that was '
  'taken (the reasoning checkout_sessions.student_profile_id already carries). '
  'Required at creation time by the endpoint, which is where it is enforceable; '
  'a NOT NULL here would make deleting a child fail on an old intent.';

comment on column public.iap_purchase_intents.original_transaction_id is
  'Apple''s originalTransactionId, once known. Becomes entitlements.external_ref '
  'for the grant — entitlement_grant() is the writer and is service_role-only. '
  'Recorded as soon as it is known, even if the grant then fails: it is the only '
  'key that can later revoke or refund this purchase.';

-- NO audit trigger on iap_purchase_intents, deliberately. Every row is written
-- by service_role from the purchase endpoint, one per tap on Buy, and the row
-- IS its own record — append-then-stamp, never edited by a person. iap_products,
-- which humans DO edit, is audited in 011.


-- iap_notifications (migration 166) : one App Store Server Notification, one
-- consumption.
--
-- Apple retries a notification on any non-2xx and re-delivers besides, so a
-- message we already acted on WILL arrive again. Every write underneath the
-- endpoint is already idempotent, so a replay could never produce a SECOND
-- grant — what it would produce without this table is a second re-query against
-- Apple's API, a second RPC round trip, and a log line indistinguishable from a
-- real event.
--
-- THE KEY IS THE NOTIFICATION UUID, NOT THE TRANSACTION ID. notificationUUID is
-- the identity of the MESSAGE and is repeated verbatim on every retry;
-- transactionId is the identity of the SUBJECT, and several genuinely different
-- messages legitimately concern one transaction — a CONSUMPTION_REQUEST today
-- and a REFUND tomorrow — so keying on it would swallow the REFUND, which is
-- the one message that must never be missed.
--
-- CLAIM-THEN-SETTLE: the endpoint INSERTs the row before doing any work and
-- stamps processed_at + outcome after it.
--     row absent             -> never seen; process it
--     row present, unstamped -> a previous attempt died mid-flight; process it
--                               again (every underlying write is idempotent)
--     row present, stamped   -> a genuine replay; do nothing, answer 200
create table if not exists public.iap_notifications (
  -- Apple's own message id. THE dedupe key.
  notification_uuid       uuid not null,

  -- The RAIL that verified this message, never the payload's own claim. The
  -- production endpoint always writes 'Production' and the sandbox endpoint
  -- always writes 'Sandbox', because each route is bound to one verifier. Part
  -- of the primary key so a sandbox message can never be the reason a
  -- production message is dismissed as a replay.
  environment             text not null,

  -- Apple's notificationType / subtype, stored as free text ON PURPOSE: a new
  -- member of Apple's vocabulary must be RECORDED and ignored, never rejected.
  -- An enum here would turn "Apple shipped a new notification type" into a 500
  -- and an endless retry loop.
  notification_type       text not null,
  subtype                 text,

  -- Join keys to iap_purchase_intents and entitlements. Nullable because a TEST
  -- notification carries no transaction at all, and because a message is claimed
  -- before its transaction is necessarily known.
  transaction_id          text,
  original_transaction_id text,
  product_id              text,

  received_at             timestamptz not null default now(),

  -- NULL until the message has been fully consumed. See CLAIM-THEN-SETTLE.
  processed_at            timestamptz,

  -- What we did: granted / revoked / ignored_type / unknown_product /
  -- sandbox_recorded / … Text rather than an enum for the same reason
  -- notification_type is: this vocabulary will grow, and a schema change is not
  -- an acceptable price for adding a diagnostic value.
  outcome                 text,

  constraint pk_iap_notifications primary key (notification_uuid, environment),

  constraint ck_iap_notification_environment
    check (environment in ('Production', 'Sandbox')),
  constraint ck_iap_notification_type_len
    check (length(notification_type) between 1 and 64),
  constraint ck_iap_notification_subtype_len
    check (subtype is null or length(subtype) between 1 and 64),

  -- The same 1..100 bound iap_purchase_intents.original_transaction_id and
  -- transaction.ts's TRANSACTION_ID_RE already use. The three must not disagree
  -- about what an Apple id may be, or a purchase one layer accepts is one
  -- another cannot record.
  constraint ck_iap_notification_txn
    check (transaction_id is null or length(transaction_id) between 1 and 100),
  constraint ck_iap_notification_orig_txn
    check (original_transaction_id is null
           or length(original_transaction_id) between 1 and 100),
  constraint ck_iap_notification_product
    check (product_id is null or length(product_id) between 1 and 200),
  constraint ck_iap_notification_outcome
    check (outcome is null or length(outcome) between 1 and 40),

  constraint ck_iap_notification_processed
    check (processed_at is null or processed_at >= received_at),

  -- A settled row must say what it settled AS. "Processed, outcome unknown" is
  -- not a state anybody can act on six months later.
  constraint ck_iap_notification_settled
    check (processed_at is null or outcome is not null)
);

-- The 'Migration 165.' opening below is TRANSCRIBED VERBATIM from migration
-- 2026_09_01_166, which mis-numbers itself in its own comment and RAISE strings.
-- Correcting it here would put canonical and the live databases out of step for
-- no gain: the number in the text is wrong, the table it describes is right.
comment on table public.iap_notifications is
  'Migration 165. One row per App Store Server Notification V2, keyed on Apple''s '
  'notificationUUID plus the rail that verified it. It is the REPLAY GUARD for '
  '/api/payments/apple/notifications and its sandbox twin: claimed before the '
  'work and stamped after it, so a retry of a message already consumed costs one '
  'indexed lookup. Keyed on the MESSAGE id and not the transaction id because '
  'several different messages legitimately concern one transaction — a '
  'CONSUMPTION_REQUEST and a later REFUND — and swallowing the second would miss '
  'the one notification that must never be missed. Written by service_role only.';

comment on column public.iap_notifications.environment is
  'The RAIL that verified the message, never the payload''s own environment '
  'claim. Part of the primary key so a sandbox message can never be the reason a '
  'production message is dismissed as a replay.';

comment on column public.iap_notifications.processed_at is
  'NULL means an attempt STARTED and did not finish — an alarm, not a leak. The '
  'endpoint claims the row before doing any work and stamps it afterwards, so an '
  'unstamped row is re-processed on Apple''s next retry; every write underneath '
  'is idempotent, so a second pass converges rather than duplicating.';

comment on column public.iap_notifications.notification_type is
  'Apple''s notificationType, as free text. NOT an enum: a new member of Apple''s '
  'vocabulary must be recorded and ignored, never rejected — an enum would turn '
  '"Apple shipped a new notification type" into a 500 and an endless retry loop.';

-- NO audit trigger here either, for the reason iap_purchase_intents has none:
-- every row is written by service_role from one endpoint, one per message, and
-- the row IS its own record. RETENTION IS NOT SOLVED HERE, and saying so is
-- better than pretending — rows accumulate at the rate of purchases and refunds,
-- and they are the evidence a chargeback is answered with. If a prune is ever
-- wanted it belongs in 016 with a horizon measured in years.
