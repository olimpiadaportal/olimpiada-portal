'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TopicCard } from './TopicCard';
import { SubtopicList } from './SubtopicList';
import type { TopicWithStats, TopicFilters } from '@/types/subjects';

interface TopicListProps {
  topics: TopicWithStats[];
  subjectId: string;
  canEdit: boolean;
  onEdit: (topic: TopicWithStats) => void;
  onDelete: (topic: TopicWithStats) => void;
  onToggleStatus: (topic: TopicWithStats) => void;
  onAddQuestions?: (topic: TopicWithStats) => void;
  onReorder: (topics: TopicWithStats[]) => Promise<void>;
  selectedTopics?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  onSubtopicChange?: () => void;
}

// Sortable wrapper for TopicCard
function SortableTopicCard({
  topic,
  onEdit,
  onDelete,
  onToggleStatus,
  onAddQuestions,
  onExpandSubtopics,
  isExpanded,
  isSelected,
  onSelect,
}: {
  topic: TopicWithStats;
  onEdit: (topic: TopicWithStats) => void;
  onDelete: (topic: TopicWithStats) => void;
  onToggleStatus: (topic: TopicWithStats) => void;
  onAddQuestions?: (topic: TopicWithStats) => void;
  onExpandSubtopics: (topic: TopicWithStats) => void;
  isExpanded: boolean;
  isSelected?: boolean;
  onSelect?: (topicId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TopicCard
        topic={topic}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleStatus={onToggleStatus}
        onAddQuestions={onAddQuestions}
        onExpandSubtopics={onExpandSubtopics}
        isExpanded={isExpanded}
        isDragging={isDragging}
        dragHandleProps={listeners}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </div>
  );
}

export function TopicList({
  topics,
  subjectId,
  canEdit,
  onEdit,
  onDelete,
  onToggleStatus,
  onAddQuestions,
  onReorder,
  selectedTopics,
  onSelectionChange,
  onSubtopicChange,
}: TopicListProps) {
  const [localTopics, setLocalTopics] = useState(topics);
  const [filters, setFilters] = useState<TopicFilters>({
    difficulty_level: 'all',
    is_active: undefined,
    search: '',
  });
  const [isReordering, setIsReordering] = useState(false);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  // Handle select all
  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedTopics?.size === filteredTopics.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredTopics.map(t => t.id)));
    }
  };

  // Update local topics when props change
  useState(() => {
    setLocalTopics(topics);
  });

  // Toggle expanded subtopic panel
  const handleExpandSubtopics = (topic: TopicWithStats) => {
    setExpandedTopicId(prev => (prev === topic.id ? null : topic.id));
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localTopics.findIndex((t) => t.id === active.id);
      const newIndex = localTopics.findIndex((t) => t.id === over.id);

      const reorderedTopics = arrayMove(localTopics, oldIndex, newIndex).map((topic, index) => ({
        ...topic,
        display_order: index + 1,
      }));

      setLocalTopics(reorderedTopics);
      setIsReordering(true);

      try {
        await onReorder(reorderedTopics);
      } catch (error) {
        setLocalTopics(topics);
        console.error('Failed to reorder topics:', error);
      } finally {
        setIsReordering(false);
      }
    }
  };

  // Filter topics
  const filteredTopics = localTopics.filter((topic) => {
    if (filters.difficulty_level !== 'all' && topic.difficulty_level !== filters.difficulty_level) {
      return false;
    }
    if (filters.is_active !== undefined && topic.is_active !== filters.is_active) {
      return false;
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        topic.topic_name.toLowerCase().includes(searchLower) ||
        (topic.topic_name_az && topic.topic_name_az.toLowerCase().includes(searchLower)) ||
        (topic.topic_name_ru && topic.topic_name_ru.toLowerCase().includes(searchLower)) ||
        (topic.description && topic.description.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search topics..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Difficulty Filter */}
          <div className="sm:w-48">
            <select
              value={filters.difficulty_level}
              onChange={(e) => setFilters({ ...filters, difficulty_level: e.target.value as 'all' | 'beginner' | 'intermediate' | 'advanced' })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="sm:w-40">
            <select
              value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  is_active: value === 'all' ? undefined : value === 'active',
                });
              }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Results count and Select All */}
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>Showing {filteredTopics.length} of {localTopics.length} topics</span>
            {onSelectionChange && filteredTopics.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-900">
                <input
                  type="checkbox"
                  checked={selectedTopics?.size === filteredTopics.length && filteredTopics.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="font-medium">Select All</span>
              </label>
            )}
          </div>
          {isReordering && (
            <span className="text-blue-600 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving order...
            </span>
          )}
        </div>
      </div>

      {/* Topic Cards with Drag & Drop */}
      {filteredTopics.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No topics found</h3>
          <p className="text-gray-500">
            {filters.search || filters.difficulty_level !== 'all' || filters.is_active !== undefined
              ? 'Try adjusting your filters'
              : 'Get started by creating your first topic'}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTopics.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {filteredTopics.map((topic) => (
                <div key={topic.id}>
                  <SortableTopicCard
                    topic={topic}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleStatus={onToggleStatus}
                    onAddQuestions={onAddQuestions}
                    onExpandSubtopics={handleExpandSubtopics}
                    isExpanded={expandedTopicId === topic.id}
                    isSelected={selectedTopics?.has(topic.id)}
                    onSelect={(topicId) => {
                      if (onSelectionChange && selectedTopics) {
                        const newSelected = new Set(selectedTopics);
                        if (newSelected.has(topicId)) {
                          newSelected.delete(topicId);
                        } else {
                          newSelected.add(topicId);
                        }
                        onSelectionChange(newSelected);
                      }
                    }}
                  />
                  {/* Inline subtopic panel — expands/collapses below the topic card */}
                  {expandedTopicId === topic.id && (
                    <SubtopicList
                      topicId={topic.id}
                      topicName={topic.topic_name}
                      canEdit={canEdit}
                      onSubtopicChange={onSubtopicChange}
                    />
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Drag hint */}
      {filteredTopics.length > 1 && (
        <div className="text-center text-sm text-gray-500">
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Drag topics to reorder
        </div>
      )}
    </div>
  );
}
