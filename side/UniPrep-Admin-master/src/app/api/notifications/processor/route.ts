/**
 * Notification Processor API Route
 * Phase 2: Event-Driven Notifications
 * 
 * API endpoint to manually trigger notification processing.
 * Can be called via cron job or manually for testing.
 * 
 * Also processes waitlist invitation emails from waitlist_email_queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { notificationProcessorService } from '@/services/notificationProcessorService';
import { processWaitlistEmails } from '@/services/waitlistEmailService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/notifications/processor
 * Manually trigger notification processing
 * 
 * Security: Requires API key authentication via X-API-Key header
 * This endpoint is designed to be called by cron jobs
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: API Key authentication (REQUIRED for production)
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.NOTIFICATION_PROCESSOR_API_KEY;

    // Enforce API key authentication
    if (!expectedApiKey || expectedApiKey.trim() === '') {
      console.error('⚠️ SECURITY WARNING: NOTIFICATION_PROCESSOR_API_KEY not set in environment variables');
      return NextResponse.json(
        { error: 'Service configuration error - API key not configured' },
        { status: 500 }
      );
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      console.warn('🚫 Unauthorized access attempt to notification processor');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }


    console.log('🔔 [Processor] Starting notification processing...');

    // Process the main notification queue
    // @ts-expect-error - processQueue is private but needed for API route
    await notificationProcessorService.processQueue();
    console.log('🔔 [Processor] Main notification queue processed');

    // Process waitlist invitation emails
    console.log('🔔 [Processor] Starting waitlist email processing...');
    const waitlistStats = await processWaitlistEmails(10);
    console.log('🔔 [Processor] Waitlist stats:', JSON.stringify(waitlistStats));

    return NextResponse.json({
      success: true,
      message: 'Notification queue processed',
      timestamp: new Date().toISOString(),
      waitlist_emails: waitlistStats,
    });
  } catch (error) {
    console.error('Error in notification processor:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process notifications'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/processor
 * Removed: Previously leaked system status without auth (HIGH-06 fix)
 */
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
