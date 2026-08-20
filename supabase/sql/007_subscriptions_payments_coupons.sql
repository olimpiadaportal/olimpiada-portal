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
  created_at               timestamptz not null default now()
);

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
-- End of 007_subscriptions_payments_coupons.sql
-- =============================================================================
