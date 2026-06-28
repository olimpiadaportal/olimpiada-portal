'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { examGroupService, ExamGroup, ExamGroupSubject, Subject } from '@/services/examGroupService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function ExamGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const groupId = params.id as string;
  const { canEditContent, canDeleteContent, isModerator, loading: permissionsLoading } = usePermissions();

  const [group, setGroup] = useState<ExamGroup | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'first' | 'second'>('first');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [groupId]);

  const fetchData = async () => {
    setLoading(true);
    const [groupResult, subjectsResult] = await Promise.all([
      examGroupService.getExamGroup(groupId),
      examGroupService.getSubjects(),
    ]);

    if (groupResult.success && groupResult.data) {
      setGroup(groupResult.data);
    } else {
      toast.error('Failed to load exam group');
      router.push('/exam-groups');
    }

    if (subjectsResult.success && subjectsResult.data) {
      setSubjects(subjectsResult.data);
    }
    setLoading(false);
  };

  const getStageSubjects = (stage: 'first' | 'second') => {
    if (!group?.subjects) return [];
    return group.subjects
      .filter(s => s.stage === stage && s.is_active)
      .sort((a, b) => a.display_order - b.display_order);
  };

  const handleUpdateSubject = async (id: string, data: any, subjectName: string) => {
    if (!canEditContent) {
      toast.error('Permission denied: You do not have permission to update subjects.');
      return;
    }
    const result = await examGroupService.updateGroupSubject(id, data);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_GROUP_SUBJECT_UPDATE,
        tableName: 'exam_group_subjects',
        recordId: id,
        newValues: data,
        description: `Updated ${subjectName} in ${group?.name_en} (${activeTab === 'first' ? 'Stage I' : 'Stage II'})`,
      });
      toast.success('Subject updated');
      fetchData();
    } else {
      toast.error(result.error || 'Failed to update');
    }
  };

  const handleRemoveSubject = async (id: string, subjectName: string) => {
    if (!canDeleteContent) {
      toast.error('Permission denied: You do not have permission to remove subjects.');
      return;
    }
    if (!confirm(`Remove ${subjectName} from ${activeTab === 'first' ? 'Stage I' : 'Stage II'}?`)) return;
    
    const result = await examGroupService.removeSubjectFromGroup(id);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_GROUP_SUBJECT_DELETE,
        tableName: 'exam_group_subjects',
        recordId: id,
        description: `Removed ${subjectName} from ${group?.name_en} (${activeTab === 'first' ? 'Stage I' : 'Stage II'})`,
      });
      toast.success('Subject removed');
      fetchData();
    } else {
      toast.error(result.error || 'Failed to remove');
    }
  };

  const handleAddSubject = async (data: any, subjectName: string) => {
    if (!canEditContent) {
      toast.error('Permission denied: You do not have permission to add subjects.');
      return;
    }
    const result = await examGroupService.addSubjectToGroup({
      ...data,
      exam_group_id: groupId,
      stage: activeTab,
    });
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_GROUP_SUBJECT_ADD,
        tableName: 'exam_group_subjects',
        recordId: result.data?.id,
        newValues: data,
        description: `Added ${subjectName} to ${group?.name_en} (${activeTab === 'first' ? 'Stage I' : 'Stage II'})`,
      });
      toast.success('Subject added');
      fetchData();
      setShowAddModal(false);
    } else {
      toast.error(result.error || 'Failed to add');
    }
  };

  const handleUpdateGroup = async (data: any) => {
    if (!group) return;
    if (!canEditContent) {
      toast.error('Permission denied: You do not have permission to update exam groups.');
      return;
    }
    const result = await examGroupService.updateExamGroup(groupId, data);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_GROUP_UPDATE,
        tableName: 'exam_groups',
        recordId: groupId,
        oldValues: { name_en: group.name_en, name_az: group.name_az },
        newValues: data,
        description: `Updated exam group: ${group.name_en}`,
      });
      toast.success('Group updated');
      fetchData();
      setShowEditModal(false);
    } else {
      toast.error(result.error || 'Failed to update');
    }
  };

  if (loading || permissionsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!group) return null;

  const stageSubjects = getStageSubjects(activeTab);
  const maxPoints = activeTab === 'first' ? group.first_stage_max_points : group.second_stage_max_points;
  const totalCoeff = stageSubjects.reduce((sum, s) => sum + s.coefficient, 0) || 1;
  const existingSubjectIds = (group.subjects || [])
    .filter(s => s.stage === activeTab)
    .map(s => s.subject_id);

  return (
    <div className="p-6">
      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">ℹ️</span>
            <p className="text-sm text-yellow-800">
              <strong>View-only access:</strong> As a moderator, you can view exam group details but cannot edit or modify subjects.
            </p>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/exam-groups" className="text-blue-600 hover:underline">
          ← Back to Exam Groups
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {group.name_en} ({group.code})
            </h1>
            <p className="text-gray-600 mt-1">{group.name_az}</p>
            <p className="text-sm text-gray-500 mt-2">{group.description}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-sm text-gray-500">Stage I</div>
              <div className="text-2xl font-bold text-green-600">{group.first_stage_max_points} pts</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500">Stage II</div>
              <div className="text-2xl font-bold text-blue-600">
                {group.has_second_stage ? `${group.second_stage_max_points} pts` : 'N/A'}
              </div>
            </div>
            {canEditContent && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                ✏️ Edit Group
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stage Tabs */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('first')}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'first'
                ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            📗 Stage I (First Stage)
            <span className="ml-2 text-sm">300 pts max</span>
          </button>
          <button
            onClick={() => setActiveTab('second')}
            disabled={!group.has_second_stage}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'second'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : group.has_second_stage
                  ? 'text-gray-500 hover:bg-gray-50'
                  : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            📘 Stage II (Second Stage)
            <span className="ml-2 text-sm">
              {group.has_second_stage ? '400 pts max' : 'Not applicable'}
            </span>
          </button>
        </div>

        {/* Stage Content */}
        <div className="p-6">
          {/* Info Banner */}
          <div className={`rounded-lg p-4 mb-6 ${
            activeTab === 'first' ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
          }`}>
            {activeTab === 'first' ? (
              <div className="text-sm text-green-700">
                <strong>Stage I Rules:</strong> All subjects typically have coefficient 1.0 (equal weight).
                Total: 300 points distributed equally among subjects.
              </div>
            ) : (
              <div className="text-sm text-blue-700">
                <strong>Stage II Rules:</strong> 2 subjects with coefficient 1.5 (150 pts each) + 
                1 subject with coefficient 1.0 (100 pts). Total: 400 points.
              </div>
            )}
          </div>

          {/* Add Subject Button */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {activeTab === 'first' ? 'Stage I' : 'Stage II'} Subjects
            </h3>
            {canEditContent && (
              <button
                onClick={() => setShowAddModal(true)}
                className={`px-4 py-2 rounded-lg text-white ${
                  activeTab === 'first' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                ➕ Add Subject
              </button>
            )}
          </div>

          {/* Subjects Table */}
          {stageSubjects.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 pl-2">#</th>
                  <th className="pb-3">Subject</th>
                  <th className="pb-3 text-center">Coefficient</th>
                  <th className="pb-3 text-center">Questions</th>
                  <th className="pb-3 text-center">Max Points</th>
                  <th className="pb-3 text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stageSubjects.map((gs, index) => {
                  const subjectMaxPoints = Math.round((gs.coefficient / totalCoeff) * maxPoints);
                  return (
                    <tr key={gs.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-4 pl-2 text-gray-400">{index + 1}</td>
                      <td className="py-4">
                        <span className="font-medium">{gs.subject?.name_en}</span>
                        <span className="text-gray-400 text-sm ml-2">({gs.subject?.name_az})</span>
                      </td>
                      <td className="py-4 text-center">
                        {canEditContent ? (
                          <select
                            value={gs.coefficient}
                            onChange={(e) => handleUpdateSubject(gs.id, { coefficient: parseFloat(e.target.value) }, gs.subject?.name_en || '')}
                            className="px-3 py-1.5 border rounded-lg text-center bg-white"
                          >
                            <option value="1.0">1.0x</option>
                            <option value="1.5">1.5x</option>
                          </select>
                        ) : (
                          <span className="text-gray-700">{gs.coefficient}x</span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {canEditContent ? (
                          <input
                            type="number"
                            value={gs.questions_count}
                            onChange={(e) => handleUpdateSubject(gs.id, { questions_count: parseInt(e.target.value) }, gs.subject?.name_en || '')}
                            className="w-20 px-3 py-1.5 border rounded-lg text-center"
                            min="1"
                            max="50"
                          />
                        ) : (
                          <span className="text-gray-700">{gs.questions_count}</span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <span className={`font-bold ${activeTab === 'first' ? 'text-green-600' : 'text-blue-600'}`}>
                          {subjectMaxPoints} pts
                        </span>
                      </td>
                      <td className="py-4 text-right pr-2">
                        {canDeleteContent && (
                          <button
                            onClick={() => handleRemoveSubject(gs.id, gs.subject?.name_en || '')}
                            className="text-red-500 hover:text-red-700 px-3 py-1"
                          >
                            🗑️ Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="py-3 pl-2 font-medium">Total</td>
                  <td className="py-3 text-center font-bold text-lg">
                    {stageSubjects.reduce((sum, s) => {
                      return sum + Math.round((s.coefficient / totalCoeff) * maxPoints);
                    }, 0)} pts
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-4">📚</div>
              <p>No subjects configured for {activeTab === 'first' ? 'Stage I' : 'Stage II'}</p>
              {canEditContent && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className={`mt-4 px-4 py-2 rounded-lg text-white ${
                    activeTab === 'first' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Add First Subject
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Subject Modal */}
      {showAddModal && (
        <AddSubjectModal
          stage={activeTab}
          subjects={subjects}
          existingSubjectIds={existingSubjectIds}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSubject}
        />
      )}

      {/* Edit Group Modal */}
      {showEditModal && (
        <EditGroupModal
          group={group}
          onClose={() => setShowEditModal(false)}
          onSave={handleUpdateGroup}
        />
      )}
    </div>
  );
}

// Add Subject Modal
function AddSubjectModal({
  stage,
  subjects,
  existingSubjectIds,
  onClose,
  onSave,
}: {
  stage: 'first' | 'second';
  subjects: Subject[];
  existingSubjectIds: string[];
  onClose: () => void;
  onSave: (data: any, subjectName: string) => void;
}) {
  const availableSubjects = subjects.filter(s => !existingSubjectIds.includes(s.id));
  const [formData, setFormData] = useState({
    subject_id: availableSubjects[0]?.id || '',
    coefficient: stage === 'first' ? 1.0 : 1.5,
    questions_count: 30,
    display_order: existingSubjectIds.length + 1,
  });

  if (availableSubjects.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h2 className="text-xl font-bold mb-4">Add Subject to {stage === 'first' ? 'Stage I' : 'Stage II'}</h2>
          <p className="text-gray-600">All available subjects are already added.</p>
          <div className="flex justify-end mt-6">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedSubject = availableSubjects.find(s => s.id === formData.subject_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">
          Add Subject to {stage === 'first' ? 'Stage I' : 'Stage II'}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <select
              value={formData.subject_id}
              onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_en} ({s.name_az})
                </option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Coefficient</label>
              <select
                value={formData.coefficient}
                onChange={(e) => setFormData({ ...formData, coefficient: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="1.0">1.0x (Standard)</option>
                <option value="1.5">1.5x (Weighted)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Questions</label>
              <input
                type="number"
                value={formData.questions_count}
                onChange={(e) => setFormData({ ...formData, questions_count: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                min="1"
                max="50"
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave(formData, selectedSubject?.name_en || '')}
            className={`px-4 py-2 text-white rounded-lg ${
              stage === 'first' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Add Subject
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Group Modal
function EditGroupModal({
  group,
  onClose,
  onSave,
}: {
  group: ExamGroup;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name_en: group.name_en,
    name_az: group.name_az,
    description: group.description || '',
    first_stage_max_points: group.first_stage_max_points,
    second_stage_max_points: group.second_stage_max_points,
    has_second_stage: group.has_second_stage,
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Edit {group.code} Group</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name (English)</label>
            <input
              type="text"
              value={formData.name_en}
              onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Name (Azerbaijani)</label>
            <input
              type="text"
              value={formData.name_az}
              onChange={(e) => setFormData({ ...formData, name_az: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Stage I Max Points</label>
              <input
                type="number"
                value={formData.first_stage_max_points}
                onChange={(e) => setFormData({ ...formData, first_stage_max_points: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Stage II Max Points</label>
              <input
                type="number"
                value={formData.second_stage_max_points}
                onChange={(e) => setFormData({ ...formData, second_stage_max_points: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={!formData.has_second_stage}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="has_second_stage"
              checked={formData.has_second_stage}
              onChange={(e) => setFormData({ ...formData, has_second_stage: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="has_second_stage" className="text-sm">Has Stage II Exam</label>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
