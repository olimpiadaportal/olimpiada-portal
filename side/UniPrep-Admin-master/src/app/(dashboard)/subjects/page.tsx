'use client';

import { useState, useEffect } from 'react';
import { SubjectList } from '@/components/subjects/SubjectList';
import { SubjectFormModal } from '@/components/subjects/SubjectFormModal';
import { DeleteSubjectModal } from '@/components/subjects/DeleteSubjectModal';
import { subjectService } from '@/services/subjectService';
import { usePermissions } from '@/hooks/usePermissions';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import type { SubjectWithStats, CreateSubjectParams, UpdateSubjectParams } from '@/types/subjects';

export default function SubjectsPage() {
  const { canEditUsers, canDeleteUsers, isModerator } = usePermissions();
  const [subjects, setSubjects] = useState<SubjectWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedSubject, setSelectedSubject] = useState<SubjectWithStats | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load subjects
  const loadSubjects = async () => {
    setIsLoading(true);
    setError(null);

    const result = await subjectService.getSubjectsWithStats();

    if (result.success && result.data) {
      setSubjects(result.data);
    } else {
      setError(result.error || 'Failed to load subjects');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  // Show toast
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle create subject
  const handleCreate = () => {
    setFormMode('create');
    setSelectedSubject(null);
    setIsFormModalOpen(true);
  };

  // Handle edit subject
  const handleEdit = (subject: SubjectWithStats) => {
    if (!canEditUsers) {
      showToast('Permission denied: You do not have permission to edit subjects.', 'error');
      return;
    }
    setFormMode('edit');
    setSelectedSubject(subject);
    setIsFormModalOpen(true);
  };

  // Handle delete subject
  const handleDelete = (subject: SubjectWithStats) => {
    if (!canDeleteUsers) {
      showToast('Permission denied: You do not have permission to delete subjects.', 'error');
      return;
    }
    setSelectedSubject(subject);
    setIsDeleteModalOpen(true);
  };

  // Submit form (create or edit)
  const handleFormSubmit = async (data: CreateSubjectParams | UpdateSubjectParams) => {
    if (formMode === 'create') {
      const result = await subjectService.createSubject(data as CreateSubjectParams);
      if (result.success && result.data) {
        // Log the create action (result.data is the subject ID string)
        await auditLogService.logAction({
          actionType: AuditActionTypes.SUBJECT_CREATE,
          tableName: 'subjects',
          recordId: result.data,
          newValues: { name_en: data.name_en, name_az: data.name_az },
          description: `Created subject: ${data.name_en}`
        });
        
        showToast('Subject created successfully', 'success');
        await loadSubjects();
      } else {
        throw new Error(result.error || 'Failed to create subject');
      }
    } else {
      const updateData = data as UpdateSubjectParams;
      const result = await subjectService.updateSubject(updateData);
      if (result.success) {
        // Log the update action
        await auditLogService.logAction({
          actionType: AuditActionTypes.SUBJECT_UPDATE,
          tableName: 'subjects',
          recordId: updateData.id,
          oldValues: selectedSubject ? { name_en: selectedSubject.name_en, name_az: selectedSubject.name_az } : undefined,
          newValues: { name_en: updateData.name_en, name_az: updateData.name_az },
          description: `Updated subject: ${updateData.name_en}`
        });
        
        showToast('Subject updated successfully', 'success');
        await loadSubjects();
      } else {
        throw new Error(result.error || 'Failed to update subject');
      }
    }
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedSubject) return;

    const result = await subjectService.deleteSubject(selectedSubject.id);
    if (result.success) {
      // Log the delete action
      await auditLogService.logAction({
        actionType: AuditActionTypes.SUBJECT_DELETE,
        tableName: 'subjects',
        recordId: selectedSubject.id,
        oldValues: { name_en: selectedSubject.name_en, name_az: selectedSubject.name_az },
        description: `Deleted subject: ${selectedSubject.name_en}`
      });
      
      showToast('Subject deleted successfully', 'success');
      await loadSubjects();
    } else {
      throw new Error(result.error || 'Failed to delete subject');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subjects</h1>
            <p className="text-gray-600 mt-1">
              Manage exam subjects and their topics
            </p>
          </div>
          {canEditUsers && (
            <button
              onClick={handleCreate}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Subject
            </button>
          )}
        </div>
      </div>

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can view subjects but cannot create, edit, or delete them.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Subjects</p>
              <p className="text-2xl font-bold text-gray-900">{subjects.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Subjects</p>
              <p className="text-2xl font-bold text-gray-900">
                {subjects.filter(s => s.is_active).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Questions</p>
              <p className="text-2xl font-bold text-gray-900">
                {subjects.reduce((sum, s) => sum + s.question_count, 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Topics</p>
              <p className="text-2xl font-bold text-gray-900">
                {subjects.reduce((sum, s) => sum + s.topic_count, 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : (
        <SubjectList
          subjects={subjects}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canEdit={canEditUsers}
          canDelete={canDeleteUsers}
        />
      )}

      {/* Modals */}
      <SubjectFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        subject={selectedSubject}
        mode={formMode}
      />

      <DeleteSubjectModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        subject={selectedSubject}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className={`rounded-lg shadow-lg px-6 py-4 flex items-center gap-3 ${
            toast.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
