/**
 * Manual Budget Alert Trigger
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Allows admins to manually trigger test alerts for a specific budget
 */

import { NextResponse } from 'next/server';
import { triggerTestAlert } from '@/services/budgetAlertService';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/trigger-alert
 * 
 * Manually trigger a test alert for a specific budget
 * 
 * Body: { budgetId: string }
 * 
 * Authentication: Requires authenticated admin user
 */
export async function POST(request: Request) {
  try {
    // Create Supabase client with proper cookie handling
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated. Please log in.' },
        { status: 401 }
      );
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { budgetId } = body;

    if (!budgetId) {
      return NextResponse.json(
        { error: 'budgetId is required' },
        { status: 400 }
      );
    }


    // Trigger test alert
    const result = await triggerTestAlert(budgetId);

    if (!result.success) {
      console.error(`❌ Failed to send test alert: ${result.error}`);
      return NextResponse.json(
        { error: result.error || 'Failed to send alert' },
        { status: 500 }
      );
    }


    return NextResponse.json({
      success: true,
      message: 'Test alert sent successfully',
      budgetId,
    });
  } catch (error) {
    console.error('Error triggering test alert:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
