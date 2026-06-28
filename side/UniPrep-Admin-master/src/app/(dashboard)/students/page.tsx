'use client';

import { useEffect, useState } from 'react';
import { studentService, SearchStudentsParams } from '@/services/studentService';
import type { Student } from '@/types';
import { SearchBar } from '@/components/common/SearchBar';
import { Pagination } from '@/components/common/Pagination';
import { StudentFilters } from '@/components/students/StudentFilters';
import { StudentCard } from '@/components/students/StudentCard';

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    city: '',
    status: 'all',
    minElo: '',
    maxElo: '',
  });
  const [sortBy, setSortBy] = useState<'name' | 'elo' | 'exams' | 'last_active' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadStudents();
  }, [searchQuery, filters, sortBy, sortOrder, currentPage]);

  async function loadStudents() {
    try {
      setLoading(true);
      setError(null);

      const params: SearchStudentsParams = {
        query: searchQuery || undefined,
        city: filters.city || undefined,
        status: filters.status === 'all' ? undefined : filters.status as 'active' | 'inactive',
        minElo: filters.minElo ? parseInt(filters.minElo) : undefined,
        maxElo: filters.maxElo ? parseInt(filters.maxElo) : undefined,
        sortBy,
        sortOrder,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };

      const response = await studentService.searchStudents(params);

      if (response.success && response.data) {
        setStudents(response.data.students);
        setTotalCount(response.data.totalCount);
      } else {
        setError(response.error || 'Failed to load students');
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
        <h1 className="text-3xl font-bold text-gray-900">Students</h1>
        <p className="text-gray-600 mt-1">
          Manage and monitor student accounts. Students register through the mobile app.
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
            <StudentFilters onFilterChange={handleFilterChange} />
            
            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Newest First</option>
              <option value="name">Name</option>
              <option value="elo">ELO Rating</option>
              <option value="exams">Most Exams</option>
              <option value="last_active">Last Active</option>
            </select>
          </div>
        </div>

        {/* Active Filters Display */}
        {(searchQuery || filters.city || filters.status !== 'all' || filters.minElo || filters.maxElo) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                Search: {searchQuery}
                <button onClick={() => setSearchQuery('')} className="hover:text-blue-900">×</button>
              </span>
            )}
            {filters.city && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                City: {filters.city}
                <button onClick={() => setFilters({...filters, city: ''})} className="hover:text-blue-900">×</button>
              </span>
            )}
            {filters.status !== 'all' && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                Status: {filters.status}
                <button onClick={() => setFilters({...filters, status: 'all'})} className="hover:text-blue-900">×</button>
              </span>
            )}
            {(filters.minElo || filters.maxElo) && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                ELO: {filters.minElo || '0'} - {filters.maxElo || '∞'}
                <button onClick={() => setFilters({...filters, minElo: '', maxElo: ''})} className="hover:text-blue-900">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {loading ? 'Loading...' : `${totalCount} student${totalCount !== 1 ? 's' : ''} found`}
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={loadStudents}
            className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && students.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-500">
            {searchQuery || filters.city || filters.status !== 'all' || filters.minElo || filters.maxElo
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first student'}
          </p>
        </div>
      )}

      {/* Student List */}
      {!loading && !error && students.length > 0 && (
        <div className="space-y-4">
          {students.map((student) => (
            <StudentCard key={student.student_id} student={student} />
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
