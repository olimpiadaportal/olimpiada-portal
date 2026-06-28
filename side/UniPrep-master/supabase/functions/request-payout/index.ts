// ============================================================
// request-payout — Phase 8
// ============================================================
// Teacher requests withdrawal of their wallet balance.
// Admin reviews and approves/rejects in the Admin Panel.
//
// Flow:
//   1. Validate JWT → get teacher record
//   2. Validate amount >= min_payout_amount
//   3. Validate amount <= wallet balance
//   4. Insert payout_request row with status='pending'
//   5. Return { payoutRequestId }
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401, req);

    // Extract the JWT token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'Invalid authorization format' }, 401, req);

    // Create admin client to verify the user - more reliable than anon client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError?.message || 'No user found');
      return json({ error: 'Unauthorized', details: authError?.message }, 401, req);
    }

    // ── 2. Get teacher record ────────────────────────────────
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!teacher) return json({ error: 'Teacher record not found' }, 404, req);

    // ── 3. Parse body ────────────────────────────────────────
    const { amount, bank_details_ref } = await req.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return json({ error: 'Invalid amount' }, 400, req);
    }
    if (!bank_details_ref || typeof bank_details_ref !== 'string' || !bank_details_ref.trim()) {
      return json({ error: 'Bank details reference is required' }, 400, req);
    }

    // ── 4. Fetch min_payout_amount ───────────────────────────
    const { data: minPayoutRow } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'min_payout_amount')
      .single();

    const minPayout = minPayoutRow ? parseFloat(JSON.parse(minPayoutRow.value)) : 50;

    if (amount < minPayout) {
      return json({ error: `Minimum payout amount is ${minPayout}` }, 400, req);
    }

    // ── 5. Fetch wallet balance ──────────────────────────────
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('balance, currency')
      .eq('user_id', user.id)
      .single();

    if (!wallet) {
      return json({ error: 'No wallet found. You have no earnings to withdraw.' }, 400, req);
    }

    if (Number(wallet.balance) < amount) {
      return json({
        error: `Insufficient balance. Available: ${wallet.currency} ${wallet.balance}`,
      }, 400, req);
    }

    // ── 6. Check for existing pending request ────────────────
    const { data: existingRequest } = await supabaseAdmin
      .from('payout_requests')
      .select('id')
      .eq('teacher_id', teacher.id)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return json({
        error: 'You already have a pending payout request. Please wait for it to be processed.',
      }, 409, req);
    }

    // ── 7. Create payout request ─────────────────────────────
    const { data: payoutRequest, error: insertError } = await supabaseAdmin
      .from('payout_requests')
      .insert({
        teacher_id: teacher.id,
        amount,
        currency: wallet.currency,
        bank_details_ref: bank_details_ref.trim(),
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Payout request insert error:', insertError);
      return json({ error: 'Failed to create payout request' }, 500, req);
    }

    console.log(`📤 Payout request created: ${payoutRequest.id} for teacher ${teacher.id}, amount: ${wallet.currency} ${amount}`);

    return json({
      payoutRequestId: payoutRequest.id,
      message: 'Payout request submitted. Admin will review and process it shortly.',
    }, 200, req);

  } catch (err) {
    console.error('request-payout error:', err);
    return json({ error: 'Internal server error' }, 500, req);
  }
});
