import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'http://localhost:3000',
  'http://localhost:8081',
];

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

function parseBoolean(value: unknown): boolean {
  if (value === true || value === 'true') return true;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) === true;
    } catch {
      return false;
    }
  }
  return false;
}

async function stripeRequest(
  secretKey: string,
  path: string,
  method: 'GET' | 'POST',
  params?: URLSearchParams,
  idempotencyKey?: string
) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: method === 'POST' ? params : undefined,
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Stripe request failed');
  }
  return body;
}

function paymentIntentClientSecret(subscription: any, resolvedPaymentIntent?: any): string | null {
  const invoice = subscription?.latest_invoice;
  const confirmationSecret = invoice?.confirmation_secret;
  const paymentIntent = resolvedPaymentIntent || invoice?.payment_intent;
  const paymentIntentStatus = typeof paymentIntent === 'object' ? paymentIntent?.status : null;
  const payableStatuses = new Set([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
  ]);

  if (paymentIntentStatus && !payableStatuses.has(paymentIntentStatus)) {
    return null;
  }

  if (confirmationSecret?.client_secret) return confirmationSecret.client_secret;
  return typeof paymentIntent === 'object' ? paymentIntent?.client_secret || null : null;
}

function objectId(value: any): string | null {
  if (typeof value === 'string') return value;
  return value?.id || null;
}

function invoicePaymentIntentId(invoice: any): string | null {
  const direct = objectId(invoice?.payment_intent);
  if (direct) return direct;

  const payment = invoice?.payments?.data?.find((item: any) => item?.payment?.payment_intent);
  const fromPayments = objectId(payment?.payment?.payment_intent);
  if (fromPayments) return fromPayments;

  const clientSecret = invoice?.confirmation_secret?.client_secret;
  if (typeof clientSecret === 'string' && clientSecret.includes('_secret_')) {
    return clientSecret.split('_secret_')[0] || null;
  }

  return null;
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

function mappedSubscriptionStatus(status: string): string {
  return status === 'canceled' ? 'cancelled' : status;
}

async function reconcileExistingSubscription(
  admin: ReturnType<typeof createClient>,
  stripeSecretKey: string,
  existing: any,
  studentUserId: string,
  teacherUserId: string
) {
  const stripeSubscription = await stripeRequest(
    stripeSecretKey,
    `subscriptions/${existing.stripe_subscription_id}?expand[]=latest_invoice.payment_intent&expand[]=latest_invoice.confirmation_secret`,
    'GET'
  );

  const invoice = typeof stripeSubscription.latest_invoice === 'object'
    ? stripeSubscription.latest_invoice
    : null;
  let paymentIntent = typeof invoice?.payment_intent === 'object'
    ? invoice.payment_intent
    : null;
  const paymentIntentId = invoicePaymentIntentId(invoice);
  if ((!paymentIntent || !paymentIntent.status) && paymentIntentId) {
    paymentIntent = await stripeRequest(
      stripeSecretKey,
      `payment_intents/${paymentIntentId}`,
      'GET'
    );
  }
  const paymentSucceeded = invoice?.status === 'paid' || paymentIntent?.status === 'succeeded';
  const reconciledStatus = paymentSucceeded
    ? 'active'
    : mappedSubscriptionStatus(stripeSubscription.status);
  const invoiceId = objectId(stripeSubscription.latest_invoice);
  const paidAt = paymentSucceeded
    ? unixDate(invoice?.status_transitions?.paid_at) || new Date().toISOString()
    : existing.last_payment_at;
  const period = subscriptionPeriod(stripeSubscription);

  if (paymentSucceeded && invoiceId && paymentIntentId) {
    const amountPaid = Number(invoice?.amount_paid || 0) / 100;
    if (amountPaid > 0) {
      const { error: accountingError } = await admin.rpc(
        'process_teacher_subscription_payment',
        {
          p_teacher_subscription_id: existing.id,
          p_student_user_id: studentUserId,
          p_teacher_user_id: teacherUserId,
          p_amount: amountPaid,
          p_currency: String(invoice?.currency || existing.currency || 'azn').toUpperCase(),
          p_external_payment_id: paymentIntentId,
          p_external_invoice_id: invoiceId,
          p_idempotency_key: `teacher_subscription_invoice_${invoiceId}`,
        }
      );
      if (accountingError) throw accountingError;
    }
  }

  const { data: saved, error: saveError } = await admin
    .from('teacher_subscriptions')
    .update({
      status: reconciledStatus,
      current_period_start: period.start,
      current_period_end: period.end,
      cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
      cancelled_at: unixDate(stripeSubscription.canceled_at),
      ended_at: unixDate(stripeSubscription.ended_at),
      stripe_latest_invoice_id: invoiceId,
      stripe_latest_payment_intent_id: paymentIntentId,
      last_payment_at: paidAt,
      ...(paymentSucceeded ? { last_payment_failed_at: null } : {}),
      metadata: {
        ...(existing.metadata || {}),
        stripe_livemode: Boolean(stripeSubscription.livemode),
        last_reconciled_at: new Date().toISOString(),
      },
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (saveError) throw saveError;

  return {
    subscription: saved,
    clientSecret: paymentSucceeded
      ? null
      : paymentIntentClientSecret(stripeSubscription, paymentIntent),
    alreadyExists: true,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let localSubscriptionId: string | null = null;

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(req, { error: 'Unauthorized' }, 401);

    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(req, { error: 'Unauthorized' }, 401);

    const { teacherId } = await req.json();
    if (!teacherId) return json(req, { error: 'teacherId is required' }, 400);

    const [{ data: enabledRow }, { data: student }, { data: teacher }] = await Promise.all([
      admin.from('system_settings').select('value').eq('key', 'subscriptions_enabled').maybeSingle(),
      admin.from('students').select('id, user_id').eq('user_id', user.id).single(),
      admin
        .from('teachers')
        .select(`
          id,
          user_id,
          monthly_rate,
          is_verified,
          stripe_subscription_product_id,
          stripe_subscription_price_id,
          stripe_subscription_price_amount,
          stripe_subscription_price_currency,
          profiles!teachers_user_id_fkey_profiles(full_name)
        `)
        .eq('id', teacherId)
        .single(),
    ]);

    if (!parseBoolean(enabledRow?.value)) {
      return json(req, { error: 'Teacher subscriptions are not enabled' }, 403);
    }
    if (!student) return json(req, { error: 'Student profile not found' }, 404);
    if (!teacher) return json(req, { error: 'Teacher not found' }, 404);
    if (!teacher.is_verified) return json(req, { error: 'Teacher is not verified' }, 400);

    const amount = Number(teacher.monthly_rate);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(req, { error: 'Teacher has no monthly subscription rate' }, 400);
    }

    const { data: existing } = await admin
      .from('teacher_subscriptions')
      .select('*')
      .eq('student_id', student.id)
      .eq('teacher_id', teacher.id)
      .in('status', ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'])
      .maybeSingle();

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) return json(req, { error: 'Payment system not configured' }, 503);

    if (existing?.stripe_subscription_id) {
      const reconciled = await reconcileExistingSubscription(
        admin,
        stripeSecretKey,
        existing,
        student.user_id,
        teacher.user_id
      );
      return json(req, reconciled);
    }

    const { data: currencyRow } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'currency')
      .maybeSingle();
    const rawCurrency = currencyRow?.value;
    const currency = (
      typeof rawCurrency === 'string' && rawCurrency.startsWith('"')
        ? JSON.parse(rawCurrency)
        : rawCurrency || 'eur'
    ).toString().toLowerCase();
    const amountInCents = Math.round(amount * 100);

    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const { data: prior } = await admin
        .from('teacher_subscriptions')
        .select('stripe_customer_id')
        .eq('student_id', student.id)
        .not('stripe_customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      customerId = prior?.stripe_customer_id || null;
    }

    if (!customerId) {
      const profile = await admin.from('profiles').select('full_name').eq('id', user.id).single();
      const customer = await stripeRequest(
        stripeSecretKey,
        'customers',
        'POST',
        new URLSearchParams({
          email: user.email || '',
          name: profile.data?.full_name || '',
          'metadata[elmly_user_id]': user.id,
          'metadata[elmly_student_id]': student.id,
        }),
        `teacher_customer_${student.id}`
      );
      customerId = customer.id;
    }

    let productId = teacher.stripe_subscription_product_id;
    if (!productId) {
      const product = await stripeRequest(
        stripeSecretKey,
        'products',
        'POST',
        new URLSearchParams({
          name: `Elmly teacher subscription - ${(teacher.profiles as any)?.full_name || teacher.id}`,
          'metadata[elmly_teacher_id]': teacher.id,
          'metadata[elmly_teacher_user_id]': teacher.user_id,
        }),
        `teacher_product_${teacher.id}`
      );
      productId = product.id;
    }

    const priceMatches =
      teacher.stripe_subscription_price_id &&
      Number(teacher.stripe_subscription_price_amount) === amount &&
      teacher.stripe_subscription_price_currency?.toLowerCase() === currency;

    let priceId = priceMatches ? teacher.stripe_subscription_price_id : null;
    if (!priceId) {
      const price = await stripeRequest(
        stripeSecretKey,
        'prices',
        'POST',
        new URLSearchParams({
          product: productId,
          unit_amount: String(amountInCents),
          currency,
          'recurring[interval]': 'month',
          'metadata[elmly_teacher_id]': teacher.id,
        }),
        `teacher_price_${teacher.id}_${currency}_${amountInCents}`
      );
      priceId = price.id;

      await admin
        .from('teachers')
        .update({
          stripe_subscription_product_id: productId,
          stripe_subscription_price_id: priceId,
          stripe_subscription_price_amount: amount,
          stripe_subscription_price_currency: currency,
        })
        .eq('id', teacher.id);
    }

    if (existing) {
      localSubscriptionId = existing.id;
      await admin
        .from('teacher_subscriptions')
        .update({
          status: 'incomplete',
          monthly_amount: amount,
          currency,
          stripe_customer_id: customerId,
          stripe_price_id: priceId,
          cancel_at_period_end: false,
          cancelled_at: null,
          ended_at: null,
        })
        .eq('id', existing.id);
    } else {
      const { data: created, error: createError } = await admin
        .from('teacher_subscriptions')
        .insert({
          student_id: student.id,
          teacher_id: teacher.id,
          status: 'incomplete',
          monthly_amount: amount,
          currency,
          stripe_customer_id: customerId,
          stripe_price_id: priceId,
        })
        .select()
        .single();
      if (createError || !created) throw createError || new Error('Could not create subscription record');
      localSubscriptionId = created.id;
    }

    const subscriptionParams = new URLSearchParams({
      customer: customerId,
      'items[0][price]': priceId,
      payment_behavior: 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'metadata[elmly_teacher_subscription]': 'true',
      'metadata[elmly_teacher_subscription_id]': localSubscriptionId,
      'metadata[elmly_student_id]': student.id,
      'metadata[elmly_student_user_id]': user.id,
      'metadata[elmly_teacher_id]': teacher.id,
      'metadata[elmly_teacher_user_id]': teacher.user_id,
    });
    subscriptionParams.append('expand[]', 'latest_invoice.payment_intent');
    subscriptionParams.append('expand[]', 'latest_invoice.confirmation_secret');

    const stripeSubscription = await stripeRequest(
      stripeSecretKey,
      'subscriptions',
      'POST',
      subscriptionParams,
      `teacher_subscription_${localSubscriptionId}`
    );

    const period = subscriptionPeriod(stripeSubscription);

    const { data: saved, error: saveError } = await admin
      .from('teacher_subscriptions')
      .update({
        stripe_subscription_id: stripeSubscription.id,
        status: stripeSubscription.status,
        current_period_start: period.start,
        current_period_end: period.end,
        cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
        metadata: {
          stripe_livemode: Boolean(stripeSubscription.livemode),
        },
      })
      .eq('id', localSubscriptionId)
      .select()
      .single();
    if (saveError) throw saveError;

    return json(req, {
      subscription: saved,
      clientSecret: paymentIntentClientSecret(stripeSubscription),
      alreadyExists: false,
    });
  } catch (error) {
    if (localSubscriptionId) {
      await admin
        .from('teacher_subscriptions')
        .update({ status: 'incomplete_expired', ended_at: new Date().toISOString() })
        .eq('id', localSubscriptionId)
        .is('stripe_subscription_id', null);
    }
    console.error('create-teacher-subscription error:', error);
    return json(req, { error: error instanceof Error ? error.message : 'Subscription creation failed' }, 500);
  }
});
