'use client';

import type { SubtopicWithStats } from '@/types/subjects';
import { formatRelativeTime } from '@/utils/timeUtils';

interface SubtopicCardProps {
  subtopic: SubtopicWithStats;
  onEdit: (subtopic: SubtopicWithStats) => void;
  onDelete: (subtopic: SubtopicWithStats) => void;
  onToggleStatus: (subtopic: SubtopicWithStats) => void;
}

export function SubtopicCard({ subtopic, onEdit, onDelete, onToggleStatus }: SubtopicCardProps) {
  const difficultyBadge = {
    beginner: 'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced: 'bg-red-100 text-red-800',
  }[subtopic.difficulty_level];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
      subtopic.is_active ? 'bg-white border-gray-200 hover:border-indigo-200' : 'bg-gray-50 border-gray-200 opacity-70'
    }`}>
      {/* Left dot accent */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${subtopic.is_active ? 'bg-indigo-500' : 'bg-gray-300'}`} />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{subtopic.subtopic_name}</p>
        {subtopic.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{subtopic.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">Updated {formatRelativeTime(subtopic.updated_at)}</p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${difficultyBadge}`}>
          {subtopic.difficulty_level.charAt(0).toUpperCase() + subtopic.difficulty_level.slice(1)}
        </span>

        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {subtopic.question_count}
        </span>

        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          subtopic.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {subtopic.is_active ? '● Active' : '○ Inactive'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onToggleStatus(subtopic)}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title={subtopic.is_active ? 'Deactivate subtopic' : 'Activate subtopic'}
        >
          {subtopic.is_active ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => onEdit(subtopic)}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="Edit subtopic"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(subtopic)}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Delete subtopic"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
