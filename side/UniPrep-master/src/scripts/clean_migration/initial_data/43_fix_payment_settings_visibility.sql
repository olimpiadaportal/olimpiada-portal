-- ============================================================================
-- 43: Fix Payment Flow — Settings Visibility + Booking Status Constraint
-- ============================================================================
-- This migration fixes TWO root causes that prevented paid bookings from
-- working, even though bookings_paid = true was set in the admin panel.
--
-- ROOT CAUSE 1: RLS blocks client reads of payment settings
-- ─────────────────────────────────────────────────────────
-- bookings_paid, stripe_publishable_key, and stripe_mode had
-- is_public = FALSE in system_settings. The RLS policy
-- "system_settings_public_read" only allows authenticated (non-admin)
-- users to SELECT rows where is_public = TRUE.
--
-- Result: paymentService.isBookingsPaid() silently returned no data →
-- defaulted to false → app always took the "free booking" path.
--
-- Fix: Set is_public = TRUE for these non-sensitive config flags.
-- stripe_publishable_key is the PUBLIC key by design (safe to expose).
-- Secret keys remain is_public = FALSE.
--
-- ROOT CAUSE 2: payment_status CHECK constraint too restrictive
-- ─────────────────────────────────────────────────────────────
-- The bookings.payment_status CHECK constraint only allowed:
--   ('free', 'pending_payment', 'paid', 'payment_failed', 'refunded')
--
-- But the Edge Functions (create-payment, capture-booking-payment) use:
--   'awaiting_acceptance' — set when student creates a paid booking request
--   'awaiting_payment'    — set when teacher accepts and PaymentIntent is created
--
-- Result: Any INSERT/UPDATE with these statuses was silently rejected by
-- the DB constraint, causing the Edge Functions to fail.
--
-- Fix: Drop old constraint, add new one with all valid statuses.
-- ============================================================================

-- ── FIX 1: Make payment config readable by mobile app ──────────────────

UPDATE system_settings SET is_public = TRUE WHERE key = 'bookings_paid';
UPDATE system_settings SET is_public = TRUE WHERE key = 'stripe_publishable_key';
UPDATE system_settings SET is_public = TRUE WHERE key = 'stripe_mode';

-- ── FIX 2: Expand booking status CHECK constraint ──────────────────────
-- The booking `status` column needs 'awaiting_payment' (set by capture-booking-payment
-- Edge Function when teacher accepts a paid booking).
-- Original: ('pending', 'confirmed', 'completed', 'cancelled')
-- Note: Auto-generated constraint names vary, so we find and drop ALL check
-- constraints on the `status` column, then add the correct one.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) NOT LIKE '%payment_status%'
  LOOP
    EXECUTE 'ALTER TABLE bookings DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending',               -- Student requested, waiting for teacher
    'awaiting_payment',      -- Teacher accepted, waiting for student payment
    'confirmed',             -- Booking confirmed (free or payment completed)
    'completed',             -- Session completed
    'cancelled'              -- Cancelled by either party
  ));

-- ── FIX 3: Expand payment_status CHECK constraint ──────────────────────
-- The `payment_status` column needs 'awaiting_acceptance' and 'awaiting_payment'
-- (set by create-payment and capture-booking-payment Edge Functions).
-- Original: ('free', 'pending_payment', 'paid', 'payment_failed', 'refunded')

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_status%'
  LOOP
    EXECUTE 'ALTER TABLE bookings DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'free',                  -- No payment required
    'awaiting_acceptance',   -- Student created paid booking, waiting for teacher
    'awaiting_payment',      -- Teacher accepted, PaymentIntent created, waiting for student payment
    'pending_payment',       -- Payment initiated but not yet confirmed
    'paid',                  -- Payment completed successfully
    'payment_failed',        -- Payment attempt failed
    'refunded'               -- Payment was refunded
  ));

-- ── VERIFY ─────────────────────────────────────────────────────────────

-- 1. Check settings visibility
SELECT key, is_public, is_sensitive
FROM system_settings
WHERE key IN ('bookings_paid', 'stripe_publishable_key', 'stripe_mode', 'currency')
ORDER BY key;

-- 2. Check constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_payment_status_check';
