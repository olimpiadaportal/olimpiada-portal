/**
 * Quality Metrics Card Component
 * Stage 5.5 - Phase 4: Quality Assurance
 * 
 * Displays quality statistics and trends
 */

'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getQualityMetrics, getQualityByFeature, type QualityMetrics } from '@/services/qualityReviewService';

export function QualityMetricsCard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [featureData, setFeatureData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    loadMetrics();
  }, [timeRange]);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);

    const endDate = new Date();
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    const [metricsResult, featureResult] = await Promise.all([
      getQualityMetrics(startDate, endDate),
      getQualityByFeature(startDate, endDate),
    ]);

    if (metricsResult.success && metricsResult.data) {
      setMetrics(metricsResult.data);
    } else {
      setError(metricsResult.error || 'Failed to load metrics');
    }

    if (featureResult.success && featureResult.data) {
      setFeatureData(featureResult.data);
    }

    setLoading(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-700';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const formatFeatureName = (featureType: string) => {
    // Convert snake_case to Title Case
    return featureType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.5) return 'Good';
    return 'Needs Improvement';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm">{error || 'Failed to load metrics'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quality Metrics</h3>
              <p className="text-sm text-gray-500">AI response quality analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            <button
              onClick={loadMetrics}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh metrics"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Average Quality Score */}
          <div className={`rounded-lg p-4 ${getScoreColor(metrics.avg_quality_score)}`}>
            <p className="text-xs font-medium mb-1">Avg Quality Score</p>
            <p className="text-2xl font-bold">
              {(metrics.avg_quality_score * 100).toFixed(0)}%
            </p>
            <p className="text-xs mt-1">{getScoreLabel(metrics.avg_quality_score)}</p>
          </div>

          {/* Total Reviewed */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">Total Reviewed</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.total_reviewed}</p>
            <p className="text-xs text-gray-500 mt-1">Responses</p>
          </div>

          {/* Approval Rate */}
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs text-green-700 font-medium mb-1">Approval Rate</p>
            <p className="text-2xl font-bold text-green-600">
              {metrics.approval_rate.toFixed(1)}%
            </p>
            <div className="flex items-center gap-1 mt-1">
              <CheckCircle className="w-3 h-3 text-green-600" />
              <p className="text-xs text-green-600">Approved</p>
            </div>
          </div>

          {/* Flagged Count */}
          <div className="bg-orange-50 rounded-lg p-4">
            <p className="text-xs text-orange-700 font-medium mb-1">Flagged Items</p>
            <p className="text-2xl font-bold text-orange-600">{metrics.flagged_count}</p>
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3 text-orange-600" />
              <p className="text-xs text-orange-600">Needs Review</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Trends Chart */}
      {metrics.trends && metrics.trends.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Quality Trends</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics.trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
              />
              <YAxis domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: any) => [`${(value * 100).toFixed(1)}%`, 'Quality Score']}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="avg_score"
                stroke="#3B82F6"
                strokeWidth={2}
                name="Avg Quality Score"
                dot={{ fill: '#3B82F6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quality by Feature */}
      {featureData.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Quality by Feature</h4>
          <div className="space-y-3">
            {featureData.map((feature) => (
              <div key={feature.feature_type} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{formatFeatureName(feature.feature_type)}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(feature.avg_score)}`}>
                    {(feature.avg_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Total</p>
                    <p className="font-semibold text-gray-900">{feature.total}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Approved</p>
                    <p className="font-semibold text-green-600">{feature.approved}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Rejected</p>
                    <p className="font-semibold text-red-600">{feature.rejected}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs" title="Items not manually reviewed yet (includes high-quality items)">
                      Not Reviewed
                    </p>
                    <p className="font-semibold text-gray-600">{feature.pending}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Common Issues */}
      {metrics.common_issues && metrics.common_issues.length > 0 && (
        <div className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Common Issues</h4>
          <div className="space-y-2">
            {metrics.common_issues.slice(0, 5).map((issue, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm text-gray-900">{issue.issue}</span>
                </div>
                <span className="text-sm font-semibold text-gray-600">{issue.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
