'use client';

import React, { useState, useEffect } from 'react';
import { Subject, QuestionDifficulty, QuestionType } from '@/types/questions';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import type { TopicWithStats, SubtopicWithStats } from '@/types/subjects';

interface QuestionFiltersProps {
  subjects: Subject[];
  selectedSubject: string;
  onSubjectChange: (value: string) => void;
  searchText: string;
  onSearchChange: (value: string) => void;
  difficultyFilter: string;
  onDifficultyChange: (value: string) => void;
  topicFilter: string;
  onTopicChange: (value: string) => void;
  typeFilter?: string;
  onTypeChange?: (value: string) => void;
  subtopicFilter?: string;
  onSubtopicChange?: (value: string) => void;
}

export default function QuestionFilters({
  subjects,
  selectedSubject,
  onSubjectChange,
  searchText,
  onSearchChange,
  difficultyFilter,
  onDifficultyChange,
  topicFilter,
  onTopicChange,
  typeFilter = '',
  onTypeChange,
  subtopicFilter = '',
  onSubtopicChange,
}: QuestionFiltersProps) {
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);

  // Load topics when subject changes
  useEffect(() => {
    if (selectedSubject) {
      loadTopics();
    } else {
      setTopics([]);
      onTopicChange('');
    }
  }, [selectedSubject]);

  // Load subtopics when topic filter changes
  useEffect(() => {
    if (topicFilter && topicFilter !== '__unassigned__') {
      const topic = topics.find((t) => t.topic_name === topicFilter);
      if (topic) {
        loadSubtopicsForTopic(topic.id);
      } else {
        setSubtopics([]);
      }
    } else {
      setSubtopics([]);
      onSubtopicChange?.('');
    }
  }, [topicFilter, topics]);

  const loadTopics = async () => {
    if (!selectedSubject) return;

    setLoadingTopics(true);
    try {
      const result = await topicService.getTopicsBySubject(selectedSubject);
      if (result.success && result.data) {
        setTopics(result.data);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadSubtopicsForTopic = async (topicId: string) => {
    setLoadingSubtopics(true);
    try {
      const result = await subtopicService.getSubtopicsByTopic(topicId);
      if (result.success && result.data) {
        setSubtopics(result.data.filter((s) => s.is_active));
      } else {
        setSubtopics([]);
      }
    } catch {
      setSubtopics([]);
    } finally {
      setLoadingSubtopics(false);
    }
  };
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        {/* Subject Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject
          </label>
          <select
            value={selectedSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* Topic Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic
          </label>
          <select
            value={topicFilter}
            onChange={(e) => onTopicChange(e.target.value)}
            disabled={!selectedSubject || loadingTopics}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">All Topics</option>
            <option value="__unassigned__">Unassigned</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.topic_name}>
                {topic.topic_name} ({topic.question_count})
              </option>
            ))}
          </select>
        </div>

        {/* Subtopic Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subtopic
          </label>
          <select
            value={subtopicFilter}
            onChange={(e) => onSubtopicChange?.(e.target.value)}
            disabled={!topicFilter || topicFilter === '__unassigned__' || loadingSubtopics || subtopics.length === 0}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">All Subtopics</option>
            {subtopics.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subtopic_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Question Type
          </label>
          <select
            value={typeFilter}
            onChange={(e) => onTypeChange?.(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="mcq">📝 MCQ</option>
            <option value="codable_open">✏️ Short Answer</option>
            <option value="written_open">📋 Question Group</option>
          </select>
        </div>

        {/* Difficulty Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Difficulty
          </label>
          <select
            value={difficultyFilter}
            onChange={(e) => onDifficultyChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search
          </label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search question text..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
