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

function unixDate(value: unknown): string | null {
  return typeof value === 'number' && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function subscriptionPeriodEnd(subscription: any): string | null {
  return unixDate(
    subscription?.items?.data?.[0]?.current_period_end
      ?? subscription?.current_period_end
  );
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(req, { error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(req, { error: 'Unauthorized' }, 401);

    const { teacherId } = await req.json();
    if (!teacherId) return json(req, { error: 'teacherId is required' }, 400);

    const { data: student } = await admin
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!student) return json(req, { error: 'Student profile not found' }, 404);

    const { data: subscription } = await admin
      .from('teacher_subscriptions')
      .select('*')
      .eq('student_id', student.id)
      .eq('teacher_id', teacherId)
      .in('status', ['trialing', 'active', 'past_due', 'unpaid', 'paused'])
      .eq('cancel_at_period_end', true)
      .maybeSingle();

    if (!subscription?.stripe_subscription_id) {
      return json(req, { error: 'Subscription scheduled for cancellation not found' }, 404);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) return json(req, { error: 'Payment system not configured' }, 503);

    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${subscription.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `resume_teacher_subscription_${subscription.id}_${new Date(subscription.updated_at).getTime()}`,
        },
        body: new URLSearchParams({ cancel_at_period_end: 'false' }),
      }
    );
    const stripeSubscription = await response.json();
    if (!response.ok) {
      return json(req, { error: stripeSubscription?.error?.message || 'Resume failed' }, 502);
    }

    const periodEnd = subscriptionPeriodEnd(stripeSubscription)
      || subscription.current_period_end;

    const { data: saved, error: saveError } = await admin
      .from('teacher_subscriptions')
      .update({
        cancel_at_period_end: false,
        cancelled_at: null,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id)
      .select()
      .single();
    if (saveError) throw saveError;

    return json(req, { subscription: saved });
  } catch (error) {
    console.error('resume-teacher-subscription error:', error);
    return json(req, { error: error instanceof Error ? error.message : 'Resume failed' }, 500);
  }
});
