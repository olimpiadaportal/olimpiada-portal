'use client';

import { useEffect, useState } from 'react';
import { teacherService, SearchTeachersParams } from '@/services/teacherService';
import type { Teacher } from '@/types';
import { SearchBar } from '@/components/common/SearchBar';
import { Pagination } from '@/components/common/Pagination';
import { TeacherFilters } from '@/components/teachers/TeacherFilters';
import { TeacherCard } from '@/components/teachers/TeacherCard';

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    city: '',
    verificationStatus: 'all',
    specialization: '',
  });
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'students' | 'bookings' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadTeachers();
  }, [searchQuery, filters, sortBy, sortOrder, currentPage]);

  async function loadTeachers() {
    try {
      setLoading(true);
      setError(null);

      const params: SearchTeachersParams = {
        query: searchQuery || undefined,
        city: filters.city || undefined,
        verificationStatus: filters.verificationStatus === 'all' ? undefined : filters.verificationStatus as 'verified' | 'unverified',
        specialization: filters.specialization || undefined,
        sortBy,
        sortOrder,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };

      const response = await teacherService.searchTeachers(params);

      if (response.success && response.data) {
        setTeachers(response.data.teachers);
        setTotalCount(response.data.totalCount);
      } else {
        setError(response.error || 'Failed to load teachers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(query: string) {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page on search
  }

  function handleFilterChange(newFilters: typeof filters) {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page on filter
  }

  function handleSortChange(field: typeof sortBy) {
    if (field === sortBy) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Teachers</h1>
        <p className="text-gray-600 mt-1">
          Manage and verify teacher accounts. Teachers register through the mobile app.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <SearchBar
              placeholder="Search by name or email..."
              onSearch={handleSearch}
            />
          </div>
          <div className="flex gap-2">
            <TeacherFilters onFilterChange={handleFilterChange} />
            
            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="created_at">Newest First</option>
              <option value="name">Name</option>
              <option value="rating">Rating</option>
              <option value="students">Most Students</option>
              <option value="bookings">Most Bookings</option>
            </select>
          </div>
        </div>

        {/* Active Filters Display */}
        {(searchQuery || filters.city || filters.verificationStatus !== 'all' || filters.specialization) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                Search: {searchQuery}
                <button onClick={() => setSearchQuery('')} className="hover:text-purple-900">×</button>
              </span>
            )}
            {filters.city && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                City: {filters.city}
                <button onClick={() => setFilters({...filters, city: ''})} className="hover:text-purple-900">×</button>
              </span>
            )}
            {filters.verificationStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                Status: {filters.verificationStatus}
                <button onClick={() => setFilters({...filters, verificationStatus: 'all'})} className="hover:text-purple-900">×</button>
              </span>
            )}
            {filters.specialization && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                Subject: {filters.specialization}
                <button onClick={() => setFilters({...filters, specialization: ''})} className="hover:text-purple-900">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {loading ? 'Loading...' : `${totalCount} teacher${totalCount !== 1 ? 's' : ''} found`}
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={loadTeachers}
            className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && teachers.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-6xl mb-4">👨‍🏫</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No teachers found</h3>
          <p className="text-gray-500">
            {searchQuery || filters.city || filters.verificationStatus !== 'all' || filters.specialization
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first teacher'}
          </p>
        </div>
      )}

      {/* Teacher List */}
      {!loading && !error && teachers.length > 0 && (
        <div className="space-y-4">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.teacher_id} teacher={teacher} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={totalCount}
          itemsPerPage={itemsPerPage}
        />
      )}
    </div>
  );
}
