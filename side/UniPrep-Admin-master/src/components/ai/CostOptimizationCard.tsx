/**
 * Cost Optimization Card Component
 * Stage 5.5 - Phase 3: Cost Optimization Analyzer
 * 
 * Displays AI cost optimization insights and recommendations
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Lightbulb, 
  DollarSign,
  Zap,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getCostOptimizationInsights, getQuickOptimizationTips, type OptimizationSummary, type OptimizationInsight } from '@/services/costOptimizationService';

export function CostOptimizationCard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OptimizationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    loadOptimizationData();
  }, [timeRange]);

  const loadOptimizationData = async () => {
    setLoading(true);
    setError(null);

    const result = await getCostOptimizationInsights(timeRange);

    if (result.success && result.data) {
      setSummary(result.data);
    } else {
      setError(result.error || 'Failed to load optimization data');
    }

    setLoading(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
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

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const tips = getQuickOptimizationTips(summary);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Cost Optimization Insights
              </h3>
              <p className="text-sm text-gray-500">
                AI usage analysis and recommendations
              </p>
            </div>
          </div>

          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Cost */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-500 font-medium">Total Cost</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${summary.totalCost.toFixed(2)}
            </p>
          </div>

          {/* Potential Savings */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-green-600" />
              <p className="text-xs text-green-700 font-medium">Potential Savings</p>
            </div>
            <p className="text-2xl font-bold text-green-600">
              ${summary.totalPotentialSavings.toFixed(2)}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {summary.totalCost > 0 
                ? `${((summary.totalPotentialSavings / summary.totalCost) * 100).toFixed(0)}% reduction`
                : '0% reduction'
              }
            </p>
          </div>

          {/* Optimization Score */}
          <div className={`rounded-lg p-4 ${getScoreColor(summary.averageOptimizationScore)}`}>
            <div className="flex items-center gap-2 mb-1">
              {summary.averageOptimizationScore >= 80 ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <p className="text-xs font-medium">Optimization Score</p>
            </div>
            <p className="text-2xl font-bold">
              {summary.averageOptimizationScore}/100
            </p>
            <p className="text-xs mt-1">
              {summary.averageOptimizationScore >= 80 ? 'Excellent' : 
               summary.averageOptimizationScore >= 60 ? 'Good' : 'Needs Improvement'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Tips */}
      {tips.length > 0 && (
        <div className="p-6 border-b border-gray-200 bg-purple-50">
          <h4 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Quick Optimization Tips
          </h4>
          <ul className="space-y-2">
            {tips.map((tip, index) => (
              <li key={index} className="text-sm text-purple-800 flex items-start gap-2">
                <span className="text-purple-600 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detailed Insights */}
      <div className="p-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">
          Feature-Level Analysis
        </h4>

        {summary.insights.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No usage data available for the selected period
          </p>
        ) : (
          <div className="space-y-3">
            {summary.insights.map((insight) => (
              <InsightCard
                key={insight.featureType}
                insight={insight}
                expanded={expandedInsight === insight.featureType}
                onToggle={() => setExpandedInsight(
                  expandedInsight === insight.featureType ? null : insight.featureType
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface InsightCardProps {
  insight: OptimizationInsight;
  expanded: boolean;
  onToggle: () => void;
}

function InsightCard({ insight, expanded, onToggle }: InsightCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary Row */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1">
          {/* Feature Name */}
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-gray-900">{insight.featureType}</p>
            <p className="text-xs text-gray-500">{insight.totalRequests} requests</p>
          </div>

          {/* Cost */}
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              ${insight.totalCost.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 justify-end">
              {getTrendIcon(insight.costTrend)}
              <p className="text-xs text-gray-500">{insight.costTrend}</p>
            </div>
          </div>

          {/* Score */}
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${getScoreColor(insight.optimizationScore)}`}>
            {insight.optimizationScore}/100
          </div>

          {/* Expand Icon */}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
          {/* Primary Suggestion */}
          <div className="bg-white rounded-lg p-3 border-l-4 border-purple-500">
            <p className="text-xs font-medium text-purple-900 mb-1">
              💡 Primary Recommendation
            </p>
            <p className="text-sm text-gray-700">{insight.primarySuggestion}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Avg Tokens</p>
              <p className="text-sm font-semibold text-gray-900">
                {insight.avgTokensPerRequest.toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Avg Cost</p>
              <p className="text-sm font-semibold text-gray-900">
                ${insight.avgCostPerRequest.toFixed(4)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Max Cost</p>
              <p className="text-sm font-semibold text-gray-900">
                ${insight.maxCostRequest.toFixed(4)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Savings</p>
              <p className="text-sm font-semibold text-green-600">
                ${insight.optimizationPotential.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Detailed Suggestions */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Detailed Suggestions:</p>
            {Object.entries(insight.detailedSuggestions).map(([key, value]) => (
              <div key={key} className="bg-white rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-gray-700">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
