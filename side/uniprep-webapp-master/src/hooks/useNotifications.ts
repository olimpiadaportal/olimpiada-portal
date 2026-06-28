'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationService, Notification } from '@/services/notificationService';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { t } = useTranslation();

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await notificationService.getNotifications(userId);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      if (data) {
        setNotifications(data);
        const unread = data.filter(n => !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error in loadNotifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    const { success } = await notificationService.markAsRead(notificationId);
    
    if (success) {
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    const { success } = await notificationService.markAllAsRead(userId);
    
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success(t('notifications.markedAllAsRead'));
    }
  }, [userId, toast]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    const { success } = await notificationService.deleteNotification(notificationId);
    
    if (success) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success(t('notifications.notificationDeleted'));
    }
  }, [toast]);

  // Delete all notifications
  const deleteAllNotifications = useCallback(async () => {
    if (!userId) return;

    const { success } = await notificationService.deleteAllNotifications(userId);
    
    if (success) {
      setNotifications([]);
      setUnreadCount(0);
      toast.success(t('notifications.allNotificationsDeleted'));
    }
  }, [userId, toast]);

  // Setup realtime subscription
  useEffect(() => {
    if (!userId) return;

    loadNotifications();

    const channel = notificationService.subscribeToNotifications(
      userId,
      // On insert
      (notification) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
        
        // Show toast for new notification
        toast.info(notification.title, notification.body);
      },
      // On update
      (notification) => {
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? notification : n))
        );
        
        // Update unread count if read status changed
        if (notification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      },
      // On delete
      (notificationId) => {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }
    );

    return () => {
      notificationService.unsubscribe(channel);
    };
  }, [userId, loadNotifications, toast]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refresh: loadNotifications,
  };
}
