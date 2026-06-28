'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Exam, ExamDetails } from '@/types/exams';
import { examService } from '@/services/examService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import EditExamModal from '../../../../components/exams/EditExamModal';
import QuestionSelectorModal from '../../../../components/exams/QuestionSelectorModal';
import AutoSelectModal from '../../../../components/exams/AutoSelectModal';

export default function ExamEditorPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const examId = params.id as string;
  const { canEditContent, canDeleteContent, isModerator, loading: permissionsLoading } = usePermissions();

  const [exam, setExam] = useState<Exam | null>(null);
  const [examDetails, setExamDetails] = useState<ExamDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'questions' | 'settings'>('details');
  const [officialToggling, setOfficialToggling] = useState(false);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQuestionSelector, setShowQuestionSelector] = useState(false);
  const [showAutoSelect, setShowAutoSelect] = useState(false);

  useEffect(() => {
    fetchExamDetails();
  }, [examId]);

  const fetchExamDetails = async () => {
    setLoading(true);
    // Use direct table query to get the full exam row (including new columns)
    const result = await examService.getExamById(examId);
    if (result.success && result.data) {
      setExam(result.data);
    } else {
      toast.error(result.error || 'Failed to load exam details');
      router.push('/exams');
      setLoading(false);
      return;
    }
    const detailsResult = await examService.getExamDetails(examId);
    if (detailsResult.success && detailsResult.data) {
      setExamDetails(detailsResult.data);
    } else {
      toast.error(detailsResult.error || 'Failed to load exam questions');
    }
    setLoading(false);
  };

  const handleToggleOfficial = async () => {
    if (!exam || !canEditContent) return;
    setOfficialToggling(true);
    const newValue = !exam.is_official;
    const result = await examService.setExamOfficial(examId, newValue);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.EXAM_UPDATE,
        tableName: 'mock_exams',
        recordId: examId,
        newValues: { is_official: newValue },
        description: `${newValue ? 'Stamped' : 'Removed'} Official Elmly badge on exam: ${exam.title}`,
      });
      toast.success(newValue ? 'Official Elmly stamp applied' : 'Official stamp removed');
      fetchExamDetails();
    } else {
      toast.error(result.error || 'Failed to update official status');
    }
    setOfficialToggling(false);
  };

  const handleRemoveQuestion = async (questionIds: string[], isGroup?: boolean) => {
    if (!canDeleteContent) {
      toast.error('Permission denied: You do not have permission to remove questions.');
      return;
    }
    const confirmMsg = isGroup
      ? `Remove this question group (${questionIds.length} questions) from the exam?`
      : 'Remove this question from the exam?';
    if (!window.confirm(confirmMsg)) return;

    const questionToRemove = examDetails?.questions.find(q => q.question_id === questionIds[0]);
    const result = await examService.removeQuestionsFromExam(examId, questionIds);
    if (result.success) {
      await auditLogService.logAction({
        actionType: AuditActionTypes.QUESTION_DELETE,
        tableName: 'mock_exam_questions',
        recordId: examId,
        oldValues: questionToRemove ? {
          question_id: questionIds[0],
          question_text: questionToRemove.question_text?.substring(0, 100),
          exam_title: exam?.title,
          _action: 'EXAM_QUESTION_REMOVE'
        } : { question_id: questionIds[0], _action: 'EXAM_QUESTION_REMOVE' },
        description: `Removed ${isGroup ? `question group (${questionIds.length} questions)` : 'question'} from exam: ${exam?.title}`
      });
      toast.success(isGroup ? 'Question group removed' : 'Question removed');
      fetchExamDetails();
    } else {
      toast.error(result.error || 'Failed to remove question');
    }
  };

  const handleQuestionsAdded = async (count?: number, source?: 'manual' | 'auto') => {
    await auditLogService.logAction({
      actionType: AuditActionTypes.QUESTION_CREATE,
      tableName: 'mock_exam_questions',
      recordId: examId,
      newValues: { count, source: source || 'manual', exam_title: exam?.title, _action: 'EXAM_QUESTION_ADD' },
      description: `Added ${count || 'multiple'} questions to exam: ${exam?.title} (${source || 'manual'})`
    });
    setShowQuestionSelector(false);
    setShowAutoSelect(false);
    fetchExamDetails();
    toast.success('Questions added successfully');
  };

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!exam || !examDetails) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Exam not found</p>
        </div>
      </div>
    );
  }

  const isTeacherExam = !!exam.created_by_teacher;

  return (
    <div className="p-6">
      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">ℹ️</span>
            <p className="text-sm text-yellow-800">
              <strong>View-only access:</strong> As a moderator, you can view exam details but cannot edit or modify questions.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push(isTeacherExam ? '/exams/teacher-submissions' : '/exams')}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          ← {isTeacherExam ? 'Back to Teacher Submissions' : 'Back to Exams'}
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{exam.title}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {exam.exam_type.replace(/_/g, ' ')}
              </span>
              {exam.target_group && (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  Group {exam.target_group}
                </span>
              )}
              {/* Official stamp badge */}
              {exam.is_official && (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                  🏆 Official Elmly
                </span>
              )}
              {/* Teacher exam approval badge */}
              {isTeacherExam && (
                <span className={`px-3 py-1 rounded-full text-sm ${
                  exam.is_approved
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {exam.is_approved ? '✅ Approved' : '🕐 Pending Approval'}
                </span>
              )}
              {/* Creator badge */}
              {isTeacherExam ? (
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                  👤 {exam.teacher_name ?? 'Teacher'}
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                  Elmly
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            {/* Set Official toggle — only for admins, shown on all exams */}
            {canEditContent && (
              <button
                onClick={handleToggleOfficial}
                disabled={officialToggling}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  exam.is_official
                    ? 'border-yellow-400 bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {officialToggling ? '...' : exam.is_official ? '🏆 Remove Official Stamp' : '🏆 Set as Official'}
              </button>
            )}
            {canEditContent && !isTeacherExam && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Edit Details
              </button>
            )}
            <button
              onClick={() => router.push(`/exams/${examId}/preview`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Preview Exam
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'details'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'questions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Questions ({examDetails.questions.length}/{exam.total_questions})
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Exam Information</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exam Type</label>
              <p className="text-gray-900">{exam.exam_type.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Group</label>
              <p className="text-gray-900">{exam.target_group ? `Group ${exam.target_group}` : '—'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <p className="text-gray-900">{exam.duration_minutes} minutes</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Questions</label>
              <p className="text-gray-900">{exam.total_questions}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Questions Added</label>
              <p className="text-gray-900">{examDetails.questions.length}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Completion</label>
              <p className="text-gray-900">
                {Math.round((examDetails.questions.length / exam.total_questions) * 100)}%
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Official Status</label>
              <p className="text-gray-900">{exam.is_official ? '🏆 Official Elmly Exam' : 'Not official'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Creator</label>
              <p className="text-gray-900">
                {isTeacherExam ? `👤 ${exam.teacher_name ?? 'Teacher'}` : 'Elmly'}
              </p>
            </div>
            {isTeacherExam && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approval Status</label>
                <p className={`font-medium ${exam.is_approved ? 'text-green-700' : 'text-yellow-700'}`}>
                  {exam.is_approved ? '✅ Approved — visible to students' : '🕐 Pending — not yet visible to students'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div>
          {/* Teacher exam notice */}
          {isTeacherExam && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-800">
                📝 This is a teacher-created exam. Questions come from the teacher's personal library and/or Elmly questions. This exam {exam.is_approved ? 'is approved and visible to students' : 'is pending approval and not yet visible to students'}.
              </p>
            </div>
          )}

          {/* Action Buttons — only for official Elmly exams */}
          {canEditContent && !isTeacherExam && (
            <div className="mb-4 flex gap-3">
              <button
                onClick={() => setShowQuestionSelector(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Add Questions Manually
              </button>
              <button
                onClick={() => setShowAutoSelect(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                🎲 Auto-Select Questions
              </button>
            </div>
          )}

          {/* Questions List */}
          {examDetails.questions.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-12 text-center">
              <p className="text-gray-500 mb-4">No questions added yet</p>
              {!isTeacherExam && (
                <p className="text-sm text-gray-400">
                  Add questions manually or use auto-select to populate the exam
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Question</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difficulty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correct Answer</th>
                    {!isTeacherExam && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    const renderedGroupIds = new Set<string>();
                    return examDetails.questions.map((q, index) => {
                      const questionType = q.question_type || 'mcq';
                      const isWrittenOpen = questionType === 'written_open';
                      const isFirstInGroup = isWrittenOpen && !!q.group_id && !renderedGroupIds.has(q.group_id);
                      const isPartOfGroup = isWrittenOpen && !!q.group_id && renderedGroupIds.has(q.group_id);

                      if (isFirstInGroup && q.group_id) {
                        renderedGroupIds.add(q.group_id);
                      }

                      const groupQuestions = isFirstInGroup
                        ? examDetails.questions.filter(gq => gq.group_id === q.group_id)
                        : [];

                      if (isPartOfGroup) return null;

                      return (
                        <tr
                          key={q.id}
                          className={`hover:bg-gray-50 ${isFirstInGroup ? 'bg-indigo-50/50' : ''}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {index + 1}
                            {isFirstInGroup && groupQuestions.length > 1 && (
                              <span className="text-xs text-indigo-600 ml-1">
                                (+{groupQuestions.length - 1})
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isFirstInGroup && q.context_text ? (
                              <div>
                                <div className="text-xs text-indigo-600 font-medium mb-1">
                                  📋 Situasiya ({groupQuestions.length} sual)
                                </div>
                                <div className="text-sm text-gray-600 italic mb-2 line-clamp-2">
                                  {q.context_text.substring(0, 100)}...
                                </div>
                                <div className="space-y-1">
                                  {groupQuestions.map((gq, gIdx) => (
                                    <div key={gq.id} className="text-sm text-gray-900 truncate max-w-md pl-4 border-l-2 border-indigo-200">
                                      {gIdx + 1}. {gq.question_text?.substring(0, 60)}...
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-900 truncate max-w-md">
                                {q.question_text}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              questionType === 'mcq' ? 'bg-blue-100 text-blue-800' :
                              questionType === 'codable_open' ? 'bg-cyan-100 text-cyan-800' :
                              'bg-indigo-100 text-indigo-800'
                            }`}>
                              {questionType === 'mcq' ? '📝 MCQ' :
                               questionType === 'codable_open' ? '💻 Short' :
                               '📋 Question Group'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {q.subject_name || q.subject_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              q.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                              q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {q.difficulty}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {q.correct_answer ? (
                              /^[A-Ea-e]$/.test(q.correct_answer) ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-semibold">
                                  {q.correct_answer.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-gray-700 max-w-xs truncate block" title={q.correct_answer}>
                                  {q.correct_answer.length > 40 ? q.correct_answer.substring(0, 40) + '…' : q.correct_answer}
                                </span>
                              )
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          {!isTeacherExam && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              {canDeleteContent && (
                                <button
                                  onClick={() => handleRemoveQuestion(
                                    isFirstInGroup
                                      ? groupQuestions.map(gq => gq.question_id)
                                      : [q.question_id],
                                    isFirstInGroup
                                  )}
                                  className="text-red-600 hover:text-red-900"
                                  title={isFirstInGroup ? 'Remove group' : 'Remove'}
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showEditModal && (
        <EditExamModal
          exam={exam}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchExamDetails();
          }}
        />
      )}

      {showQuestionSelector && (
        <QuestionSelectorModal
          examId={examId}
          exam={exam}
          existingQuestionIds={Array.from(new Set([
            ...examDetails.questions.map((q) => q.question_id),
            ...examDetails.questions.filter(q => q.group_id).map(q => q.group_id as string),
          ]))}
          currentCount={examDetails.questions.length}
          isOpen={showQuestionSelector}
          onClose={() => setShowQuestionSelector(false)}
          onSuccess={handleQuestionsAdded}
        />
      )}

      {showAutoSelect && (
        <AutoSelectModal
          examId={examId}
          exam={exam}
          currentCount={examDetails.questions.length}
          isOpen={showAutoSelect}
          onClose={() => setShowAutoSelect(false)}
          onSuccess={handleQuestionsAdded}
        />
      )}
    </div>
  );
}
