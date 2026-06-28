'use client';

import { useState, useEffect, useCallback } from 'react';
import { subtopicService } from '@/services/subtopicService';
import { SubtopicCard } from './SubtopicCard';
import { SubtopicFormModal } from './SubtopicFormModal';
import { DeleteSubtopicModal } from './DeleteSubtopicModal';
import type { SubtopicWithStats, CreateSubtopicParams, UpdateSubtopicParams } from '@/types/subjects';

interface SubtopicListProps {
  topicId: string;
  topicName: string;
  canEdit: boolean;
  onSubtopicChange?: () => void;
}

export function SubtopicList({ topicId, topicName, canEdit, onSubtopicChange }: SubtopicListProps) {
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedSubtopic, setSelectedSubtopic] = useState<SubtopicWithStats | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadSubtopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await subtopicService.getSubtopicsByTopic(topicId);
    if (result.success && result.data) {
      setSubtopics(result.data);
    } else {
      setError(result.error || 'Failed to load subtopics');
    }
    setLoading(false);
  }, [topicId]);

  useEffect(() => {
    loadSubtopics();
  }, [loadSubtopics]);

  // ── CRUD handlers ────────────────────────────────────────────────────────────

  const handleCreate = () => {
    setFormMode('create');
    setSelectedSubtopic(null);
    setIsFormOpen(true);
  };

  const handleEdit = (subtopic: SubtopicWithStats) => {
    setFormMode('edit');
    setSelectedSubtopic(subtopic);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (data: CreateSubtopicParams | UpdateSubtopicParams) => {
    if (formMode === 'create') {
      const result = await subtopicService.createSubtopic(data as CreateSubtopicParams);
      if (!result.success) throw new Error(result.error || 'Failed to create subtopic');
      showToast('Subtopic created successfully', 'success');
    } else {
      const result = await subtopicService.updateSubtopic(data as UpdateSubtopicParams);
      if (!result.success) throw new Error(result.error || 'Failed to update subtopic');
      showToast('Subtopic updated successfully', 'success');
    }
    await loadSubtopics();
    onSubtopicChange?.();
  };

  const handleDelete = (subtopic: SubtopicWithStats) => {
    setSelectedSubtopic(subtopic);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedSubtopic) return;
    setIsDeleting(true);
    const result = await subtopicService.deleteSubtopic(selectedSubtopic.id);
    setIsDeleting(false);
    if (result.success) {
      showToast('Subtopic deleted successfully', 'success');
      setIsDeleteOpen(false);
      setSelectedSubtopic(null);
      await loadSubtopics();
      onSubtopicChange?.();
    } else {
      showToast(result.error || 'Failed to delete subtopic', 'error');
    }
  };

  const handleToggleStatus = async (subtopic: SubtopicWithStats) => {
    const result = await subtopicService.toggleSubtopicStatus(subtopic.id, !subtopic.is_active);
    if (result.success) {
      showToast(
        `Subtopic ${!subtopic.is_active ? 'activated' : 'deactivated'} successfully`,
        'success'
      );
      await loadSubtopics();
    } else {
      showToast(result.error || 'Failed to update subtopic status', 'error');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="mt-1 ml-6 border-l-2 border-indigo-100 pl-4">
      {/* Sub-header */}
      <div className="flex items-center justify-between py-2 mb-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
          </svg>
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
            Subtopics
            {!loading && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                {subtopics.length}
              </span>
            )}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Subtopic
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-gray-500 text-sm">
          <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading subtopics...
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 py-2">{error}</div>
      ) : subtopics.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-400 italic">No subtopics yet.</p>
          {canEdit && (
            <button
              onClick={handleCreate}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + Add the first subtopic
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 pb-2">
          {subtopics.map((subtopic) => (
            <SubtopicCard
              key={subtopic.id}
              subtopic={subtopic}
              onEdit={canEdit ? handleEdit : () => {}}
              onDelete={canEdit ? handleDelete : () => {}}
              onToggleStatus={canEdit ? handleToggleStatus : () => {}}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <SubtopicFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        subtopic={selectedSubtopic}
        mode={formMode}
        topicId={topicId}
        topicName={topicName}
      />

      <DeleteSubtopicModal
        isOpen={isDeleteOpen}
        onClose={() => { setIsDeleteOpen(false); setSelectedSubtopic(null); }}
        onConfirm={handleDeleteConfirm}
        subtopic={selectedSubtopic}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] animate-slide-up">
          <div className={`rounded-lg shadow-lg px-5 py-3 flex items-center gap-3 text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
