/**
 * Budget Alert Cron Job
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Runs periodically (every hour) to check budgets and send alerts
 * Triggered by Vercel Cron or manual invocation
 */

import { NextResponse } from 'next/server';
import { checkAndSendBudgetAlerts } from '@/services/budgetAlertService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/check-budgets
 * 
 * Checks all active budgets and sends alerts if thresholds are exceeded
 * 
 * Authentication: Requires CRON_SECRET in Authorization header
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron job not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cron job attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const startTime = Date.now();

    // Check budgets and send alerts
    const result = await checkAndSendBudgetAlerts();

    const duration = Date.now() - startTime;


    if (result.errors.length > 0) {
      console.error('❌ Errors during budget check:', result.errors);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      budgets_checked: result.checked,
      alerts_sent: result.alertsSent,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Fatal error in budget check cron job:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
