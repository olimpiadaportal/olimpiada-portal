// ============================================================
// stripe-webhook — Phase 8B
// ============================================================
// Receives Stripe webhook events and processes payment outcomes.
//
// Registered events in Stripe Dashboard:
//   - payment_intent.succeeded      → mark booking paid, credit teacher wallet
//   - payment_intent.payment_failed → keep booking awaiting payment and allow retry
//   - charge.refunded               → process refund, debit teacher wallet
//
// Security:
//   - Webhook signature verified with STRIPE_WEBHOOK_SECRET
//   - All DB mutations via process_booking_payment() / process_refund()
//     which are SECURITY DEFINER functions (service role only)
//   - Idempotency key prevents double-processing
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Stripe webhook signature verification using Web Crypto API
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',');
    const tPart = parts.find((p) => p.startsWith('t='));
    const v1Part = parts.find((p) => p.startsWith('v1='));

    if (!tPart || !v1Part) return false;

    const timestamp = tPart.slice(2);
    const signature = v1Part.slice(3);
    const signedPayload = `${timestamp}.${payload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const mac = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload)
    );

    const expected = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

function teacherSubscriptionMarker(subscription: any): boolean {
  return subscription?.metadata?.elmly_teacher_subscription === 'true'
    || Boolean(subscription?.metadata?.elmly_teacher_subscription_id);
}

function mapTeacherSubscriptionStatus(status: string): string {
  return status === 'canceled' ? 'cancelled' : status;
}

function unixDate(value: unknown): string | null {
  return typeof value === 'number' && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function subscriptionPeriod(subscription: any) {
  const item = subscription?.items?.data?.[0];
  return {
    start: unixDate(item?.current_period_start ?? subscription?.current_period_start),
    end: unixDate(item?.current_period_end ?? subscription?.current_period_end),
  };
}

function invoiceSubscriptionId(invoice: any): string | null {
  const direct = invoice?.subscription;
  if (typeof direct === 'string') return direct;
  if (direct?.id) return direct.id;

  const parentSubscription = invoice?.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === 'string') return parentSubscription;
  return parentSubscription?.id || null;
}

function invoicePaymentIntentId(invoice: any): string | null {
  if (typeof invoice?.payment_intent === 'string') return invoice.payment_intent;
  if (invoice?.payment_intent?.id) return invoice.payment_intent.id;

  const payment = invoice?.payments?.data?.find((item: any) => item?.payment?.payment_intent);
  const paymentIntent = payment?.payment?.payment_intent;
  return typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id || null;
}

function invoiceTeacherSubscriptionId(invoice: any): string | null {
  return invoice?.parent?.subscription_details?.metadata?.elmly_teacher_subscription_id
    || invoice?.subscription_details?.metadata?.elmly_teacher_subscription_id
    || null;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return new Response('Webhook secret not configured', { status: 503 });
  }

  // ── Read raw body for signature verification ─────────────
  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!isValid) {
    console.error('Invalid Stripe webhook signature');
    return new Response('Invalid signature', { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log(`Processing Stripe event: ${event.type} [${event.id}]`);

  try {
    switch (event.type) {
      // ── Payment succeeded (Pay-After-Acceptance) ─────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const bookingId = pi.metadata?.booking_id;
        let studentUserId = pi.metadata?.student_user_id;
        let teacherUserId = pi.metadata?.teacher_user_id;

        if (!bookingId) {
          console.error('Missing booking_id in PaymentIntent metadata:', pi.id);
          break;
        }

        // If user IDs are missing from metadata, fetch from booking record
        // This handles PaymentIntents created before the metadata fix
        if (!studentUserId || !teacherUserId) {
          console.log('Fetching user IDs from booking record (metadata incomplete)');
          const { data: bookingData } = await supabase
            .from('bookings')
            .select('student_user_id, teacher_user_id')
            .eq('id', bookingId)
            .single();
          
          if (bookingData) {
            studentUserId = studentUserId || bookingData.student_user_id;
            teacherUserId = teacherUserId || bookingData.teacher_user_id;
          }
        }

        if (!studentUserId || !teacherUserId) {
          console.error('Could not determine user IDs for booking:', bookingId);
          // Still update booking status even if we can't process payment
          await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_status: 'paid',
              payment_intent_id: pi.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', bookingId);
          console.log(`Booking ${bookingId} marked as confirmed (user IDs missing)`);
          break;
        }

        const amount = pi.amount / 100; // Convert cents to decimal
        const currency = pi.currency.toUpperCase();
        const idempotencyKey = `pi_succeeded_${pi.id}`;

        // Process payment: create transactions, credit teacher wallet
        const { data: success, error } = await supabase.rpc('process_booking_payment', {
          p_booking_id: bookingId,
          p_student_user_id: studentUserId,
          p_teacher_user_id: teacherUserId,
          p_amount: amount,
          p_currency: currency,
          p_external_payment_id: pi.id,
          p_idempotency_key: idempotencyKey,
        });

        if (error) {
          console.error('process_booking_payment error:', error);
          // Still update booking status even if RPC fails
          await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_status: 'paid',
              payment_intent_id: pi.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', bookingId);
          console.log(`Booking ${bookingId} marked as confirmed (RPC failed but payment succeeded)`);
          break;
        }

        // Update booking status to confirmed (Pay-After-Acceptance complete)
        await supabase
          .from('bookings')
          .update({
            status: 'confirmed',
            payment_status: 'paid',
            payment_intent_id: pi.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bookingId);

        // Send notification to teacher that payment is complete
        const { data: booking } = await supabase
          .from('bookings')
          .select('teacher_user_id, student_id, scheduled_date, scheduled_time, subjects(name_en)')
          .eq('id', bookingId)
          .single();

        if (booking?.teacher_user_id) {
          // Queue notification for push + in-app delivery via notification processor
          console.log(`Queueing payment_received notification for teacher: ${booking.teacher_user_id}`);
          const { data: teacherNotifId, error: teacherNotifError } = await supabase.rpc('queue_payment_notification', {
            p_user_id: booking.teacher_user_id,
            p_notification_type: 'payment_received',
            p_title: '💰 Payment Received',
            p_body: `Student has completed payment for ${(booking.subjects as any)?.name_en || 'session'} on ${booking.scheduled_date}. Booking is now confirmed!`,
            p_data: {
              type: 'payment_received',
              bookingId: bookingId,
              amount: amount,
              currency: currency,
              subjectName: (booking.subjects as any)?.name_en || 'session',
              scheduledDate: booking.scheduled_date,
            },
            p_channels: ['push', 'in_app'],
            p_priority: 8,
          });
          if (teacherNotifError) {
            console.error('Failed to queue teacher notification:', teacherNotifError);
          } else {
            console.log(`✅ Teacher notification queued: ${teacherNotifId}`);
          }
        }

        // Also notify student that payment was successful
        if (studentUserId) {
          console.log(`Queueing payment_succeeded notification for student: ${studentUserId}`);
          const { data: studentNotifId, error: studentNotifError } = await supabase.rpc('queue_payment_notification', {
            p_user_id: studentUserId,
            p_notification_type: 'payment_succeeded',
            p_title: '✅ Payment Successful',
            p_body: `Your payment of ${currency} ${amount} was successful! Your session on ${booking?.scheduled_date || 'the scheduled date'} is now confirmed.`,
            p_data: {
              type: 'payment_succeeded',
              bookingId: bookingId,
              amount: amount,
              currency: currency,
              scheduledDate: booking?.scheduled_date,
            },
            p_channels: ['push', 'in_app'],
            p_priority: 8,
          });
          if (studentNotifError) {
            console.error('Failed to queue student notification:', studentNotifError);
          } else {
            console.log(`✅ Student notification queued: ${studentNotifId}`);
          }
        }

        console.log(`✅ Payment processed for booking ${bookingId}: ${currency} ${amount} - Booking confirmed`);
        break;
      }

      // ── Payment failed ─────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const bookingId = pi.metadata?.booking_id;

        if (!bookingId) {
          console.error('Missing booking_id in PaymentIntent metadata:', pi.id);
          break;
        }

        const { error } = await supabase
          .from('bookings')
          .update({
            status: 'awaiting_payment',
            payment_status: 'payment_failed',
            cancellation_reason: null,
            cancelled_at: null,
            cancelled_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bookingId);

        if (error) console.error('Update booking payment_failed error:', error);
        else console.log(`Payment failed for booking ${bookingId}; booking remains awaiting payment for retry.`);
        break;
      }

      // ── Charge refunded ────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object;
        const piId = charge.payment_intent;

        if (!piId) break;

        // Find booking by payment_intent_id
        const { data: booking } = await supabase
          .from('bookings')
          .select('id')
          .eq('payment_intent_id', piId)
          .single();

        if (!booking) {
          const { data: refunded, error: subscriptionRefundError } = await supabase.rpc(
            'process_teacher_subscription_refund',
            {
              p_external_payment_id: piId,
              p_refunded_total: Number(charge.amount_refunded || 0) / 100,
              p_reason: 'Teacher subscription payment refunded via Stripe',
              p_idempotency_key: `teacher_subscription_refund_${charge.id}`,
            }
          );

          if (subscriptionRefundError) {
            console.error('Teacher subscription refund error:', subscriptionRefundError);
          } else if (refunded) {
            console.log(`Teacher subscription refund processed for PaymentIntent ${piId}`);
          } else {
            console.log(`No Elmly booking or teacher subscription payment found for refund ${piId}`);
          }
          break;
        }

        const idempotencyKey = `refund_${charge.id}`;
        const { error } = await supabase.rpc('process_refund', {
          p_booking_id: booking.id,
          p_reason: 'Refunded via Stripe',
          p_idempotency_key: idempotencyKey,
        });

        if (error) console.error('process_refund error:', error);
        else console.log(`↩️ Refund processed for booking ${booking.id}`);
        break;
      }

      // ── Subscription events (Phase 8C) ─────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoiceSubscriptionId(invoice);
        if (!stripeSubscriptionId) break;

        const localSubscriptionId = invoiceTeacherSubscriptionId(invoice);
        let teacherSubscriptionQuery = supabase
          .from('teacher_subscriptions')
          .select('id, student_id, teacher_id, students(user_id), teachers(user_id)');
        teacherSubscriptionQuery = localSubscriptionId
          ? teacherSubscriptionQuery.eq('id', localSubscriptionId)
          : teacherSubscriptionQuery.eq('stripe_subscription_id', stripeSubscriptionId);
        const { data: teacherSubscription } = await teacherSubscriptionQuery.maybeSingle();

        if (!teacherSubscription) break;

        const amount = Number(invoice.amount_paid || 0) / 100;
        const paymentIntentId = invoicePaymentIntentId(invoice) || invoice.id;
        const studentUserId = (teacherSubscription.students as any)?.user_id;
        const teacherUserId = (teacherSubscription.teachers as any)?.user_id;

        if (amount > 0 && studentUserId && teacherUserId) {
          const { error: accountingError } = await supabase.rpc(
            'process_teacher_subscription_payment',
            {
              p_teacher_subscription_id: teacherSubscription.id,
              p_student_user_id: studentUserId,
              p_teacher_user_id: teacherUserId,
              p_amount: amount,
              p_currency: String(invoice.currency || 'eur').toUpperCase(),
              p_external_payment_id: paymentIntentId,
              p_external_invoice_id: invoice.id,
              p_idempotency_key: `teacher_subscription_invoice_${invoice.id}`,
            }
          );
          if (accountingError) {
            console.error('Teacher subscription accounting error:', accountingError);
          }
        }

        await supabase
          .from('teacher_subscriptions')
          .update({
            status: 'active',
            ever_active: true,
            stripe_latest_invoice_id: invoice.id,
            stripe_latest_payment_intent_id: paymentIntentId,
            last_payment_at: new Date().toISOString(),
            last_payment_failed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', teacherSubscription.id);

        console.log(`Teacher subscription invoice paid: ${invoice.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoiceSubscriptionId(invoice);
        if (!stripeSubscriptionId) break;

        const localSubscriptionId = invoiceTeacherSubscriptionId(invoice);
        let failedUpdate = supabase
          .from('teacher_subscriptions')
          .update({
            status: 'past_due',
            stripe_latest_invoice_id: invoice.id,
            stripe_latest_payment_intent_id: invoicePaymentIntentId(invoice),
            last_payment_failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        failedUpdate = localSubscriptionId
          ? failedUpdate.eq('id', localSubscriptionId)
          : failedUpdate.eq('stripe_subscription_id', stripeSubscriptionId);
        await failedUpdate;

        console.log(`Teacher subscription invoice failed: ${invoice.id}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const period = subscriptionPeriod(sub);

        if (teacherSubscriptionMarker(sub)) {
          const localId = sub.metadata?.elmly_teacher_subscription_id;
          const update = {
            stripe_subscription_id: sub.id,
            stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            stripe_price_id: sub.items?.data?.[0]?.price?.id || null,
            status: mapTeacherSubscriptionStatus(sub.status),
            current_period_start: period.start,
            current_period_end: period.end,
            cancel_at_period_end: Boolean(sub.cancel_at_period_end),
            cancelled_at: unixDate(sub.canceled_at),
            ended_at: unixDate(sub.ended_at),
            ...(['active', 'trialing'].includes(sub.status) ? { ever_active: true } : {}),
            updated_at: new Date().toISOString(),
          };

          let query = supabase.from('teacher_subscriptions').update(update);
          query = localId
            ? query.eq('id', localId)
            : query.eq('stripe_subscription_id', sub.id);
          const { error: teacherSubError } = await query;
          if (teacherSubError) {
            console.error('Teacher subscription update error:', teacherSubError);
          }
          console.log(`Teacher subscription ${event.type}: ${sub.id}`);
          break;
        }

        const userId = sub.metadata?.user_id;
        if (!userId) break;

        // Find tier by Stripe price ID
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (!priceId) break;

        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('id')
          .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
          .single();

        if (!tier) {
          console.error('No tier found for Stripe price:', priceId);
          break;
        }

        const billingCycle = sub.items?.data?.[0]?.price?.recurring?.interval === 'year'
          ? 'yearly' : 'monthly';

        await supabase
          .from('user_subscriptions')
          .upsert({
            user_id: userId,
            tier_id: tier.id,
            status: sub.status,
            billing_cycle: billingCycle,
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer,
            current_period_start: period.start,
            current_period_end: period.end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        console.log(`📦 Subscription ${event.type} for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const period = subscriptionPeriod(sub);

        if (teacherSubscriptionMarker(sub)) {
          await supabase
            .from('teacher_subscriptions')
            .update({
              status: 'cancelled',
              cancel_at_period_end: false,
              cancelled_at: unixDate(sub.canceled_at) || new Date().toISOString(),
              ended_at: unixDate(sub.ended_at) || new Date().toISOString(),
              current_period_end: period.end,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id);

          console.log(`Teacher subscription cancelled: ${sub.id}`);
          break;
        }

        await supabase
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id);

        console.log(`🗑️ Subscription cancelled: ${sub.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Internal server error', { status: 500 });
  }
});
