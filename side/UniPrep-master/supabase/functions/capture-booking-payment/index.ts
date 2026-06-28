// ============================================================
// capture-booking-payment — Phase 8B (Pay-After-Acceptance)
// ============================================================
// Called when teacher accepts a booking request.
// Creates Stripe PaymentIntent and returns clientSecret for student to pay.
//
// Flow:
//   1. Validate JWT → verify teacher owns the booking
//   2. Check booking status is 'pending' and payment_status is 'awaiting_acceptance'
//   3. Create Stripe PaymentIntent with booking metadata
//   4. Update booking: status='awaiting_payment', payment_status='pending_payment'
//   5. Send notification to student to complete payment
//   6. Return { clientSecret, price } for student's payment UI
//
// Security:
//   - Only the teacher who owns the booking can trigger this
//   - STRIPE_SECRET_KEY stored in Supabase secrets only
//   - Price was calculated server-side at booking creation
//   - Student contact info hidden until payment completes
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

    // Extract the JWT token - handle both "Bearer <token>" and raw token
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    if (!token) {
      return json({ error: 'Invalid authorization format' }, 401, req);
    }

    // Create admin client to verify the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Use admin client to get user from JWT
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

    // ── 3. Fetch booking with teacher details (including hourly_rate) ──
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('*, teachers(user_id, hourly_rate)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return json({ error: 'Booking not found' }, 404, req);
    }

    // Verify the caller is the teacher who owns this booking
    if (booking.teachers?.user_id !== user.id) {
      return json({ error: 'You are not authorized to accept this booking' }, 403, req);
    }

    // ── 4. Check booking is in correct state ─────────────────
    if (booking.status !== 'pending') {
      return json({ error: 'Booking is not in pending state' }, 400, req);
    }

    // If payment_status is 'free', just accept without payment
    if (booking.payment_status === 'free') {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId);

      return json({
        bookingId,
        paymentRequired: false,
        message: 'Booking accepted. No payment required.',
      }, 200, req);
    }

    // ── 5. Check bookings_paid flag ──────────────────────────
    const { data: flagRow } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'bookings_paid')
      .single();

    // flagRow.value is JSONB — Supabase auto-parses it, but handle both cases
    const rawVal = flagRow?.value;
    const bookingsPaid = rawVal === true || rawVal === 'true' || (typeof rawVal === 'string' && JSON.parse(rawVal) === true);

    // If bookings are free, just accept
    if (!bookingsPaid) {
      await supabaseAdmin
        .from('bookings')
        .update({ 
          status: 'confirmed',
          payment_status: 'free',
        })
        .eq('id', bookingId);

      return json({
        bookingId,
        paymentRequired: false,
        message: 'Booking accepted. No payment required.',
      }, 200, req);
    }

    // ── 6. Get Stripe secret key ─────────────────────────────
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return json({ error: 'Payment system not configured' }, 503, req);
    }

    // ── 7. Fetch currency ────────────────────────────────────
    const { data: currencyRow } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'currency')
      .single();
    const rawCurrency = currencyRow?.value;
    const currency = (typeof rawCurrency === 'string' && rawCurrency.startsWith('"')
      ? JSON.parse(rawCurrency)
      : rawCurrency || 'eur'
    ).toString().toLowerCase();

    // ── 8. Calculate price server-side from teacher's hourly_rate ──
    // booking.price is always 0 (client doesn't set it), so we calculate here
    const teacherHourlyRate = Number(booking.teachers?.hourly_rate) || 0;
    const durationHours = Number(booking.duration_hours) || 1;
    const price = teacherHourlyRate * durationHours;

    if (price <= 0) {
      // Teacher has no hourly rate set, accept without payment
      console.log(`No price for booking ${bookingId}: hourly_rate=${teacherHourlyRate}, duration=${durationHours}`);
      await supabaseAdmin
        .from('bookings')
        .update({ 
          status: 'confirmed',
          payment_status: 'free',
        })
        .eq('id', bookingId);

      return json({
        bookingId,
        paymentRequired: false,
        message: 'Booking accepted. No payment required (teacher has no rate set).',
      }, 200, req);
    }

    const idempotencyKey = `capture_${bookingId}_${Date.now()}`;
    const amountInCents = Math.round(price * 100);

    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: new URLSearchParams({
        amount: String(amountInCents),
        currency: currency,
        'metadata[booking_id]': bookingId,
        'metadata[student_id]': booking.student_id,
        'metadata[teacher_id]': booking.teacher_id,
        'metadata[student_user_id]': booking.student_user_id || '',
        'metadata[teacher_user_id]': booking.teacher_user_id || user.id,
        'automatic_payment_methods[enabled]': 'true',
      }),
    });

    if (!stripeResponse.ok) {
      const stripeError = await stripeResponse.json();
      console.error('Stripe error:', stripeError);
      return json({ error: 'Payment initiation failed', details: stripeError.error?.message }, 502, req);
    }

    const paymentIntent = await stripeResponse.json();

    // ── 9. Update booking status and store calculated price ──
    await supabaseAdmin
      .from('bookings')
      .update({
        status: 'awaiting_payment',
        payment_status: 'pending_payment',
        payment_intent_id: paymentIntent.id,
        price: price,
      })
      .eq('id', bookingId);

    // ── 10. Send notification to student ─────────────────────
    // Fetch student and teacher info for notification
    const { data: studentData } = await supabaseAdmin
      .from('students')
      .select('user_id')
      .eq('id', booking.student_id)
      .single();

    const { data: teacherProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const { data: subjectData } = await supabaseAdmin
      .from('subjects')
      .select('name_en')
      .eq('id', booking.subject_id)
      .single();

    if (studentData?.user_id) {
      // Queue notification for push + in-app delivery via notification processor
      console.log(`Queueing booking_accepted_payment_required notification for student: ${studentData.user_id}`);
      const { data: notifId, error: notifError } = await supabaseAdmin.rpc('queue_payment_notification', {
        p_user_id: studentData.user_id,
        p_notification_type: 'booking_accepted_payment_required',
        p_title: '💳 Payment Required',
        p_body: `${teacherProfile?.full_name || 'Your teacher'} accepted your booking request for ${subjectData?.name_en || 'a session'}. Please complete payment to confirm.`,
        p_data: {
          type: 'payment_required',
          bookingId: bookingId,
          price: price,
          currency: currency.toUpperCase(),
          teacherName: teacherProfile?.full_name || 'Your teacher',
          subjectName: subjectData?.name_en || 'session',
          scheduledDate: booking.scheduled_date,
        },
        p_channels: ['push', 'in_app'],
        p_priority: 8,
      });
      if (notifError) {
        console.error('Failed to queue student notification:', notifError);
      } else {
        console.log(`✅ Student notification queued: ${notifId}`);
      }
    }

    console.log(`✅ Teacher accepted booking ${bookingId}. Payment required: ${currency.toUpperCase()} ${price}`);

    return json({
      bookingId,
      clientSecret: paymentIntent.client_secret,
      price,
      currency: currency.toUpperCase(),
      paymentRequired: true,
      message: 'Booking accepted. Student has been notified to complete payment.',
    }, 200, req);

  } catch (err) {
    console.error('capture-booking-payment error:', err);
    return json({ error: 'Internal server error' }, 500, req);
  }
});
