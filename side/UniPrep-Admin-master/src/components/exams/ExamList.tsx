'use client';

import { Exam } from '@/types/exams';
import { formatDistanceToNow } from 'date-fns';

interface ExamListProps {
  exams: Exam[];
  onEdit: (examId: string) => void;
  onDelete: (examId: string) => void;
  onPreview: (examId: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function ExamList({
  exams,
  onEdit,
  onDelete,
  onPreview,
  canEdit = true,
  canDelete = true,
}: ExamListProps) {
  const getTypeBadge = (type: string) => {
    const styles = {
      first_stage: 'bg-blue-50 text-blue-700',
      second_stage: 'bg-purple-50 text-purple-700',
      full_exam: 'bg-green-50 text-green-700',
    };

    const labels = {
      first_stage: 'First Stage',
      second_stage: 'Second Stage',
      full_exam: 'Full Exam',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[type as keyof typeof styles] || styles.first_stage}`}>
        {labels[type as keyof typeof labels] || type}
      </span>
    );
  };

  const getGroupBadge = (group: string) => {
    const colors = ['bg-red-100 text-red-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800', 'bg-purple-100 text-purple-800'];
    const index = ['I', 'II', 'III', 'IV', 'V'].indexOf(group);
    const color = colors[index] || colors[0];

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        Group {group}
      </span>
    );
  };

  if (exams.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No exams found</p>
        <p className="text-sm text-gray-400 mt-2">Create your first exam to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Exam
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type / Group
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Questions
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {exams.map((exam) => (
            <tr key={exam.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{exam.title}</span>
                    {exam.is_official && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800" title="Official Elmly Exam">
                        🏆 Official
                      </span>
                    )}
                    {exam.created_by_teacher && !exam.is_approved && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700" title="Pending admin approval">
                        🕐 Pending
                      </span>
                    )}
                    {exam.created_by_teacher && exam.is_approved && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700" title="Teacher exam — approved">
                        ✅ Teacher
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Created {formatDistanceToNow(new Date(exam.created_at), { addSuffix: true })}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="space-y-1">
                  {getTypeBadge(exam.exam_type)}
                  <div>
                    {getGroupBadge(exam.target_group)}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {exam.duration_minutes} min
                </div>
                <div className="text-xs text-gray-500">
                  {Math.floor(exam.duration_minutes / 60)}h {exam.duration_minutes % 60}m
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {exam.question_count || 0} / {exam.total_questions}
                </div>
                <div className="text-xs text-gray-500">
                  {exam.question_count ? Math.round((exam.question_count / exam.total_questions) * 100) : 0}% complete
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onPreview(exam.id)}
                    className="text-blue-600 hover:text-blue-900"
                    title="Preview"
                  >
                    👁️
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => onEdit(exam.id)}
                      className="text-indigo-600 hover:text-indigo-900"
                      title="Edit"
                    >
                      ✏️
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => onDelete(exam.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
