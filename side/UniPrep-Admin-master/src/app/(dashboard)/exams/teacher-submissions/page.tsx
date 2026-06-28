'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Exam } from '@/types/exams';
import { examService } from '@/services/examService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

type StatusFilter = 'all' | 'pending' | 'approved';

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const toast = useToast();
  const { canEditUsers, isModerator } = usePermissions();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, [statusFilter]);

  const fetchSubmissions = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    const result = await examService.getTeacherSubmissions(
      statusFilter === 'all' ? undefined : statusFilter
    );
    if (result.success && result.data) {
      setExams(result.data);
    } else {
      toast.error(result.error || 'Failed to load teacher submissions');
    }
    setLoading(false);
  };

  const handleApprove = async (examId: string, approved: boolean) => {
    if (!canEditUsers) {
      toast.error('Permission denied');
      return;
    }
    setActionLoading(examId);
    const result = await examService.approveTeacherExam(examId, approved);
    if (result.success) {
      const exam = exams.find(e => e.id === examId);
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_UPDATE,
        tableName: 'mock_exams',
        recordId: examId,
        newValues: { is_approved: approved },
        description: `${approved ? 'Approved' : 'Rejected'} teacher exam: ${exam?.title}`,
      });
      toast.success(approved ? 'Exam approved — now visible to students' : 'Exam rejected');
      fetchSubmissions();
    } else {
      toast.error(result.error || 'Action failed');
    }
    setActionLoading(null);
  };

  const handleBulkApprove = async () => {
    if (!canEditUsers || selectedIds.size === 0) return;
    if (!window.confirm(`Approve ${selectedIds.size} selected exam(s)?`)) return;

    setActionLoading('bulk');
    let successCount = 0;
    for (const id of selectedIds) {
      const result = await examService.approveTeacherExam(id, true);
      if (result.success) successCount++;
    }
    toast.success(`${successCount} exam(s) approved`);
    fetchSubmissions();
    setActionLoading(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === exams.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(exams.map(e => e.id)));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/exams')}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          ← Back to Exams
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Teacher Exam Submissions</h1>
        <p className="text-gray-600 mt-2">Review and approve teacher-created exams before they become visible to students</p>
      </div>

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can review submissions but cannot approve or reject them.
          </p>
        </div>
      )}

      {/* Filter + Bulk Actions Bar */}
      <div className="mb-6 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          {(['pending', 'approved', 'all'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f === 'pending' ? '🕐 Pending' : f === 'approved' ? '✅ Approved' : '📋 All'}
            </button>
          ))}
        </div>

        {canEditUsers && selectedIds.size > 0 && statusFilter !== 'approved' && (
          <button
            onClick={handleBulkApprove}
            disabled={actionLoading === 'bulk'}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'bulk' ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : '✅'}
            Approve Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">Loading submissions...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-lg mb-2">No submissions found</p>
          <p className="text-gray-400 text-sm">
            {statusFilter === 'pending' ? 'No pending teacher exams awaiting review.' : 'Nothing to show.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {canEditUsers && statusFilter !== 'approved' && (
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === exams.length && exams.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exam</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type / Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Questions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exams.map(exam => (
                <tr key={exam.id} className="hover:bg-gray-50">
                  {canEditUsers && statusFilter !== 'approved' && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(exam.id)}
                        onChange={() => toggleSelect(exam.id)}
                        className="rounded"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <button
                      onClick={() => router.push(`/exams/${exam.id}`)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm text-left"
                    >
                      {exam.title}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {exam.teacher_avatar_url ? (
                        <img src={exam.teacher_avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                          {exam.teacher_name?.[0] ?? '?'}
                        </div>
                      )}
                      <span className="text-sm text-gray-900">{exam.teacher_name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs w-fit">
                        {exam.exam_type.replace(/_/g, ' ')}
                      </span>
                      {exam.target_group && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs w-fit">
                          Group {exam.target_group}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <span className="font-medium">{exam.question_count_actual ?? 0}</span>
                    <span className="text-gray-400"> / {exam.total_questions}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(exam.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      exam.is_approved
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {exam.is_approved ? '✅ Approved' : '🕐 Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => router.push(`/exams/${exam.id}`)}
                        className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Preview
                      </button>
                      {canEditUsers && !exam.is_approved && (
                        <button
                          onClick={() => handleApprove(exam.id, true)}
                          disabled={actionLoading === exam.id}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === exam.id ? '...' : 'Approve'}
                        </button>
                      )}
                      {canEditUsers && exam.is_approved && (
                        <button
                          onClick={() => handleApprove(exam.id, false)}
                          disabled={actionLoading === exam.id}
                          className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                        >
                          {actionLoading === exam.id ? '...' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
