'use client';

import React, { useState, useEffect } from 'react';
import { Subject } from '@/types/questions';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import type { TopicWithStats, SubtopicWithStats } from '@/types/subjects';

interface FilterPreset {
  id: string;
  name: string;
  filters: {
    subjects: string[];
    topics: string[];
    difficulties: string[];
    status: string;
  };
}

interface AdvancedFiltersProps {
  subjects: Subject[];
  onFilterChange: (filters: any) => void;
}

export default function AdvancedFilters({
  subjects,
  onFilterChange,
}: AdvancedFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Load topics when subjects change
  useEffect(() => {
    if (selectedSubjects.length > 0) {
      loadTopicsForSubjects();
    } else {
      setTopics([]);
      setSelectedTopics([]);
    }
  }, [selectedSubjects]);

  // Load subtopics when selected topics change
  useEffect(() => {
    if (selectedTopics.length > 0 && topics.length > 0) {
      loadSubtopicsForSelectedTopics();
    } else {
      setSubtopics([]);
      setSelectedSubtopics([]);
    }
  }, [selectedTopics, topics]);

  // Load saved presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('questionFilterPresets');
    if (saved) {
      setPresets(JSON.parse(saved));
    }
  }, []);

  const loadTopicsForSubjects = async () => {
    try {
      const allTopics: TopicWithStats[] = [];
      for (const subjectId of selectedSubjects) {
        const result = await topicService.getTopicsBySubject(subjectId);
        if (result.success && result.data) {
          allTopics.push(...result.data);
        }
      }
      setTopics(allTopics);
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const loadSubtopicsForSelectedTopics = async () => {
    try {
      const selectedTopicIds = selectedTopics
        .map((name) => topics.find((t) => t.topic_name === name)?.id)
        .filter(Boolean) as string[];

      const allSubtopics: SubtopicWithStats[] = [];
      for (const topicId of selectedTopicIds) {
        const result = await subtopicService.getSubtopicsByTopic(topicId);
        if (result.success && result.data) {
          allSubtopics.push(...result.data.filter((s) => s.is_active));
        }
      }

      // Deduplicate by ID
      const seen = new Set<string>();
      setSubtopics(
        allSubtopics.filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        })
      );
    } catch (error) {
      console.error('Failed to load subtopics:', error);
    }
  };

  const handleApplyFilters = () => {
    onFilterChange({
      subjects: selectedSubjects,
      topics: selectedTopics,
      subtopics: selectedSubtopics,
      difficulties: selectedDifficulties,
      status: statusFilter,
      searchText,
    });
  };

  const handleClearFilters = () => {
    setSelectedSubjects([]);
    setSelectedTopics([]);
    setSelectedSubtopics([]);
    setSelectedDifficulties([]);
    setStatusFilter('all');
    setSearchText('');
    onFilterChange({
      subjects: [],
      topics: [],
      subtopics: [],
      difficulties: [],
      status: 'all',
      searchText: '',
    });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName,
      filters: {
        subjects: selectedSubjects,
        topics: selectedTopics,
        difficulties: selectedDifficulties,
        status: statusFilter,
      },
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('questionFilterPresets', JSON.stringify(updated));
    setPresetName('');
    setShowSavePreset(false);
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setSelectedSubjects(preset.filters.subjects);
    setSelectedTopics(preset.filters.topics);
    setSelectedDifficulties(preset.filters.difficulties);
    setStatusFilter(preset.filters.status);
    handleApplyFilters();
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('questionFilterPresets', JSON.stringify(updated));
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const toggleTopic = (topicName: string) => {
    setSelectedTopics(prev =>
      prev.includes(topicName)
        ? prev.filter(name => name !== topicName)
        : [...prev, topicName]
    );
  };

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulties(prev =>
      prev.includes(difficulty)
        ? prev.filter(d => d !== difficulty)
        : [...prev, difficulty]
    );
  };

  const toggleSubtopic = (subtopicId: string) => {
    setSelectedSubtopics((prev) =>
      prev.includes(subtopicId)
        ? prev.filter((id) => id !== subtopicId)
        : [...prev, subtopicId]
    );
  };

  const activeFilterCount =
    selectedSubjects.length +
    selectedTopics.length +
    selectedSubtopics.length +
    selectedDifficulties.length +
    (statusFilter !== 'all' ? 1 : 0) +
    (searchText ? 1 : 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            {showAdvanced ? '▼' : '▶'} Advanced Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Basic Search (always visible) */}
      <div className="mb-4">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleApplyFilters()}
          placeholder="Search questions..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="space-y-4 border-t pt-4">
          {/* Saved Presets */}
          {presets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Saved Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg"
                  >
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      className="text-sm text-gray-700 hover:text-blue-600"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select Subjects */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subjects (Multi-select)
            </label>
            <div className="flex flex-wrap gap-2">
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => toggleSubject(subject.id)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    selectedSubjects.includes(subject.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {subject.name_en}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-select Topics */}
          {topics.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topics (Multi-select)
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => toggleTopic(topic.topic_name)}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      selectedTopics.includes(topic.topic_name)
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {topic.topic_name} ({topic.question_count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select Subtopics — shown when topics are selected and have subtopics */}
          {subtopics.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subtopics (Multi-select)
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {subtopics.map((subtopic) => (
                  <button
                    key={subtopic.id}
                    onClick={() => toggleSubtopic(subtopic.id)}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      selectedSubtopics.includes(subtopic.id)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {subtopic.subtopic_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select Difficulties */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty (Multi-select)
            </label>
            <div className="flex gap-2">
              {['easy', 'medium', 'hard'].map((difficulty) => (
                <button
                  key={difficulty}
                  onClick={() => toggleDifficulty(difficulty)}
                  className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
                    selectedDifficulties.includes(difficulty)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active Only' },
                { value: 'inactive', label: 'Inactive Only' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    statusFilter === option.value
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <button
              onClick={handleApplyFilters}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Apply Filters
            </button>
            
            {activeFilterCount > 0 && !showSavePreset && (
              <button
                onClick={() => setShowSavePreset(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                💾 Save as Preset
              </button>
            )}

            {showSavePreset && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name..."
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()}
                />
                <button
                  onClick={handleSavePreset}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSavePreset(false);
                    setPresetName('');
                  }}
                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
