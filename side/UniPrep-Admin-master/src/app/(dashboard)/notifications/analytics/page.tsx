/**
 * Notification Analytics Dashboard
 * Phase 5: Analytics & Monitoring
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  ArrowLeft
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface OverviewStats {
  total_notifications: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  processing_count: number;
  delivery_rate_percentage: number;
  unique_recipients: number;
}

interface TrendData {
  date: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  unique_users: number;
  success_rate: number;
}

interface ChannelPerformance {
  channel: string;
  total_sent: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_delivery_time_seconds: number;
}

interface QueueHealth {
  metric: string;
  value: number;
  health_status: 'healthy' | 'warning' | 'critical';
}

const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

export default function NotificationAnalyticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [channels, setChannels] = useState<ChannelPerformance[]>([]);
  const [queueHealth, setQueueHealth] = useState<QueueHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadOverview(),
        loadTrends(),
        loadChannels(),
        loadQueueHealth(),
      ]);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    const res = await fetch('/api/notifications/analytics?type=overview');
    const json = await res.json();
    if (json.success) {
      setOverview(json.data);
    }
  };

  const loadTrends = async () => {
    const res = await fetch('/api/notifications/analytics?type=trends&days=7');
    const json = await res.json();
    if (json.success) {
      setTrends(json.data);
    }
  };

  const loadChannels = async () => {
    const res = await fetch('/api/notifications/analytics?type=channels');
    const json = await res.json();
    if (json.success) {
      setChannels(json.data);
    }
  };

  const loadQueueHealth = async () => {
    const res = await fetch('/api/notifications/analytics?type=health');
    const json = await res.json();
    if (json.success) {
      setQueueHealth(json.data);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="h-5 w-5" />;
      case 'warning': return <AlertCircle className="h-5 w-5" />;
      case 'critical': return <XCircle className="h-5 w-5" />;
      default: return <Clock className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/notifications">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Notification Analytics</h1>
            <p className="text-gray-600 mt-1">
              Monitor notification performance and user engagement
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{overview.total_notifications.toLocaleString()}</div>
              <p className="text-sm text-gray-600 mt-1">
                {overview.unique_recipients.toLocaleString()} unique recipients
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Delivery Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {overview.delivery_rate_percentage}%
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {overview.sent_count.toLocaleString()} successfully sent
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Failed Deliveries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {overview.failed_count.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Requires attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Queue Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {overview.pending_count.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {overview.processing_count} processing
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Queue Health */}
      {queueHealth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Queue Health Status</CardTitle>
            <CardDescription>Real-time monitoring of notification queue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {queueHealth.map((health, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${getStatusColor(health.health_status)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{health.metric}</span>
                    {getStatusIcon(health.health_status)}
                  </div>
                  <div className="text-2xl font-bold">{health.value.toLocaleString()}</div>
                  <div className="text-xs mt-1 capitalize">{health.health_status}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for detailed analytics */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="channels">
            <BarChart3 className="h-4 w-4 mr-2" />
            Channels
          </TabsTrigger>
          <TabsTrigger value="engagement">
            <Users className="h-4 w-4 mr-2" />
            Engagement
          </TabsTrigger>
        </TabsList>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>7-Day Notification Trends</CardTitle>
              <CardDescription>Daily notification volume and success rate</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="total_count" 
                    stroke={COLORS.primary} 
                    name="Total"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="sent_count" 
                    stroke={COLORS.success} 
                    name="Sent"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="failed_count" 
                    stroke={COLORS.danger} 
                    name="Failed"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Success Rate Trend</CardTitle>
              <CardDescription>Daily delivery success rate percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="success_rate" fill={COLORS.success} name="Success Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Channel Performance</CardTitle>
              <CardDescription>Comparison of notification channels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {channels.map((channel, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-lg capitalize">{channel.channel}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        channel.success_rate >= 95 ? 'bg-green-100 text-green-800' :
                        channel.success_rate >= 80 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {channel.success_rate}% Success
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Total Sent</p>
                        <p className="font-semibold">{channel.total_sent.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Successful</p>
                        <p className="font-semibold text-green-600">{channel.success_count.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Failed</p>
                        <p className="font-semibold text-red-600">{channel.failure_count.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Avg Delivery</p>
                        <p className="font-semibold">
                          {channel.avg_delivery_time_seconds ? channel.avg_delivery_time_seconds.toFixed(1) : '0.0'}s
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Engagement</CardTitle>
              <CardDescription>Coming soon: User engagement metrics and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>User engagement analytics will be available here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
