'use client';

import { useState, useEffect } from 'react';
import { ExamType, TargetGroup, CreateExamInput } from '@/types/exams';
import { examService } from '@/services/examService';
import { examGroupService, ExamGroup } from '@/services/examGroupService';
import { useToast } from '@/contexts/ToastContext';

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (examId: string) => void;
}

export default function CreateExamModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateExamModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [examGroups, setExamGroups] = useState<ExamGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    exam_type: 'first_stage' as ExamType,
    target_group: 'I' as TargetGroup,
    duration_minutes: 180,
    total_questions: 90,
  });

  // Fetch exam groups from database
  useEffect(() => {
    if (isOpen) {
      fetchExamGroups();
    }
  }, [isOpen]);

  const fetchExamGroups = async () => {
    setLoadingGroups(true);
    const result = await examGroupService.getExamGroups();
    if (result.success && result.data) {
      setExamGroups(result.data.filter(g => g.is_active));
      // Set default to first group if available
      if (result.data.length > 0 && !formData.target_group) {
        setFormData(prev => ({ ...prev, target_group: result.data![0].code as TargetGroup }));
      }
    }
    setLoadingGroups(false);
  };

  // Get selected group info
  const selectedGroup = examGroups.find(g => g.code === formData.target_group);
  
  // Check if second stage is available for selected group
  const canSelectSecondStage = selectedGroup?.has_second_stage ?? true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setLoading(true);

    const input: CreateExamInput = {
      title: formData.title,
      exam_type: formData.exam_type,
      target_group: formData.target_group,
      duration_minutes: formData.duration_minutes,
      total_questions: formData.total_questions,
    };

    const result = await examService.createExam(input);
    setLoading(false);

    if (result.success && result.data) {
      toast.success('Exam created successfully');
      onSuccess(result.data);
      onClose();
      // Reset form
      setFormData({
        title: '',
        exam_type: 'first_stage',
        target_group: 'I',
        duration_minutes: 180,
        total_questions: 90,
      });
    } else {
      toast.error(result.error || 'Failed to create exam');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">Create New Exam</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Group I - First Stage Mock Exam #1"
                required
              />
            </div>

            {/* Exam Type & Target Group */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Exam Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.exam_type}
                  onChange={(e) => setFormData({ ...formData, exam_type: e.target.value as ExamType })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="first_stage">First Stage (300 pts)</option>
                  <option value="second_stage" disabled={!canSelectSecondStage}>
                    Second Stage (400 pts){!canSelectSecondStage ? ' - N/A for this group' : ''}
                  </option>
                  <option value="full_exam" disabled={!canSelectSecondStage}>
                    Full Exam (700 pts){!canSelectSecondStage ? ' - N/A for this group' : ''}
                  </option>
                </select>
                {!canSelectSecondStage && (
                  <p className="text-xs text-yellow-600 mt-1">
                    Group {formData.target_group} only has Stage I exam
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Target Group <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.target_group}
                  onChange={(e) => {
                    const newGroup = e.target.value as TargetGroup;
                    const group = examGroups.find(g => g.code === newGroup);
                    // If group doesn't have second stage and current exam type is second_stage, switch to first_stage
                    const newExamType = (!group?.has_second_stage && formData.exam_type !== 'first_stage') 
                      ? 'first_stage' 
                      : formData.exam_type;
                    setFormData({ ...formData, target_group: newGroup, exam_type: newExamType });
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loadingGroups}
                >
                  {loadingGroups ? (
                    <option>Loading groups...</option>
                  ) : examGroups.length > 0 ? (
                    examGroups.map((group) => (
                      <option key={group.id} value={group.code}>
                        Group {group.code} - {group.name_en}
                        {!group.has_second_stage ? ' (Stage I only)' : ''}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="I">Group I</option>
                      <option value="II">Group II</option>
                      <option value="III">Group III</option>
                      <option value="IV">Group IV</option>
                      <option value="V">Group V</option>
                    </>
                  )}
                </select>
                {selectedGroup && (
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedGroup.description || `Max: ${selectedGroup.first_stage_max_points + (selectedGroup.has_second_stage ? selectedGroup.second_stage_max_points : 0)} pts`}
                  </p>
                )}
              </div>
            </div>

            {/* Duration & Total Questions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Duration (minutes) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Typical: 180 minutes (3 hours)</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Total Questions <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.total_questions}
                  onChange={(e) => setFormData({ ...formData, total_questions: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Typical: 90 questions (30 per subject)</p>
              </div>
            </div>

            {/* Info Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> After creating the exam, you'll be able to add questions manually or use auto-selection to populate it based on subject and difficulty distribution.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Exam'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
