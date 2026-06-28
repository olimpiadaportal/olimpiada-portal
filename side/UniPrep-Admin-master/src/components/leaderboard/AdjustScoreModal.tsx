'use client';

import { useState, useEffect } from 'react';
import { leaderboardService } from '@/services/leaderboardService';
import { useToast } from '@/contexts/ToastContext';
import { auditLogService, ValidDbActionTypes } from '@/services/auditLogService';

interface Student {
  id: string;
  user_id: string;
  elo_rating: number;
  full_name?: string;
  email?: string;
}

interface AdjustScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserAdminId?: string;
}

export default function AdjustScoreModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserAdminId,
}: AdjustScoreModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [newElo, setNewElo] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStudent) {
      toast.error('Please select a student');
      return;
    }

    if (!newElo || isNaN(Number(newElo))) {
      toast.error('Please enter a valid ELO value');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the adjustment');
      return;
    }

    if (!currentUserAdminId) {
      toast.error('Admin ID not found');
      return;
    }

    setLoading(true);

    try {
      const result = await leaderboardService.createScoreAdjustment(
        selectedStudent.id,
        Number(newElo),
        reason,
        currentUserAdminId
      );

      if (!result.success) {
        toast.error(result.error || 'Failed to adjust score');
        return;
      }

      const adjustment = Number(newElo) - selectedStudent.elo_rating;
      
      // Log the score adjustment
      await auditLogService.logAction({
        actionType: ValidDbActionTypes.ADJUST_SCORE,
        tableName: 'students',
        recordId: selectedStudent.id,
        oldValues: { elo_rating: selectedStudent.elo_rating },
        newValues: { elo_rating: Number(newElo) },
        description: `Adjusted ELO score for ${selectedStudent.full_name || selectedStudent.email}`,
        metadata: {
          student_name: selectedStudent.full_name,
          adjustment,
          reason
        }
      });
      
      toast.success(
        `Score adjusted by ${adjustment > 0 ? '+' : ''}${adjustment} (${selectedStudent.elo_rating} → ${newElo})`
      );
      
      onSuccess();
      onClose();
      
      // Reset form
      setSelectedStudent(null);
      setNewElo('');
      setReason('');
      setSearchQuery('');
    } catch (err) {
      console.error('Exception adjusting score:', err);
      toast.error('An error occurred while adjusting the score');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    setSearching(true);
    setSearchResults([]);

    try {
      const { supabase } = await import('@/lib/supabase');
      
      // Use RPC function to search students with profiles
      const { data, error } = await supabase.rpc('search_students_by_name', {
        search_query: searchQuery,
        result_limit: 10
      });

      if (error) {
        console.error('Error searching students:', error);
        toast.error(`Failed to search students: ${error.message || 'Unknown error'}`);
        return;
      }


      if (!data || data.length === 0) {
        toast.info('No students found');
        return;
      }

      const students: Student[] = data.map((item: any) => {
        
        // Ensure all fields have proper values
        const student: Student = {
          id: String(item.student_id || ''),
          user_id: String(item.user_id || ''),
          elo_rating: Number(item.elo_rating) || 1000,
          full_name: String(item.full_name || item.email || 'Unknown Student'),
          email: String(item.email || ''),
        };
        
        return student;
      });

      setSearchResults(students);
    } catch (err) {
      console.error('Exception searching students:', err);
      toast.error('An error occurred while searching');
    } finally {
      setSearching(false);
    }
  };

  const selectStudent = (student: Student) => {
    setSelectedStudent(student);
    setSearchResults([]);
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Adjust Student Score</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Student Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Student
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter student name or email"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              
              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {searchResults.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => selectStudent(student)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium text-gray-900">{student.full_name}</div>
                      {student.email && (
                        <div className="text-xs text-gray-500">{student.email}</div>
                      )}
                      <div className="text-sm text-gray-600">Current ELO: {student.elo_rating}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Student */}
            {selectedStudent && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedStudent.full_name || 'Student'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Current ELO: <span className="font-bold">{selectedStudent.elo_rating}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* New ELO */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New ELO *
              </label>
              <input
                type="number"
                value={newElo}
                onChange={(e) => setNewElo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 1500"
                min="1000"
                max="2000"
                required
                disabled={!selectedStudent}
              />
              {selectedStudent && newElo && !isNaN(Number(newElo)) && (
                <p className="text-sm text-gray-600 mt-1">
                  Adjustment: {Number(newElo) - selectedStudent.elo_rating > 0 ? '+' : ''}
                  {Number(newElo) - selectedStudent.elo_rating}
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Explain why this adjustment is necessary"
                rows={3}
                required
                disabled={!selectedStudent}
              />
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> All score adjustments are logged and cannot be undone.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              disabled={loading || !selectedStudent}
            >
              {loading ? 'Adjusting...' : 'Adjust Score'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
