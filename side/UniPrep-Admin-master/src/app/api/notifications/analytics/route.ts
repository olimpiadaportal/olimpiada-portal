/**
 * Notification Analytics API
 * Phase 5: Analytics & Monitoring
 * 
 * API endpoints for notification analytics and monitoring
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
 * GET /api/notifications/analytics?type=overview|trends|engagement|health
 * Get notification analytics data
 */
export async function GET(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'moderator');
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const days = parseInt(searchParams.get('days') || '7');

    switch (type) {
      case 'overview':
        return await getOverviewStats();
      
      case 'trends':
        return await getTrends(days);
      
      case 'engagement':
        return await getEngagementStats();
      
      case 'health':
        return await getQueueHealth();
      
      case 'channels':
        return await getChannelPerformance();
      
      case 'types':
        return await getTopTypes();
      
      case 'failures':
        return await getFailureAnalysis();
      
      default:
        return NextResponse.json(
          { error: 'Invalid analytics type' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch analytics'
      },
      { status: 500 }
    );
  }
}

async function getOverviewStats() {
  // Query actual tables instead of views that may not exist
  const { data: notifications, error: notifError } = await supabase
    .from('admin_notifications')
    .select('id, status, total_recipients, delivered_count, opened_count, failed_count');

  if (notifError) {
    console.error('Overview stats error:', notifError);
  }

  const stats = (notifications || []).reduce((acc, n) => ({
    total_notifications: acc.total_notifications + 1,
    sent_count: acc.sent_count + (n.status === 'sent' ? 1 : 0),
    failed_count: acc.failed_count + (n.failed_count || 0),
    pending_count: acc.pending_count + (n.status === 'pending' || n.status === 'scheduled' ? 1 : 0),
    processing_count: acc.processing_count + (n.status === 'sending' ? 1 : 0),
    total_recipients: acc.total_recipients + (n.total_recipients || 0),
    total_delivered: acc.total_delivered + (n.delivered_count || 0),
    total_opened: acc.total_opened + (n.opened_count || 0),
  }), {
    total_notifications: 0,
    sent_count: 0,
    failed_count: 0,
    pending_count: 0,
    processing_count: 0,
    total_recipients: 0,
    total_delivered: 0,
    total_opened: 0,
  });

  const delivery_rate = stats.total_recipients > 0 
    ? Math.round((stats.total_delivered / stats.total_recipients) * 100) 
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      total_notifications: stats.total_notifications,
      sent_count: stats.sent_count,
      failed_count: stats.failed_count,
      pending_count: stats.pending_count,
      processing_count: stats.processing_count,
      delivery_rate_percentage: delivery_rate,
      unique_recipients: stats.total_recipients,
      total_delivered: stats.total_delivered,
      total_opened: stats.total_opened,
    },
  });
}

async function getTrends(days: number) {
  // Query admin_notifications directly for trends
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('admin_notifications')
    .select('created_at, total_recipients, delivered_count, failed_count')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Trends error:', error);
    return NextResponse.json({ success: true, data: [] });
  }

  // Group by date
  const trendsByDate: Record<string, any> = {};
  (data || []).forEach(n => {
    const date = new Date(n.created_at).toISOString().split('T')[0];
    if (!trendsByDate[date]) {
      trendsByDate[date] = { date, total_count: 0, sent_count: 0, failed_count: 0, unique_users: 0, success_rate: 0 };
    }
    trendsByDate[date].total_count += 1;
    trendsByDate[date].sent_count += n.delivered_count || 0;
    trendsByDate[date].failed_count += n.failed_count || 0;
    trendsByDate[date].unique_users += n.total_recipients || 0;
  });

  // Calculate success rates
  const trends = Object.values(trendsByDate).map((t: any) => ({
    ...t,
    success_rate: t.sent_count + t.failed_count > 0 
      ? Math.round((t.sent_count / (t.sent_count + t.failed_count)) * 100) 
      : 100
  }));

  return NextResponse.json({ success: true, data: trends });
}

async function getEngagementStats() {
  const [topEngaged, lowEngaged] = await Promise.all([
    supabase.from('top_engaged_users').select('*').limit(20),
    supabase.from('low_engagement_users').select('*').limit(20),
  ]);

  if (topEngaged.error) throw topEngaged.error;
  if (lowEngaged.error) throw lowEngaged.error;

  return NextResponse.json({
    success: true,
    data: {
      topEngaged: topEngaged.data,
      lowEngaged: lowEngaged.data,
    },
  });
}

async function getQueueHealth() {
  // Return basic health metrics based on actual data
  const { count: pendingCount } = await supabase
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'sending']);

  const { count: failedCount } = await supabase
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');

  const pending = pendingCount || 0;
  const failed = failedCount || 0;

  const healthMetrics = [
    { metric: 'Pending Notifications', value: pending, health_status: pending > 100 ? 'warning' : 'healthy' },
    { metric: 'Failed Notifications', value: failed, health_status: failed > 10 ? 'critical' : failed > 0 ? 'warning' : 'healthy' },
  ];

  return NextResponse.json({ success: true, data: healthMetrics });
}

async function getChannelPerformance() {
  // Query notification_recipients for channel performance
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('channel, status');

  if (error) {
    console.error('Channel performance error:', error);
    return NextResponse.json({ success: true, data: [] });
  }

  // Group by channel
  const channelStats: Record<string, any> = {};
  (data || []).forEach(r => {
    if (!channelStats[r.channel]) {
      channelStats[r.channel] = { channel: r.channel, total_sent: 0, success_count: 0, failure_count: 0 };
    }
    channelStats[r.channel].total_sent += 1;
    if (r.status === 'delivered' || r.status === 'opened') {
      channelStats[r.channel].success_count += 1;
    } else if (r.status === 'failed') {
      channelStats[r.channel].failure_count += 1;
    }
  });

  const channels = Object.values(channelStats).map((c: any) => ({
    ...c,
    success_rate: c.total_sent > 0 ? Math.round((c.success_count / c.total_sent) * 100) : 0,
    avg_delivery_time_seconds: 0, // Would need timestamps to calculate
  }));

  return NextResponse.json({ success: true, data: channels });
}

async function getTopTypes() {
  const { data, error } = await supabase
    .rpc('get_top_notification_types', { p_limit: 10 });

  if (error) throw error;

  return NextResponse.json({
    success: true,
    data,
  });
}

async function getFailureAnalysis() {
  const [failures, usersWithIssues] = await Promise.all([
    supabase.from('notification_failure_analysis').select('*').limit(20),
    supabase.from('users_with_notification_issues').select('*').limit(20),
  ]);

  if (failures.error) throw failures.error;
  if (usersWithIssues.error) throw usersWithIssues.error;

  return NextResponse.json({
    success: true,
    data: {
      failures: failures.data,
      usersWithIssues: usersWithIssues.data,
    },
  });
}

/**
 * POST /api/notifications/analytics/snapshot
 * Create a performance snapshot
 */
export async function POST(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { data, error } = await supabase
      .rpc('create_performance_snapshot');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      snapshotId: data,
    });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create snapshot'
      },
      { status: 500 }
    );
  }
}
