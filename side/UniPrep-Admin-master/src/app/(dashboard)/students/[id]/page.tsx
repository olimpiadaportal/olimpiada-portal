'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { studentService } from '@/services/studentService';
import type { StudentDetail } from '@/types';
import { formatDate, getELOTier } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;
  const { canEditUsers, canDeleteUsers, isModerator, loading: permissionsLoading } = usePermissions();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    city: '',
    phone: '',
  });

  useEffect(() => {
    loadStudent();
  }, [studentId]);

  async function loadStudent() {
    try {
      setLoading(true);
      setError(null);

      const response = await studentService.getStudentDetail(studentId);

      if (response.success && response.data) {
        setStudent(response.data);
        setEditForm({
          fullName: response.data.profile.full_name,
          email: response.data.profile.email,
          city: response.data.profile.city || '',
          phone: response.data.profile.phone || '',
        });
      } else {
        setError(response.error || 'Failed to load student');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!student) return;
    
    // Security check: Prevent moderators from editing
    if (!canEditUsers) {
      alert('Permission denied: You do not have permission to edit student profiles.');
      return;
    }

    try {
      setSaving(true);
      const response = await studentService.updateStudentProfile(studentId, {
        fullName: editForm.fullName,
        email: editForm.email,
        city: editForm.city,
        phone: editForm.phone,
      });

      if (response.success) {
        await loadStudent();
        setEditMode(false);
      } else {
        alert('Failed to update: ' + response.error);
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    // Security check: Prevent moderators from deleting
    if (!canDeleteUsers) {
      alert('Permission denied: You do not have permission to delete student profiles.');
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setSaving(true);
      const response = await studentService.deleteStudent(studentId, false);

      if (response.success) {
        router.push('/students');
      } else {
        alert('Failed to delete: ' + response.error);
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error || 'Student not found'}</p>
        <Link href="/students" className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium">
          ← Back to Students
        </Link>
      </div>
    );
  }

  const tierInfo = getELOTier(student.stats.elo_rating);

  return (
    <div className="space-y-6">
      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">ℹ️</span>
            <p className="text-sm text-yellow-800">
              <strong>View-only access:</strong> As a moderator, you can view student details but cannot edit or delete profiles.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/students"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{student.profile.full_name}</h1>
            <p className="text-sm text-gray-500">{student.profile.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode ? (
            <>
              {canEditUsers && (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit Profile
                </button>
              )}
              {canDeleteUsers && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">ELO Rating</p>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-2xl font-bold text-gray-900">{student.stats.elo_rating}</p>
            <span className={`text-xs px-2 py-1 rounded ${
              tierInfo.tier === 'Bronze' ? 'bg-orange-100 text-orange-800' :
              tierInfo.tier === 'Silver' ? 'bg-gray-100 text-gray-800' :
              tierInfo.tier === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
              tierInfo.tier === 'Platinum' ? 'bg-blue-100 text-blue-800' :
              'bg-cyan-100 text-cyan-800'
            }`}>
              {tierInfo.tier}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Exams</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{student.stats.total_exams}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Questions Answered</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{student.stats.total_questions.toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Average Score</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{student.stats.avg_score.toFixed(1)}%</p>
        </div>
      </div>

      {/* Profile Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
        
        {editMode ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={editForm.fullName}
                onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={editForm.city}
                onChange={(e) => setEditForm({...editForm, city: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">City</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{student.profile.city || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{student.profile.phone || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Registered</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{formatDate(student.profile.created_at)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Last Active</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {student.stats.last_active_date ? formatDate(student.stats.last_active_date) : 'Never'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Current Streak</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{student.stats.streak_count} days</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Status</dt>
              <dd className="mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  student.stats.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {student.stats.is_active ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Subjects Performance */}
      {student.subjects && student.subjects.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Subject Performance</h2>
          <div className="space-y-3">
            {student.subjects.map((subject) => (
              <div key={subject.subject_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{subject.subject_name}</p>
                  <p className="text-sm text-gray-500">{subject.exam_count} exams taken</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{subject.avg_score.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">Average</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {student.recent_activity && student.recent_activity.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {student.recent_activity.map((activity) => (
              <div key={activity.test_id} className="flex items-center justify-between p-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{activity.subject_name}</p>
                  <p className="text-sm text-gray-500">
                    {activity.questions_attempted} questions • {formatDate(activity.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{activity.score}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Student?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete {student.profile.full_name}? This action will archive the student.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
