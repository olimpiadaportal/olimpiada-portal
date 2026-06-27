-- =============================================================================
-- 007_subscriptions_payments_coupons.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 007 of 013.
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
  profile_id      uuid not null references public.profiles (id) on delete cascade,
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
-- End of 007_subscriptions_payments_coupons.sql
-- =============================================================================
