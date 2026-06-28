/**
 * AI Quality Assurance Page
 * Stage 5.5 - Phase 4: Quality Assurance System
 * 
 * Harmonized with mobile app's ai_usage_logs and ai_quality_reviews tables
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Shield, History } from 'lucide-react';
import { ReviewQueueCard } from '@/components/ai/ReviewQueueCard';
import { ReviewModal } from '@/components/ai/ReviewModal';
import { QualityMetricsCard } from '@/components/ai/QualityMetricsCard';
import type { ReviewQueueItem } from '@/services/qualityReviewService';
import { createClient } from '@/utils/supabase/client';

export default function QualityAssurancePage() {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewerId, setReviewerId] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Get current user ID for reviewer
    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setReviewerId(user.id);
      }
    };
    loadUser();
  }, []);

  const handleReviewClick = (item: ReviewQueueItem) => {
    setSelectedItem(item);
    setShowReviewModal(true);
  };

  const handleReviewSubmitted = () => {
    // Trigger refresh of queue
    setRefreshTrigger((prev) => prev + 1);
  };

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
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quality Assurance</h1>
            <p className="text-gray-600 mt-1">Monitor and review AI output quality</p>
          </div>
        </div>

        <button
          onClick={() => router.push('/ai-management/review-history')}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <History className="w-5 h-5" />
          Review History
        </button>
      </div>

      {/* Quality Metrics */}
      <QualityMetricsCard />

      {/* Review Queue */}
      <ReviewQueueCard onReviewClick={handleReviewClick} refreshTrigger={refreshTrigger} />

      {/* Review Modal */}
      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        item={selectedItem}
        reviewerId={reviewerId}
        onReviewSubmitted={handleReviewSubmitted}
      />

      {/* Quality Guidelines */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Quality Assurance Guidelines
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-purple-800">
          <div>
            <h4 className="font-medium mb-2">Scoring Criteria:</h4>
            <ul className="space-y-1">
              <li>• <strong>Accuracy (1-5):</strong> Factual correctness</li>
              <li>• <strong>Relevance (1-5):</strong> Matches user intent</li>
              <li>• <strong>Coherence (1-5):</strong> Logical flow and clarity</li>
              <li>• <strong>Safety (1-5):</strong> No harmful content</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Review Actions:</h4>
            <ul className="space-y-1">
              <li>• <strong>Approved:</strong> Meets quality standards</li>
              <li>• <strong>Rejected:</strong> Fails quality requirements</li>
              <li>• <strong>Needs Work:</strong> Requires improvements</li>
              <li>• <strong>Flagged:</strong> Escalate for further review</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 p-3 bg-white rounded-lg border border-purple-200">
          <p className="text-sm text-purple-900">
            <strong>💡 Tip:</strong> Quality reviews help improve AI performance over time. 
            Document specific issues and strengths to guide prompt optimization and model selection.
          </p>
        </div>
      </div>
    </div>
  );
}
