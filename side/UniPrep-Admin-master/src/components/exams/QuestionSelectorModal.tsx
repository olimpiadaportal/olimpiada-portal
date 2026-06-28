'use client';

import React, { useEffect, useState } from 'react';
import { Exam } from '@/types/exams';
import { Question, QuestionDifficulty, Subject, QuestionGroup } from '@/types/questions';
import { questionService } from '@/services/questionService';
import { examService } from '@/services/examService';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import { questionGroupService } from '@/services/questionGroupService';
import { useToast } from '@/contexts/ToastContext';
import type { TopicWithStats, SubtopicWithStats } from '@/types/subjects';

interface QuestionSelectorModalProps {
  examId: string;
  exam: Exam;
  existingQuestionIds: string[];
  currentCount: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type QuestionWithSubject = Question & { subject_name?: string };
type QuestionOrGroup = (QuestionWithSubject | (QuestionGroup & { subject_name?: string; isGroup: true }));

export default function QuestionSelectorModal({
  examId,
  exam,
  existingQuestionIds,
  currentCount,
  isOpen,
  onClose,
  onSuccess,
}: QuestionSelectorModalProps) {
  const toast = useToast();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [questions, setQuestions] = useState<QuestionOrGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [subtopicFilter, setSubtopicFilter] = useState<string>('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const remainingSlots = Math.max(exam.total_questions - currentCount, 0);

  // Actual question count for selected items (groups expand to 3 questions each)
  const actualSelectedCount = Array.from(selectedIds).reduce((sum, id) => {
    const item = questions.find(q => q.id === id);
    if (item && 'isGroup' in item && (item as any).isGroup) return sum + 3;
    return sum + 1;
  }, 0);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    fetchSubjects();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchQuestions();
  }, [isOpen, selectedSubject, topicFilter, subtopicFilter, difficultyFilter, questionTypeFilter, searchText, onlyActive]);

  useEffect(() => {
    if (selectedSubject) {
      fetchTopics();
    } else {
      setTopics([]);
      setTopicFilter('');
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (topicFilter && topicFilter !== '__unassigned__') {
      const topic = topics.find((t) => t.topic_name === topicFilter);
      if (topic) {
        fetchSubtopicsForTopic(topic.id);
      } else {
        setSubtopics([]);
        setSubtopicFilter('');
      }
    } else {
      setSubtopics([]);
      setSubtopicFilter('');
    }
  }, [topicFilter, topics]);

  const fetchSubjects = async () => {
    const result = await questionService.getSubjects();
    if (result.success && result.data) {
      setSubjects(result.data);
    }
  };

  const fetchTopics = async () => {
    if (!selectedSubject) return;
    const result = await topicService.getTopicsBySubject(selectedSubject);
    if (result.success && result.data) {
      setTopics(result.data);
    }
  };

  const fetchSubtopicsForTopic = async (topicId: string) => {
    setSubtopicFilter('');
    try {
      const result = await subtopicService.getSubtopicsByTopic(topicId);
      if (result.success && result.data) {
        setSubtopics(result.data.filter((s) => s.is_active));
      } else {
        setSubtopics([]);
      }
    } catch {
      setSubtopics([]);
    }
  };

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      
      // Fetch individual questions (MCQ and codable_open)
      const result = await questionService.searchQuestions({
        subject_id: selectedSubject || undefined,
        difficulty: (difficultyFilter as QuestionDifficulty) || undefined,
        search_text: searchText || undefined,
        is_active: onlyActive,
        limit: 200,
      });

      if (!result.success || !result.data) {
        setQuestions([]);
        if (result.error) {
          toast.error(result.error);
        }
        return;
      }

      // Filter out written_open individual questions (they should only appear as groups)
      let individualQuestions = (result.data as QuestionWithSubject[]).filter(
        (q) => !existingQuestionIds.includes(q.id) && q.question_type !== 'written_open'
      );
      
      // Fetch question groups (for written_open questions)
      const groupsResult = await questionGroupService.getQuestionGroups(
        selectedSubject || undefined,
        onlyActive
      );
      
      let groups: QuestionOrGroup[] = [];
      if (groupsResult.success && groupsResult.data) {
        groups = groupsResult.data
          .filter((g: QuestionGroup) => !existingQuestionIds.includes(g.id))
          .map((g: QuestionGroup) => ({
            ...g,
            isGroup: true as const,
            subject_name: subjects.find(s => s.id === g.subject_id)?.name_en
          }));
      }
      
      // Combine individual questions and groups
      let combined: QuestionOrGroup[] = [...individualQuestions, ...groups];
      
      // Client-side topic filtering
      if (topicFilter) {
        if (topicFilter === '__unassigned__') {
          combined = combined.filter(item => !item.topic || item.topic === '');
        } else {
          combined = combined.filter(item => item.topic === topicFilter);
        }
      }

      // Client-side subtopic filtering
      if (subtopicFilter) {
        combined = combined.filter((item) => {
          if ('isGroup' in item && item.isGroup) return false;
          return (item as Question).subtopic_id === subtopicFilter;
        });
      }

      // Client-side question type filtering
      if (questionTypeFilter) {
        if (questionTypeFilter === 'written_open') {
          // Only show groups
          combined = combined.filter(item => 'isGroup' in item && item.isGroup);
        } else {
          // Only show individual questions of this type
          combined = combined.filter(item => !('isGroup' in item) && (item as Question).question_type === questionTypeFilter);
        }
      }
      
      setQuestions(combined);
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error('Fetch questions for selector error:', error);
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one question');
      return;
    }

    if (remainingSlots <= 0) {
      toast.error('This exam already has the maximum number of questions');
      return;
    }

    if (actualSelectedCount > remainingSlots) {
      toast.error(
        `Adding these selections would use ${actualSelectedCount} question slots but only ${remainingSlots} remain. ` +
        `(Note: question groups count as 3 questions each.)`
      );
      return;
    }

    setSaving(true);
    try {
      const result = await examService.addQuestionsToExam(examId, Array.from(selectedIds));
      if (!result.success) {
        toast.error(result.error || 'Failed to add questions');
        return;
      }
      onSuccess();
    } catch (error: any) {
      console.error('Add questions to exam error:', error);
      toast.error('Failed to add questions');
    } finally {
      setSaving(false);
    }
  };

  const allSelected =
    questions.length > 0 && selectedIds.size === questions.length && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Select Questions</h2>
            <p className="text-sm text-gray-600 mt-1">
              Exam: <span className="font-medium">{exam.title}</span> · Remaining slots:{' '}
              <span className="font-medium">{remainingSlots}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={saving}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All subjects</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                disabled={!selectedSubject}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">All topics</option>
                <option value="__unassigned__">Unassigned</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.topic_name}>
                    {topic.topic_name} ({topic.question_count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtopic</label>
              <select
                value={subtopicFilter}
                onChange={(e) => setSubtopicFilter(e.target.value)}
                disabled={!topicFilter || topicFilter === '__unassigned__' || subtopics.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">All subtopics</option>
                {subtopics.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subtopic_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={questionTypeFilter}
                onChange={(e) => setQuestionTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All types</option>
                <option value="mcq">📝 MCQ</option>
                <option value="codable_open">💻 Short Answer</option>
                <option value="written_open">📋 Question Group</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search question text..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <label className="mt-2 inline-flex items-center text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                />
                Only active questions
              </label>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : questions.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No questions match the current filters</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={allSelected}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Difficulty
                  </th>
                                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {questions.map((item) => {
                  const isGroup = 'isGroup' in item && item.isGroup;
                  const q = item as QuestionWithSubject;
                  const group = item as QuestionGroup & { subject_name?: string; isGroup: true };
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleToggleOne(item.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {isGroup ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              📋 Question Group (3 questions)
                            </div>
                            <div className="text-xs text-gray-600 line-clamp-2">
                              {group.context_text}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-900 line-clamp-2 max-w-xl">
                            {q.question_text}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            isGroup
                              ? 'bg-indigo-100 text-indigo-800'
                              : q.question_type === 'mcq'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-cyan-100 text-cyan-800'
                          }`}
                        >
                          {isGroup ? '📋 Question Group' : q.question_type === 'mcq' ? '📝 MCQ' : '💻 Short'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.subject_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            item.difficulty === 'easy'
                              ? 'bg-green-100 text-green-800'
                              : item.difficulty === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {item.difficulty}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white">
          <div className="text-sm text-gray-600">
            Selected: <span className="font-semibold">{selectedIds.size}</span>
            {actualSelectedCount !== selectedIds.size && (
              <span className="text-amber-700 ml-1">({actualSelectedCount} actual questions)</span>
            )}
            {' '}· Remaining slots:{' '}
            <span className={`font-semibold ${actualSelectedCount > remainingSlots ? 'text-red-600' : ''}`}>
              {remainingSlots}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleAddSelected}
              disabled={saving || selectedIds.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Adding...' : 'Add Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
