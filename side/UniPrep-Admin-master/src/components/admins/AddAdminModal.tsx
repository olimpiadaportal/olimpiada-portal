'use client';

import { useState } from 'react';
import { adminService } from '@/services/adminService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import type { AdminRole } from '@/types';

interface AddAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddAdminModal({ isOpen, onClose, onSuccess }: AddAdminModalProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRole>('moderator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Basic validation
    if (!email || !fullName) {
      setError('Email and full name are required');
      setLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    const result = await adminService.createAdmin({
      email,
      fullName,
      role,
    });

    if (result.success) {
      // Log the admin creation action
      await auditLogService.logAction({
        actionType: AuditActionTypes.USER_CREATE,
        tableName: 'admin_users',
        newValues: { email, full_name: fullName, role },
        description: `Created new admin: ${fullName} (${email}) with role ${role}`,
      });

      // Reset form
      setEmail('');
      setFullName('');
      setRole('moderator');
      setError(null);
      
      // Close modal and refresh list
      onSuccess();
      onClose();
    } else {
      setError(result.error || 'Failed to create admin');
    }

    setLoading(false);
  };

  const handleClose = () => {
    if (!loading) {
      setEmail('');
      setFullName('');
      setRole('moderator');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Add New Admin</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              User must already exist in the system
            </p>
          </div>

          {/* Full Name Input */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* Role Select */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="moderator">Moderator (Read-only)</option>
              <option value="admin">Admin (Can manage users)</option>
              <option value="super_admin">Super Admin (Full access)</option>
            </select>
          </div>

          {/* Role Description */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-700 font-medium mb-2">Role Permissions:</p>
            {role === 'super_admin' && (
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Full access to all features</li>
                <li>• Can manage other admins</li>
                <li>• Can view audit logs</li>
                <li>• Can modify system settings</li>
              </ul>
            )}
            {role === 'admin' && (
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Can manage students and teachers</li>
                <li>• Can view reports</li>
                <li>• Can moderate content</li>
                <li>• Cannot manage other admins</li>
              </ul>
            )}
            {role === 'moderator' && (
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Read-only access</li>
                <li>• Can view students and teachers</li>
                <li>• Can view reports</li>
                <li>• Cannot modify anything</li>
              </ul>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
            >
              {loading ? 'Creating...' : 'Create Admin'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Help Text */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            <strong>Note:</strong> The user must already have an account in the system. If the user
            doesn't exist, they need to sign up first.
          </p>
        </div>
      </div>
    </div>
  );
}
