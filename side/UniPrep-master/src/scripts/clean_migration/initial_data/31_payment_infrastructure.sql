-- ============================================================
-- Migration 31: Phase 8 — Payment Infrastructure
-- ============================================================
-- Purpose : Build the full payment schema baseline.
--           Bookings remain price=0 at launch; this schema
--           enables the switch to paid bookings (Phase 8B)
--           and subscriptions (Phase 8C) with zero schema changes.
-- Depends : bookings, auth.users, students, teachers
-- Safe    : All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ============================================================

-- ── 1. Add payment columns to bookings ──────────────────────
-- Stripe PaymentIntent ID for reconciliation (null = free booking)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_intent_id  TEXT,
  ADD COLUMN IF NOT EXISTS payment_status     TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_status IN ('free', 'awaiting_acceptance', 'awaiting_payment', 'pending_payment', 'paid', 'payment_failed', 'refunded'));

-- Index for webhook lookups by payment_intent_id
CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent
  ON bookings(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- ── 2. Wallets ───────────────────────────────────────────────
-- One wallet per user. Students accumulate spending history;
-- teachers accumulate earnings. Balance cannot go negative.
CREATE TABLE IF NOT EXISTS wallets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  balance             DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency            TEXT          NOT NULL DEFAULT 'EUR',

  -- Lifetime aggregates (denormalised for fast dashboard queries)
  total_earned        DECIMAL(12,2) NOT NULL DEFAULT 0,   -- teachers
  total_spent         DECIMAL(12,2) NOT NULL DEFAULT 0,   -- students
  total_withdrawn     DECIMAL(12,2) NOT NULL DEFAULT 0,   -- teachers

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  USING (user_id = auth.uid());

-- Service role (Edge Functions) can do everything
CREATE POLICY "Service role full access on wallets"
  ON wallets FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- ── 3. Transactions (immutable ledger) ──────────────────────
-- Append-only. No UPDATE or DELETE policies.
-- Every payment creates exactly 3 rows:
--   booking_payment  (student → teacher, full amount)
--   teacher_earning  (teacher receives amount - commission)
--   platform_commission (platform receives commission)
CREATE TABLE IF NOT EXISTS transactions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties (NULL for top-ups / withdrawals)
  from_user_id            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id              UUID        REFERENCES bookings(id)   ON DELETE SET NULL,

  -- Amount
  amount                  DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency                TEXT          NOT NULL DEFAULT 'EUR',

  -- Classification
  type                    TEXT          NOT NULL CHECK (type IN (
    'booking_payment',      -- Student pays for booking
    'teacher_earning',      -- Teacher receives (amount - commission)
    'platform_commission',  -- Platform's cut
    'refund',               -- Refund to student
    'withdrawal',           -- Teacher withdraws to bank
    'subscription_charge',  -- Future: subscription billing
    'top_up'                -- Future: wallet top-up
  )),
  status                  TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'refunded'
  )),

  -- Stripe reference
  external_payment_id     TEXT,         -- Stripe PaymentIntent ID
  external_payment_method TEXT,         -- 'card', 'bank_transfer', etc.

  -- Commission tracking
  commission_rate         DECIMAL(5,4), -- e.g. 0.15 for 15%
  commission_amount       DECIMAL(12,2),

  -- Metadata
  description             TEXT,
  metadata                JSONB         NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,

  -- Idempotency: prevents duplicate processing of same Stripe event
  idempotency_key         TEXT          UNIQUE
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "Service role full access on transactions"
  ON transactions FOR ALL
  USING (auth.role() = 'service_role');

-- No UPDATE/DELETE policies for non-service roles → ledger is append-only

CREATE INDEX IF NOT EXISTS idx_transactions_from       ON transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to         ON transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_booking    ON transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status     ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_created    ON transactions(created_at DESC);

-- ── 4. Payout Requests ───────────────────────────────────────
-- Teachers request withdrawal of their wallet balance.
-- Admin approves/rejects in the Admin Panel.
CREATE TABLE IF NOT EXISTS payout_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,

  amount              DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency            TEXT          NOT NULL DEFAULT 'EUR',

  -- Bank details reference (never store raw IBAN here — store a reference ID
  -- to a securely stored record, or an encrypted blob)
  bank_details_ref    TEXT          NOT NULL,

  status              TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'processing', 'completed', 'rejected'
  )),

  -- Admin processing
  processed_by        UUID          REFERENCES auth.users(id),
  processed_at        TIMESTAMPTZ,
  rejection_reason    TEXT,
  admin_notes         TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own payout requests"
  ON payout_requests FOR SELECT
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Teachers can create payout requests"
  ON payout_requests FOR INSERT
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on payout_requests"
  ON payout_requests FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_payout_requests_teacher ON payout_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status  ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_created ON payout_requests(created_at DESC);

-- ── 5. Subscription Tiers (Phase 8C baseline) ───────────────
-- Tier definitions managed by admin. No billing yet at launch.
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL UNIQUE,  -- 'free', 'plus', 'pro'
  display_name        TEXT        NOT NULL,
  display_name_az     TEXT,
  display_name_ru     TEXT,

  price_monthly       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly        DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency            TEXT          NOT NULL DEFAULT 'EUR',

  -- Feature limits (NULL = unlimited)
  max_bookings_per_month  INTEGER,    -- NULL = unlimited
  ai_explanations_limit   INTEGER,    -- NULL = unlimited
  has_score_prediction    BOOLEAN     NOT NULL DEFAULT FALSE,
  has_priority_matching   BOOLEAN     NOT NULL DEFAULT FALSE,
  has_advanced_analytics  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Stripe product/price IDs (populated when billing goes live)
  stripe_product_id       TEXT,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly  TEXT,

  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order          INTEGER     NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription tiers"
  ON subscription_tiers FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Service role full access on subscription_tiers"
  ON subscription_tiers FOR ALL
  USING (auth.role() = 'service_role');

-- Seed the three tiers
INSERT INTO subscription_tiers (name, display_name, display_name_az, display_name_ru, price_monthly, price_yearly, max_bookings_per_month, ai_explanations_limit, has_score_prediction, has_priority_matching, has_advanced_analytics, sort_order)
VALUES
  ('free', 'Free',  'Pulsuz', 'Бесплатно',  0,     0,      3,    20,   FALSE, FALSE, FALSE, 0),
  ('plus', 'Plus',  'Plus',   'Плюс',       9.99,  99.99,  10,   NULL, TRUE,  FALSE, FALSE, 1),
  ('pro',  'Pro',   'Pro',    'Про',        19.99, 199.99, NULL, NULL, TRUE,  TRUE,  TRUE,  2)
ON CONFLICT (name) DO NOTHING;

-- ── 6. User Subscriptions ────────────────────────────────────
-- Tracks which tier each user is on. All users start on 'free'.
-- Stripe subscription_id populated when billing goes live.
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id                 UUID        NOT NULL REFERENCES subscription_tiers(id),

  status                  TEXT        NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'cancelled', 'past_due', 'trialing', 'paused'
  )),
  billing_cycle           TEXT        CHECK (billing_cycle IN ('monthly', 'yearly')),

  -- Stripe references (null until billing is live)
  stripe_subscription_id  TEXT        UNIQUE,
  stripe_customer_id      TEXT,

  -- Dates
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)  -- One active subscription per user
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on user_subscriptions"
  ON user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user   ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier   ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe ON user_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 7. Add Stripe settings to system_settings ────────────────
-- These are read by the Admin Panel Payment Settings tab.
-- stripe_secret_key and stripe_webhook_secret are NEVER stored here —
-- they live in Supabase Edge Function secrets only.
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('payment', 'stripe_mode',            '"test"',   'string',  'Stripe mode: test or live', TRUE, FALSE, FALSE, '"test"'),
  ('payment', 'stripe_publishable_key', '""',       'string',  'Stripe publishable key (safe to expose to clients)', TRUE, FALSE, FALSE, '""'),
  ('payment', 'bookings_paid',          'false',    'boolean', 'Whether teacher bookings require payment (Phase 8B)', TRUE, FALSE, FALSE, 'false'),
  ('payment', 'subscriptions_enabled',  'false',    'boolean', 'Whether subscription billing is active (Phase 8C)', FALSE, FALSE, FALSE, 'false'),
  ('payment', 'payout_schedule',        '"manual"', 'string',  'Payout schedule: manual or automatic', FALSE, FALSE, FALSE, '"manual"')
ON CONFLICT (key) DO NOTHING;

-- ── 8. DB function: process_booking_payment ─────────────────
-- Called by the stripe-webhook Edge Function on payment_intent.succeeded.
-- Creates 3 transaction rows + updates wallets + updates booking.
-- Uses SECURITY DEFINER so Edge Function (service role) can call it.
CREATE OR REPLACE FUNCTION process_booking_payment(
  p_booking_id          UUID,
  p_student_user_id     UUID,
  p_teacher_user_id     UUID,
  p_amount              DECIMAL,
  p_currency            TEXT,
  p_external_payment_id TEXT,
  p_idempotency_key     TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate   DECIMAL;
  v_commission_amount DECIMAL;
  v_teacher_amount    DECIMAL;
BEGIN
  -- Idempotency guard: if this key was already processed, return true silently
  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN TRUE;
  END IF;

  -- Fetch commission rate from system_settings (default 15%)
  SELECT COALESCE((value::TEXT)::DECIMAL, 0.15)
  INTO v_commission_rate
  FROM system_settings WHERE key = 'commission_rate';

  IF v_commission_rate IS NULL THEN
    v_commission_rate := 0.15;
  END IF;

  v_commission_amount := ROUND(p_amount * v_commission_rate, 2);
  v_teacher_amount    := p_amount - v_commission_amount;

  -- Row 1: Student payment
  INSERT INTO transactions (from_user_id, to_user_id, booking_id, amount, currency, type, status,
    external_payment_id, commission_rate, commission_amount, description, idempotency_key, completed_at)
  VALUES (p_student_user_id, p_teacher_user_id, p_booking_id, p_amount, p_currency,
    'booking_payment', 'completed', p_external_payment_id,
    v_commission_rate, v_commission_amount,
    'Booking payment', p_idempotency_key, NOW());

  -- Row 2: Teacher earning
  INSERT INTO transactions (to_user_id, booking_id, amount, currency, type, status,
    commission_rate, commission_amount, description, idempotency_key, completed_at)
  VALUES (p_teacher_user_id, p_booking_id, v_teacher_amount, p_currency,
    'teacher_earning', 'completed',
    v_commission_rate, v_commission_amount,
    'Earning from booking', p_idempotency_key || '_earning', NOW());

  -- Row 3: Platform commission
  INSERT INTO transactions (from_user_id, booking_id, amount, currency, type, status,
    description, idempotency_key, completed_at)
  VALUES (p_teacher_user_id, p_booking_id, v_commission_amount, p_currency,
    'platform_commission', 'completed',
    'Platform commission', p_idempotency_key || '_commission', NOW());

  -- Update teacher wallet
  INSERT INTO wallets (user_id, balance, total_earned, currency)
  VALUES (p_teacher_user_id, v_teacher_amount, v_teacher_amount, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET
    balance      = wallets.balance + v_teacher_amount,
    total_earned = wallets.total_earned + v_teacher_amount,
    updated_at   = NOW();

  -- Update student wallet (spending tracker only, balance stays 0)
  INSERT INTO wallets (user_id, balance, total_spent, currency)
  VALUES (p_student_user_id, 0, p_amount, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET
    total_spent = wallets.total_spent + p_amount,
    updated_at  = NOW();

  -- Update booking: mark as paid, awaiting teacher acceptance
  UPDATE bookings SET
    price          = p_amount,
    payment_status = 'paid',
    payment_intent_id = p_external_payment_id,
    status         = 'pending',
    updated_at     = NOW()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- ── 9. DB function: process_refund ──────────────────────────
CREATE OR REPLACE FUNCTION process_refund(
  p_booking_id      UUID,
  p_reason          TEXT,
  p_idempotency_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking          RECORD;
  v_original_payment RECORD;
  v_teacher_amount   DECIMAL;
BEGIN
  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_original_payment FROM transactions
  WHERE booking_id = p_booking_id AND type = 'booking_payment' AND status = 'completed'
  LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_teacher_amount := v_original_payment.amount - COALESCE(v_original_payment.commission_amount, 0);

  -- Record refund transaction
  INSERT INTO transactions (from_user_id, to_user_id, booking_id, amount, currency, type, status,
    description, idempotency_key, completed_at)
  VALUES (v_original_payment.to_user_id, v_original_payment.from_user_id,
    p_booking_id, v_original_payment.amount, v_original_payment.currency,
    'refund', 'completed', p_reason, p_idempotency_key, NOW());

  -- Reverse teacher wallet balance
  UPDATE wallets SET
    balance      = GREATEST(balance - v_teacher_amount, 0),
    total_earned = GREATEST(total_earned - v_teacher_amount, 0),
    updated_at   = NOW()
  WHERE user_id = v_original_payment.to_user_id;

  -- Update booking
  UPDATE bookings SET
    status             = 'cancelled',
    payment_status     = 'refunded',
    cancelled_at       = NOW(),
    cancellation_reason = p_reason,
    updated_at         = NOW()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- ── 10. Updated_at triggers ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wallets_updated_at') THEN
    CREATE TRIGGER set_wallets_updated_at
      BEFORE UPDATE ON wallets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_payout_requests_updated_at') THEN
    CREATE TRIGGER set_payout_requests_updated_at
      BEFORE UPDATE ON payout_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_user_subscriptions_updated_at') THEN
    CREATE TRIGGER set_user_subscriptions_updated_at
      BEFORE UPDATE ON user_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
