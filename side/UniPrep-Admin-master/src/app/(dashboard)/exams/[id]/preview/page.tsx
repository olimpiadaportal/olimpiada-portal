'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ExamDetails } from '@/types/exams';
import { examService } from '@/services/examService';
import { useToast } from '@/contexts/ToastContext';

export default function ExamPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const toast = useToast();

  const [details, setDetails] = useState<ExamDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      const result = await examService.getExamDetails(examId);

      if (result.success && result.data) {
        setDetails(result.data);
      } else {
        toast.error(result.error || 'Failed to load exam preview');
        router.push('/exams');
      }

      setLoading(false);
    };

    if (examId) {
      fetchDetails();
    }
  }, [examId, router, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading exam preview...</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Exam not found</p>
        </div>
      </div>
    );
  }

  const { exam, questions } = details;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push(`/exams/${examId}`)}
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
          >
            
            Back to Editor
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{exam.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-700">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
              {exam.exam_type.replace('_', ' ')}
            </span>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full">
              Group {exam.target_group}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full">
              {exam.duration_minutes} minutes
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full">
              {questions.length} / {exam.total_questions} questions
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
          <span className="text-sm text-gray-600">
            Showing {questions.length} question{questions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-200">
          {(() => {
            const renderedGroupIds = new Set<string>();
            return questions.map((q, index) => {
              const questionType = q.question_type || 'mcq';
              const isWrittenOpen = questionType === 'written_open';
              const isFirstInGroup = isWrittenOpen && q.group_id && !renderedGroupIds.has(q.group_id);
              
              if (isFirstInGroup && q.group_id) {
                renderedGroupIds.add(q.group_id);
              }
              
              return (
                <div key={q.id} className={`px-6 py-4 ${isWrittenOpen ? 'bg-indigo-50' : ''}`}>
                  {/* Show context for first question in a written_open group */}
                  {isFirstInGroup && q.context_text && (
                    <div className="mb-4 p-4 bg-indigo-100 rounded-lg border border-indigo-200">
                      <div className="text-xs font-semibold text-indigo-700 mb-2">
                        📝 Essay Group Context (Situasiya)
                      </div>
                      <div className="text-sm text-indigo-900 whitespace-pre-wrap">
                        {q.context_text}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                        <span>Question {index + 1}</span>
                        {isWrittenOpen && q.group_order && (
                          <span className="text-indigo-600">(Part {q.group_order} of 3)</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">
                        {q.question_text}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs">
                      {/* Question Type Badge */}
                      <span
                        className={`px-2 py-1 rounded-full ${
                          questionType === 'mcq'
                            ? 'bg-blue-100 text-blue-800'
                            : questionType === 'codable_open'
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {questionType === 'mcq' ? '📝 MCQ' : 
                         questionType === 'codable_open' ? '💻 Short Answer' : 
                         '📋 Question Group'}
                      </span>
                      {(q.subject_name || q.subject_id) && (
                        <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                          {q.subject_name || q.subject_id}
                        </span>
                      )}
                      {q.difficulty && (
                        <span
                          className={`px-2 py-1 rounded-full ${
                            q.difficulty === 'easy'
                              ? 'bg-green-100 text-green-800'
                              : q.difficulty === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
