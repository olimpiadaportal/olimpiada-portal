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
-- subscription_subjects : which subjects this child subscription covers.
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_subjects (
  child_subscription_id uuid not null references public.child_subscriptions (id) on delete cascade,
  subject_id            uuid not null references public.subjects (id) on delete cascade,
  added_at              timestamptz not null default now(),
  primary key (child_subscription_id, subject_id)
);

-- -----------------------------------------------------------------------------
-- checkout_sessions : provider-agnostic checkout (subscription | olympiad).
-- -----------------------------------------------------------------------------
create table if not exists public.checkout_sessions (
  id                       uuid primary key default gen_random_uuid(),
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind                     text not null check (kind in ('subscription', 'olympiad')),
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
