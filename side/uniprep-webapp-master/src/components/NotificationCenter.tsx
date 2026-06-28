'use client';

import React, { useState } from 'react';
import { Bell, X, Check, Trash2, ExternalLink, CheckCheck, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification } from '@/services/notificationService';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NotificationCenterProps {
  userId: string | null;
}

export function NotificationCenter({ userId }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const router = useRouter();
  const { t } = useTranslation();
  const NOTIFICATION_LIMIT = 5;
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications(userId);

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

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
    setSelectedNotification(notification);
  };

  const getNotificationRoute = (notification: Notification): string | null => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isTeacher = pathname.includes('/teacher');
    const userPath = isTeacher ? '/teacher' : '/student';

    // Payment-required notification → take student directly to bookings (payment tab)
    if (notification.data?.notification_subtype === 'booking_accepted_payment_required') {
      return '/student/bookings';
    }

    if (notification.type === 'booking') {
      return `${userPath}/bookings`;
    }
    if (notification.action_url) {
      return convertDeepLinkToWebRoute(notification.action_url, userPath);
    }
    return null;
  };

  const convertDeepLinkToWebRoute = (deepLink: string, userPath: string): string | null => {
    // Convert elmly:// deep links to web routes
    if (deepLink.startsWith('elmly://')) {
      const path = deepLink.replace('elmly://', '');
      // Handle specific paths
      if (path.includes('booking') || path.includes('session')) {
        return `${userPath}/bookings`;
      }
      return `${userPath}/${path}`;
    }
    // If already a web route, return as is
    if (deepLink.startsWith('/')) {
      return deepLink;
    }
    return null;
  };

  const handleSeeAll = () => {
    setIsOpen(false);
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isTeacher = pathname.includes('/teacher');
    router.push(isTeacher ? '/teacher/notifications' : '/student/notifications');
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'all') return true;
    // Add filter logic here
    return false;
  });

  if (!userId) return null;

  return (
    <>
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={t('notifications.title') || 'Notifications'}
      >
        <Bell className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div className="absolute right-0 mt-2 w-96 max-h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('notifications.title') || 'Notifications'}
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                    title={t('notifications.markAllRead') || 'Mark all as read'}
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('notifications.markAllRead') || 'Mark all read'}</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {filter === 'all'
                      ? t('notifications.noNotifications') || 'No notifications'
                      : t('notifications.noMatch') || 'No notifications match your filters'}
                  </p>
                  {filter === 'all' && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      {t('notifications.allCaughtUp') || "You're all caught up!"}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredNotifications.slice(0, NOTIFICATION_LIMIT).map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                          !notification.is_read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className="flex-shrink-0 text-2xl">
                            {getNotificationIcon(notification.type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                {notification.title}
                              </h4>
                              {!notification.is_read && (
                                <div className="flex-shrink-0 w-2 h-2 bg-indigo-600 rounded-full mt-1"></div>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {notification.body}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {formatDate(notification.created_at)}
                              </span>
                              <div className="flex items-center gap-1">
                                {!notification.is_read && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(notification.id);
                                    }}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                    title={t('notifications.markAsRead') || 'Mark as read'}
                                  >
                                    <Check className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
                                  title={t('notifications.delete') || 'Delete'}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* See All Button */}
                  {filteredNotifications.length > NOTIFICATION_LIMIT && (
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={handleSeeAll}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                      >
                        <span>{t('notifications.seeAll') || 'See all notifications'}</span>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {notifications.length} {t('notifications.total') || 'notifications'}
                  {unreadCount > 0 && ` • ${unreadCount} ${t('notifications.unread') || 'unread'}`}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {/* Notification Detail Modal */}
    <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
      <DialogContent className="sm:max-w-[440px] bg-white dark:bg-gray-800">
        {selectedNotification && (() => {
          const route = getNotificationRoute(selectedNotification);
          return (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-3xl">{getNotificationIcon(selectedNotification.type)}</span>
                  <DialogTitle className="text-gray-900 dark:text-white text-left">
                    {selectedNotification.title}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-gray-600 dark:text-gray-400 text-sm text-left mt-2 leading-relaxed">
                  {selectedNotification.body}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(selectedNotification.created_at)}
              </div>

              {selectedNotification.is_read ? null : (
                <Badge className="self-start bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs w-fit">
                  {t('notifications.unread') || 'Unread'}
                </Badge>
              )}

              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedNotification(null)}
                >
                  {t('common.close')}
                </Button>
                {route && (
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                    onClick={() => {
                      setSelectedNotification(null);
                      router.push(route);
                    }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    {t('notifications.viewDetails') || 'View Details'}
                  </Button>
                )}
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
