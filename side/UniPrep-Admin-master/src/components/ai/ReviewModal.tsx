/**
 * Review Modal Component
 * Stage 5.5 - Phase 4: Quality Assurance
 * 
 * Modal for reviewing and scoring AI-generated content
 */

'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Star,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  Loader2,
} from 'lucide-react';
import {
  getUsageLogDetails,
  submitReview,
  type ReviewQueueItem,
  type SubmitReviewParams,
} from '@/services/qualityReviewService';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ReviewQueueItem | null;
  reviewerId: string;
  onReviewSubmitted: () => void;
}

export function ReviewModal({
  isOpen,
  onClose,
  item,
  reviewerId,
  onReviewSubmitted,
}: ReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logDetails, setLogDetails] = useState<any>(null);

  // Review form state
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected' | 'needs_improvement' | 'flagged'>('approved');
  const [accuracyScore, setAccuracyScore] = useState<number>(5);
  const [relevanceScore, setRelevanceScore] = useState<number>(5);
  const [coherenceScore, setCoherenceScore] = useState<number>(5);
  const [safetyScore, setSafetyScore] = useState<number>(5);
  const [feedback, setFeedback] = useState('');
  const [issues, setIssues] = useState<Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>>([]);
  const [strengths, setStrengths] = useState<Array<{ aspect: string; description: string }>>([]);

  useEffect(() => {
    if (isOpen && item) {
      loadLogDetails();
      resetForm();
    }
  }, [isOpen, item]);

  const loadLogDetails = async () => {
    if (!item) return;

    setLoading(true);
    const result = await getUsageLogDetails(item.log_id);

    if (result.success && result.data) {
      setLogDetails(result.data);
    }

    setLoading(false);
  };

  const resetForm = () => {
    setReviewStatus('approved');
    setAccuracyScore(5);
    setRelevanceScore(5);
    setCoherenceScore(5);
    setSafetyScore(5);
    setFeedback('');
    setIssues([]);
    setStrengths([]);
  };

  const handleSubmit = async () => {
    if (!item) return;

    setSubmitting(true);

    const params: SubmitReviewParams = {
      usageLogId: item.log_id,
      reviewerId,
      reviewStatus,
      accuracyScore,
      relevanceScore,
      coherenceScore,
      safetyScore,
      feedback,
      issues,
      strengths,
    };

    const result = await submitReview(params);

    if (result.success) {
      onReviewSubmitted();
      onClose();
    } else {
      alert(`Failed to submit review: ${result.error}`);
    }

    setSubmitting(false);
  };

  const addIssue = () => {
    setIssues([...issues, { type: '', description: '', severity: 'medium' }]);
  };

  const updateIssue = (index: number, field: string, value: any) => {
    const updated = [...issues];
    updated[index] = { ...updated[index], [field]: value };
    setIssues(updated);
  };

  const removeIssue = (index: number) => {
    setIssues(issues.filter((_, i) => i !== index));
  };

  const addStrength = () => {
    setStrengths([...strengths, { aspect: '', description: '' }]);
  };

  const updateStrength = (index: number, field: string, value: string) => {
    const updated = [...strengths];
    updated[index] = { ...updated[index], [field]: value };
    setStrengths(updated);
  };

  const removeStrength = (index: number) => {
    setStrengths(strengths.filter((_, i) => i !== index));
  };

  const ScoreSelector = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all ${
              value === score
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <Star
                className={`w-4 h-4 ${value === score ? 'fill-orange-500 text-orange-500' : 'text-gray-400'}`}
              />
              <span className="font-medium">{score}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Quality Review</h2>
            <p className="text-sm text-gray-500 mt-1">
              {item.feature_type} • {item.provider}/{item.model}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Log Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">Request Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Request ID</p>
                    <p className="font-mono text-xs text-gray-900">{item.request_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Quality Score</p>
                    <p className="font-semibold text-gray-900">
                      {(item.quality_score * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Flagged Reason</p>
                    <p className="text-gray-900">{item.flagged_reason}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Created</p>
                    <p className="text-gray-900">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {logDetails?.request_metadata && (
                  <div className="mt-4">
                    <p className="text-gray-500 text-sm mb-2">Request Data</p>
                    <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-x-auto">
                      {JSON.stringify(logDetails.request_metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {logDetails?.response_metadata && (
                  <div className="mt-4">
                    <p className="text-gray-500 text-sm mb-2">Response Data</p>
                    <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-x-auto max-h-48">
                      {JSON.stringify(logDetails.response_metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Review Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review Decision
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { value: 'approved', label: 'Approved', icon: CheckCircle, color: 'green' },
                    { value: 'rejected', label: 'Rejected', icon: XCircle, color: 'red' },
                    { value: 'needs_improvement', label: 'Needs Work', icon: AlertTriangle, color: 'yellow' },
                    { value: 'flagged', label: 'Flagged', icon: AlertTriangle, color: 'orange' },
                  ].map((status) => {
                    const Icon = status.icon;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => setReviewStatus(status.value as 'approved' | 'rejected' | 'needs_improvement' | 'flagged')}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          reviewStatus === status.value
                            ? `border-${status.color}-500 bg-${status.color}-50`
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 mx-auto mb-1 ${
                            reviewStatus === status.value
                              ? `text-${status.color}-600`
                              : 'text-gray-400'
                          }`}
                        />
                        <p className="text-sm font-medium text-center">{status.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quality Scores */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Quality Scores (1-5)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ScoreSelector
                    label="Accuracy"
                    value={accuracyScore}
                    onChange={setAccuracyScore}
                  />
                  <ScoreSelector
                    label="Relevance"
                    value={relevanceScore}
                    onChange={setRelevanceScore}
                  />
                  <ScoreSelector
                    label="Coherence"
                    value={coherenceScore}
                    onChange={setCoherenceScore}
                  />
                  <ScoreSelector
                    label="Safety"
                    value={safetyScore}
                    onChange={setSafetyScore}
                  />
                </div>
              </div>

              {/* Feedback */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Feedback & Comments
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Provide detailed feedback about the AI response..."
                />
              </div>

              {/* Issues */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Issues Found</label>
                  <button
                    type="button"
                    onClick={addIssue}
                    className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                  >
                    + Add Issue
                  </button>
                </div>
                {issues.map((issue, index) => (
                  <div key={index} className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="text"
                        value={issue.type}
                        onChange={(e) => updateIssue(index, 'type', e.target.value)}
                        placeholder="Issue type (e.g., Inaccuracy)"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <select
                        value={issue.severity}
                        onChange={(e) => updateIssue(index, 'severity', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="low">Low Severity</option>
                        <option value="medium">Medium Severity</option>
                        <option value="high">High Severity</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={issue.description}
                        onChange={(e) => updateIssue(index, 'description', e.target.value)}
                        placeholder="Describe the issue..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeIssue(index)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Strengths */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Strengths</label>
                  <button
                    type="button"
                    onClick={addStrength}
                    className="text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    + Add Strength
                  </button>
                </div>
                {strengths.map((strength, index) => (
                  <div key={index} className="mb-3 p-3 bg-green-50 rounded-lg">
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={strength.aspect}
                        onChange={(e) => updateStrength(index, 'aspect', e.target.value)}
                        placeholder="Aspect (e.g., Clarity)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeStrength(index)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={strength.description}
                      onChange={(e) => updateStrength(index, 'description', e.target.value)}
                      placeholder="Describe the strength..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Submit Review
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
