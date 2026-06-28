/**
 * Review Queue Card Component
 * Stage 5.5 - Phase 4: Quality Assurance
 * 
 * Displays AI usage logs flagged for quality review
 */

'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Filter,
  Clock,
} from 'lucide-react';
import { getReviewQueue, type ReviewQueueItem } from '@/services/qualityReviewService';

interface ReviewQueueCardProps {
  onReviewClick: (item: ReviewQueueItem) => void;
  refreshTrigger?: number;
}

export function ReviewQueueCard({ onReviewClick, refreshTrigger }: ReviewQueueCardProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  useEffect(() => {
    loadQueue();
  }, [filter, refreshTrigger]);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);

    const result = await getReviewQueue(filter, 50);

    if (result.success && result.data) {
      setItems(result.data);
    } else {
      setError(result.error || 'Failed to load review queue');
    }

    setLoading(false);
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'text-red-600 bg-red-50';
    if (priority >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-blue-600 bg-blue-50';
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 80) return 'High';
    if (priority >= 50) return 'Medium';
    return 'Low';
  };

  const getQualityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quality Review Queue</h3>
              <p className="text-sm text-gray-500">
                {items.length} item{items.length !== 1 ? 's' : ''} requiring review
              </p>
            </div>
          </div>

          <button
            onClick={loadQueue}
            disabled={loading}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-24 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-red-600 p-4 bg-red-50 rounded-lg">
            <XCircle className="w-5 h-5" />
            <p className="text-sm">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-gray-600 font-medium">No items in queue</p>
            <p className="text-sm text-gray-500 mt-1">
              {filter === 'pending'
                ? 'All AI responses are performing well!'
                : `No ${filter} reviews found`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.log_id}
                className="border border-gray-200 rounded-lg p-4 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => onReviewClick(item)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{item.feature_type}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
                          item.priority
                        )}`}
                      >
                        {getPriorityLabel(item.priority)} Priority
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{item.flagged_reason}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReviewClick(item);
                    }}
                    className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="Review this item"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Provider</p>
                    <p className="font-medium text-gray-900">{item.provider}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Model</p>
                    <p className="font-medium text-gray-900">{item.model}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Quality Score</p>
                    <p className={`font-semibold ${getQualityColor(item.quality_score)}`}>
                      {(item.quality_score * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Created</p>
                    <p className="font-medium text-gray-900 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <p className="text-sm text-gray-600 text-center">
            Click on any item to review and provide feedback
          </p>
        </div>
      )}
    </div>
  );
}
