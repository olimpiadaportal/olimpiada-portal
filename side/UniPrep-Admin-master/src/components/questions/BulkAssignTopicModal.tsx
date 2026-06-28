'use client';

import React, { useState, useEffect } from 'react';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import { useToast } from '@/contexts/ToastContext';
import type { TopicWithStats, SubtopicWithStats } from '@/types/subjects';
import { supabase } from '@/lib/supabase';

interface BulkAssignTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  questionIds: string[];
  subjectId: string;
}

export default function BulkAssignTopicModal({
  isOpen,
  onClose,
  onSuccess,
  questionIds,
  subjectId,
}: BulkAssignTopicModalProps) {
  const toast = useToast();
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [selectedSubtopic, setSelectedSubtopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);

  useEffect(() => {
    if (isOpen && subjectId) {
      loadTopics();
    }
  }, [isOpen, subjectId]);

  // Load subtopics when selected topic changes
  useEffect(() => {
    if (selectedTopic) {
      const topic = topics.find((t) => t.id === selectedTopic);
      if (topic) {
        loadSubtopicsForTopic(topic.id);
      } else {
        setSubtopics([]);
        setSelectedSubtopic('');
      }
    } else {
      setSubtopics([]);
      setSelectedSubtopic('');
    }
  }, [selectedTopic, topics]);

  const loadTopics = async () => {
    setLoadingTopics(true);
    try {
      const result = await topicService.getTopicsBySubject(subjectId);
      if (result.success && result.data) {
        setTopics(result.data);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
      toast.error('Failed to load topics');
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadSubtopicsForTopic = async (topicId: string) => {
    setLoadingSubtopics(true);
    setSelectedSubtopic('');
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

  const handleAssign = async () => {
    if (!selectedTopic) {
      toast.error('Please select a topic');
      return;
    }

    setLoading(true);
    try {
      const topic = topics.find(t => t.id === selectedTopic);
      if (!topic) {
        toast.error('Topic not found');
        return;
      }

      const { data, error } = await supabase
        .from('questions')
        .update({
          topic: topic.topic_name,
          subtopic_id: selectedSubtopic || null,
        })
        .in('id', questionIds)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('No questions were updated. Check permissions.');
        return;
      }

      const subtopic = subtopics.find((s) => s.id === selectedSubtopic);
      const assignedTo = subtopic
        ? `${topic.topic_name} › ${subtopic.subtopic_name}`
        : topic.topic_name;
      toast.success(`✅ ${data.length} question(s) assigned to ${assignedTo}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Bulk assign error:', error);
      toast.error(error.message || 'Failed to assign questions');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Assign Topic & Subtopic
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={loading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Assign <span className="font-semibold">{questionIds.length}</span> selected question(s) to a topic and optional subtopic
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              disabled={loadingTopics || loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">Choose a topic...</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.topic_name} ({topic.question_count} questions)
                </option>
              ))}
            </select>
          </div>

          {loadingTopics && (
            <p className="text-sm text-gray-500">Loading topics...</p>
          )}

          {/* Subtopic select — shown when a topic is selected and has subtopics */}
          {selectedTopic && !loadingSubtopics && subtopics.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subtopic <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <select
                value={selectedSubtopic}
                onChange={(e) => setSelectedSubtopic(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">No subtopic</option>
                {subtopics.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subtopic_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedTopic && loadingSubtopics && (
            <p className="text-sm text-gray-500">Loading subtopics...</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={loading || !selectedTopic}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Assigning...' : selectedSubtopic ? 'Assign Topic & Subtopic' : 'Assign to Topic'}
          </button>
        </div>
      </div>
    </div>
  );
}
