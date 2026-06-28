'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { adminService } from '@/services/adminService';
import { authService } from '@/services/authService';
import { canManageRole, canChangeRole, getRoleDisplayName, getAssignableRoles, type AdminRole as RoleType } from '@/lib/roleHierarchy';
import { useToast } from '@/contexts/ToastContext';
import type { AdminDetail, AdminRole } from '@/types';

export default function AdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [admin, setAdmin] = useState<AdminDetail | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType | null>(null);
  const [currentUserAdminId, setCurrentUserAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRole, setEditRole] = useState<AdminRole>('moderator');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Get current user role and admin ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserRole(user.role as RoleType);
        setCurrentUserAdminId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Fetch admin details
  const fetchAdmin = async () => {
    setLoading(true);
    setError(null);

    const result = await adminService.getAdminDetail(id);

    if (result.success && result.data) {
      setAdmin(result.data);
      setEditRole(result.data.info.role);
    } else {
      console.error('Fetch failed:', result.error);
      setError(result.error || 'Failed to load admin details');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Handle role update
  const handleRoleUpdate = async () => {
    if (!admin || !currentUserRole) {
      toast.error('Unable to update role. Please refresh the page.');
      setIsEditMode(false);
      return;
    }

    // Check if role actually changed
    if (editRole === admin.info.role) {
      toast.info('No changes made');
      setIsEditMode(false);
      return;
    }

    // Check if user can change this role
    if (!canChangeRole(currentUserRole, admin.info.role as RoleType, editRole as RoleType)) {
      toast.error(`You cannot change a ${getRoleDisplayName(admin.info.role as RoleType)} to ${getRoleDisplayName(editRole as RoleType)}`);
      setIsEditMode(false);
      return;
    }

    setActionLoading(true);

    const result = await adminService.updateAdminRole(id, editRole, currentUserAdminId || undefined);

    if (result.success) {
      toast.success('Role updated successfully');
      await fetchAdmin();
      setIsEditMode(false);
    } else {
      console.error('Update failed:', result.error);
      toast.error(result.error || 'Failed to update role');
    }

    setActionLoading(false);
  };

  // Handle status toggle
  const handleStatusToggle = async () => {
    if (!admin || !currentUserRole) return;

    // Check if user can manage this admin
    if (!canManageRole(currentUserRole, admin.info.role as RoleType)) {
      toast.error(`You cannot modify a ${getRoleDisplayName(admin.info.role as RoleType)}`);
      setShowStatusModal(false);
      return;
    }

    setActionLoading(true);

    const newStatus = !admin.info.is_active;
    const result = await adminService.updateAdminStatus(id, newStatus, currentUserAdminId || undefined);

    if (result.success) {
      toast.success(`Admin ${newStatus ? 'activated' : 'deactivated'} successfully`);
      await fetchAdmin();
      setShowStatusModal(false);
    } else {
      toast.error(result.error || 'Failed to update status');
    }

    setActionLoading(false);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!admin || !currentUserRole) return;

    // Check if user can manage this admin
    if (!canManageRole(currentUserRole, admin.info.role as RoleType)) {
      toast.error(`You cannot delete a ${getRoleDisplayName(admin.info.role as RoleType)}`);
      setShowDeleteModal(false);
      return;
    }

    setActionLoading(true);

    const result = await adminService.deleteAdmin(id, currentUserAdminId || undefined);

    if (result.success) {
      toast.success('Admin deleted successfully');
      router.push('/admins');
    } else {
      toast.error(result.error || 'Failed to delete admin');
      setActionLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const roleColors: Record<AdminRole, string> = {
    super_admin: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    moderator: 'bg-gray-100 text-gray-800',
  };

  const roleLabels: Record<AdminRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    moderator: 'Moderator',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Admin not found'}</p>
          <button
            onClick={() => router.push('/admins')}
            className="mt-2 text-sm text-red-600 hover:text-red-500 font-medium"
          >
            ← Back to Admins
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admins')}
          className="text-gray-600 hover:text-gray-900 mb-4 flex items-center"
        >
          ← Back to Admins
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            {/* Avatar */}
            {admin.profile.avatar_url ? (
              <img
                src={admin.profile.avatar_url}
                alt={admin.profile.full_name}
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 font-semibold text-xl">
                  {getInitials(admin.profile.full_name)}
                </span>
              </div>
            )}

            {/* Name & Email */}
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {admin.profile.full_name}
                </h1>
                {admin.info.is_active ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-gray-600 mt-1">{admin.profile.email}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {currentUserRole && canManageRole(currentUserRole, admin.info.role as RoleType) ? (
              <>
                <button
                  onClick={() => setShowStatusModal(true)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    admin.info.is_active
                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                >
                  {admin.info.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 font-medium transition-colors"
                >
                  Delete
                </button>
              </>
            ) : (
              <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm font-medium">
                🔒 {getRoleDisplayName(admin.info.role as RoleType)} - Protected
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-1">Role</p>
          <div className="flex items-center justify-between">
            {isEditMode && currentUserRole && canManageRole(currentUserRole, admin.info.role as RoleType) ? (
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as AdminRole)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
              >
                {/* Show current role first */}
                <option value={admin.info.role}>{getRoleDisplayName(admin.info.role as RoleType)}</option>
                {/* Show only roles user can assign (excluding current role) */}
                {getAssignableRoles(currentUserRole)
                  .filter(role => role !== admin.info.role)
                  .map((role) => (
                    <option key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </option>
                  ))}
              </select>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    roleColors[admin.info.role]
                  }`}
                >
                  {roleLabels[admin.info.role]}
                </span>
                {currentUserRole && canManageRole(currentUserRole, admin.info.role as RoleType) && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-1">Total Actions</p>
          <p className="text-2xl font-bold text-gray-900">{admin.stats.total_actions}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-1">Recent Actions (30d)</p>
          <p className="text-2xl font-bold text-gray-900">{admin.stats.recent_actions_count}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-1">Last Login</p>
          <p className="text-lg font-semibold text-gray-900">
            {admin.info.last_login_at
              ? formatDistanceToNow(new Date(admin.info.last_login_at), { addSuffix: true })
              : 'Never'}
          </p>
        </div>
      </div>

      {/* Edit Mode Buttons */}
      {isEditMode && (
        <div className="mb-6 flex space-x-2">
          <button
            onClick={handleRoleUpdate}
            disabled={actionLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {actionLoading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => {
              setIsEditMode(false);
              setEditRole(admin.info.role);
            }}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Profile Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Phone</p>
            <p className="font-medium text-gray-900">{admin.profile.phone || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Created By</p>
            <p className="font-medium text-gray-900">
              {admin.created_by?.full_name || 'System'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Created At</p>
            <p className="font-medium text-gray-900">
              {new Date(admin.info.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last Updated</p>
            <p className="font-medium text-gray-900">
              {formatDistanceToNow(new Date(admin.info.updated_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {admin.recent_activity && admin.recent_activity.length > 0 ? (
          <div className="space-y-3">
            {admin.recent_activity.map((log) => (
              <div key={log.log_id} className="border-l-4 border-indigo-500 pl-4 py-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{log.action.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </p>
                </div>
                {log.target_type && (
                  <p className="text-sm text-gray-600 mt-1">
                    Target: {log.target_type} {log.target_id && `(${log.target_id.slice(0, 8)}...)`}
                  </p>
                )}
                {log.details && Object.keys(log.details).length > 0 && (
                  <pre className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No recent activity</p>
        )}
      </div>

      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {admin.info.is_active ? 'Deactivate Admin' : 'Activate Admin'}
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to {admin.info.is_active ? 'deactivate' : 'activate'}{' '}
              <strong>{admin.profile.full_name}</strong>?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleStatusToggle}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  admin.info.is_active
                    ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowStatusModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Admin</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{admin.profile.full_name}</strong>? This
              action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
