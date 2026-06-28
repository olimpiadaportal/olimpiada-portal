'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import { questionService } from '@/services/questionService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { Question, QuestionStatistics, Subject, QuestionDifficulty, QuestionType } from '@/types/questions';
import BulkUploadModal from '@/components/questions/BulkUploadModal';
import BulkAssignTopicModal from '@/components/questions/BulkAssignTopicModal';
import QuestionFilters from '@/components/questions/QuestionFilters';
import AdvancedFilters from '@/components/questions/AdvancedFilters';
import QuestionTable from '@/components/questions/QuestionTable';
import EditQuestionModal from '@/components/questions/EditQuestionModal';
import AddQuestionModal from '@/components/questions/AddQuestionModal';
import DeleteQuestionModal from '@/components/questions/DeleteQuestionModal';

export default function QuestionsPage() {
  const router = useRouter();
  const toast = useToast();
  const { canEditUsers, canDeleteUsers, isModerator } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [statistics, setStatistics] = useState<QuestionStatistics | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [subtopicFilter, setSubtopicFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | undefined>(undefined);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [useAdvancedFilters, setUseAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string>('');
  const [deleteTargetIsGroup, setDeleteTargetIsGroup] = useState(false);
  const [deleteTargetText, setDeleteTargetText] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const latestQuestionsRequestRef = useRef(0);
  const normalizedSearchText = searchText.trim();
  const isWaitingForSearchDebounce =
    !useAdvancedFilters && normalizedSearchText !== debouncedSearchText;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchQuestions();
    }
  }, [selectedSubject, topicFilter, subtopicFilter, debouncedSearchText, difficultyFilter, typeFilter]);

  useEffect(() => {
    const normalizedSearch = searchText.trim();
    const delayMs = normalizedSearch ? 350 : 0;
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(normalizedSearch);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  useEffect(() => {
    if (!loading && useAdvancedFilters && advancedFilters) {
      fetchQuestions();
    }
  }, [advancedFilters]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchSubjects(), fetchStatistics(), fetchQuestions()]);
    setLoading(false);
  };

  // Reset subtopic when topic changes so stale subtopic selections don't persist
  const handleTopicChange = (value: string) => {
    setTopicFilter(value);
    setSubtopicFilter('');
  };

  const fetchSubjects = async () => {
    const result = await questionService.getSubjects();
    if (result.success && result.data) {
      setSubjects(result.data);
    }
  };

  const fetchStatistics = async () => {
    const result = await questionService.getQuestionStatistics();
    if (result.success && result.data) {
      setStatistics(result.data);
    }
  };

  const fetchQuestions = async () => {
    const requestId = ++latestQuestionsRequestRef.current;
    setQuestionsLoading(true);

    try {
      let filteredQuestions: Question[] = [];
      let success = true;
      let errorMsg = '';
      
      // Use advanced filters if enabled
      if (useAdvancedFilters && advancedFilters) {
        const result = await questionService.searchAllQuestions({
          search_text: advancedFilters.searchText || undefined,
          limit: 100000,
        });

        success = result.success;
        errorMsg = result.error || '';

        if (result.success && result.data) {
          filteredQuestions = result.data;
          
          // Apply multi-select filters
          if (advancedFilters.subjects.length > 0) {
            filteredQuestions = filteredQuestions.filter(q => 
              advancedFilters.subjects.includes(q.subject_id)
            );
          }
          
          if (advancedFilters.topics.length > 0) {
            filteredQuestions = filteredQuestions.filter(q =>
              advancedFilters.topics.includes(q.topic)
            );
          }

          if (advancedFilters.subtopics?.length > 0) {
            filteredQuestions = filteredQuestions.filter(q =>
              q.subtopic_id && advancedFilters.subtopics.includes(q.subtopic_id)
            );
          }
          
          if (advancedFilters.difficulties.length > 0) {
            filteredQuestions = filteredQuestions.filter(q => 
              advancedFilters.difficulties.includes(q.difficulty)
            );
          }
          
          if (advancedFilters.status !== 'all') {
            const isActive = advancedFilters.status === 'active';
            filteredQuestions = filteredQuestions.filter(q => q.is_active === isActive);
          }
        }
      } else {
        // Use simple filters - batch fetch all questions to bypass Supabase 1000 row limit
        const result = await questionService.searchAllQuestions({
          subject_id: selectedSubject || undefined,
          search_text: debouncedSearchText || undefined,
          difficulty: (difficultyFilter as QuestionDifficulty) || undefined,
          limit: 100000,
        });

        success = result.success;
        errorMsg = result.error || '';

        if (result.success && result.data) {
          filteredQuestions = result.data;
          
          // Client-side topic filtering
          if (topicFilter) {
            if (topicFilter === '__unassigned__') {
              filteredQuestions = filteredQuestions.filter(q => !q.topic || q.topic === '');
            } else {
              filteredQuestions = filteredQuestions.filter(q => q.topic === topicFilter);
            }
          }

          // Client-side subtopic filtering
          if (subtopicFilter) {
            filteredQuestions = filteredQuestions.filter(q => q.subtopic_id === subtopicFilter);
          }

          // Client-side type filtering
          if (typeFilter) {
            filteredQuestions = filteredQuestions.filter(q => q.question_type === typeFilter);
          }
        }
      }
        
      if (requestId !== latestQuestionsRequestRef.current) {
        return;
      }

      setQuestions(filteredQuestions);
      
      if (!success) {
        console.error('Failed to fetch questions:', errorMsg);
        toast.error(`Failed to load questions: ${errorMsg || 'Unknown error'}`);
      }
    } catch (error) {
      if (requestId !== latestQuestionsRequestRef.current) {
        return;
      }

      console.error('Exception fetching questions:', error);
      toast.error('An error occurred while loading questions. Check console for details.');
    } finally {
      if (requestId === latestQuestionsRequestRef.current) {
        setQuestionsLoading(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuestions.size === 0) {
      toast.error('No questions selected');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedQuestions.size} questions?`)) {
      return;
    }

    const questionIds = Array.from(selectedQuestions);
    const result = await questionService.bulkDeleteQuestions(questionIds);
    
    if (result.success) {
      // Log the bulk delete action
      await auditLogService.logAction({
        actionType: AuditActionTypes.QUESTION_DELETE,
        tableName: 'questions',
        description: `Bulk deleted ${result.data?.deleted_count || 0} questions`,
        metadata: { question_ids: questionIds, count: result.data?.deleted_count }
      });
      
      toast.success(`Deleted ${result.data?.deleted_count || 0} questions`);
      setSelectedQuestions(new Set());
      fetchData();
    } else {
      toast.error(result.error || 'Failed to delete questions');
    }
  };

  const handleBulkActivate = async () => {
    if (selectedQuestions.size === 0) {
      toast.error('No questions selected');
      return;
    }

    try {
      let successCount = 0;
      for (const questionId of selectedQuestions) {
        const result = await questionService.toggleQuestionStatus(questionId, true);
        if (result.success) successCount++;
      }

      toast.success(`Activated ${successCount} question(s)`);
      setSelectedQuestions(new Set());
      fetchQuestions();
    } catch (error) {
      toast.error('Failed to activate questions');
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedQuestions.size === 0) {
      toast.error('No questions selected');
      return;
    }

    try {
      let successCount = 0;
      for (const questionId of selectedQuestions) {
        const result = await questionService.toggleQuestionStatus(questionId, false);
        if (result.success) successCount++;
      }

      toast.success(`Deactivated ${successCount} question(s)`);
      setSelectedQuestions(new Set());
      fetchQuestions();
    } catch (error) {
      toast.error('Failed to deactivate questions');
    }
  };

  const handleExport = async () => {
    const data = await questionService.exportQuestions({
      subject_id: selectedSubject || undefined,
      difficulty: (difficultyFilter as QuestionDifficulty) || undefined,
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questions-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Questions exported successfully');
  };

  const handleToggleStatus = async (questionId: string, isActive: boolean) => {
    const result = await questionService.toggleQuestionStatus(questionId, !isActive);
    
    if (result.success) {
      toast.success(`Question ${!isActive ? 'activated' : 'deactivated'}`);
      fetchQuestions();
    } else {
      toast.error(result.error || 'Failed to update question status');
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      if (deleteTargetIsGroup) {
        // Delete question group
        const { questionGroupService } = await import('@/services/questionGroupService');
        const result = await questionGroupService.deleteQuestionGroup(deleteTargetId);
        
        if (result.success) {
          await auditLogService.logAction({
            actionType: AuditActionTypes.QUESTION_DELETE,
            tableName: 'question_groups',
            recordId: deleteTargetId,
            description: 'Deleted question group (Situasiya)'
          });
          
          toast.success('Question group deleted successfully');
          setShowDeleteModal(false);
          await fetchData();
        } else {
          toast.error(result.error || 'Failed to delete question group');
        }
      } else {
        // Delete single question
        const questionToDelete = questions.find(q => q.id === deleteTargetId);
        const result = await questionService.deleteQuestion(deleteTargetId);
        
        if (result.success) {
          await auditLogService.logAction({
            actionType: AuditActionTypes.QUESTION_DELETE,
            tableName: 'questions',
            recordId: deleteTargetId,
            oldValues: questionToDelete ? { 
              question_text: questionToDelete.question_text?.substring(0, 100),
              subject_id: questionToDelete.subject_id 
            } : undefined,
            description: 'Deleted single question'
          });
          
          toast.success('Question deleted successfully');
          setShowDeleteModal(false);
          await fetchData();
        } else {
          toast.error(result.error || 'Failed to delete question');
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('An error occurred while deleting');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Question Bank</h1>
        <p className="text-gray-600 mt-2">
          Manage exam questions with bulk operations and advanced filtering
        </p>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total Questions</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {statistics.total_questions.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Active</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {statistics.active_questions.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Easy</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {statistics.by_difficulty.easy.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Medium</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              {statistics.by_difficulty.medium.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Hard</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {statistics.by_difficulty.hard.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can view questions but cannot add, edit, or delete them.
          </p>
        </div>
      )}

      {/* Actions Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3">
            {canEditUsers && (
              <>
                <button onClick={() => setShowAddQuestion(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  ➕ Add Question
                </button>
                <button onClick={() => setShowBulkUpload(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  📤 Bulk Upload
                </button>
              </>
            )}
            <button onClick={handleExport} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              📥 Export JSON
            </button>
          </div>
          {selectedQuestions.size > 0 && canEditUsers && (
            <div className="flex gap-3 items-center relative">
              <span className="text-sm text-gray-600">
                {selectedQuestions.size} selected
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
                >
                  Bulk Actions
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showBulkActions && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                    <button
                      onClick={() => {
                        setShowBulkAssign(true);
                        setShowBulkActions(false);
                      }}
                      disabled={!selectedSubject}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      📌 Assign to Topic
                    </button>
                    <button
                      onClick={() => {
                        handleBulkActivate();
                        setShowBulkActions(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50"
                    >
                      ✅ Activate
                    </button>
                    <button
                      onClick={() => {
                        handleBulkDeactivate();
                        setShowBulkActions(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50"
                    >
                      ❌ Deactivate
                    </button>
                    {canDeleteUsers && (
                      <button
                        onClick={() => {
                          handleBulkDelete();
                          setShowBulkActions(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Toggle */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            setUseAdvancedFilters(!useAdvancedFilters);
            if (useAdvancedFilters) {
              // Reset advanced filters when switching back
              setAdvancedFilters(null);
            }
          }}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          {useAdvancedFilters ? '📊 Switch to Simple Filters' : '🔍 Switch to Advanced Filters'}
        </button>
        {useAdvancedFilters && advancedFilters && (
          <span className="text-sm text-gray-600">
            {advancedFilters.subjects.length + advancedFilters.topics.length + advancedFilters.difficulties.length} active filters
          </span>
        )}
      </div>

      {/* Filters */}
      {useAdvancedFilters ? (
        <AdvancedFilters
          subjects={subjects}
          onFilterChange={(filters) => {
            setAdvancedFilters(filters);
          }}
        />
      ) : (
        <QuestionFilters
          subjects={subjects}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          topicFilter={topicFilter}
          onTopicChange={handleTopicChange}
          subtopicFilter={subtopicFilter}
          onSubtopicChange={setSubtopicFilter}
          searchText={searchText}
          onSearchChange={setSearchText}
          difficultyFilter={difficultyFilter}
          onDifficultyChange={setDifficultyFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
        />
      )}

      {(isWaitingForSearchDebounce || questionsLoading) && (
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {isWaitingForSearchDebounce
            ? 'Waiting for typing to pause before searching...'
            : 'Searching question bank...'}
        </div>
      )}

      {/* Questions Table */}
      <QuestionTable
        questions={questions}
        selectedQuestions={selectedQuestions}
        onSelectionChange={setSelectedQuestions}
        onToggleStatus={handleToggleStatus}
        canEdit={canEditUsers}
        canDelete={canDeleteUsers}
        onEdit={(id: string) => {
          if (!canEditUsers) {
            toast.error('Permission denied: You do not have permission to edit questions.');
            return;
          }
          
          setEditingQuestionId(id);
          setShowEditModal(true);
        }}
        onDelete={(id: string) => {
          if (!canDeleteUsers) {
            toast.error('Permission denied: You do not have permission to delete questions.');
            return;
          }
          
          // Check if this is a group_id (question groups) or question_id
          const isGroup = questions.some(q => q.group_id === id);
          const questionToDelete = questions.find(q => q.id === id);
          
          // Set delete modal state
          setDeleteTargetId(id);
          setDeleteTargetIsGroup(isGroup);
          setDeleteTargetText(questionToDelete?.question_text || '');
          setShowDeleteModal(true);
        }}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={async (uploadedCount?: number) => {
          // Log the bulk import action
          await auditLogService.logAction({
            actionType: AuditActionTypes.QUESTION_BULK_IMPORT,
            tableName: 'questions',
            description: `Bulk imported ${uploadedCount || 'multiple'} questions`,
            metadata: { count: uploadedCount }
          });
          
          setShowBulkUpload(false);
          fetchData();
        }}
        subjects={subjects}
      />

      {/* Bulk Assign Topic Modal */}
      <BulkAssignTopicModal
        isOpen={showBulkAssign}
        onClose={() => setShowBulkAssign(false)}
        onSuccess={() => {
          setShowBulkAssign(false);
          setSelectedQuestions(new Set());
          fetchQuestions();
        }}
        questionIds={Array.from(selectedQuestions)}
        subjectId={selectedSubject}
      />

      {/* Add Question Modal */}
      <AddQuestionModal
        isOpen={showAddQuestion}
        onClose={() => setShowAddQuestion(false)}
        onSuccess={async () => {
          await auditLogService.logAction({
            actionType: AuditActionTypes.QUESTION_CREATE,
            tableName: 'questions',
            description: 'Created new question manually',
          });
          setShowAddQuestion(false);
          await fetchData(); // Refresh everything
        }}
        subjects={subjects}
        preSelectedSubjectId={selectedSubject}
      />

      {/* Edit Question Modal */}
      <EditQuestionModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingQuestionId(undefined);
        }}
        onSuccess={async () => {
          setShowEditModal(false);
          setEditingQuestionId(undefined);
          await fetchData(); // Refresh everything
        }}
        questionId={editingQuestionId}
        subjectId={selectedSubject || subjects[0]?.id || ''}
      />

      {/* Delete Question Modal */}
      <DeleteQuestionModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteTargetId('');
          setDeleteTargetIsGroup(false);
          setDeleteTargetText('');
        }}
        onConfirm={handleConfirmDelete}
        isGroup={deleteTargetIsGroup}
        questionText={deleteTargetText}
        loading={deleting}
      />
    </div>
  );
}
