'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Exam, ExamType, TargetGroup } from '@/types/exams';
import { examService } from '@/services/examService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import ExamList from '@/components/exams/ExamList';
import CreateExamModal from '@/components/exams/CreateExamModal';
import { supabase } from '@/lib/supabase';

type SourceFilter = 'all' | 'official' | 'teacher_pending' | 'teacher_approved';

export default function ExamsPage() {
  const router = useRouter();
  const toast = useToast();
  const { canEditUsers, canDeleteUsers, isModerator } = usePermissions();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Filters
  const [typeFilter, setTypeFilter] = useState<ExamType | ''>('');
  const [groupFilter, setGroupFilter] = useState<TargetGroup | ''>('');
  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    fetchExams();
  }, [typeFilter, groupFilter, searchText, sourceFilter]);

  const fetchExams = async () => {
    setLoading(true);

    // Source filter applied client-side after base search
    const result = await examService.searchExams({
      exam_type: typeFilter || undefined,
      target_group: groupFilter || undefined,
      search_text: searchText || undefined,
    });

    if (result.success && result.data) {
      let data = result.data as Exam[];
      if (sourceFilter === 'official') {
        data = data.filter(e => e.is_official);
      } else if (sourceFilter === 'teacher_pending') {
        data = data.filter(e => e.created_by_teacher && !e.is_approved);
      } else if (sourceFilter === 'teacher_approved') {
        data = data.filter(e => e.created_by_teacher && e.is_approved);
      }
      setExams(data);
    } else {
      toast.error(result.error || 'Failed to load exams');
    }
    setLoading(false);
  };

  const handleCreateSuccess = async (examId: string, examData?: Partial<Exam>) => {
    await auditLogService.logAction({
      actionType: AuditActionTypes.EXAM_CREATE,
      tableName: 'mock_exams',
      recordId: examId,
      newValues: examData || { id: examId },
      description: `Created new exam: ${examData?.title || examId}`
    });
    fetchExams();
    router.push(`/exams/${examId}`);
  };

  const handleEdit = (examId: string) => {
    router.push(`/exams/${examId}`);
  };

  const handleDelete = async (examId: string) => {
    if (!canDeleteUsers) {
      toast.error('Permission denied: You do not have permission to delete exams.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this exam? This action cannot be undone.')) {
      return;
    }
    const examToDelete = exams.find(e => e.id === examId);
    const result = await examService.deleteExam(examId);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_DELETE,
        tableName: 'mock_exams',
        recordId: examId,
        oldValues: examToDelete ? {
          title: examToDelete.title,
          exam_type: examToDelete.exam_type,
          target_group: examToDelete.target_group
        } : { id: examId },
        description: `Deleted exam: ${examToDelete?.title || examId}`
      });
      toast.success('Exam deleted successfully');
      fetchExams();
    } else {
      toast.error(result.error || 'Failed to delete exam');
    }
  };

  const handlePreview = (examId: string) => {
    router.push(`/exams/${examId}/preview`);
  };

  const sourceLabels: Record<SourceFilter, string> = {
    all: 'All',
    official: '🏆 Official',
    teacher_pending: '🕐 Teacher (Pending)',
    teacher_approved: '✅ Teacher (Approved)',
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Exam Management</h1>
          <p className="text-gray-600 mt-2">Create and manage exams for students</p>
        </div>
        <button
          onClick={() => router.push('/exams/teacher-submissions')}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm"
        >
          📥 Teacher Submissions
        </button>
      </div>

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can view exams but cannot create, edit, or delete them.
          </p>
        </div>
      )}

      {/* Source Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(sourceLabels) as SourceFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sourceFilter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {sourceLabels[f]}
          </button>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ExamType | '')}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="first_stage">First Stage</option>
            <option value="second_stage">Second Stage</option>
            <option value="full_exam">Full Exam</option>
          </select>

          {/* Group Filter */}
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as TargetGroup | '')}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Groups</option>
            <option value="I">Group I</option>
            <option value="II">Group II</option>
            <option value="III">Group III</option>
            <option value="IV">Group IV</option>
            <option value="V">Group V</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search exams..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {canEditUsers && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <span>➕</span>
            Create Exam
          </button>
        )}
      </div>

      {/* Exams List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading exams...</p>
        </div>
      ) : (
        <ExamList
          exams={exams}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPreview={handlePreview}
          canEdit={canEditUsers}
          canDelete={canDeleteUsers}
        />
      )}

      {/* Create Modal */}
      <CreateExamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

