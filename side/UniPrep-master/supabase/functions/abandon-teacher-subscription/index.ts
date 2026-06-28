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

    const { subscriptionId } = await req.json();
    if (!subscriptionId) return json(req, { error: 'subscriptionId is required' }, 400);

    const { data: student } = await admin
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!student) return json(req, { error: 'Student profile not found' }, 404);

    const { data: subscription } = await admin
      .from('teacher_subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .eq('student_id', student.id)
      .maybeSingle();

    if (!subscription) return json(req, { error: 'Subscription not found' }, 404);
    if (subscription.ever_active) {
      return json(req, { error: 'Previously active subscriptions cannot be removed' }, 409);
    }
    if (!['incomplete', 'past_due', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
      return json(req, { error: 'Only unpaid initial subscriptions can be removed' }, 409);
    }

    if (subscription.stripe_subscription_id) {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) return json(req, { error: 'Payment system not configured' }, 503);

      const response = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscription.stripe_subscription_id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Idempotency-Key': `abandon_teacher_subscription_${subscription.id}`,
          },
        }
      );
      const stripeSubscription = await response.json();
      if (!response.ok && stripeSubscription?.error?.code !== 'resource_missing') {
        return json(
          req,
          { error: stripeSubscription?.error?.message || 'Subscription removal failed' },
          502
        );
      }
    }

    const endedAt = new Date().toISOString();
    const { data: saved, error: saveError } = await admin
      .from('teacher_subscriptions')
      .update({
        status: 'cancelled',
        cancel_at_period_end: false,
        cancelled_at: endedAt,
        ended_at: endedAt,
        updated_at: endedAt,
        metadata: {
          ...(subscription.metadata || {}),
          abandoned_before_activation: true,
          abandoned_at: endedAt,
        },
      })
      .eq('id', subscription.id)
      .eq('ever_active', false)
      .select()
      .single();
    if (saveError) throw saveError;

    return json(req, { subscription: saved });
  } catch (error) {
    console.error('abandon-teacher-subscription error:', error);
    return json(
      req,
      { error: error instanceof Error ? error.message : 'Subscription removal failed' },
      500
    );
  }
});
