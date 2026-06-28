// ============================================================
// get-payment-client-secret — Phase 8B (Pay-After-Acceptance)
// ============================================================
// Called by the STUDENT to retrieve the Stripe client_secret
// for a booking that is awaiting their payment.
//
// Flow:
//   1. Validate JWT → verify student owns the booking
//   2. Check booking status is retryable 'awaiting_payment' with payment_intent_id
//   3. Retrieve PaymentIntent from Stripe to get client_secret
//   4. Return { clientSecret, price, currency }
//
// Security:
//   - Only the student who owns the booking can retrieve the secret
//   - STRIPE_SECRET_KEY stored in Supabase secrets only
//   - client_secret is scoped to a single PaymentIntent (PCI safe)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'https://uni-prep-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  try {
    // ── 1. Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401, req);
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    if (!token) {
      return json({ error: 'Invalid authorization format' }, 401, req);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return json({ error: 'Unauthorized' }, 401, req);
    }

    // ── 2. Parse request body ────────────────────────────────
    const { bookingId } = await req.json();

    if (!bookingId) {
      return json({ error: 'Missing bookingId' }, 400, req);
    }

    // ── 3. Fetch booking ─────────────────────────────────────
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, student_user_id, status, payment_status, payment_intent_id, price')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return json({ error: 'Booking not found' }, 404, req);
    }

    // ── 4. Verify the caller is the student who owns this booking ──
    if (booking.student_user_id !== user.id) {
      return json({ error: 'You are not authorized to pay for this booking' }, 403, req);
    }

    // ── 5a. Safety net: if webhook already confirmed this booking, return alreadyPaid ──
    if (booking.status === 'confirmed' && booking.payment_status === 'paid') {
      return json({
        bookingId,
        alreadyPaid: true,
        paymentRequired: false,
        message: 'Payment already completed. Booking is confirmed.',
      }, 200, req);
    }

    // ── 5. Check booking is in correct state ─────────────────
    const retryablePaymentStatuses = new Set(['pending_payment', 'payment_failed']);
    if (booking.status !== 'awaiting_payment' || !retryablePaymentStatuses.has(booking.payment_status)) {
      return json({ error: 'This booking is not awaiting payment' }, 400, req);
    }

    if (!booking.payment_intent_id) {
      return json({ error: 'No payment intent found for this booking' }, 400, req);
    }

    // ── 6. Get Stripe secret key ─────────────────────────────
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return json({ error: 'Payment system not configured' }, 503, req);
    }

    // ── 7. Retrieve PaymentIntent from Stripe ────────────────
    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/payment_intents/${booking.payment_intent_id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!stripeResponse.ok) {
      const stripeError = await stripeResponse.json();
      console.error('Stripe retrieve error:', stripeError);
      return json({ error: 'Failed to retrieve payment details' }, 502, req);
    }

    const paymentIntent = await stripeResponse.json();

    // ── 8. Check PaymentIntent is still payable ──────────────
    if (paymentIntent.status === 'succeeded') {
      // Already paid — update booking status
      await supabaseAdmin
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
        })
        .eq('id', bookingId);

      return json({
        bookingId,
        alreadyPaid: true,
        message: 'Payment already completed. Booking is confirmed.',
      }, 200, req);
    }

    if (paymentIntent.status === 'canceled') {
      return json({ error: 'Payment has been cancelled. Please contact support.' }, 400, req);
    }

    // ── 9. Get currency ──────────────────────────────────────
    const { data: currencyRow } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'currency')
      .single();
    const rawCurrency = currencyRow?.value;
    const currency = (typeof rawCurrency === 'string' && rawCurrency.startsWith('"')
      ? JSON.parse(rawCurrency)
      : rawCurrency || 'azn'
    ).toString().toUpperCase();

    console.log(`✅ Student ${user.id} retrieving payment for booking ${bookingId}: ${currency} ${booking.price}`);

    return json({
      bookingId,
      clientSecret: paymentIntent.client_secret,
      price: Number(booking.price),
      currency,
      paymentRequired: true,
      alreadyPaid: false,
      message: 'Payment details retrieved. Please complete payment.',
    }, 200, req);

  } catch (err) {
    console.error('get-payment-client-secret error:', err);
    return json({ error: 'Internal server error' }, 500, req);
  }
});
