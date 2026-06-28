'use client';

import React, { useEffect, useState } from 'react';
import { Exam, TargetGroup, QuestionDistribution } from '@/types/exams';
import { Subject } from '@/types/questions';
import { questionService } from '@/services/questionService';
import { topicService } from '@/services/topicService';
import { examService } from '@/services/examService';
import { useToast } from '@/contexts/ToastContext';
import type { TopicWithStats } from '@/types/subjects';

interface AutoSelectModalProps {
  examId: string;
  exam: Exam;
  currentCount: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SubjectRow {
  subjectId: string;
  easy: string;
  medium: string;
  hard: string;
  showTopicConfig?: boolean;
  excludeTopics?: string[];
  minPerTopic?: string;
  maxPerTopic?: string;
  prioritizeTopics?: string[];
}

interface QuestionCounts {
  easy: number;
  medium: number;
  hard: number;
}

// Matches GROUP_SCORING in mobile app (src/types/mockExam.ts)
const GROUP_SUBJECTS: Record<TargetGroup, string[]> = {
  I: ['Mathematics', 'Physics', 'Chemistry'],
  II: ['Mathematics', 'Geography', 'History'],
  III: ['Azerbaijani Language', 'History', 'Literature'],
  IV: ['Biology', 'Chemistry', 'Physics'],
  V: ['Azerbaijani Language', 'Mathematics', 'Foreign Language'],
};

const getExamStageForExam = (exam: Exam): 'first' | 'second' => {
  return exam.exam_type === 'first_stage' ? 'first' : 'second';
};

export default function AutoSelectModal({
  examId,
  exam,
  currentCount,
  isOpen,
  onClose,
  onSuccess,
}: AutoSelectModalProps) {
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, TopicWithStats[]>>({});
  const [questionCounts, setQuestionCounts] = useState<Record<string, QuestionCounts>>({});
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq']);

  useEffect(() => {
    if (!isOpen) return;
    fetchSubjects();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || subjects.length === 0) return;
    initializeRows();
  }, [isOpen, subjects]);

  const fetchSubjects = async () => {
    try {
      const result = await questionService.getSubjects();
      if (result.success && result.data) {
        setSubjects(result.data);
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast.error('Failed to load subjects');
      }
    } catch (error: any) {
      console.error('Auto-select fetch subjects error:', error);
      toast.error('Failed to load subjects');
    }
  };

  const initializeRows = () => {
    // Start with empty rows - let user select subjects manually
    setRows([{ 
      subjectId: '', 
      easy: '', 
      medium: '', 
      hard: '',
      showTopicConfig: false,
      excludeTopics: [],
      minPerTopic: '',
      maxPerTopic: '',
      prioritizeTopics: [],
    }]);
  };

  const loadQuestionCounts = async (subjectId: string, types?: string[]) => {
    const effectiveTypes = types ?? questionTypes;
    if (effectiveTypes.length === 0) return; // No types selected — counts show 0 without a DB call
    const cacheKey = `${subjectId}|${[...effectiveTypes].sort().join(',')}`;
    if (questionCounts[cacheKey]) return;

    try {
      const result = await questionService.getQuestionCountsByDifficulty(subjectId, effectiveTypes);
      if (result.success && result.data) {
        setQuestionCounts(prev => ({ ...prev, [cacheKey]: result.data! }));
      }
    } catch (error) {
      console.error('Failed to load question counts:', error);
    }
  };

  // Reload counts for all selected subjects whenever questionTypes changes
  useEffect(() => {
    if (!isOpen) return;
    rows.forEach(row => {
      if (row.subjectId) {
        loadQuestionCounts(row.subjectId, questionTypes);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionTypes, isOpen]);

  if (!isOpen) return null;

  const parseCount = (value: string): number => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) || n < 0 ? 0 : n;
  };

  const loadTopicsForSubject = async (subjectId: string) => {
    if (topicsBySubject[subjectId]) return;
    try {
      const result = await topicService.getTopicsBySubject(subjectId);
      if (result.success && result.data) {
        setTopicsBySubject(prev => ({ ...prev, [subjectId]: result.data! }));
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const handleRowChange = (index: number, field: keyof SubjectRow, value: string | string[] | boolean) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };

    // Load topics and question counts when subject changes
    if (field === 'subjectId' && typeof value === 'string' && value) {
      loadTopicsForSubject(value);
      loadQuestionCounts(value, questionTypes);
    }

    setRows(updated);
  };

  // Validation helper to check if requested count exceeds available
  const getValidationError = (row: SubjectRow, difficulty: 'easy' | 'medium' | 'hard'): string | null => {
    if (!row.subjectId) return null;
    if (questionTypes.length === 0) return null;
    const cacheKey = `${row.subjectId}|${[...questionTypes].sort().join(',')}`;
    if (!questionCounts[cacheKey]) return null;

    const requested = parseCount(row[difficulty]);
    const available = questionCounts[cacheKey][difficulty];

    if (requested > available) {
      return `Only ${available} available`;
    }
    return null;
  };

  const toggleTopicConfig = (index: number) => {
    const updated = [...rows];
    updated[index].showTopicConfig = !updated[index].showTopicConfig;

    // Load topics if showing config
    if (updated[index].showTopicConfig && updated[index].subjectId) {
      loadTopicsForSubject(updated[index].subjectId);
    }

    setRows(updated);
  };

  const handleAddRow = () => {
    setRows([...rows, { 
      subjectId: '', 
      easy: '', 
      medium: '', 
      hard: '',
      showTopicConfig: false,
      excludeTopics: [],
      minPerTopic: '',
      maxPerTopic: '',
      prioritizeTopics: [],
    }]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = [...rows];
    updated.splice(index, 1);
    setRows(updated);
  };

  const totalPlanned = rows.reduce((sum, row) => {
    return sum + parseCount(row.easy) + parseCount(row.medium) + parseCount(row.hard);
  }, 0);

  const getCountsForRow = (row: SubjectRow): QuestionCounts | undefined => {
    if (!row.subjectId) return undefined;
    if (questionTypes.length === 0) return { easy: 0, medium: 0, hard: 0 };
    const cacheKey = `${row.subjectId}|${[...questionTypes].sort().join(',')}`;
    return questionCounts[cacheKey];
  };

  const handleApply = async () => {
    const distribution: QuestionDistribution = {};
    const topicConfig: Record<string, any> = {};
    let requested = 0;

    rows.forEach((row) => {
      if (!row.subjectId) return;
      const subject = subjects.find((s) => s.id === row.subjectId);
      if (!subject) return;

      const easy = parseCount(row.easy);
      const medium = parseCount(row.medium);
      const hard = parseCount(row.hard);
      const rowTotal = easy + medium + hard;
      if (rowTotal === 0) return;

      distribution[subject.name_en] = { easy, medium, hard };
      requested += rowTotal;

      // Add topic configuration if any
      if (row.showTopicConfig) {
        const config: any = {};
        if (row.excludeTopics && row.excludeTopics.length > 0) {
          config.exclude = row.excludeTopics;
        }
        if (row.minPerTopic && parseCount(row.minPerTopic) > 0) {
          config.min_per_topic = parseCount(row.minPerTopic);
        }
        if (row.maxPerTopic && parseCount(row.maxPerTopic) > 0) {
          config.max_per_topic = parseCount(row.maxPerTopic);
        }
        if (row.prioritizeTopics && row.prioritizeTopics.length > 0) {
          config.prioritize = row.prioritizeTopics;
        }
        
        if (Object.keys(config).length > 0) {
          topicConfig[subject.name_en] = config;
        }
      }
    });

    if (Object.keys(distribution).length === 0 || requested === 0) {
      toast.error('Configure at least one subject with a positive question count');
      return;
    }

    if (questionTypes.length === 0) {
      toast.error('Select at least one question type to include');
      return;
    }

    if (requested > exam.total_questions) {
      toast.error(
        `Requested ${requested} questions but exam capacity is ${exam.total_questions} questions`
      );
      return;
    }

    // Check for validation errors (requested exceeds available)
    const validationErrors: string[] = [];
    rows.forEach((row) => {
      if (!row.subjectId) return;
      const subject = subjects.find((s) => s.id === row.subjectId);
      if (!subject) return;
      
      const counts = questionCounts[`${row.subjectId}|${[...questionTypes].sort().join(',')}`];
      if (!counts) return;
      
      const easyReq = parseCount(row.easy);
      const mediumReq = parseCount(row.medium);
      const hardReq = parseCount(row.hard);
      
      if (easyReq > counts.easy) {
        validationErrors.push(`${subject.name_en}: Requested ${easyReq} easy questions but only ${counts.easy} available`);
      }
      if (mediumReq > counts.medium) {
        validationErrors.push(`${subject.name_en}: Requested ${mediumReq} medium questions but only ${counts.medium} available`);
      }
      if (hardReq > counts.hard) {
        validationErrors.push(`${subject.name_en}: Requested ${hardReq} hard questions but only ${counts.hard} available`);
      }
    });

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]); // Show first error
      return;
    }

    setLoading(true);
    try {
      const stage = getExamStageForExam(exam);
      const hasTopicConfig = Object.keys(topicConfig).length > 0;
      const result = await examService.autoSelectQuestions(
        examId,
        distribution,
        stage,
        hasTopicConfig ? topicConfig : undefined,
        questionTypes
      );
      if (!result.success) {
        toast.error(result.error || 'Failed to auto-select questions');
        return;
      }
      onSuccess();
    } catch (error: any) {
      console.error('Auto-select questions error:', error);
      toast.error('Failed to auto-select questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Auto-select Questions</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose which question types to include, configure counts per subject and difficulty.
              Written open (Question Groups) must be added separately via "Add Questions Manually".
            </p>
          </div>
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

        <div className="px-6 py-4 flex-1 overflow-auto">
          <div className="mb-4 text-sm text-gray-700">
            Exam total questions: <span className="font-semibold">{exam.total_questions}</span> ·
            Currently in exam: <span className="font-semibold">{currentCount}</span> ·
            <span className="font-semibold text-amber-700">Auto-select replaces existing questions of the selected types. Written open groups are always preserved.</span>
          </div>

          {/* Question type selector */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Question types to auto-select:</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={questionTypes.includes('mcq')}
                  onChange={(e) => {
                    setQuestionTypes(prev =>
                      e.target.checked ? [...prev, 'mcq'] : prev.filter(t => t !== 'mcq')
                    );
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">📝 MCQ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={questionTypes.includes('codable_open')}
                  onChange={(e) => {
                    setQuestionTypes(prev =>
                      e.target.checked ? [...prev, 'codable_open'] : prev.filter(t => t !== 'codable_open')
                    );
                  }}
                  className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm text-gray-700">💻 Short Answer</span>
              </label>
              <span className="text-sm text-gray-400 flex items-center">
                📋 Question Group — add manually
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {rows.map((row, index) => {
              const subjectTopics = row.subjectId ? topicsBySubject[row.subjectId] || [] : [];
              
              return (
                <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-3">
                  {/* Main row */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                        <select
                          value={row.subjectId}
                          onChange={(e) => handleRowChange(index, 'subjectId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select subject</option>
                          {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name_en}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Easy
                          {row.subjectId && getCountsForRow(row) && (
                            <span className="text-xs text-gray-500 ml-1">
                              (max: {getCountsForRow(row)!.easy})
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.easy}
                          onChange={(e) => handleRowChange(index, 'easy', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            getValidationError(row, 'easy') ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                        {getValidationError(row, 'easy') && (
                          <p className="text-xs text-red-600 mt-1">{getValidationError(row, 'easy')}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Medium
                          {row.subjectId && getCountsForRow(row) && (
                            <span className="text-xs text-gray-500 ml-1">
                              (max: {getCountsForRow(row)!.medium})
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.medium}
                          onChange={(e) => handleRowChange(index, 'medium', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            getValidationError(row, 'medium') ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                        {getValidationError(row, 'medium') && (
                          <p className="text-xs text-red-600 mt-1">{getValidationError(row, 'medium')}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Hard
                          {row.subjectId && getCountsForRow(row) && (
                            <span className="text-xs text-gray-500 ml-1">
                              (max: {getCountsForRow(row)!.hard})
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.hard}
                          onChange={(e) => handleRowChange(index, 'hard', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            getValidationError(row, 'hard') ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                        {getValidationError(row, 'hard') && (
                          <p className="text-xs text-red-600 mt-1">{getValidationError(row, 'hard')}</p>
                        )}
                      </div>
                    </div>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        className="px-2 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        disabled={loading}
                        title="Remove row"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Topic weighting toggle */}
                  {row.subjectId && subjectTopics.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleTopicConfig(index)}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        disabled={loading}
                      >
                        {row.showTopicConfig ? '▼' : '▶'} Topic Weighting (Advanced)
                      </button>
                    </div>
                  )}

                  {/* Topic weighting config */}
                  {row.showTopicConfig && subjectTopics.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                      <p className="text-xs text-gray-600">
                        Control how questions are distributed across topics
                      </p>
                      
                      {/* Min/Max per topic */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Min per topic
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={row.minPerTopic || ''}
                            onChange={(e) => handleRowChange(index, 'minPerTopic', e.target.value)}
                            placeholder="Optional"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Max per topic
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={row.maxPerTopic || ''}
                            onChange={(e) => handleRowChange(index, 'maxPerTopic', e.target.value)}
                            placeholder="Optional"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Exclude topics */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Exclude topics
                        </label>
                        <div className="max-h-32 overflow-y-auto border border-gray-300 rounded p-2 space-y-1">
                          {subjectTopics.map((topic) => (
                            <label key={topic.id} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(row.excludeTopics || []).includes(topic.topic_name)}
                                onChange={(e) => {
                                  const current = row.excludeTopics || [];
                                  const updated = e.target.checked
                                    ? [...current, topic.topic_name]
                                    : current.filter(t => t !== topic.topic_name);
                                  handleRowChange(index, 'excludeTopics', updated);
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">
                                {topic.topic_name} <span className="text-gray-500">({topic.question_count})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Prioritize topics */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Prioritize topics
                        </label>
                        <div className="max-h-32 overflow-y-auto border border-gray-300 rounded p-2 space-y-1">
                          {subjectTopics.map((topic) => (
                            <label key={topic.id} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(row.prioritizeTopics || []).includes(topic.topic_name)}
                                onChange={(e) => {
                                  const current = row.prioritizeTopics || [];
                                  const updated = e.target.checked
                                    ? [...current, topic.topic_name]
                                    : current.filter(t => t !== topic.topic_name);
                                  handleRowChange(index, 'prioritizeTopics', updated);
                                }}
                                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm text-gray-700">
                                {topic.topic_name} <span className="text-gray-500">({topic.question_count})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-700">
            <button
              type="button"
              onClick={handleAddRow}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Add subject row
            </button>
            <div>
              Planned total questions: <span className="font-semibold">{totalPlanned}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end bg-white gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Selecting...' : 'Apply Auto-select'}
          </button>
        </div>
      </div>
    </div>
  );
}
