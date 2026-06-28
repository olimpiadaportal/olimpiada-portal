'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { teacherService } from '@/services/teacherService';
import type { TeacherDetail } from '@/types';
import { formatDate } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';

function certificateObjectPath(value: string): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    return decodeURIComponent(value.replace(/^certificates\//, '').replace(/^\/+/, ''));
  }

  try {
    const url = new URL(value);
    for (const marker of [
      '/storage/v1/object/public/certificates/',
      '/storage/v1/object/sign/certificates/',
      '/storage/v1/object/authenticated/certificates/',
      '/certificates/',
    ]) {
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        return decodeURIComponent(url.pathname.slice(index + marker.length));
      }
    }
  } catch {
    return null;
  }

  return null;
}

export default function TeacherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.id as string;
  const { canEditUsers, canDeleteUsers, isModerator, loading: permissionsLoading } = usePermissions();

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingCertIndex, setDeletingCertIndex] = useState<number | null>(null);
  const [showCertDeleteConfirm, setShowCertDeleteConfirm] = useState(false);
  const [certificateUrls, setCertificateUrls] = useState<Record<string, string>>({});

  // Edit form state
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    city: '',
    phone: '',
    bio: '',
    experienceYears: 0,
    hourlyRate: 0,
    monthlyRate: 0,
  });

  useEffect(() => {
    loadTeacher();
  }, [teacherId]);

  async function loadTeacher() {
    try {
      setLoading(true);
      setError(null);

      const response = await teacherService.getTeacherDetail(teacherId);

      if (response.success && response.data) {
        setTeacher(response.data);
        const signedEntries = await Promise.all(
          (response.data.info.certificates || []).map(async (storedValue: string) => {
            const path = certificateObjectPath(storedValue);
            if (!path) return [storedValue, ''] as const;
            const { data } = await supabase.storage
              .from('certificates')
              .createSignedUrl(path, 300);
            return [storedValue, data?.signedUrl || ''] as const;
          })
        );
        setCertificateUrls(Object.fromEntries(signedEntries));
        setEditForm({
          fullName: response.data.profile.full_name,
          email: response.data.profile.email,
          city: response.data.profile.city || '',
          phone: response.data.profile.phone || '',
          bio: response.data.info.bio || '',
          experienceYears: response.data.info.experience_years || 0,
          hourlyRate: Number(response.data.info.hourly_rate) || 0,
          monthlyRate: Number(response.data.info.monthly_rate) || 0,
        });
      } else {
        setError(response.error || 'Failed to load teacher');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!teacher) return;
    
    // Security check: Prevent moderators from editing
    if (!canEditUsers) {
      alert('Permission denied: You do not have permission to edit teacher profiles.');
      return;
    }

    try {
      setSaving(true);
      const response = await teacherService.updateTeacherProfile(teacherId, {
        fullName: editForm.fullName,
        email: editForm.email,
        city: editForm.city,
        phone: editForm.phone,
        bio: editForm.bio,
        experienceYears: editForm.experienceYears,
        hourlyRate: editForm.hourlyRate,
        monthlyRate: editForm.monthlyRate,
      });

      if (response.success) {
        await loadTeacher();
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

  async function handleVerification(isVerified: boolean) {
    // Security check: Prevent moderators from verifying
    if (!canEditUsers) {
      alert('Permission denied: You do not have permission to verify teachers.');
      setShowVerificationModal(false);
      return;
    }

    try {
      setSaving(true);
      const response = await teacherService.updateTeacherVerification(teacherId, isVerified);

      if (response.success) {
        await loadTeacher();
        setShowVerificationModal(false);
      } else {
        alert('Failed to update verification: ' + response.error);
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
      alert('Permission denied: You do not have permission to delete teacher profiles.');
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setSaving(true);
      const response = await teacherService.deleteTeacher(teacherId, false);

      if (response.success) {
        router.push('/teachers');
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

  async function handleDeleteCertificate() {
    if (deletingCertIndex === null || !teacher) return;
    
    // Security check: Prevent moderators from deleting certificates
    if (!canEditUsers) {
      alert('Permission denied: You do not have permission to delete certificates.');
      setShowCertDeleteConfirm(false);
      setDeletingCertIndex(null);
      return;
    }

    try {
      setSaving(true);
      const certificateValue = teacher.info.certificates?.[deletingCertIndex];
      const objectPath = certificateValue ? certificateObjectPath(certificateValue) : null;
      if (objectPath) {
        const { error: storageError } = await supabase.storage
          .from('certificates')
          .remove([objectPath]);
        if (storageError) {
          throw storageError;
        }
      }

      // Remove the certificate from the array
      const updatedCerts = teacher.info.certificates?.filter((_, i) => i !== deletingCertIndex) || [];
      
      // Update teacher certificates array directly
      const response = await teacherService.updateTeacherCertificates(teacherId, updatedCerts);

      if (response.success) {
        await loadTeacher();
        setShowCertDeleteConfirm(false);
        setDeletingCertIndex(null);
      } else {
        alert('Failed to delete certificate: ' + response.error);
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error || 'Teacher not found'}</p>
        <Link href="/teachers" className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium">
          ← Back to Teachers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">ℹ️</span>
            <p className="text-sm text-yellow-800">
              <strong>View-only access:</strong> As a moderator, you can view teacher details but cannot edit, verify, or delete profiles.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/teachers"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{teacher.profile.full_name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  teacher.info.is_verified
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {teacher.info.is_verified ? '✓ Verified' : 'Pending'}
              </span>
            </div>
            <p className="text-sm text-gray-500">{teacher.profile.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!teacher.info.is_verified && canEditUsers && (
            <button
              onClick={() => setShowVerificationModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Verify Teacher
            </button>
          )}
          {teacher.info.is_verified && canEditUsers && (
            <button
              onClick={() => {
                if (window.confirm('Disapprove this teacher? They will be removed from the student marketplace until approved again.')) {
                  void handleVerification(false);
                }
              }}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Updating...' : 'Disapprove'}
            </button>
          )}
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
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Rating</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {teacher.info.rating ? `${teacher.info.rating.toFixed(1)} ⭐` : 'N/A'}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Subscribers</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {teacher.stats.current_student_count ?? teacher.stats.student_count}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Lifetime Subscribers</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {teacher.stats.total_student_count ?? teacher.stats.student_count}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Completed Bookings</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{teacher.stats.completed_bookings}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">₼{teacher.stats.total_revenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Profile Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
        
        {editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({...editForm, city: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience (years)</label>
                <input
                  type="number"
                  value={editForm.experienceYears}
                  onChange={(e) => setEditForm({...editForm, experienceYears: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (₼)</label>
                <input
                  type="number"
                  value={editForm.hourlyRate}
                  onChange={(e) => setEditForm({...editForm, hourlyRate: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rate (₼)</label>
                <input
                  type="number"
                  value={editForm.monthlyRate}
                  onChange={(e) => setEditForm({...editForm, monthlyRate: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">City</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{teacher.profile.city || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{teacher.profile.phone || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Experience</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {teacher.info.experience_years ? `${teacher.info.experience_years} years` : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Hourly Rate</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {teacher.info.hourly_rate ? `₼${teacher.info.hourly_rate}` : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Monthly Rate</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {teacher.info.monthly_rate ? `₼${teacher.info.monthly_rate}` : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Registered</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">{formatDate(teacher.profile.created_at)}</dd>
            </div>
            {teacher.info.bio && (
              <div className="col-span-2">
                <dt className="text-sm text-gray-500">Bio</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{teacher.info.bio}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Specializations */}
      {teacher.info.specializations && teacher.info.specializations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Specializations</h2>
          <div className="flex flex-wrap gap-2">
            {teacher.info.specializations.map((spec, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-md text-sm bg-purple-50 text-purple-700 font-medium"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certificates */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Certificates
          {teacher.info.certificates && teacher.info.certificates.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({teacher.info.certificates.length})
            </span>
          )}
        </h2>
        {teacher.info.certificates && teacher.info.certificates.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {teacher.info.certificates.map((certUrl, index) => (
              <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden">
                {/* PDF indicator or image preview */}
                {certUrl.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium">PDF Certificate</p>
                      <p className="text-xs text-gray-400">Certificate {index + 1}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <img
                      src={certificateUrls[certUrl] || ''}
                      alt={`Certificate ${index + 1}`}
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const fallback = (e.target as HTMLImageElement).nextElementSibling;
                        fallback?.classList.remove('hidden');
                        fallback?.classList.add('flex');
                      }}
                    />
                    <div className="hidden w-full h-48 bg-gray-100 items-center justify-center">
                      <div className="text-center text-gray-400">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm">Certificate {index + 1}</p>
                      </div>
                    </div>
                  </>
                )}
                {/* Hover overlay with View and Delete buttons */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const signedUrl = certificateUrls[certUrl];
                      if (signedUrl) {
                        window.open(signedUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        alert('Certificate could not be opened. Refresh the page and try again.');
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 shadow-lg hover:bg-gray-50"
                  >
                    View
                  </button>
                  {canEditUsers && (
                    <button
                      onClick={() => {
                        setDeletingCertIndex(index);
                        setShowCertDeleteConfirm(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-2 bg-red-500 rounded-lg text-sm font-medium text-white shadow-lg hover:bg-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No certificates uploaded</p>
          </div>
        )}
      </div>

      {/* Students */}
      {teacher.students && teacher.students.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Students ({teacher.students.length})</h2>
          <div className="space-y-3">
            {teacher.students.slice(0, 10).map((student) => (
              <div key={student.student_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{student.student_name}</p>
                  <p className="text-sm text-gray-500">{student.student_email}</p>
                </div>
                <p className="text-xs text-gray-500">Assigned {formatDate(student.assigned_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Bookings */}
      {teacher.recent_bookings && teacher.recent_bookings.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Bookings</h2>
          <div className="space-y-3">
            {teacher.recent_bookings.map((booking) => (
              <div key={booking.booking_id} className="flex items-center justify-between p-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{booking.student_name}</p>
                  <p className="text-sm text-gray-500">{formatDate(booking.date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">₼{booking.amount}</p>
                  <span className={`text-xs px-2 py-1 rounded ${
                    booking.status === 'completed' ? 'bg-green-100 text-green-800' :
                    booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Verify Teacher?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to verify {teacher.profile.full_name}? This will allow them to accept bookings.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowVerificationModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={() => handleVerification(true)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Teacher?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete {teacher.profile.full_name}? This will mark them as unverified.
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

      {/* Certificate Delete Confirmation Modal */}
      {showCertDeleteConfirm && deletingCertIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Certificate?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete Certificate {deletingCertIndex + 1}? This action cannot be undone. The teacher will be removed from student marketplace results until their certificates are approved again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCertDeleteConfirm(false);
                  setDeletingCertIndex(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCertificate}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
