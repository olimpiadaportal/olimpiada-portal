'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { analyticsService, QuestionFeedbackItem } from '@/services/analyticsService';
import { QuestionFeedbackTable } from '@/components/analytics/QuestionFeedbackTable';
import { QuestionEditModal } from '@/components/analytics/QuestionEditModal';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const STATUS_META = {
  pending:   { label: 'Pending',   color: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: 'bg-yellow-400' },
  reviewed:  { label: 'Reviewed',  color: 'bg-blue-100 text-blue-800 border-blue-200',       dot: 'bg-blue-400'   },
  resolved:  { label: 'Resolved',  color: 'bg-green-100 text-green-800 border-green-200',    dot: 'bg-green-400'  },
  dismissed: { label: 'Dismissed', color: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400'   },
};

export default function FeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<QuestionFeedbackItem[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  useEffect(() => { loadFeedback(); }, []);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await analyticsService.getQuestionFeedback();
      if (!res.success) throw new Error(res.error || 'Failed to load feedback');
      setFeedback(res.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (questionId: string, feedbackType: string, status: string, notes?: string) => {
    const result = await analyticsService.updateFeedbackGroup(questionId, feedbackType, status, notes);
    if (result.success) {
      setFeedback(prev =>
        prev.map(f =>
          f.question_id === questionId && f.feedback_type === feedbackType
            ? { ...f, status, admin_notes: notes ?? f.admin_notes }
            : f
        )
      );
    }
  };

  // Summary counts
  const counts = feedback.reduce(
    (acc, f) => { acc[f.status as keyof typeof acc] = (acc[f.status as keyof typeof acc] || 0) + 1; return acc; },
    { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 }
  );

  if (loading) return <div className="p-6"><DashboardSkeleton /></div>;
  if (error) return (
    <div className="p-6">
      <ErrorMessage type="error" title="Failed to Load Feedback" message={error} onRetry={loadFeedback} />
    </div>
  );

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/analytics/content" className="hover:text-gray-700">Content Analytics</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Student Feedback</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Student Feedback</h1>
          <p className="text-gray-600 mt-1">Review and act on student-reported question issues</p>
        </div>
        <button
          onClick={loadFeedback}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => {
          const meta = STATUS_META[key];
          return (
            <div key={key} className={`bg-white rounded-lg border ${meta.color.split(' ').find(c => c.startsWith('border')) || 'border-gray-200'} p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">{meta.label}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
              </div>
              <div className="mt-2 text-3xl font-bold text-gray-900">{counts[key]}</div>
              <div className="mt-1 text-xs text-gray-500">
                {feedback.length > 0 ? `${((counts[key] / feedback.length) * 100).toFixed(0)}% of total` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attention banner */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{counts.pending} pending report{counts.pending !== 1 ? 's' : ''}</span>
            {' '}need review. Resolve or dismiss them to keep the queue clean.
          </p>
        </div>
      )}

      {/* Full feedback table */}
      <QuestionFeedbackTable
        feedback={feedback}
        onUpdateStatus={handleUpdateStatus}
        onEditQuestion={setEditingQuestionId}
      />

      {/* Edit Modal */}
      {editingQuestionId && (
        <QuestionEditModal
          questionId={editingQuestionId}
          onClose={() => setEditingQuestionId(null)}
          onSaved={() => { loadFeedback(); setEditingQuestionId(null); }}
        />
      )}
    </div>
  );
}
