'use client';

import React, { useState, useMemo } from 'react';
import { Question, QuestionType } from '@/types/questions';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface QuestionTableProps {
  questions: Question[];
  selectedQuestions: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onToggleStatus: (id: string, isActive: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export default function QuestionTable({
  questions,
  selectedQuestions,
  onSelectionChange,
  onToggleStatus,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: QuestionTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Calculate pagination
  const totalPages = Math.ceil(questions.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedQuestions = useMemo(() => 
    questions.slice(startIndex, endIndex), 
    [questions, startIndex, endIndex]
  );

  // Reset to page 1 when questions change (e.g., filter applied)
  React.useEffect(() => {
    setCurrentPage(1);
  }, [questions.length]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select questions on current page
      onSelectionChange(new Set(paginatedQuestions.map((q) => q.id)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedQuestions);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    onSelectionChange(newSelected);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getQuestionTypeBadge = (type: QuestionType) => {
    switch (type) {
      case 'mcq':
        return {
          label: 'MCQ',
          icon: '📝',
          className: 'bg-blue-100 text-blue-800',
        };
      case 'codable_open':
        return {
          label: 'Short Answer',
          icon: '✏️',
          className: 'bg-green-100 text-green-800',
        };
      case 'written_open':
        return {
          label: 'Question Group',
          icon: '📋',
          className: 'bg-purple-100 text-purple-800',
        };
      default:
        return {
          label: 'MCQ',
          icon: '📝',
          className: 'bg-gray-100 text-gray-800',
        };
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  // Group questions by group_id
  const groupedQuestions = useMemo(() => {
    const groups = new Map<string | null, Question[]>();
    paginatedQuestions.forEach(q => {
      const key = q.group_id || null;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(q);
    });
    return groups;
  }, [paginatedQuestions]);

  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <div className="text-gray-400 text-5xl mb-4">📝</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Questions Found</h3>
        <p className="text-gray-600">
          Try adjusting your filters or upload questions using the bulk upload feature.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={paginatedQuestions.length > 0 && paginatedQuestions.every(q => selectedQuestions.has(q.id))}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  title="Select all on this page"
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Answer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {Array.from(groupedQuestions.entries()).map(([groupId, groupQuestions]) => {
              if (groupId) {
                // This is a question group (Situasiya)
                const isExpanded = expandedGroups.has(groupId);
                const firstQuestion = groupQuestions[0];
                return (
                  <React.Fragment key={groupId}>
                    {/* Group Header Row */}
                    <tr className="bg-purple-50 hover:bg-purple-100">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={groupQuestions.every(q => selectedQuestions.has(q.id))}
                          onChange={(e) => {
                            const newSelected = new Set(selectedQuestions);
                            groupQuestions.forEach(q => {
                              if (e.target.checked) {
                                newSelected.add(q.id);
                              } else {
                                newSelected.delete(q.id);
                              }
                            });
                            onSelectionChange(newSelected);
                          }}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleGroupExpansion(groupId)}
                            className="text-purple-600 hover:text-purple-800 font-medium"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <div>
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-purple-600 text-white">
                              📚 SITUASIYA ({groupQuestions.length} questions)
                            </span>
                            {firstQuestion.topic && (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  📚 {firstQuestion.topic}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                          📄 Written Open
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">
                          {(firstQuestion as { subject_name?: string }).subject_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDifficultyColor(firstQuestion.difficulty)}`}>
                          {firstQuestion.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 italic">Manual grading</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onToggleStatus(groupId, firstQuestion.is_active)}
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            firstQuestion.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {firstQuestion.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={() => onEdit(groupId)}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                              title="Edit Group"
                            >
                              ✏️
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => onDelete(groupId)}
                              className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                              title="Delete Group"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Group Questions */}
                    {isExpanded && groupQuestions.sort((a, b) => (a.group_order || 0) - (b.group_order || 0)).map((question, idx) => (
                      <tr key={question.id} className="bg-purple-25 border-l-4 border-purple-300">
                        <td className="px-4 py-3 pl-12">
                          <span className="text-xs font-semibold text-purple-600">Q{idx + 1}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 line-clamp-2 max-w-md">
                            {question.question_text}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getQuestionTypeBadge(question.question_type).className}`}>
                            {getQuestionTypeBadge(question.question_type).icon} {getQuestionTypeBadge(question.question_type).label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {(firstQuestion as { subject_name?: string }).subject_name || 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDifficultyColor(firstQuestion.difficulty)}`}>
                            {firstQuestion.difficulty}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500 italic">Manual grading</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            question.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {question.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-gray-400">Part of group</span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              } else {
                // Regular standalone questions
                return groupQuestions.map((question) => (
              <tr key={question.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.has(question.id)}
                    onChange={(e) => handleSelectOne(question.id, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900 line-clamp-2 max-w-md">
                    {question.question_text}
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {question.topic && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        📚 {question.topic}
                      </span>
                    )}
                    {question.subtopic_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                        ↳ {question.subtopic_name}
                      </span>
                    )}
                    {!question.topic && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        No Topic
                      </span>
                    )}
                    {question.exclude_from_practice && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                        ⚠️ No Practice
                      </span>
                    )}
                    {question.tags && question.tags.length > 0 && (
                      <>
                        {question.tags.slice(0, 2).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const badge = getQuestionTypeBadge(question.question_type);
                    return (
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${badge.className}`}>
                        {badge.icon} {badge.label}
                      </span>
                    );
                  })()}
                  {question.question_type === 'written_open' && question.max_points && (
                    <div className="text-xs text-gray-500 mt-1">{question.max_points} pts</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">
                    {(question as { subject_name?: string }).subject_name || 'N/A'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDifficultyColor(
                      question.difficulty
                    )}`}
                  >
                    {question.difficulty}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {question.question_type === 'mcq' ? (
                    question.correct_answer ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-800 font-semibold rounded">
                        {question.correct_answer}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )
                  ) : question.question_type === 'codable_open' ? (
                    <div className="text-xs text-gray-600 max-w-[120px] truncate" title={question.correct_answer || question.expected_answer}>
                      {question.correct_answer || question.expected_answer || 'N/A'}
                    </div>
                  ) : question.question_type === 'written_open' ? (
                    <span className="text-xs text-gray-500 italic">Manual grading</span>
                  ) : (
                    <span className="text-xs text-gray-400">N/A</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleStatus(question.id, question.is_active)}
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      question.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {question.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(question.id);
                        }}
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(question.id);
                        }}
                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
                ));
              }
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: Showing info */}
          <div className="text-sm text-gray-700">
            Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
            <span className="font-semibold">{Math.min(endIndex, questions.length)}</span> of{' '}
            <span className="font-semibold">{questions.length}</span> questions
            {selectedQuestions.size > 0 && (
              <span className="ml-2 text-blue-600">
                ({selectedQuestions.size} selected)
              </span>
            )}
          </div>

          {/* Right: Page size selector and navigation */}
          <div className="flex items-center gap-4">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="pageSize" className="text-sm text-gray-600">
                Per page:
              </label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            {/* Page navigation - Google style */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {(() => {
                const pages: (number | string)[] = [];
                const maxVisible = 7; // Show max 7 page numbers
                
                if (totalPages <= maxVisible) {
                  // Show all pages if total is small
                  for (let i = 1; i <= totalPages; i++) {
                    pages.push(i);
                  }
                } else {
                  // Always show first page
                  pages.push(1);
                  
                  if (currentPage > 3) {
                    pages.push('...');
                  }
                  
                  // Show pages around current page
                  const start = Math.max(2, currentPage - 1);
                  const end = Math.min(totalPages - 1, currentPage + 1);
                  
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  
                  if (currentPage < totalPages - 2) {
                    pages.push('...');
                  }
                  
                  // Always show last page
                  pages.push(totalPages);
                }
                
                return pages.map((page, idx) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-gray-500">
                        ...
                      </span>
                    );
                  }
                  
                  const pageNum = page as number;
                  const isActive = pageNum === currentPage;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`min-w-[32px] px-2 py-1 text-sm rounded transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                });
              })()}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="p-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
