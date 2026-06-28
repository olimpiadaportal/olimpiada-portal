import { supabase } from './supabase';

const parseBooleanSetting = (value: unknown): boolean => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false' || value == null) return false;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) === true;
    } catch {
      return false;
    }
  }
  return false;
};

// ── Payment Service ───────────────────────────────────────────
// Phase 8 — Infrastructure layer.
// Bookings are currently FREE (price = 0). This service is the
// integration point for Stripe when Phase 8B activates paid bookings.
//
// When bookings_paid = true in system_settings:
//   1. Call initiateBookingPayment() → returns client_secret
//   2. Present Stripe Payment Sheet (requires @stripe/stripe-react-native)
//   3. On success, stripe-webhook Edge Function calls process_booking_payment()
//
// Until then, createFreeBooking() is used directly.

class PaymentService {
  // ── System Settings ─────────────────────────────────────────

  async isBookingsPaid(): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'bookings_paid')
        .single();
      if (!data) return false;
      // JSONB: Supabase auto-parses, but handle string fallback
      return parseBooleanSetting(data.value);
    } catch {
      return false;
    }
  }

  async isSubscriptionsEnabled(): Promise<boolean> {
    try {
      const { data: config, error: configError } = await supabase.rpc(
        'get_teacher_subscription_public_config'
      );

      if (!configError && config) {
        const payload = Array.isArray(config) ? config[0] : config;
        return parseBooleanSetting(payload?.subscriptions_enabled ?? payload?.subscriptionsEnabled);
      }

      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'subscriptions_enabled')
        .single();
      return data ? parseBooleanSetting(data.value) : false;
    } catch {
      return false;
    }
  }

  async getStripePublishableKey(): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'stripe_publishable_key')
        .single();
      if (!data) return null;
      // JSONB: Supabase auto-parses, but handle string fallback
      let key = data.value;
      if (typeof key === 'string' && key.startsWith('"')) {
        key = JSON.parse(key);
      }
      return typeof key === 'string' && key.startsWith('pk_') ? key : null;
    } catch {
      return null;
    }
  }

  // ── Phase 8B: Create booking request (Pay-After-Acceptance) ──
  // Calls the create-payment Supabase Edge Function.
  // Creates booking WITHOUT payment. Payment is triggered when teacher accepts.
  // Returns { bookingId, estimatedPrice, paymentRequired }
  async initiateBookingPayment(params: {
    teacherId: string;
    subjectId: string;
    scheduledDate: string;
    scheduledTime: string;
    durationHours: number;
    sessionMethod: string;
    serviceType: string;
    notes?: string;
    location?: string;
  }): Promise<{
    bookingId: string;
    estimatedPrice: number;
    currency: string;
    paymentRequired: boolean;
    message: string;
  } | null> {
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: params,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Initiate booking payment error:', error);
      return null;
    }
  }

  // ── Phase 8B: Capture payment when teacher accepts ───────────
  // Called by teacher when accepting a booking.
  // Creates Stripe PaymentIntent and returns clientSecret for student to pay.
  async captureBookingPayment(bookingId: string): Promise<{
    bookingId: string;
    clientSecret?: string;
    price?: number;
    currency?: string;
    paymentRequired: boolean;
    message: string;
  } | null> {
    try {
      const { data, error } = await supabase.functions.invoke('capture-booking-payment', {
        body: { bookingId },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Capture booking payment error:', error);
      return null;
    }
  }

  // ── Phase 8B: Get payment client secret (student side) ───────
  // Called by student to retrieve the Stripe client_secret for PaymentSheet.
  // The client_secret is scoped to a single PaymentIntent (PCI safe).
  async getPaymentClientSecret(bookingId: string): Promise<{
    clientSecret?: string;
    price?: number;
    currency?: string;
    paymentRequired: boolean;
    alreadyPaid?: boolean;
    message: string;
  } | null> {
    try {
      const { data, error } = await supabase.functions.invoke('get-payment-client-secret', {
        body: { bookingId },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get payment client secret error:', error);
      return null;
    }
  }

  // ── Phase 8B: Complete payment (student side) ────────────────
  // ── Phase 8B: Request refund ─────────────────────────────────
}

export const paymentService = new PaymentService();
