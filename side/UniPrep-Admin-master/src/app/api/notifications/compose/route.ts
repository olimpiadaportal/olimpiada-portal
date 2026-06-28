/**
 * Notification Composer API
 * Allows admins to send custom notifications
 * 
 * Uses admin_send_notification RPC function which:
 * 1. Creates admin_notifications record
 * 2. Creates notification_recipients for each user/channel
 * 3. Creates notifications table entries for in-app display
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Require authenticated admin (minimum admin role for sending notifications)
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const body = await request.json();
    const {
      recipients,
      notificationType,
      title,
      body: messageBody,
      channels,
      scheduledAt,
      actionUrl,
    } = body;

    // Validate
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients are required' },
        { status: 400 }
      );
    }

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json(
        { error: 'At least one channel is required' },
        { status: 400 }
      );
    }

    // LOW-03: Sanitize notification content (prevent XSS via compromised admin)
    const sanitize = (str: string) => str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
    const sanitizedTitle = sanitize(title);
    const sanitizedBody = sanitize(messageBody);

    // Create Supabase client with service role for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Use the authenticated admin's user ID
    const adminId = admin.userId;

    // Determine target type and filter based on recipients
    let targetType = 'individual';
    let targetFilter: Record<string, any> = { user_ids: recipients };

    // Build data object for action URL and other metadata
    const notificationData: Record<string, any> = {};
    if (actionUrl) {
      notificationData.action_url = actionUrl;
    }

    // Use admin_send_notification RPC function
    // This properly creates records in admin_notifications, notification_recipients, AND notifications tables
    // Also handles variable substitution (e.g., {{user_name}})
    const { data, error } = await supabase.rpc('admin_send_notification', {
      p_admin_id: adminId,
      p_title: sanitizedTitle,
      p_body: sanitizedBody,
      p_channels: channels,
      p_target_type: targetType,
      p_target_filter: targetFilter,
      p_scheduled_at: scheduledAt || null,
      p_notification_type: notificationType || 'general',
      p_data: notificationData,
    });

    if (error) {
      console.error('Error sending notification:', error);
      return NextResponse.json(
        { error: 'Failed to send notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notificationId: data,
      count: recipients.length,
      message: `Notification sent to ${recipients.length} recipient(s) successfully`,
    });
  } catch (error) {
    console.error('Error in compose API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
