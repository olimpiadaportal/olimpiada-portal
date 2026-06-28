'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Admin } from '@/types';

interface AdminCardProps {
  admin: Admin;
}

const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  moderator: 'bg-gray-100 text-gray-800',
};

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
};

export default function AdminCard({ admin }: AdminCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* Avatar */}
          {admin.avatar_url ? (
            <img
              src={admin.avatar_url}
              alt={admin.full_name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 font-semibold text-sm">
                {getInitials(admin.full_name)}
              </span>
            </div>
          )}

          {/* Name & Email */}
          <div>
            <h3 className="font-semibold text-gray-900">{admin.full_name}</h3>
            <p className="text-sm text-gray-500">{admin.email}</p>
          </div>
        </div>

        {/* Status Badge */}
        {admin.is_active ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Inactive
          </span>
        )}
      </div>

      {/* Role */}
      <div className="mb-4">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            roleColors[admin.role] || roleColors.moderator
          }`}
        >
          {roleLabels[admin.role] || admin.role}
        </span>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <p className="text-gray-500">Last Login</p>
          <p className="font-medium text-gray-900">
            {admin.last_login_at
              ? formatDistanceToNow(new Date(admin.last_login_at), {
                  addSuffix: true,
                })
              : 'Never'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Created By</p>
          <p className="font-medium text-gray-900">
            {admin.created_by_name || 'System'}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Joined {formatDistanceToNow(new Date(admin.created_at), { addSuffix: true })}
        </p>
        <Link
          href={`/admins/${admin.admin_id}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}
