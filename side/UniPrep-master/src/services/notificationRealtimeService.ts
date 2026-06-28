/**
 * Notification Realtime Service
 * Phase 2: Event-Driven Notifications
 * 
 * Handles real-time notification delivery using Supabase Realtime.
 * Features:
 * - Subscribe to new notifications
 * - Show in-app notifications immediately
 * - Update badge count
 * - Handle notification interactions
 * - Auto-reconnect on connection loss
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { notificationHandlerService } from './notificationHandlerService';

export interface RealtimeNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  data: any;
  priority: number;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

class NotificationRealtimeService {
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private isSubscribed = false;

  /**
   * Subscribe to real-time notifications for a user
   */
  async subscribe(userId: string): Promise<void> {
    try {
      // Unsubscribe from previous channel if exists
      if (this.channel) {
        await this.unsubscribe();
      }

      this.userId = userId;

      console.log('🔔 Subscribing to real-time notifications for user:', userId);

      // Create channel for user's notifications
      this.channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            this.handleNewNotification(payload.new as RealtimeNotification);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            this.handleNotificationUpdate(payload.new as RealtimeNotification);
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            this.isSubscribed = true;
            console.log('✅ Subscribed to real-time notifications');
          } else if (status === 'CHANNEL_ERROR') {
            // Don't show error to user - just log it silently
            console.log('📡 Notification channel error (non-critical):', err?.message || 'Connection issue');
            this.isSubscribed = false;
            // Retry silently after delay
            setTimeout(() => {
              if (this.userId && !this.isSubscribed) {
                console.log('🔄 Retrying notification subscription...');
                this.subscribe(this.userId);
              }
            }, 10000);
          } else if (status === 'TIMED_OUT') {
            console.log('⏱️ Notification subscription timed out - will retry');
            this.isSubscribed = false;
            // Retry after delay
            setTimeout(() => {
              if (this.userId && !this.isSubscribed) {
                this.subscribe(this.userId);
              }
            }, 5000);
          } else if (status === 'CLOSED') {
            console.log('🔌 Notification channel closed');
            this.isSubscribed = false;
          }
        });
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      this.isSubscribed = false;
    }
  }

  /**
   * Unsubscribe from real-time notifications
   */
  async unsubscribe(): Promise<void> {
    try {
      if (this.channel) {
        await supabase.removeChannel(this.channel);
        this.channel = null;
        this.isSubscribed = false;
        console.log('🔕 Unsubscribed from real-time notifications');
      }
    } catch (error) {
      console.error('Error unsubscribing from notifications:', error);
    }
  }

  /**
   * Handle new notification received
   */
  private async handleNewNotification(notification: RealtimeNotification): Promise<void> {
    try {
      console.log('📬 New notification received:', notification.title);

      // Show local notification immediately
      await this.showLocalNotification(notification);

      // Update badge count
      await this.updateBadgeCount();

      // Track analytics
      await this.trackNotificationEvent(notification.id, 'delivered');
    } catch (error) {
      console.error('Error handling new notification:', error);
    }
  }

  /**
   * Handle notification update (e.g., marked as read)
   */
  private async handleNotificationUpdate(notification: RealtimeNotification): Promise<void> {
    try {
      console.log('🔄 Notification updated:', notification.id);

      // Update badge count if read status changed
      if (notification.is_read) {
        await this.updateBadgeCount();
      }
    } catch (error) {
      console.error('Error handling notification update:', error);
    }
  }

  /**
   * Show local notification
   */
  private async showLocalNotification(notification: RealtimeNotification): Promise<void> {
    try {
      // Check if app is in foreground
      const state = await Notifications.getNotificationChannelsAsync();
      
      // Schedule local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            ...notification.data,
            notificationId: notification.id,
            type: notification.type,
            action_url: notification.action_url,
          },
          sound: 'default',
          priority: notification.priority >= 8 
            ? Notifications.AndroidNotificationPriority.HIGH 
            : Notifications.AndroidNotificationPriority.DEFAULT,
          badge: 1,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Error showing local notification:', error);
    }
  }

  /**
   * Update badge count
   */
  private async updateBadgeCount(): Promise<void> {
    try {
      if (!this.userId) return;

      // Get unread count
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.userId)
        .eq('is_read', false);

      if (error) throw error;

      // Set badge
      await Notifications.setBadgeCountAsync(count || 0);
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  }

  /**
   * Track notification event
   */
  private async trackNotificationEvent(
    notificationId: string,
    eventType: 'delivered' | 'opened' | 'clicked' | 'dismissed'
  ): Promise<void> {
    try {
      if (!this.userId) return;

      await supabase.from('notification_analytics').insert({
        notification_id: notificationId,
        user_id: this.userId,
        event_type: eventType,
        channel: 'in_app',
      });
    } catch (error) {
      console.error('Error tracking notification event:', error);
    }
  }

  /**
   * Get subscription status
   */
  isActive(): boolean {
    return this.isSubscribed;
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.userId;
  }
}

export const notificationRealtimeService = new NotificationRealtimeService();
