'use client';

import { useEffect, useState } from 'react';
import { Bell, Filter, CheckCheck, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const router = useRouter();
  const { t } = useTranslation();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications(userId);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      } else {
        router.push('/login');
      }
    };
    loadUser();
  }, [router]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'exam':
        return '🎓';
      case 'booking':
        return '📅';
      case 'achievement':
        return '🏆';
      case 'reminder':
        return '⏰';
      case 'announcement':
        return '📢';
      default:
        return '🔔';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow') || 'Just now';
    if (diffMins < 60) return `${diffMins}m ${t('notifications.ago') || 'ago'}`;
    if (diffHours < 24) return `${diffHours}h ${t('notifications.ago') || 'ago'}`;
    if (diffDays < 7) return `${diffDays}d ${t('notifications.ago') || 'ago'}`;
    return date.toLocaleDateString();
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    if (notification.action_url) {
      const webUrl = convertDeepLinkToWebRoute(notification.action_url);
      if (webUrl) {
        router.push(webUrl);
      }
    }
  };

  const convertDeepLinkToWebRoute = (deepLink: string): string | null => {
    if (deepLink.startsWith('elmly://')) {
      const path = deepLink.replace('elmly://', '');
      return `/student/${path}`;
    }
    if (deepLink.startsWith('/')) {
      return deepLink;
    }
    return null;
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.is_read;
    return notification.type === filter;
  });

  const filterOptions = [
    { value: 'all', label: t('notifications.all') || 'All' },
    { value: 'unread', label: t('notifications.unread') || 'Unread' },
    { value: 'general', label: t('notifications.general') || 'General' },
    { value: 'exam', label: t('notifications.exams') || 'Exams' },
    { value: 'booking', label: t('notifications.bookings') || 'Bookings' },
    { value: 'achievement', label: t('notifications.achievements') || 'Achievements' },
    { value: 'reminder', label: t('notifications.reminders') || 'Reminders' },
    { value: 'announcement', label: t('notifications.announcements') || 'Announcements' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('notifications.title') || 'Notifications'}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {notifications.length} {t('notifications.total') || 'notifications'}
              {unreadCount > 0 && ` • ${unreadCount} ${t('notifications.unread') || 'unread'}`}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              onClick={markAllAsRead}
              variant="outline"
              className="flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">{t('notifications.markAllRead') || 'Mark all read'}</span>
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('common.filters') || 'Filters'}:
            </span>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === option.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Notifications List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <Bell className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {filter === 'all'
                ? t('notifications.noNotifications') || 'No notifications'
                : t('notifications.noMatch') || 'No notifications match your filters'}
            </h3>
            {filter === 'all' && (
              <p className="text-gray-500 dark:text-gray-400">
                {t('notifications.allCaughtUp') || "You're all caught up!"}
              </p>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`p-4 cursor-pointer transition-all hover:shadow-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 ${
                  !notification.is_read
                    ? 'border-l-4 border-l-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/10'
                    : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 text-3xl">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <div className="flex-shrink-0 w-2.5 h-2.5 bg-indigo-600 rounded-full mt-1.5"></div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {notification.body}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        {formatDate(notification.created_at)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!notification.is_read && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                          >
                            <CheckCheck className="w-3.5 h-3.5 mr-1" />
                            {t('notifications.markAsRead') || 'Mark read'}
                          </Button>
                        )}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          {t('notifications.delete') || 'Delete'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
