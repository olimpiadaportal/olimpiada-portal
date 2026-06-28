'use client';

import { useState, useEffect } from 'react';
import { questionService } from '@/services/questionService';
import type { Question } from '@/types/questions';

interface AddQuestionsToTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (questionIds: string[]) => Promise<void>;
  subjectId: string;
  topicName: string;
  currentTopicName: string;
}

export function AddQuestionsToTopicModal({
  isOpen,
  onClose,
  onSubmit,
  subjectId,
  topicName,
  currentTopicName,
}: AddQuestionsToTopicModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'unassigned' | 'other' | 'all'>('unassigned');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>('');

  // Get unique topics from loaded questions
  const availableTopics = [...new Set(questions.map(q => q.topic).filter(Boolean))];

  // Load questions when modal opens or filter changes
  useEffect(() => {
    if (isOpen && subjectId) {
      loadQuestions();
      setSelectedQuestions(new Set()); // Clear selection when reloading
    }
  }, [isOpen, subjectId, filterType]);

  const loadQuestions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load questions based on filter type - use batch fetch to get all questions
      let searchParams: any = {
        limit: 100000,
      };

      if (filterType === 'unassigned' || filterType === 'all') {
        // For unassigned and all, only search within current subject
        searchParams.subject_id = subjectId;
      }
      // For 'other', don't filter by subject - get all questions

      const result = await questionService.searchAllQuestions(searchParams);

      if (result.success && result.data) {
        // Filter based on filterType
        let filtered = result.data;
        
        if (filterType === 'unassigned') {
          // Only questions without topic from THIS subject
          filtered = filtered.filter((q: Question) => 
            q.subject_id === subjectId && (!q.topic || q.topic === '')
          );
        } else if (filterType === 'other') {
          // Questions from OTHER subjects (unassigned or with different topics)
          filtered = filtered.filter((q: Question) => 
            q.subject_id !== subjectId && (!q.topic || q.topic !== currentTopicName)
          );
        }
        // 'all' shows questions already assigned to THIS topic
        else {
          filtered = filtered.filter((q: Question) => 
            q.subject_id === subjectId && q.topic === currentTopicName
          );
        }

        setQuestions(filtered);
      } else {
        setError(result.error || 'Failed to load questions');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle select/deselect
  const toggleQuestion = (questionId: string) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionId)) {
      newSelected.delete(questionId);
    } else {
      newSelected.add(questionId);
    }
    setSelectedQuestions(newSelected);
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectedQuestions.size === filteredQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (selectedQuestions.size === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(Array.from(selectedQuestions));
      setSelectedQuestions(new Set());
      // Wait for parent to update, then reload with fresh data
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadQuestions();
      // Don't close modal - let user assign more if needed
      // User can click Cancel to close
    } catch (err: any) {
      setError(err.message || 'Failed to assign questions');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter questions by search, topic, difficulty, and question type
  const filteredQuestions = questions.filter(q => {
    // Search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      let matchesSearch = q.question_text.toLowerCase().includes(search);
      
      // For MCQ questions, also search in options
      if (q.question_type === 'mcq') {
        matchesSearch = matchesSearch ||
          (q.option_a?.toLowerCase().includes(search) || false) ||
          (q.option_b?.toLowerCase().includes(search) || false) ||
          (q.option_c?.toLowerCase().includes(search) || false) ||
          (q.option_d?.toLowerCase().includes(search) || false);
      }
      
      if (!matchesSearch) return false;
    }
    
    // Topic filter
    if (topicFilter) {
      if (topicFilter === '__unassigned__') {
        if (q.topic && q.topic.trim() !== '') return false;
      } else {
        if (q.topic !== topicFilter) return false;
      }
    }
    
    // Difficulty filter
    if (difficultyFilter && q.difficulty !== difficultyFilter) {
      return false;
    }
    
    // Question type filter
    if (questionTypeFilter && q.question_type !== questionTypeFilter) {
      return false;
    }
    
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Add Questions to Topic</h2>
              <p className="mt-1 text-sm text-gray-600">
                Assign questions to <span className="font-semibold">{topicName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col gap-3">
            {/* Row 1: Search and Source Filter */}
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'unassigned' | 'all')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="unassigned">Unassigned (This Subject)</option>
                <option value="other">Other Subjects</option>
                <option value="all">All (This Subject)</option>
              </select>
            </div>
            
            {/* Row 2: Topic, Difficulty, and Question Type Filters */}
            <div className="flex gap-3">
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Topics</option>
                <option value="__unassigned__">📌 Unassigned Only</option>
                {availableTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    📚 {topic}
                  </option>
                ))}
              </select>
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Difficulties</option>
                <option value="easy">🟢 Easy</option>
                <option value="medium">🟡 Medium</option>
                <option value="hard">🔴 Hard</option>
              </select>
              <select
                value={questionTypeFilter}
                onChange={(e) => setQuestionTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Types</option>
                <option value="mcq">📝 MCQ</option>
                <option value="codable_open">💻 Short Answer</option>
                <option value="written_open">📋 Question Group</option>
              </select>
              {(topicFilter || difficultyFilter || questionTypeFilter) && (
                <button
                  onClick={() => {
                    setTopicFilter('');
                    setDifficultyFilter('');
                    setQuestionTypeFilter('');
                  }}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No questions available</h3>
              <p className="text-gray-500">
                {filterType === 'unassigned' 
                  ? 'All questions are already assigned to topics'
                  : 'No questions match your search criteria'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.size === filteredQuestions.length && filteredQuestions.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({filteredQuestions.length})
                  </span>
                </label>
                <span className="text-sm text-gray-600">
                  {selectedQuestions.size} selected
                </span>
              </div>

              {/* Question List */}
              {filteredQuestions.map((question) => (
                <label
                  key={question.id}
                  className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedQuestions.has(question.id)}
                    onChange={() => toggleQuestion(question.id)}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {question.question_text}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        question.question_type === 'mcq'
                          ? 'bg-blue-100 text-blue-800'
                          : question.question_type === 'codable_open'
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {question.question_type === 'mcq' ? '📝 MCQ' : question.question_type === 'codable_open' ? '💻 Short Answer' : '📋 Question Group'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        question.difficulty === 'easy'
                          ? 'bg-green-100 text-green-800'
                          : question.difficulty === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {question.difficulty}
                      </span>
                      {question.topic && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          📚 {question.topic}
                        </span>
                      )}
                      {!question.topic && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedQuestions.size === 0 || isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Assigning...
                </>
              ) : (
                <>
                  Assign {selectedQuestions.size} Question{selectedQuestions.size !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
