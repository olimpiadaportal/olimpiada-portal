'use client';

import { useState, useEffect } from 'react';
import type { SubjectWithStats, CreateSubjectParams, UpdateSubjectParams } from '@/types/subjects';

interface SubjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSubjectParams | UpdateSubjectParams) => Promise<void>;
  subject?: SubjectWithStats | null;
  mode: 'create' | 'edit';
}

export function SubjectFormModal({ isOpen, onClose, onSubmit, subject, mode }: SubjectFormModalProps) {
  const [formData, setFormData] = useState({
    name_en: '',
    name_az: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subject && mode === 'edit') {
      setFormData({
        name_en: subject.name_en,
        name_az: subject.name_az,
      });
    } else {
      setFormData({
        name_en: '',
        name_az: '',
      });
    }
    setError(null);
  }, [subject, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'edit' && subject) {
        await onSubmit({
          id: subject.id,
          ...formData,
        } as UpdateSubjectParams);
      } else {
        await onSubmit(formData as CreateSubjectParams);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subject');
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
            {mode === 'create' ? 'Create New Subject' : 'Edit Subject'}
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

          {/* Subject Names */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Subject Names</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                English Name *
              </label>
              <input
                type="text"
                required
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Mathematics"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Azerbaijani Name *
              </label>
              <input
                type="text"
                required
                value={formData.name_az}
                onChange={(e) => setFormData({ ...formData, name_az: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Riyaziyyat"
              />
            </div>

          </div>

          {/* Info about scoring */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">About Scoring</p>
                <p className="text-blue-700">
                  Coefficients and max points are configured per <strong>Exam Group</strong>, not per subject. 
                  Practice sessions use percentage scoring (correct answers / total questions × 100%).
                </p>
              </div>
            </div>
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
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Subject' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
