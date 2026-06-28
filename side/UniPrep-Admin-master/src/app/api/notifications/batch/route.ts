/**
 * Notification Batching API
 * Combines similar notifications to reduce spam
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { data, error } = await supabase.rpc('batch_similar_notifications');

    if (error) {
      console.error('Error running batching:', error);
      return NextResponse.json(
        { error: 'Failed to run batching' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Batching completed successfully',
      batched_count: data || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in batching API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
