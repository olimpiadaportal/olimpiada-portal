'use client';

import { useState, useEffect } from 'react';
import { adminNotificationService, AdminNotification } from '@/services/adminNotificationService';

interface NotificationHistoryTableProps {
  onRefresh?: () => void;
}

export default function NotificationHistoryTable({ onRefresh }: NotificationHistoryTableProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedNotification, setSelectedNotification] = useState<AdminNotification | null>(null);

  useEffect(() => {
    loadNotifications();
  }, [statusFilter]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await adminNotificationService.getNotifications(
        statusFilter || undefined,
        50,
        0
      );
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      scheduled: 'bg-yellow-100 text-yellow-700',
      sending: 'bg-blue-100 text-blue-700',
      sent: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTargetLabel = (type: string, filter: Record<string, any>) => {
    switch (type) {
      case 'all': return 'All Users';
      case 'students': return 'All Students';
      case 'teachers': return 'All Teachers';
      case 'city': return `City: ${filter.city || 'N/A'}`;
      case 'target_group': return `Group ${filter.target_group || 'N/A'}`;
      case 'individual': return `${filter.user_ids?.length || 0} Users`;
      default: return type;
    }
  };

  const getChannelIcons = (channels: string[]) => {
    const icons: Record<string, string> = {
      in_app: '📱',
      push: '🔔',
      email: '📧'
    };
    return channels.map(c => icons[c] || '📨').join(' ');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getDeliveryRate = (notification: AdminNotification) => {
    if (notification.total_recipients === 0) return 0;
    return Math.round((notification.delivered_count / notification.total_recipients) * 100);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">📜 Notification History</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={loadNotifications}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notification
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Channels
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Delivery
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <span className="animate-pulse">Loading notifications...</span>
                </td>
              </tr>
            ) : notifications.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No notifications found
                </td>
              </tr>
            ) : (
              notifications.map((notification) => (
                <tr
                  key={notification.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedNotification(notification)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-500 truncate max-w-[200px]">
                        {notification.body}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">
                      {getTargetLabel(notification.target_type, notification.target_filter)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-lg">
                      {getChannelIcons(notification.channels)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(notification.status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${getDeliveryRate(notification)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">
                        {notification.delivered_count}/{notification.total_recipients}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(notification.sent_at || notification.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notification Details</h3>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Title</p>
                <p className="font-medium text-gray-900">{selectedNotification.title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Message</p>
                <p className="text-gray-700">{selectedNotification.body}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  {getStatusBadge(selectedNotification.status)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Target</p>
                  <p className="text-gray-700">
                    {getTargetLabel(selectedNotification.target_type, selectedNotification.target_filter)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Channels</p>
                  <p className="text-lg">{getChannelIcons(selectedNotification.channels)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sent By</p>
                  <p className="text-gray-700">{selectedNotification.admin_name || 'Unknown'}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-2">Delivery Stats</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-semibold text-gray-900">{selectedNotification.total_recipients}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg">
                    <p className="text-lg font-semibold text-green-600">{selectedNotification.delivered_count}</p>
                    <p className="text-xs text-gray-500">Delivered</p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <p className="text-lg font-semibold text-blue-600">{selectedNotification.opened_count}</p>
                    <p className="text-xs text-gray-500">Opened</p>
                  </div>
                  <div className="p-2 bg-red-50 rounded-lg">
                    <p className="text-lg font-semibold text-red-600">{selectedNotification.failed_count}</p>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 text-sm text-gray-500">
                <p>Created: {formatDate(selectedNotification.created_at)}</p>
                {selectedNotification.sent_at && (
                  <p>Sent: {formatDate(selectedNotification.sent_at)}</p>
                )}
                {selectedNotification.scheduled_at && (
                  <p>Scheduled: {formatDate(selectedNotification.scheduled_at)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
