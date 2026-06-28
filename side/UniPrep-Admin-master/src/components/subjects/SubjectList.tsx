'use client';

import { useState } from 'react';
import { SubjectCard } from './SubjectCard';
import type { SubjectWithStats } from '@/types/subjects';

interface SubjectListProps {
  subjects: SubjectWithStats[];
  onEdit: (subject: SubjectWithStats) => void;
  onDelete: (subject: SubjectWithStats) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function SubjectList({ subjects, onEdit, onDelete, canEdit = true, canDelete = true }: SubjectListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter subjects based on search
  const filteredSubjects = subjects.filter((subject) => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        subject.name_en.toLowerCase().includes(searchLower) ||
        subject.name_az.toLowerCase().includes(searchLower) ||
        (subject.name_ru && subject.name_ru.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  // Sort alphabetically by name
  const sortedSubjects = [...filteredSubjects].sort((a, b) => {
    return a.name_en.localeCompare(b.name_en);
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search subjects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-600">
          Showing {sortedSubjects.length} of {subjects.length} subjects
        </div>
      </div>

      {/* Subject Cards */}
      {sortedSubjects.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
          <p className="text-gray-500">
            {searchTerm
              ? 'Try adjusting your search'
              : 'Get started by creating your first subject'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedSubjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              onEdit={onEdit}
              onDelete={onDelete}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
