'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopicList } from '@/components/subjects/TopicList';
import { TopicFormModal } from '@/components/subjects/TopicFormModal';
import { DeleteTopicModal } from '@/components/subjects/DeleteTopicModal';
import { AddQuestionsToTopicModal } from '@/components/subjects/AddQuestionsToTopicModal';
import { TopicDependenciesModal } from '@/components/subjects/TopicDependenciesModal';
import { subjectService } from '@/services/subjectService';
import { topicService } from '@/services/topicService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import type { SubjectWithStats, TopicWithStats, CreateTopicParams, UpdateTopicParams, TopicOrder } from '@/types/subjects';

export default function TopicsPage() {
  const params = useParams();
  const router = useRouter();
  const subjectId = params.id as string;
  const { canEditContent, canDeleteContent, isModerator, loading: permissionsLoading } = usePermissions();

  const [subject, setSubject] = useState<SubjectWithStats | null>(null);
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddQuestionsModalOpen, setIsAddQuestionsModalOpen] = useState(false);
  const [isDependenciesModalOpen, setIsDependenciesModalOpen] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDependenciesModalOpen, setIsBulkDependenciesModalOpen] = useState(false);
  const [bulkDependenciesData, setBulkDependenciesData] = useState<{totalQuestions: number; topicCount: number}>({totalQuestions: 0, topicCount: 0});
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedTopic, setSelectedTopic] = useState<TopicWithStats | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load subject and topics
  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    // Load subject
    const subjectResult = await subjectService.getSubjectById(subjectId);
    if (subjectResult.success && subjectResult.data) {
      setSubject(subjectResult.data);
    } else {
      setError(subjectResult.error || 'Subject not found');
      setIsLoading(false);
      return;
    }

    // Load topics
    const topicsResult = await topicService.getTopicsBySubject(subjectId);
    if (topicsResult.success && topicsResult.data) {
      setTopics(topicsResult.data);
    } else {
      setError(topicsResult.error || 'Failed to load topics');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (subjectId) {
      loadData();
    }
  }, [subjectId]);

  // Show toast
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle create topic
  const handleCreate = () => {
    if (!canEditContent) {
      showToast('Permission denied: You do not have permission to create topics.', 'error');
      return;
    }
    setFormMode('create');
    setSelectedTopic(null);
    setIsFormModalOpen(true);
  };

  // Handle edit topic
  const handleEdit = (topic: TopicWithStats) => {
    if (!canEditContent) {
      showToast('Permission denied: You do not have permission to edit topics.', 'error');
      return;
    }
    setFormMode('edit');
    setSelectedTopic(topic);
    setIsFormModalOpen(true);
  };

  // Handle delete topic - check for dependencies first
  const handleDelete = async (topic: TopicWithStats) => {
    if (!canDeleteContent) {
      showToast('Permission denied: You do not have permission to delete topics.', 'error');
      return;
    }
    
    setSelectedTopic(topic);
    
    // Check if topic has questions
    const questionsResult = await topicService.getTopicQuestions(topic.id);
    if (questionsResult.success && questionsResult.data && questionsResult.data.length > 0) {
      // Topic has dependencies, show dependencies modal
      setIsDependenciesModalOpen(true);
    } else {
      // No dependencies, show simple confirmation
      setIsDeleteModalOpen(true);
    }
  };

  // Handle add questions to topic
  const handleAddQuestions = (topic: TopicWithStats) => {
    if (!canEditContent) {
      showToast('Permission denied: You do not have permission to assign questions.', 'error');
      return;
    }
    setSelectedTopic(topic);
    setIsAddQuestionsModalOpen(true);
  };

  // Handle toggle topic status
  const handleToggleStatus = async (topic: TopicWithStats) => {
    if (!canEditContent) {
      showToast('Permission denied: You do not have permission to change topic status.', 'error');
      return;
    }
    const result = await topicService.toggleTopicStatus(topic.id, !topic.is_active);
    if (result.success) {
      showToast(
        `Topic ${!topic.is_active ? 'activated' : 'deactivated'} successfully`,
        'success'
      );
      await loadData();
    } else {
      showToast(result.error || 'Failed to update topic status', 'error');
    }
  };

  // Submit form (create or edit)
  const handleFormSubmit = async (data: CreateTopicParams | UpdateTopicParams) => {
    if (formMode === 'create') {
      const result = await topicService.createTopic(data as CreateTopicParams);
      if (result.success) {
        showToast('Topic created successfully', 'success');
        await loadData();
      } else {
        throw new Error(result.error || 'Failed to create topic');
      }
    } else {
      const result = await topicService.updateTopic(data as UpdateTopicParams);
      if (result.success) {
        showToast('Topic updated successfully', 'success');
        await loadData();
      } else {
        throw new Error(result.error || 'Failed to update topic');
      }
    }
  };

  // Confirm delete (only called when topic has no dependencies)
  const handleDeleteConfirm = async () => {
    if (!selectedTopic) return;

    const result = await topicService.deleteTopic(selectedTopic.id);
    if (result.success) {
      // Log to audit
      await auditLogService.logAction({
        actionType: AuditActionTypes.TOPIC_DELETE,
        tableName: 'subject_topics',
        recordId: selectedTopic.id,
        oldValues: { topic_name: selectedTopic.topic_name, subject_id: subjectId },
        description: `Deleted topic: ${selectedTopic.topic_name}`
      });
      
      showToast('Topic deleted successfully', 'success');
      setIsDeleteModalOpen(false);
      setSelectedTopic(null);
      await loadData();
    } else {
      showToast(result.error || 'Failed to delete topic', 'error');
    }
  };

  // Delete topic with all its questions
  const handleDeleteWithQuestions = async () => {
    if (!selectedTopic) return;

    // Get question count for audit log
    const questionsResult = await topicService.getTopicQuestions(selectedTopic.id);
    const questionCount = questionsResult.success ? questionsResult.data?.length || 0 : 0;

    const result = await topicService.deleteTopicWithQuestions(selectedTopic.id);
    if (result.success) {
      // Log to audit
      await auditLogService.logAction({
        actionType: AuditActionTypes.TOPIC_DELETE,
        tableName: 'subject_topics',
        recordId: selectedTopic.id,
        oldValues: { 
          topic_name: selectedTopic.topic_name, 
          subject_id: subjectId,
          deleted_with_questions: true,
          question_count: questionCount
        },
        description: `Deleted topic with ${questionCount} questions: ${selectedTopic.topic_name}`
      });
      
      showToast('Topic and all its questions deleted successfully', 'success');
      setIsDependenciesModalOpen(false);
      setSelectedTopic(null);
      await loadData();
    } else {
      showToast(result.error || 'Failed to delete topic', 'error');
    }
  };

  // Assign questions to topic
  const handleAssignQuestions = async (questionIds: string[]) => {
    if (!selectedTopic) return;

    try {
      const { data, error, count } = await supabase
        .from('questions')
        .update({ topic: selectedTopic.topic_name })
        .in('id', questionIds)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        showToast('Warning: Questions may not have been updated.', 'error');
      } else {
        showToast(`${data.length} question(s) assigned to ${selectedTopic.topic_name}`, 'success');
      }

      await loadData();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to assign questions');
    }
  };

  // Handle reorder
  const handleReorder = async (reorderedTopics: TopicWithStats[]) => {
    const topicOrders: TopicOrder[] = reorderedTopics.map((topic) => ({
      id: topic.id,
      display_order: topic.display_order,
    }));

    const result = await topicService.reorderTopics(topicOrders);
    if (result.success) {
      showToast('Topics reordered successfully', 'success');
    } else {
      throw new Error(result.error || 'Failed to reorder topics');
    }
  };

  // Bulk Actions
  const handleBulkActivate = async () => {
    if (selectedTopics.size === 0) {
      showToast('No topics selected', 'error');
      return;
    }

    try {
      let successCount = 0;
      for (const topicId of selectedTopics) {
        const result = await topicService.toggleTopicStatus(topicId, true);
        if (result.success) successCount++;
      }

      showToast(`Activated ${successCount} topic(s)`, 'success');
      setSelectedTopics(new Set());
      await loadData();
    } catch (error) {
      showToast('Failed to activate topics', 'error');
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedTopics.size === 0) {
      showToast('No topics selected', 'error');
      return;
    }

    try {
      let successCount = 0;
      for (const topicId of selectedTopics) {
        const result = await topicService.toggleTopicStatus(topicId, false);
        if (result.success) successCount++;
      }

      showToast(`Deactivated ${successCount} topic(s)`, 'success');
      setSelectedTopics(new Set());
      await loadData();
    } catch (error) {
      showToast('Failed to deactivate topics', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTopics.size === 0) {
      showToast('No topics selected', 'error');
      return;
    }

    // Check if any topic has questions and count total questions
    let totalQuestions = 0;
    let topicsWithQuestions = 0;
    
    for (const topicId of selectedTopics) {
      const questionsResult = await topicService.getTopicQuestions(topicId);
      if (questionsResult.success && questionsResult.data && questionsResult.data.length > 0) {
        totalQuestions += questionsResult.data.length;
        topicsWithQuestions++;
      }
    }

    if (totalQuestions > 0) {
      // Show bulk dependencies modal
      setBulkDependenciesData({ totalQuestions, topicCount: topicsWithQuestions });
      setIsBulkDependenciesModalOpen(true);
    } else {
      // No dependencies, show simple confirmation
      setIsBulkDeleteConfirmOpen(true);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setIsBulkDeleteConfirmOpen(false);
    
    try {
      let successCount = 0;
      const deletedTopics: string[] = [];
      
      for (const topicId of selectedTopics) {
        const topic = topics.find(t => t.id === topicId);
        const result = await topicService.deleteTopic(topicId);
        if (result.success) {
          successCount++;
          if (topic) deletedTopics.push(topic.topic_name);
        }
      }

      // Log bulk delete to audit
      await auditLogService.logAction({
        actionType: AuditActionTypes.TOPIC_DELETE,
        tableName: 'subject_topics',
        oldValues: { 
          subject_id: subjectId,
          topic_count: successCount,
          topic_names: deletedTopics
        },
        description: `Bulk deleted ${successCount} topics`
      });

      showToast(`Deleted ${successCount} topic(s)`, 'success');
      setSelectedTopics(new Set());
      await loadData();
    } catch (error) {
      showToast('Failed to delete topics', 'error');
    }
  };

  const handleBulkDeleteWithQuestions = async () => {
    setIsBulkDependenciesModalOpen(false);
    
    try {
      let successCount = 0;
      let totalQuestionsDeleted = 0;
      const deletedTopics: string[] = [];
      
      for (const topicId of selectedTopics) {
        const topic = topics.find(t => t.id === topicId);
        const questionsResult = await topicService.getTopicQuestions(topicId);
        const questionCount = questionsResult.success ? questionsResult.data?.length || 0 : 0;
        
        const result = await topicService.deleteTopicWithQuestions(topicId);
        if (result.success) {
          successCount++;
          totalQuestionsDeleted += questionCount;
          if (topic) deletedTopics.push(topic.topic_name);
        }
      }

      // Log bulk delete with questions to audit
      await auditLogService.logAction({
        actionType: AuditActionTypes.TOPIC_DELETE,
        tableName: 'subject_topics',
        oldValues: { 
          subject_id: subjectId,
          topic_count: successCount,
          topic_names: deletedTopics,
          deleted_with_questions: true,
          total_questions_deleted: totalQuestionsDeleted
        },
        description: `Bulk deleted ${successCount} topics with ${totalQuestionsDeleted} questions`
      });

      showToast(`Deleted ${successCount} topic(s) and ${totalQuestionsDeleted} question(s)`, 'success');
      setSelectedTopics(new Set());
      await loadData();
    } catch (error) {
      showToast('Failed to delete topics', 'error');
    }
  };

  if (isLoading || permissionsLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Subject not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">ℹ️</span>
            <p className="text-sm text-yellow-800">
              <strong>View-only access:</strong> As a moderator, you can view topics but cannot create, edit, or delete them.
            </p>
          </div>
        </div>
      )}

      {/* Header with Back Button */}
      <div className="mb-6">
        <Link
          href="/subjects"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Subjects
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{subject.name_en}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">
                {subject.name_az}
              </span>
            </div>
          </div>
          {canEditContent && (
            <button
              onClick={handleCreate}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Topic
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedTopics.size > 0 && canEditContent && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 font-medium">
              {selectedTopics.size} topic(s) selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkActivate}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                ✓ Activate
              </button>
              <button
                onClick={handleBulkDeactivate}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                ⊘ Deactivate
              </button>
              {canDeleteContent && (
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  🗑 Delete
                </button>
              )}
              <button
                onClick={() => setSelectedTopics(new Set())}
                className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Topics</p>
              <p className="text-2xl font-bold text-gray-900">{topics.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Topics</p>
              <p className="text-2xl font-bold text-gray-900">
                {topics.filter(t => t.is_active).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Questions</p>
              <p className="text-2xl font-bold text-gray-900">
                {topics.reduce((sum, t) => sum + t.question_count, 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Subtopics</p>
              <p className="text-2xl font-bold text-gray-900">
                {topics.reduce((sum, t) => sum + (t.subtopic_count || 0), 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
              </svg>
            </div>
          </div>
        </div>

      </div>

      {/* Topic List */}
      <TopicList
        topics={topics}
        subjectId={subjectId}
        canEdit={canEditContent}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleStatus={handleToggleStatus}
        onAddQuestions={handleAddQuestions}
        onReorder={handleReorder}
        selectedTopics={selectedTopics}
        onSelectionChange={setSelectedTopics}
        onSubtopicChange={loadData}
      />

      {/* Modals */}
      <TopicFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        topic={selectedTopic}
        mode={formMode}
        subjectId={subjectId}
      />

      <DeleteTopicModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        topic={selectedTopic}
      />

      <AddQuestionsToTopicModal
        isOpen={isAddQuestionsModalOpen}
        onClose={() => setIsAddQuestionsModalOpen(false)}
        onSubmit={handleAssignQuestions}
        subjectId={subjectId}
        topicName={selectedTopic?.topic_name || ''}
        currentTopicName={selectedTopic?.topic_name || ''}
      />

      <TopicDependenciesModal
        isOpen={isDependenciesModalOpen}
        onClose={() => {
          setIsDependenciesModalOpen(false);
          setSelectedTopic(null);
        }}
        topicId={selectedTopic?.id || ''}
        topicName={selectedTopic?.topic_name || ''}
        onDeleteWithQuestions={handleDeleteWithQuestions}
      />

      {/* Bulk Delete Confirmation Modal (No Dependencies) */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete {selectedTopics.size} Topics</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete {selectedTopics.size} topic(s)? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteConfirm}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Dependencies Modal */}
      {isBulkDependenciesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Topics Have Dependencies</h3>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>{bulkDependenciesData.topicCount}</strong> of the selected topics have a total of{' '}
                <strong>{bulkDependenciesData.totalQuestions}</strong> question(s) assigned to them.
              </p>
              <p className="text-sm text-yellow-800 mt-2">
                You can delete all selected topics along with their questions, or cancel and review individually.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsBulkDependenciesModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteWithQuestions}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete All Topics & Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className={`rounded-lg shadow-lg px-6 py-4 flex items-center gap-3 ${
            toast.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
