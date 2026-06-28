'use client';

import type { SubtopicWithStats } from '@/types/subjects';

interface DeleteSubtopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  subtopic: SubtopicWithStats | null;
}

export function DeleteSubtopicModal({ isOpen, onClose, onConfirm, subtopic }: DeleteSubtopicModalProps) {
  if (!isOpen || !subtopic) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Delete Subtopic</h3>
            <p className="text-sm text-gray-500">{subtopic.subtopic_name}</p>
          </div>
        </div>

        <p className="text-gray-600 mb-2">
          Are you sure you want to delete this subtopic? This action cannot be undone.
        </p>

        {subtopic.question_count > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> {subtopic.question_count} question{subtopic.question_count !== 1 ? 's are' : ' is'} assigned
              to this subtopic. You must reassign or remove their subtopic before deleting.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={subtopic.question_count > 0}
            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Subtopic
          </button>
        </div>
      </div>
    </div>
  );
}
