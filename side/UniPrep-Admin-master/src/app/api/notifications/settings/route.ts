/**
 * Notification Settings API
 * Phase 4: User Preferences
 * 
 * API endpoints for managing user notification preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/settings?userId=xxx
 * Get user's notification settings
 */
export async function GET(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'moderator');
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Get user's notification settings
    const { data: settings, error } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      settings: settings || [],
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch settings'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications/settings
 * Update user's notification settings
 */
export async function POST(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const body = await request.json();
    const { userId, notificationType, enabled, channels, quietHoursStart, quietHoursEnd } = body;

    if (!userId || !notificationType) {
      return NextResponse.json(
        { error: 'userId and notificationType are required' },
        { status: 400 }
      );
    }

    // Upsert user notification setting
    const { data, error } = await supabase
      .from('user_notification_settings')
      .upsert({
        user_id: userId,
        notification_type: notificationType,
        enabled: enabled ?? true,
        channels: channels || ['in_app', 'push'],
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,notification_type',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      setting: data,
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update settings'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications/settings/batch
 * Batch update multiple notification settings
 */
export async function PUT(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const body = await request.json();
    const { userId, settings } = body;

    if (!userId || !Array.isArray(settings)) {
      return NextResponse.json(
        { error: 'userId and settings array are required' },
        { status: 400 }
      );
    }

    // Prepare batch upsert data
    const upsertData = settings.map(setting => ({
      user_id: userId,
      notification_type: setting.notificationType,
      enabled: setting.enabled ?? true,
      channels: setting.channels || ['in_app', 'push'],
      quiet_hours_start: setting.quietHoursStart,
      quiet_hours_end: setting.quietHoursEnd,
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert
    const { data, error } = await supabase
      .from('user_notification_settings')
      .upsert(upsertData, {
        onConflict: 'user_id,notification_type',
      })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      settings: data,
    });
  } catch (error) {
    console.error('Error batch updating notification settings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to batch update settings'
      },
      { status: 500 }
    );
  }
}
