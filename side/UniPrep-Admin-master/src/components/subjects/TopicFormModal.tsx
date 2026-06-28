'use client';

import { useState, useEffect } from 'react';
import type { TopicWithStats, CreateTopicParams, UpdateTopicParams } from '@/types/subjects';

interface TopicFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTopicParams | UpdateTopicParams) => Promise<void>;
  topic?: TopicWithStats | null;
  mode: 'create' | 'edit';
  subjectId: string;
}

export function TopicFormModal({ isOpen, onClose, onSubmit, topic, mode, subjectId }: TopicFormModalProps) {
  const [formData, setFormData] = useState({
    topic_name: '',
    topic_name_az: '',
    topic_name_ru: '',
    description: '',
    difficulty_level: 'intermediate' as 'beginner' | 'intermediate' | 'advanced',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (topic && mode === 'edit') {
      setFormData({
        topic_name: topic.topic_name,
        topic_name_az: topic.topic_name_az || '',
        topic_name_ru: topic.topic_name_ru || '',
        description: topic.description || '',
        difficulty_level: topic.difficulty_level,
      });
    } else {
      setFormData({
        topic_name: '',
        topic_name_az: '',
        topic_name_ru: '',
        description: '',
        difficulty_level: 'intermediate',
      });
    }
    setError(null);
  }, [topic, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'edit' && topic) {
        await onSubmit({
          id: topic.id,
          ...formData,
        } as UpdateTopicParams);
      } else {
        await onSubmit({
          subject_id: subjectId,
          ...formData,
        } as CreateTopicParams);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save topic');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'create' ? 'Create New Topic' : 'Edit Topic'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Topic Names */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Topic Names</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic Name (English) *
              </label>
              <input
                type="text"
                required
                value={formData.topic_name}
                onChange={(e) => setFormData({ ...formData, topic_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Algebra"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic Name (Azerbaijani)
              </label>
              <input
                type="text"
                value={formData.topic_name_az}
                onChange={(e) => setFormData({ ...formData, topic_name_az: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Cəbr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic Name (Russian)
              </label>
              <input
                type="text"
                value={formData.topic_name_ru}
                onChange={(e) => setFormData({ ...formData, topic_name_ru: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Алгебра"
              />
            </div>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of this topic..."
            />
          </div>

          {/* Difficulty Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty Level *
            </label>
            <select
              required
              value={formData.difficulty_level}
              onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Indicates the complexity level of questions in this topic
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Topic' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
