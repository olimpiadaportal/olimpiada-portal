'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Filter, Download, TrendingUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  getReviewHistory,
  getReviewHistoryStats,
  getReviewerStats,
  type ReviewHistoryItem,
  type ReviewHistoryStats,
  type ReviewerStats,
} from '@/services/reviewHistoryService';
import { createClient } from '@/utils/supabase/client';

export default function ReviewHistoryPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<ReviewHistoryItem[]>([]);
  const [stats, setStats] = useState<ReviewHistoryStats | null>(null);
  const [reviewerStats, setReviewerStats] = useState<ReviewerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<number>(30); // days
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadData();
  }, [statusFilter, timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      // Load reviews
      const reviewsResult = await getReviewHistory({
        reviewStatus: statusFilter === 'all' ? undefined : statusFilter,
        startDate,
        limit: 100,
      });

      if (reviewsResult.success && reviewsResult.data) {
        setReviews(reviewsResult.data);
      }

      // Load stats
      const statsResult = await getReviewHistoryStats({
        startDate,
      });

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }

      // Load reviewer stats
      const reviewerStatsResult = await getReviewerStats({
        startDate,
      });

      if (reviewerStatsResult.success && reviewerStatsResult.data) {
        setReviewerStats(reviewerStatsResult.data);
      }
    } catch (error) {
      console.error('Error loading review history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatFeatureName = (featureType: string): string => {
    return featureType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 bg-green-50';
      case 'rejected':
        return 'text-red-600 bg-red-50';
      case 'needs_work':
        return 'text-orange-600 bg-orange-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'needs_work':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Date',
      'Feature',
      'Status',
      'Overall Score',
      'Accuracy',
      'Relevance',
      'Coherence',
      'Safety',
      'Provider',
      'Model',
      'Quality Score',
      'Cost',
      'Reviewer',
      'Feedback',
    ];

    const rows = reviews.map((review) => [
      new Date(review.created_at).toLocaleDateString(),
      review.feature_type || 'N/A',
      review.review_status,
      review.overall_score?.toFixed(2) || 'N/A',
      review.accuracy_score || 'N/A',
      review.relevance_score || 'N/A',
      review.coherence_score || 'N/A',
      review.safety_score || 'N/A',
      review.provider || 'N/A',
      review.model || 'N/A',
      review.quality_score?.toFixed(2) || 'N/A',
      review.cost_usd ? `$${review.cost_usd.toFixed(4)}` : 'N/A',
      review.reviewer_name || review.reviewer_email || 'N/A',
      (review.feedback || '').replace(/,/g, ';'),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading review history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/ai-management/quality')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Quality Assurance
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review History</h1>
            <p className="text-gray-600 mt-1">
              Complete history of all quality reviews submitted
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="needs_work">Needs Work</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Range
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Reviews</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_reviews}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Approval Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.approval_rate.toFixed(1)}%
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Overall Score</p>
                <p className="text-2xl font-bold text-blue-600">
                  {(stats.avg_overall_score * 100).toFixed(0)}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Issues Found</p>
                <p className="text-2xl font-bold text-orange-600">{stats.total_issues_found}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
      )}

      {/* Detailed Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Score Breakdown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Scores</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Accuracy</span>
                  <span className="font-medium">{stats.avg_accuracy_score.toFixed(1)}/5</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${(stats.avg_accuracy_score / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Relevance</span>
                  <span className="font-medium">{stats.avg_relevance_score.toFixed(1)}/5</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${(stats.avg_relevance_score / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Coherence</span>
                  <span className="font-medium">{stats.avg_coherence_score.toFixed(1)}/5</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${(stats.avg_coherence_score / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Safety</span>
                  <span className="font-medium">{stats.avg_safety_score.toFixed(1)}/5</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-600 h-2 rounded-full"
                    style={{ width: `${(stats.avg_safety_score / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Review Distribution */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Distribution</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-gray-700">Approved</span>
                </div>
                <span className="font-semibold text-green-600">{stats.approved_count}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-gray-700">Rejected</span>
                </div>
                <span className="font-semibold text-red-600">{stats.rejected_count}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <span className="text-gray-700">Needs Work</span>
                </div>
                <span className="font-semibold text-orange-600">{stats.needs_work_count}</span>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Most Reviewed Feature</span>
                  <span className="font-medium">{formatFeatureName(stats.most_reviewed_feature)}</span>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Strengths Noted</span>
                <span className="font-medium text-green-600">{stats.total_strengths_noted}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reviewer Stats */}
      {reviewerStats.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Reviewer Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Reviewer</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Total Reviews</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Approved</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Rejected</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {reviewerStats.map((reviewer) => (
                  <tr key={reviewer.reviewer_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{reviewer.reviewer_name}</p>
                        <p className="text-sm text-gray-500">{reviewer.reviewer_email}</p>
                      </div>
                    </td>
                    <td className="text-center py-3 px-4 font-medium">{reviewer.total_reviews}</td>
                    <td className="text-center py-3 px-4 text-green-600 font-medium">{reviewer.approved}</td>
                    <td className="text-center py-3 px-4 text-red-600 font-medium">{reviewer.rejected}</td>
                    <td className="text-center py-3 px-4 font-medium">
                      {(reviewer.avg_score * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review History Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Reviews</h3>
          <p className="text-sm text-gray-600 mt-1">
            Showing {reviews.length} review{reviews.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Feature</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Overall Score</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Scores</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Provider</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    No reviews found for the selected filters
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {formatFeatureName(review.feature_type || 'Unknown')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            review.review_status
                          )}`}
                        >
                          {getStatusIcon(review.review_status)}
                          {review.review_status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-medium text-gray-900">
                        {review.overall_score
                          ? `${(review.overall_score * 100).toFixed(0)}%`
                          : 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
                        <span title="Accuracy">A:{review.accuracy_score || '-'}</span>
                        <span title="Relevance">R:{review.relevance_score || '-'}</span>
                        <span title="Coherence">C:{review.coherence_score || '-'}</span>
                        <span title="Safety">S:{review.safety_score || '-'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      <div>
                        <p>{review.provider || 'N/A'}</p>
                        <p className="text-xs text-gray-500">{review.model || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {review.reviewer_name || review.reviewer_email || 'Unknown'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
