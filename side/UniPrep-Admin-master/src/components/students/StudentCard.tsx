'use client';

import Link from 'next/link';
import type { Student } from '@/types';
import { formatDate, getELOTier } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

interface StudentCardProps {
  student: Student;
}

export function StudentCard({ student }: StudentCardProps) {
  const { canEditUsers, isModerator } = usePermissions();
  const tierInfo = getELOTier(student.elo_rating);
  const tierColors: Record<string, string> = {
    Bronze: 'bg-orange-100 text-orange-800',
    Silver: 'bg-gray-100 text-gray-800',
    Gold: 'bg-yellow-100 text-yellow-800',
    Platinum: 'bg-blue-100 text-blue-800',
    Diamond: 'bg-cyan-100 text-cyan-800',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {student.avatar_url ? (
            <img
              src={student.avatar_url}
              alt={student.full_name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              {student.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {student.full_name}
              </h3>
              <p className="text-sm text-gray-500 truncate">{student.email}</p>
            </div>
            
            {/* Status Badge */}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              student.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {student.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-gray-500">ELO Rating</p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-sm font-semibold text-gray-900">{student.elo_rating}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded ${tierColors[tierInfo.tier]}`}>
                  {tierInfo.tier}
                </span>
              </div>
            </div>
            
            <div>
              <p className="text-xs text-gray-500">Exams</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{student.total_exams}</p>
            </div>
            
            <div>
              <p className="text-xs text-gray-500">Questions</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{student.total_questions.toLocaleString()}</p>
            </div>
            
            <div>
              <p className="text-xs text-gray-500">City</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{student.city || 'N/A'}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Joined {formatDate(student.created_at)}
            </p>
            <Link
              href={`/students/${student.student_id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {isModerator ? 'View Details →' : 'View/Edit →'}
            </Link>
          </div>
          
          {/* Moderator Notice */}
          {isModerator && (
            <div className="mt-2 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              ℹ️ View-only access (Moderator role)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
