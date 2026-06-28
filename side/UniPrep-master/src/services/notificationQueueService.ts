/**
 * Notification Queue Service
 * Phase 1: Foundation Enhancement
 * 
 * Handles notification queuing, priority management, rate limiting, and deduplication.
 * Features:
 * - Priority-based queue system
 * - Rate limiting (prevent spam)
 * - Deduplication (avoid duplicate notifications)
 * - Retry logic for failed deliveries
 * - User preference checking
 */

import { supabase } from './supabase';
import * as Crypto from 'expo-crypto';

export interface QueuedNotification {
  id?: string;
  user_id: string;
  notification_type: string;
  priority: number;
  channels: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  scheduled_at?: Date;
}

export interface RateLimitConfig {
  maxPerHour: number;
  maxPerDay: number;
  maxMarketingPerDay: number;
}

class NotificationQueueService {
  private readonly DEFAULT_RATE_LIMITS: RateLimitConfig = {
    maxPerHour: 5,
    maxPerDay: 10,
    maxMarketingPerDay: 1,
  };

  /**
   * Add notification to queue
   */
  async enqueue(notification: QueuedNotification): Promise<string | null> {
    try {
      // Check rate limits
      const canSend = await this.checkRateLimits(
        notification.user_id,
        notification.notification_type
      );

      if (!canSend) {
        console.log('⚠️ Rate limit exceeded, notification not queued');
        return null;
      }

      // Check for duplicates
      const isDuplicate = await this.checkDuplicate(notification);
      if (isDuplicate) {
        console.log('⚠️ Duplicate notification detected, skipping');
        return null;
      }

      // Check user preferences
      const userPreferences = await this.getUserPreferences(
        notification.user_id,
        notification.notification_type
      );

      if (!userPreferences.enabled) {
        console.log('⚠️ User has disabled this notification type');
        return null;
      }

      // Filter channels based on user preferences
      const allowedChannels = notification.channels.filter(channel =>
        userPreferences.channels.includes(channel)
      );

      if (allowedChannels.length === 0) {
        console.log('⚠️ No allowed channels for this notification');
        return null;
      }

      // Check quiet hours
      const isQuietHours = await this.isInQuietHours(
        notification.user_id,
        notification.notification_type
      );

      if (isQuietHours) {
        console.log('🔕 User is in quiet hours, scheduling for later');
        // Schedule for end of quiet hours
        notification.scheduled_at = await this.getQuietHoursEnd(
          notification.user_id,
          notification.notification_type
        );
      }

      // Insert into queue
      const { data, error } = await supabase
        .from('notification_queue')
        .insert({
          user_id: notification.user_id,
          notification_type: notification.notification_type,
          priority: notification.priority,
          channels: allowedChannels,
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          scheduled_at: notification.scheduled_at?.toISOString(),
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw error;

      console.log('✅ Notification queued:', data.id);
      return data.id;
    } catch (error) {
      console.error('Error enqueueing notification:', error);
      return null;
    }
  }

  /**
   * Check rate limits for user
   */
  private async checkRateLimits(
    userId: string,
    notificationType: string
  ): Promise<boolean> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Count notifications in last hour
      const { count: hourCount } = await supabase
        .from('notification_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo.toISOString());

      if ((hourCount || 0) >= this.DEFAULT_RATE_LIMITS.maxPerHour) {
        return false;
      }

      // Count notifications in last day
      const { count: dayCount } = await supabase
        .from('notification_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneDayAgo.toISOString());

      if ((dayCount || 0) >= this.DEFAULT_RATE_LIMITS.maxPerDay) {
        return false;
      }

      // Check marketing notification limit
      if (notificationType === 'marketing') {
        const { count: marketingCount } = await supabase
          .from('notification_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('notification_type', 'marketing')
          .gte('created_at', oneDayAgo.toISOString());

        if ((marketingCount || 0) >= this.DEFAULT_RATE_LIMITS.maxMarketingPerDay) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking rate limits:', error);
      return true; // Allow on error
    }
  }

  /**
   * Check for duplicate notifications
   */
  private async checkDuplicate(notification: QueuedNotification): Promise<boolean> {
    try {
      // Create hash of notification content
      const contentHash = await this.hashNotification(notification);

      // Check for similar notification in last 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('user_id', notification.user_id)
        .eq('notification_type', notification.notification_type)
        .eq('title', notification.title)
        .gte('created_at', oneHourAgo.toISOString())
        .limit(1);

      if (error) throw error;

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return false; // Allow on error
    }
  }

  /**
   * Hash notification content for deduplication
   */
  private async hashNotification(notification: QueuedNotification): Promise<string> {
    const content = `${notification.notification_type}:${notification.title}:${notification.body}`;
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      content
    );
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(
    userId: string,
    notificationType: string
  ): Promise<{ enabled: boolean; channels: string[] }> {
    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('enabled, channels')
        .eq('user_id', userId)
        .eq('notification_type', notificationType)
        .single();

      if (error || !data) {
        // Return defaults if no settings found
        return {
          enabled: true,
          channels: ['in_app', 'push'],
        };
      }

      return {
        enabled: data.enabled,
        channels: data.channels,
      };
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return {
        enabled: true,
        channels: ['in_app', 'push'],
      };
    }
  }

  /**
   * Check if user is in quiet hours
   */
  private async isInQuietHours(
    userId: string,
    notificationType: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('is_in_quiet_hours', {
        p_user_id: userId,
        p_notification_type: notificationType,
      });

      if (error) throw error;
      return data || false;
    } catch (error) {
      console.error('Error checking quiet hours:', error);
      return false;
    }
  }

  /**
   * Get end time of quiet hours
   */
  private async getQuietHoursEnd(
    userId: string,
    notificationType: string
  ): Promise<Date> {
    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('quiet_hours_end')
        .eq('user_id', userId)
        .eq('notification_type', notificationType)
        .single();

      if (error || !data) {
        // Default to 8 AM tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        return tomorrow;
      }

      // Parse time and create date
      const [hours, minutes] = data.quiet_hours_end.split(':');
      const endTime = new Date();
      endTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // If end time is in the past, schedule for tomorrow
      if (endTime < new Date()) {
        endTime.setDate(endTime.getDate() + 1);
      }

      return endTime;
    } catch (error) {
      console.error('Error getting quiet hours end:', error);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return tomorrow;
    }
  }

  /**
   * Get pending notifications from queue
   */
  async getPendingNotifications(limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('status', 'pending')
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as sent
   */
  async markAsSent(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notification_queue')
        .update({
          status: 'sent',
          processed_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as sent:', error);
    }
  }

  /**
   * Mark notification as failed
   */
  async markAsFailed(
    notificationId: string,
    errorMessage: string,
    retryCount: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('notification_queue')
        .update({
          status: retryCount >= 3 ? 'failed' : 'pending',
          error_message: errorMessage,
          retry_count: retryCount,
          processed_at: retryCount >= 3 ? new Date().toISOString() : null,
        })
        .eq('id', notificationId);

      if (error) throw error;

      // Log failure
      await supabase.from('notification_failures').insert({
        notification_id: notificationId,
        error_message: errorMessage,
        retry_count: retryCount,
        will_retry: retryCount < 3,
      });
    } catch (error) {
      console.error('Error marking notification as failed:', error);
    }
  }

  /**
   * Track notification analytics
   */
  async trackEvent(
    notificationId: string,
    userId: string,
    eventType: 'delivered' | 'opened' | 'clicked' | 'dismissed',
    channel: string,
    deviceInfo?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from('notification_analytics').insert({
        notification_id: notificationId,
        user_id: userId,
        event_type: eventType,
        channel: channel,
        device_info: deviceInfo || {},
      });
    } catch (error) {
      console.error('Error tracking notification event:', error);
    }
  }

  /**
   * Clean up old processed notifications
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('notification_queue')
        .delete()
        .in('status', ['sent', 'failed', 'cancelled'])
        .lt('processed_at', cutoffDate.toISOString())
        .select('id');

      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return 0;
    }
  }
}

export const notificationQueueService = new NotificationQueueService();
