'use client';

import type { TopicWithStats } from '@/types/subjects';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { formatRelativeTime } from '@/utils/timeUtils';

interface TopicCardProps {
  topic: TopicWithStats;
  onEdit: (topic: TopicWithStats) => void;
  onDelete: (topic: TopicWithStats) => void;
  onToggleStatus: (topic: TopicWithStats) => void;
  onAddQuestions?: (topic: TopicWithStats) => void;
  onExpandSubtopics?: (topic: TopicWithStats) => void;
  isExpanded?: boolean;
  isDragging?: boolean;
  dragHandleProps?: SyntheticListenerMap;
  isSelected?: boolean;
  onSelect?: (topicId: string) => void;
}

export function TopicCard({
  topic,
  onEdit,
  onDelete,
  onToggleStatus,
  onAddQuestions,
  onExpandSubtopics,
  isExpanded = false,
  isDragging,
  dragHandleProps,
  isSelected,
  onSelect,
}: TopicCardProps) {
  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Beginner
          </span>
        );
      case 'intermediate':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Intermediate
          </span>
        );
      case 'advanced':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Advanced
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border p-4 transition-all ${
        isDragging ? 'opacity-50 shadow-lg' : 'hover:shadow-md'
      } ${
        isSelected ? 'border-blue-500 bg-blue-50' : isExpanded ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Selection Checkbox */}
        {onSelect && (
          <div className="flex-shrink-0 pt-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(topic.id)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>
        )}

        {/* Drag Handle */}
        <div
          className="flex-shrink-0 cursor-move text-gray-400 hover:text-gray-600"
          {...dragHandleProps}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {topic.topic_name}
              </h3>
              <div className="mt-1 text-sm text-gray-600 space-y-0.5">
                {topic.topic_name_az && topic.topic_name_az !== topic.topic_name && (
                  <p>AZ: {topic.topic_name_az}</p>
                )}
                {topic.topic_name_ru && topic.topic_name_ru !== topic.topic_name && (
                  <p>RU: {topic.topic_name_ru}</p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {topic.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {topic.description}
            </p>
          )}

          {/* Stats & Badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {getDifficultyBadge(topic.difficulty_level)}
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              topic.is_active
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {topic.is_active ? '● Active' : '○ Inactive'}
            </span>
            <span className="inline-flex items-center text-sm text-gray-600">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {topic.question_count} question{topic.question_count !== 1 ? 's' : ''}
            </span>
            {/* Subtopic count badge */}
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${
              topic.subtopic_count > 0 ? 'text-indigo-600' : 'text-gray-400'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              {topic.subtopic_count} subtopic{topic.subtopic_count !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Last updated */}
          <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Updated {formatRelativeTime(topic.updated_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Expand subtopics toggle */}
          {onExpandSubtopics && (
            <button
              onClick={() => onExpandSubtopics(topic)}
              className={`p-2 rounded-lg transition-colors ${
                isExpanded
                  ? 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200'
                  : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
              title={isExpanded ? 'Collapse subtopics' : 'Manage subtopics'}
            >
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          {onAddQuestions && (
            <button
              onClick={() => onAddQuestions(topic)}
              className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Add questions to topic"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onToggleStatus(topic)}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title={topic.is_active ? 'Deactivate topic' : 'Activate topic'}
          >
            {topic.is_active ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => onEdit(topic)}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit topic"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(topic)}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete topic"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
