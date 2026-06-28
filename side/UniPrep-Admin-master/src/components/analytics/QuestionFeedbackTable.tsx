'use client';

import React, { useState } from 'react';
import { QuestionFeedbackItem, FeedbackReporter } from '@/services/analyticsService';

const FEEDBACK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  wrong_answer:        { label: 'Wrong Answer',        color: 'red'    },
  unclear_question:    { label: 'Unclear Question',    color: 'orange' },
  unclear_options:     { label: 'Unclear Options',     color: 'orange' },
  missing_explanation: { label: 'Missing Explanation', color: 'yellow' },
  wrong_topic:         { label: 'Wrong Topic',         color: 'purple' },
  duplicate:           { label: 'Duplicate',           color: 'blue'   },
  other:               { label: 'Other',               color: 'gray'   },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending'   },
  reviewed:  { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Reviewed'  },
  resolved:  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Resolved'  },
  dismissed: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Dismissed' },
};

interface Props {
  feedback: QuestionFeedbackItem[];
  onUpdateStatus: (questionId: string, feedbackType: string, status: string, notes?: string) => Promise<void>;
  onEditQuestion: (questionId: string) => void;
}

export function QuestionFeedbackTable({ feedback, onUpdateStatus, onEditQuestion }: Props) {
  const [expandedKey, setExpandedKey]       = useState<string | null>(null);
  const [adminNotes, setAdminNotes]         = useState<Record<string, string>>({});
  const [updatingKey, setUpdatingKey]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter]     = useState<string>('all');
  const [reportersModal, setReportersModal] = useState<FeedbackReporter[] | null>(null);

  const rowKey = (item: QuestionFeedbackItem) => `${item.question_id}__${item.feedback_type}`;

  const filtered = statusFilter === 'all'
    ? feedback
    : feedback.filter(f => f.status === statusFilter);

  const pendingCount = feedback.filter(f => f.status === 'pending').length;

  const handleStatusUpdate = async (item: QuestionFeedbackItem, status: string) => {
    const key = rowKey(item);
    setUpdatingKey(key);
    try {
      await onUpdateStatus(item.question_id, item.feedback_type, status, adminNotes[key]);
    } finally {
      setUpdatingKey(null);
    }
  };

  if (feedback.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-600">No Student Feedback</h3>
        <p className="text-sm text-gray-400 mt-1">No question issues have been reported yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Student Feedback</h2>
              {pendingCount > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {['all', 'pending', 'reviewed', 'resolved', 'dismissed'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    statusFilter === s
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-500 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_STYLES[s]?.label || s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Question</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((item) => {
                const key        = rowKey(item);
                const typeInfo   = FEEDBACK_TYPE_LABELS[item.feedback_type] || FEEDBACK_TYPE_LABELS.other;
                const statusInfo = STATUS_STYLES[item.status] || STATUS_STYLES.pending;
                const isExpanded = expandedKey === key;
                const reporters  = item.reporters || [];
                const firstReporter = reporters[0];

                return (
                  <React.Fragment key={key}>
                    <tr
                      className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                    >
                      {/* Question */}
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.question_text?.slice(0, 80)}{(item.question_text?.length || 0) > 80 ? '...' : ''}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.subject_name} · {item.difficulty || 'N/A'}
                          </p>
                        </div>
                      </td>

                      {/* Issue type */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${typeInfo.color}-100 text-${typeInfo.color}-800`}>
                          {typeInfo.label}
                        </span>
                      </td>

                      {/* Reported by */}
                      <td className="px-6 py-4">
                        {item.total_reports === 1 ? (
                          <span className="text-sm text-gray-700">{firstReporter?.name || 'Anonymous'}</span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportersModal(reporters);
                            }}
                            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {item.total_reports} reporters
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditQuestion(item.question_id); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-3">
                            {/* Full question text */}
                            <div>
                              <p className="text-xs text-gray-500 font-medium mb-1">Full Question</p>
                              <p className="text-sm text-gray-800">{item.question_text}</p>
                            </div>

                            {/* All reporter comments */}
                            {reporters.some(r => r.comment) && (
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-1">Student Comments</p>
                                <div className="space-y-1.5">
                                  {reporters.filter(r => r.comment).map((r, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{r.name}:</span>
                                      <p className="text-sm text-gray-700 italic">&quot;{r.comment}&quot;</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Topic + reporter summary */}
                            <p className="text-xs text-gray-500">
                              Topic: {item.topic || 'N/A'} ·{' '}
                              {item.total_reports === 1
                                ? `Reported by: ${firstReporter?.name || 'Anonymous'}`
                                : `${item.total_reports} students reported this issue`
                              }
                            </p>

                            {/* Admin notes */}
                            <div>
                              <p className="text-xs text-gray-500 font-medium mb-1">Admin Notes</p>
                              <textarea
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                rows={2}
                                placeholder="Add notes about this feedback..."
                                value={adminNotes[key] ?? item.admin_notes ?? ''}
                                onChange={(e) => setAdminNotes(prev => ({ ...prev, [key]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-1">
                              {item.status !== 'resolved' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleStatusUpdate(item, 'resolved'); }}
                                  disabled={updatingKey === key}
                                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  {updatingKey === key ? 'Updating...' : 'Mark Resolved'}
                                </button>
                              )}
                              {item.status === 'pending' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleStatusUpdate(item, 'reviewed'); }}
                                  disabled={updatingKey === key}
                                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Mark Reviewed
                                </button>
                              )}
                              {item.status !== 'dismissed' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleStatusUpdate(item, 'dismissed'); }}
                                  disabled={updatingKey === key}
                                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
                                >
                                  Dismiss
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); onEditQuestion(item.question_id); }}
                                className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 border border-blue-200"
                              >
                                Edit Question
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reporters modal */}
      {reportersModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setReportersModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                Reporters ({reportersModal.length})
              </h3>
              <button
                onClick={() => setReportersModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {reportersModal.map((r, idx) => (
                <div key={idx} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{r.name || 'Anonymous'}</span>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-gray-600 italic mt-0.5">&quot;{r.comment}&quot;</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
