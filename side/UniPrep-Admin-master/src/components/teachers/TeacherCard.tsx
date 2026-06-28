'use client';

import Link from 'next/link';
import type { Teacher } from '@/types';
import { formatDate } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

interface TeacherCardProps {
  teacher: Teacher;
}

export function TeacherCard({ teacher }: TeacherCardProps) {
  const { canEditUsers, isModerator } = usePermissions();
  
  // Get initials for avatar fallback
  const initials = teacher.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {teacher.avatar_url ? (
            <img
              src={teacher.avatar_url}
              alt={teacher.full_name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-xl font-semibold text-purple-600">{initials}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {teacher.full_name}
              </h3>
              <p className="text-sm text-gray-500 truncate">{teacher.email}</p>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                teacher.is_verified
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {teacher.is_verified ? '✓ Verified' : 'Pending'}
            </span>
          </div>

          {/* Specializations */}
          {teacher.specializations && teacher.specializations.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {teacher.specializations.slice(0, 3).map((spec, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-purple-50 text-purple-700"
                >
                  {spec}
                </span>
              ))}
              {teacher.specializations.length > 3 && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-600">
                  +{teacher.specializations.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-500">Rating</p>
              <p className="text-sm font-semibold text-gray-900">
                {teacher.rating ? `${teacher.rating.toFixed(1)} ⭐` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Students</p>
              <p className="text-sm font-semibold text-gray-900">{teacher.student_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Bookings</p>
              <p className="text-sm font-semibold text-gray-900">{teacher.total_bookings}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">City</p>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {teacher.city || 'N/A'}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Joined {formatDate(teacher.created_at)}
            </p>
            <Link
              href={`/teachers/${teacher.teacher_id}`}
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
