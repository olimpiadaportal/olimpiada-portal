'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, TrendingUp, DollarSign, Zap, ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAIUsageOverview, getCostTrends } from '@/services/aiAnalyticsService';
import type { AIUsageOverview, CostTrend } from '@/services/aiAnalyticsService';
import ExportModal from '@/components/ai/ExportModal';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

/**
 * AI Usage Analytics Page
 * Stage 5.5 - Phase 2
 */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AIUsagePage() {
  const router = useRouter();
  const [overview, setOverview] = useState<AIUsageOverview | null>(null);
  const [costTrends, setCostTrends] = useState<CostTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [hasData, setHasData] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const [overviewRes, trendsRes] = await Promise.all([
        getAIUsageOverview(startDate, endDate),
        getCostTrends('daily', days),
      ]);

      if (overviewRes.data) {
        setOverview(overviewRes.data);
        setHasData(overviewRes.data.total_requests > 0);
      }
      if (trendsRes.data) setCostTrends(trendsRes.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates
  useRealTimeUpdates({
    enabled: autoRefresh && !loading,
    interval: 30000, // 30 seconds
    onUpdate: loadData,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show empty state if no data
  if (!hasData && !loading) {
    return (
      <div className="p-6 space-y-6">
        <button
          onClick={() => router.push('/ai-management')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to AI Management</span>
        </button>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No AI Usage Data Yet</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Start using AI features to see usage analytics here. Data will appear once AI API calls are logged through the system.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto text-left">
            <h3 className="font-semibold text-blue-900 mb-2">💡 How to start logging AI usage:</h3>
            <ol className="space-y-2 text-sm text-blue-800">
              <li>1. Use the <code className="bg-blue-100 px-2 py-1 rounded">aiLoggingService</code> in your AI features</li>
              <li>2. Wrap AI API calls with <code className="bg-blue-100 px-2 py-1 rounded">withAILogging()</code></li>
              <li>3. Or manually call <code className="bg-blue-100 px-2 py-1 rounded">logAIUsage()</code> after each AI request</li>
              <li>4. Data will automatically appear in this dashboard</li>
            </ol>
          </div>
          <button
            onClick={() => router.push('/ai-management')}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push('/ai-management')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to AI Management</span>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usage Analytics</h1>
          <p className="text-gray-600 mt-1">Detailed AI usage metrics and trends</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 border rounded-lg transition-colors ${
              autoRefresh
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
            title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
          >
            <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
          </button>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        dataType="usage"
        data={overview}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {overview?.total_requests?.toLocaleString() || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
            <span className="text-green-600 font-medium">Active</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Tokens</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {(overview?.total_tokens || 0).toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            {((overview?.total_tokens || 0) / (overview?.total_requests || 1)).toFixed(0)} avg/request
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${overview?.total_cost?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            ${((overview?.total_cost || 0) / (overview?.total_requests || 1)).toFixed(4)}/request
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {overview?.success_rate?.toFixed(1) || 0}%
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className={`font-medium ${(overview?.success_rate || 0) >= 95 ? 'text-green-600' : 'text-yellow-600'}`}>
              {(overview?.success_rate || 0) >= 95 ? 'Excellent' : 'Good'}
            </span>
          </div>
        </div>
      </div>

      {/* Cost Trends Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={costTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="period_date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: any, name: string) => {
                if (name === 'cost') return [`$${Number(value).toFixed(2)}`, 'Cost'];
                if (name === 'requests') return [Number(value).toLocaleString(), 'Requests'];
                return [value, name];
              }}
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} name="Cost ($)" />
            <Line yAxisId="right" type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} name="Requests" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Usage by Feature */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage by Feature</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={overview?.by_feature || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="feature" />
              <YAxis />
              <Tooltip 
                formatter={(value: any, name: string) => {
                  if (name === 'cost') return [`$${Number(value).toFixed(2)}`, 'Cost'];
                  return [Number(value).toLocaleString(), name];
                }}
              />
              <Legend />
              <Bar dataKey="requests" fill="#3b82f6" name="Requests" />
              <Bar dataKey="cost" fill="#10b981" name="Cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage by Provider</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={overview?.by_provider || []}
                dataKey="requests"
                nameKey="provider"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.provider}: ${entry.requests}`}
              >
                {(overview?.by_provider || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(overview?.by_status || []).map((status, index) => (
            <div key={status.status} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {status.status}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{status.count}</p>
              <p className="text-sm text-gray-600">{status.percentage}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
