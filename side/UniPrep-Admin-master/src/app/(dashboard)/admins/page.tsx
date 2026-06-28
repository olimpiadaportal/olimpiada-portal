'use client';

import { useState, useEffect } from 'react';
import RoleGuard from '@/components/auth/RoleGuard';
import { adminService } from '@/services/adminService';
import { authService } from '@/services/authService';
import AdminCard from '@/components/admins/AdminCard';
import AddAdminModal from '@/components/admins/AddAdminModal';
import { SearchBar } from '@/components/common/SearchBar';
import { Pagination } from '@/components/common/Pagination';
import { canManageRole, canCreateAdmin, type AdminRole as RoleType } from '@/lib/roleHierarchy';
import type { Admin, AdminRole } from '@/types';

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<AdminRole | null>(null);
  const itemsPerPage = 20;

  // Fetch admins
  const fetchAdmins = async () => {
    setLoading(true);
    setError(null);

    const result = await adminService.searchAdmins({
      query: searchQuery || null,
      role: roleFilter === 'all' ? null : roleFilter,
      isActive: statusFilter === 'all' ? null : statusFilter === 'active',
      sortBy,
      sortOrder,
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
    });

    if (result.success && result.data) {
      setAdmins(result.data.admins);
      setTotalCount(result.data.totalCount);
    } else {
      setError(result.error || 'Failed to load admins');
    }

    setLoading(false);
  };

  // Get current user role on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserRole(user.role);
      }
    };
    getCurrentUser();
  }, []);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchAdmins();
  }, [searchQuery, roleFilter, statusFilter, sortBy, sortOrder, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <RoleGuard allowedRoles={['super_admin']}>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
            <p className="text-gray-600 mt-1">Manage admin users and permissions</p>
          </div>
          {/* Only show Add Admin button for super_admin */}
          {currentUserRole === 'super_admin' && (
            <button
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              onClick={() => setShowAddModal(true)}
            >
              + Add Admin
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <SearchBar
          onSearch={setSearchQuery}
          placeholder="Search by name or email..."
        />

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as AdminRole | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="created_at">Newest First</option>
              <option value="name">Name</option>
              <option value="role">Role</option>
              <option value="last_login">Last Login</option>
            </select>
          </div>

          {/* Sort Order Toggle */}
          <div className="pt-6">
            <button
              onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={sortOrder === 'ASC' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'ASC' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      {!loading && (
        <div className="mb-4 text-sm text-gray-600">
          {totalCount} {totalCount === 1 ? 'admin' : 'admins'} found
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchAdmins}
            className="mt-2 text-sm text-red-600 hover:text-red-500 font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && admins.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No admins found</h3>
          <p className="text-gray-600">
            {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Get started by adding your first admin'}
          </p>
        </div>
      )}

      {/* Admin Cards Grid */}
      {!loading && !error && admins.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {admins.map((admin) => (
              <AdminCard key={admin.admin_id} admin={admin} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* Add Admin Modal */}
      <AddAdminModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          fetchAdmins();
          setCurrentPage(1);
        }}
      />
    </div>
    </RoleGuard>
  );
}
