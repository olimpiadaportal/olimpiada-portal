'use client';

import { useState, useEffect } from 'react';
import type { SubtopicWithStats, CreateSubtopicParams, UpdateSubtopicParams } from '@/types/subjects';

interface SubtopicFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSubtopicParams | UpdateSubtopicParams) => Promise<void>;
  subtopic?: SubtopicWithStats | null;
  mode: 'create' | 'edit';
  topicId: string;
  topicName: string;
}

export function SubtopicFormModal({
  isOpen,
  onClose,
  onSubmit,
  subtopic,
  mode,
  topicId,
  topicName,
}: SubtopicFormModalProps) {
  const [formData, setFormData] = useState({
    subtopic_name: '',
    description: '',
    difficulty_level: 'intermediate' as 'beginner' | 'intermediate' | 'advanced',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subtopic && mode === 'edit') {
      setFormData({
        subtopic_name: subtopic.subtopic_name,
        description: subtopic.description || '',
        difficulty_level: subtopic.difficulty_level,
      });
    } else {
      setFormData({ subtopic_name: '', description: '', difficulty_level: 'intermediate' });
    }
    setError(null);
  }, [subtopic, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'edit' && subtopic) {
        await onSubmit({ id: subtopic.id, ...formData } as UpdateSubtopicParams);
      } else {
        await onSubmit({ topic_id: topicId, ...formData } as CreateSubtopicParams);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subtopic');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {mode === 'create' ? 'Add Subtopic' : 'Edit Subtopic'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Topic: <span className="font-medium text-gray-700">{topicName}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Subtopic Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subtopic Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.subtopic_name}
              onChange={(e) => setFormData({ ...formData, subtopic_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Samit səslər"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Brief description of this subtopic..."
            />
          </div>

          {/* Difficulty Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty Level <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.difficulty_level}
              onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Add Subtopic' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
