'use client';

import { useState, useEffect } from 'react';
import { adminNotificationService, NotificationStats } from '@/services/adminNotificationService';
import NotificationHistoryTable from '@/components/notifications/NotificationHistoryTable';
import { usePermissions } from '@/hooks/usePermissions';

export default function NotificationsPage() {
  const { canEditUsers, isModerator } = usePermissions();
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await adminNotificationService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📣 Notifications</h1>
          <p className="text-gray-600 mt-1">Send and manage notifications to your users</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditUsers && (
            <>
              <a
                href="/notifications/compose"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 w-fit"
              >
                <span>✉️</span>
                Compose
              </a>
              <a
                href="/notifications/templates"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 w-fit"
              >
                <span>📝</span>
                Templates
              </a>
            </>
          )}
          <a
            href="/notifications/analytics"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 w-fit"
          >
            <span>📊</span>
            Analytics
          </a>
          {canEditUsers && (
            <a
              href="/notifications/processor"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 w-fit"
            >
              <span>⚙️</span>
              Processor
            </a>
          )}
        </div>
      </div>

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can view notification history and analytics but cannot send notifications.
          </p>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📤</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_sent.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Total Sent</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.delivery_rate}%</p>
                <p className="text-sm text-gray-500">Delivery Rate</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">👁️</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.open_rate}%</p>
                <p className="text-sm text-gray-500">Open Rate</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">❌</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_failed.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Failed</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification History */}
      <NotificationHistoryTable key={refreshKey} />
    </div>
  );
}
