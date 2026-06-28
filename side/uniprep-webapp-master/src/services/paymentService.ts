import { createClient } from '@/lib/supabase/client';

// ── Payment Service (Web App) ─────────────────────────────────
// Phase 8B — Pay-after-acceptance Stripe integration.
// Flow: Student creates booking → Teacher accepts → Stripe PaymentIntent created
//       → Student pays → Webhook confirms → Wallets updated.

class PaymentService {
  private supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any { return this.supabase; }

  // ── System Settings ─────────────────────────────────────────

  async isBookingsPaid(): Promise<boolean> {
    try {
      const { data } = await this.db
        .from('system_settings')
        .select('value')
        .eq('key', 'bookings_paid')
        .maybeSingle();
      return data ? JSON.parse(data.value) === true : false;
    } catch {
      return false;
    }
  }

  async isSubscriptionsEnabled(): Promise<boolean> {
    try {
      const { data } = await this.db
        .from('system_settings')
        .select('value')
        .eq('key', 'subscriptions_enabled')
        .maybeSingle();
      return data ? JSON.parse(data.value) === true : false;
    } catch {
      return false;
    }
  }

  async getStripePublishableKey(): Promise<string | null> {
    try {
      const { data } = await this.db
        .from('system_settings')
        .select('value')
        .eq('key', 'stripe_publishable_key')
        .maybeSingle();
      if (!data) return null;
      const key = JSON.parse(data.value);
      return key && key.startsWith('pk_') ? key : null;
    } catch {
      return null;
    }
  }

  // ── Phase 8B: Student initiates a paid booking ───────────────
  // Calls the create-payment Edge Function. Creates the booking row
  // with payment_status = 'awaiting_acceptance'. No PaymentIntent yet —
  // that is created when the teacher accepts (captureBookingPayment).
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
      const { data, error } = await this.supabase.functions.invoke('create-payment', {
        body: params,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Initiate booking payment error:', error);
      return null;
    }
  }

  // ── Phase 8B: Teacher accepts — creates the Stripe PaymentIntent ─
  // Calls capture-booking-payment Edge Function.
  // Returns clientSecret when paymentRequired = true (student must pay).
  // Returns paymentRequired = false when booking is free — confirmed immediately.
  async captureBookingPayment(bookingId: string): Promise<{
    bookingId: string;
    paymentRequired: boolean;
    clientSecret?: string;
    price?: number;
    currency?: string;
    message: string;
  } | null> {
    try {
      const { data, error } = await this.supabase.functions.invoke('capture-booking-payment', {
        body: { bookingId },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Capture booking payment error:', error);
      return null;
    }
  }

  // ── Phase 8B: Student retrieves client_secret to open PayNowModal ─
  // Calls get-payment-client-secret Edge Function.
  // Booking must be in status = 'awaiting_payment' / payment_status = 'pending_payment'.
  async getPaymentClientSecret(bookingId: string): Promise<{
    clientSecret?: string;
    price?: number;
    currency?: string;
    paymentRequired: boolean;
    alreadyPaid?: boolean;
    message?: string;
  } | null> {
    try {
      const { data, error } = await this.supabase.functions.invoke('get-payment-client-secret', {
        body: { bookingId },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get payment client secret error:', error);
      return null;
    }
  }

  // ── Phase 8B: Called after Stripe confirmPayment() succeeds ────
  // The stripe-webhook Edge Function handles the authoritative DB update
  // (status → confirmed, payment_status → paid, wallet updates).
  // No client-side DB write needed — RLS blocks students from updating
  // payment_status anyway. Just return true so the UI can show success.
  async completePayment(_bookingId: string): Promise<boolean> {
    return true;
  }

  // ── Phase 8B: Request refund ─────────────────────────────────
  async requestRefund(bookingId: string, reason: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.functions.invoke('request-refund', {
        body: { booking_id: bookingId, reason },
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Request refund error:', error);
      return false;
    }
  }
}

export const paymentService = new PaymentService();
